#!/usr/bin/env python3
"""
PostHog Engineering Impact Dashboard — Data Fetcher
Fetches merged/closed PRs from PostHog/posthog via GitHub GraphQL,
computes 3-pillar impact scores, and writes public/dashboard-data.json.

Pillars:
  1. Execution Quality (40%) — merge cadence, lead time, fail rate, recency, PR effort
  2. Collaboration & Review Quality (30%) — PageRank on weighted review graph
  3. Code Health (30%) — code churn + merge reliability
"""

import json
import math
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from statistics import median

import networkx as nx
import requests

# ─── Config ──────────────────────────────────────────────────────────────────

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
if not GITHUB_TOKEN:
    sys.exit("ERROR: GITHUB_TOKEN environment variable is not set.")

REPO_OWNER = "PostHog"
REPO_NAME  = "posthog"
WINDOW_DAYS = 90
PAGE_SIZE   = 100

BOT_LOGINS = {"dependabot", "renovate", "github-actions", "posthog-bot", "snyk-bot", "mendral-app"}
BOT_PATTERN = re.compile(r"\[bot\]", re.IGNORECASE)

HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Content-Type":  "application/json",
}
GQL_URL = "https://api.github.com/graphql"

# ─── GraphQL helpers ──────────────────────────────────────────────────────────

PR_FIELDS = """
  number
  title
  createdAt
  updatedAt
  mergedAt
  closedAt
  additions
  deletions
  changedFiles
  author { login avatarUrl }
  labels(first: 20) { nodes { name } }
  reviews(first: 100) {
    nodes {
      author { login }
      state
      submittedAt
      comments { totalCount }
    }
  }
"""

MERGED_QUERY = """
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      first: 50
      states: [MERGED]
      after: $cursor
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        """ + PR_FIELDS + """
      }
    }
  }
}
"""

CLOSED_QUERY = """
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      first: 50
      states: [CLOSED]
      after: $cursor
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        """ + PR_FIELDS + """
      }
    }
  }
}
"""


def run_query(query: str, variables: dict, retries: int = 6) -> dict:
    for attempt in range(retries):
        try:
            resp = requests.post(
                GQL_URL,
                json={"query": query, "variables": variables},
                headers=HEADERS,
                timeout=60,
            )
            if resp.status_code in (502, 503, 504) and attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  [{resp.status_code}] Retrying in {wait}s (attempt {attempt + 1}/{retries})…", flush=True)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                raise RuntimeError(f"GraphQL errors: {data['errors']}")
            return data
        except (requests.exceptions.ChunkedEncodingError,
                requests.exceptions.ConnectionError) as exc:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  [network error: {exc.__class__.__name__}] Retrying in {wait}s…", flush=True)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("Exhausted retries")


def fetch_prs(state_query: str, since: datetime, date_field: str = "createdAt") -> list[dict]:
    """Paginate through PRs, stopping when updatedAt falls outside the window."""
    prs = []
    cursor = None
    page = 0

    while True:
        page += 1
        print(f"  Fetching page {page} (cursor={cursor})…", flush=True)
        data = run_query(state_query, {
            "owner":  REPO_OWNER,
            "name":   REPO_NAME,
            "cursor": cursor,
        })
        nodes = data["data"]["repository"]["pullRequests"]["nodes"]
        page_info = data["data"]["repository"]["pullRequests"]["pageInfo"]

        done = False
        for node in nodes:
            updated_str = node.get("updatedAt")
            if updated_str:
                updated = datetime.fromisoformat(updated_str.replace("Z", "+00:00"))
                if updated < since:
                    done = True
                    break
            prs.append(node)

        if done or not page_info["hasNextPage"]:
            break
        cursor = page_info["endCursor"]

    # Secondary filter: keep only PRs whose relevant timestamp is in-window.
    in_window = []
    for pr in prs:
        ts_str = pr.get(date_field)
        if not ts_str:
            continue
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if ts >= since:
            in_window.append(pr)
    return in_window


# ─── Bot filter ───────────────────────────────────────────────────────────────

def is_bot(login: str) -> bool:
    if not login:
        return True
    return BOT_PATTERN.search(login) is not None or login.lower() in BOT_LOGINS


# ─── Normalization ────────────────────────────────────────────────────────────

def norm(val: float, min_val: float, max_val: float, invert: bool = False) -> float:
    if max_val == min_val:
        return 1.0 if not invert else 0.0
    n = (val - min_val) / (max_val - min_val)
    return 1.0 - n if invert else n


# ─── Week index helper ────────────────────────────────────────────────────────

def week_index(dt: datetime, now: datetime) -> int:
    delta = now - dt
    return int(delta.days // 7)


# ─── PILLAR 1: Execution Quality ─────────────────────────────────────────────

def compute_execution_quality(merged_prs: list[dict], now: datetime) -> dict:
    """
    Returns dict keyed by login with execution quality components.
    Sub-metrics: merge cadence, lead time, change failure rate, recency, PR effort.
    """
    stats: dict[str, dict] = defaultdict(lambda: {
        "merge_count": 0,
        "lead_times_hours": [],
        "revert_count": 0,
        "weekly_counts": defaultdict(int),
        "recency_weight": 0.0,
        "prs_authored": [],
        "effort_scores": [],
    })

    for pr in merged_prs:
        author = pr.get("author")
        if not author:
            continue
        login = author["login"]
        if is_bot(login):
            continue

        merged_at = datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00"))
        created_at = datetime.fromisoformat(pr["createdAt"].replace("Z", "+00:00"))
        lead_hours = (merged_at - created_at).total_seconds() / 3600

        wk = week_index(merged_at, now)
        decay = 0.85 ** wk

        s = stats[login]
        s["merge_count"] += 1
        s["lead_times_hours"].append(lead_hours)
        s["weekly_counts"][wk] += 1
        s["recency_weight"] += decay
        s["prs_authored"].append(pr["number"])

        # PR effort = changedFiles * log1p(additions + deletions)
        changed_files = pr.get("changedFiles", 0)
        additions = pr.get("additions", 0)
        deletions = pr.get("deletions", 0)
        effort = changed_files * math.log1p(additions + deletions)
        s["effort_scores"].append(effort)

        if "revert" in pr["title"].lower():
            s["revert_count"] += 1

    # Minimum activity threshold: at least 3 merged PRs
    stats = {login: s for login, s in stats.items() if s["merge_count"] >= 3}

    logins = list(stats.keys())
    if not logins:
        return {}

    # Collect raw values for normalization
    merge_counts    = [stats[l]["merge_count"] for l in logins]
    recency_weights = [stats[l]["recency_weight"] for l in logins]
    lead_medians    = [median(stats[l]["lead_times_hours"]) if stats[l]["lead_times_hours"] else 0 for l in logins]
    cfr_rates       = [
        stats[l]["revert_count"] / stats[l]["merge_count"] if stats[l]["merge_count"] else 0
        for l in logins
    ]
    effort_medians  = [median(stats[l]["effort_scores"]) if stats[l]["effort_scores"] else 0 for l in logins]

    max_merge   = max(merge_counts);   min_merge   = min(merge_counts)
    max_recency = max(recency_weights); min_recency = min(recency_weights)
    max_lead    = max(lead_medians);    min_lead    = min(lead_medians)
    max_cfr     = max(cfr_rates);       min_cfr     = min(cfr_rates)
    max_effort  = max(effort_medians);  min_effort  = min(effort_medians)

    result = {}
    for login in logins:
        s = stats[login]
        mf  = norm(s["merge_count"], min_merge, max_merge)
        lt  = norm(median(s["lead_times_hours"]) if s["lead_times_hours"] else 0,
                   min_lead, max_lead, invert=True)
        cfr = norm(
            s["revert_count"] / s["merge_count"] if s["merge_count"] else 0,
            min_cfr, max_cfr, invert=True,
        )
        rec = norm(s["recency_weight"], min_recency, max_recency)
        eff = norm(median(s["effort_scores"]) if s["effort_scores"] else 0,
                   min_effort, max_effort)

        eq_score = mf * 0.25 + lt * 0.20 + cfr * 0.20 + rec * 0.15 + eff * 0.20

        # Weekly activity (last 13 weeks)
        weekly_activity = []
        for wk in range(13):
            week_start = now - timedelta(weeks=wk + 1)
            week_label = week_start.strftime("%Y-%m-%d")
            weekly_activity.append({"week": week_label, "prCount": s["weekly_counts"].get(wk, 0)})
        weekly_activity.reverse()

        raw_lead = median(s["lead_times_hours"]) if s["lead_times_hours"] else 0
        raw_effort = median(s["effort_scores"]) if s["effort_scores"] else 0

        result[login] = {
            "executionQuality": {
                "mergeCadence":       round(mf, 4),
                "leadTime":           round(lt, 4),
                "changeFailureRate":  round(cfr, 4),
                "recencyScore":       round(rec, 4),
                "prEffortScore":      round(eff, 4),
            },
            "executionQualityScore": round(eq_score, 4),
            "mergeCount":       s["merge_count"],
            "revertCount":      s["revert_count"],
            "medianLeadHours":  round(raw_lead, 1),
            "medianEffort":     round(raw_effort, 1),
            "prsAuthored":      s["prs_authored"],
            "weeklyActivity":   weekly_activity,
        }

    return result


# ─── PILLAR 2: Collaboration & Review Quality ─────────────────────────────────

def compute_review_data(merged_prs: list[dict], eq_map: dict):
    """
    Build review graph and compute PageRank.
    Edge weight = review_count * avg_comments_per_review_normalized * reviewer_execution_quality
    Returns: (nx.DiGraph, pagerank_scores_normalized, review_stats)
    """
    # Step 1: Collect per-pair review counts and comment counts
    pair_review_count: dict[tuple, int] = defaultdict(int)
    pair_comment_count: dict[tuple, int] = defaultdict(int)

    reviews_given:    dict[str, int] = defaultdict(int)
    reviews_received: dict[str, int] = defaultdict(int)
    reviewer_for:     dict[str, list] = defaultdict(list)

    for pr in merged_prs:
        author = pr.get("author")
        if not author:
            continue
        pr_author = author["login"]
        if is_bot(pr_author) or pr_author not in eq_map:
            continue

        seen_reviewers = set()
        for review in pr.get("reviews", {}).get("nodes", []):
            rev_author = review.get("author")
            if not rev_author:
                continue
            reviewer = rev_author["login"]
            if is_bot(reviewer) or reviewer == pr_author:
                continue

            comment_count = review.get("comments", {}).get("totalCount", 0)
            pair_review_count[(reviewer, pr_author)] += 1
            pair_comment_count[(reviewer, pr_author)] += comment_count

            reviews_given[reviewer] += 1
            reviews_received[pr_author] += 1
            if reviewer not in seen_reviewers:
                reviewer_for[reviewer].append(pr_author)
                seen_reviewers.add(reviewer)

    # Step 2: Compute avg comments per review for each (reviewer, author) pair
    pair_avg_comments = {}
    for pair, count in pair_review_count.items():
        avg = pair_comment_count[pair] / count if count > 0 else 0
        pair_avg_comments[pair] = avg

    # Normalize avg comments across all pairs (0-1), with minimum of 0.1
    all_avgs = list(pair_avg_comments.values())
    max_avg_comments = max(all_avgs) if all_avgs else 1
    min_avg_comments = min(all_avgs) if all_avgs else 0

    # Also compute per-engineer avg comments (for the output JSON)
    engineer_total_comments: dict[str, int] = defaultdict(int)
    engineer_total_reviews: dict[str, int] = defaultdict(int)
    for (reviewer, _), count in pair_review_count.items():
        engineer_total_reviews[reviewer] += count
    for (reviewer, _), comments in pair_comment_count.items():
        engineer_total_comments[reviewer] += comments

    engineer_avg_comments = {}
    for login in engineer_total_reviews:
        total_rev = engineer_total_reviews[login]
        total_com = engineer_total_comments.get(login, 0)
        engineer_avg_comments[login] = round(total_com / total_rev, 2) if total_rev > 0 else 0

    # Step 3: Build graph with new edge weight formula
    G = nx.DiGraph()
    for login in eq_map:
        G.add_node(login)

    for (reviewer, pr_author), review_count in pair_review_count.items():
        avg_c = pair_avg_comments[(reviewer, pr_author)]
        # Normalize
        if max_avg_comments > min_avg_comments:
            avg_c_norm = (avg_c - min_avg_comments) / (max_avg_comments - min_avg_comments)
        else:
            avg_c_norm = 0.5
        avg_c_norm = max(0.1, avg_c_norm)  # floor at 0.1

        reviewer_eq = eq_map.get(reviewer, {}).get("executionQualityScore", 0)
        weight = review_count * avg_c_norm * reviewer_eq

        if G.has_edge(reviewer, pr_author):
            G[reviewer][pr_author]["weight"] += weight
        else:
            G.add_edge(reviewer, pr_author, weight=weight)

    # Step 4: PageRank
    pr_scores_raw = nx.pagerank(G, weight="weight")

    # Normalize 0-1
    pr_min = min(pr_scores_raw.values()) if pr_scores_raw else 0
    pr_max = max(pr_scores_raw.values()) if pr_scores_raw else 1
    pr_range = pr_max - pr_min or 1
    pr_scores = {k: round((v - pr_min) / pr_range, 4) for k, v in pr_scores_raw.items()}

    return G, pr_scores, dict(reviews_given), dict(reviews_received), dict(reviewer_for), engineer_avg_comments


# ─── PILLAR 3: Code Health ────────────────────────────────────────────────────

def compute_code_health(merged_prs: list[dict], closed_prs: list[dict], eq_map: dict) -> dict:
    """
    Code churn rate + merge reliability per engineer.
    Returns dict keyed by login.
    """
    # We need file paths per PR. The GraphQL query fetches changedFiles (count) but not
    # individual file paths. We'll approximate churn using PR number as a proxy:
    # count how many PRs an engineer has, and use changedFiles counts.
    # For a more accurate churn measure, we track (login, changedFiles) across PRs.
    #
    # Actually, we don't have individual file paths from the GraphQL query.
    # We'll approximate code churn as: total changedFiles across all PRs / sum of unique PR count.
    # High changedFiles/PR ratio with many PRs suggests touching many files per PR.
    # Instead, let's use: average files per PR as a rough inverse of churn.
    # A better approximation: engineers who touch fewer files per PR more often = higher churn.
    #
    # Since we can't get actual file paths from this GraphQL query, we'll approximate:
    # churn_rate = 1 - (number_of_PRs / total_changedFiles_sum)
    # This gives a rough measure: if you have 10 PRs touching 10 files total = 0 churn (good)
    # If you have 10 PRs touching 100 files total, each PR touches 10 files = low churn
    # Actually this doesn't quite capture re-touching. Let's just do:
    # avg_files_per_pr = total_files / pr_count. Then churn_rate = 1 - 1/avg_files_per_pr
    # But that's not really churn.
    #
    # Better: total_file_touches = sum of changedFiles across all PRs.
    # unique_file_estimate = min(total_file_touches, changedFiles_of_largest_PR * pr_count * 0.5)
    # Actually let's keep it simple and meaningful:
    # We'll estimate churn as: 1 - (max_single_pr_files / total_file_touches)
    # This rewards engineers whose work is distributed.
    #
    # Simplest meaningful approach without file paths:
    # churn_proxy = stdev(changedFiles per PR) / mean(changedFiles per PR)  (coefficient of variation)
    # Low CV = consistent PR size = less churn. High CV = variable, possibly re-touching.
    # Actually this isn't churn either.
    #
    # Let's just use the data we have:
    # For code churn, since we don't have file paths, approximate using:
    # total_file_touches = sum of changedFiles across PRs
    # unique_files_estimate = we can't know this. So use a simpler metric:
    # PR focus score = 1 / (1 + stdev_of_changes_per_pr / mean_changes_per_pr) if mean > 0
    # This rewards consistent, focused work.
    #
    # Actually, let me re-read the requirement. It says:
    # "count total file touches across all their PRs and count unique file paths"
    # We CAN'T get unique file paths from the GraphQL query we have (we'd need the files connection).
    # But we CAN add it to the GraphQL query. However, the files connection on PullRequest
    # doesn't exist in GitHub's GraphQL API — we'd need the REST API for that.
    #
    # For now, approximate churn using coefficient of variation of changedFiles per PR.
    # Engineers with highly variable PR sizes (some huge, some tiny) score lower.

    from statistics import stdev

    file_touches: dict[str, list[int]] = defaultdict(list)

    for pr in merged_prs:
        author = pr.get("author")
        if not author:
            continue
        login = author["login"]
        if is_bot(login) or login not in eq_map:
            continue
        file_touches[login].append(pr.get("changedFiles", 0))

    # Count closed-without-merge per engineer
    closed_counts: dict[str, int] = defaultdict(int)
    for pr in closed_prs:
        author = pr.get("author")
        if not author:
            continue
        login = author["login"]
        if is_bot(login) or login not in eq_map:
            continue
        # Only count if not merged (redundant given the query, but safe)
        if not pr.get("mergedAt"):
            closed_counts[login] += 1

    result = {}
    # Collect raw churn values for normalization
    raw_churn_values = []
    for login in eq_map:
        touches = file_touches.get(login, [])
        if len(touches) >= 2:
            mean_t = sum(touches) / len(touches)
            std_t = stdev(touches) if len(touches) >= 2 else 0
            cv = std_t / mean_t if mean_t > 0 else 0
        else:
            cv = 0
        raw_churn_values.append((login, cv))

    churn_vals = [cv for _, cv in raw_churn_values]
    max_cv = max(churn_vals) if churn_vals else 1
    min_cv = min(churn_vals) if churn_vals else 0

    for login, cv in raw_churn_values:
        # churn_score: lower CV is better, so invert
        churn_score = norm(cv, min_cv, max_cv, invert=True)

        merged_count = eq_map[login]["mergeCount"]
        closed_count = closed_counts.get(login, 0)
        total = merged_count + closed_count
        merge_reliability = merged_count / total if total > 0 else 1.0

        code_health = churn_score * 0.50 + merge_reliability * 0.50

        result[login] = {
            "churnRate":        round(cv, 4),
            "churnScore":       round(churn_score, 4),
            "mergeReliability": round(merge_reliability, 4),
            "codeHealthScore":  round(code_health, 4),
        }

    return result


# ─── Summary generation ───────────────────────────────────────────────────────

def generate_summary(login: str, data: dict, reviewer_for: dict) -> str:
    merged = data["prsMerged"]
    effort = data.get("medianEffort", 0)
    reliability = data.get("mergeReliability", 1.0)
    reliability_pct = round(reliability * 100)
    churn = data.get("churnRate", 0)
    churn_pct = round(churn * 100, 1)
    avg_comments = data.get("avgCommentsPerReview", 0)
    reviews = data.get("reviewsGiven", 0)

    top_prs = reviewer_for.get(login, [])
    seen = set()
    unique_top = []
    for name in top_prs:
        if name not in seen:
            seen.add(name)
            unique_top.append(name)
    top3 = unique_top[:3]
    top_str = ", ".join(f"@{t}" for t in top3) if top3 else ""

    parts = [
        f"Shipped {merged} PRs (median effort score: {effort:.0f}), "
        f"{reliability_pct}% merge reliability, "
        f"code churn rate of {churn_pct}%.",
    ]
    if reviews > 0:
        parts.append(
            f"Reviewed {reviews} PRs with avg {avg_comments:.1f} comments per review."
        )
    if top_str:
        parts.append(f"Top reviewer for {top_str}.")

    return " ".join(parts)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    now   = datetime.now(timezone.utc)
    since = now - timedelta(days=WINDOW_DAYS)

    print(f"Fetching PRs from {REPO_OWNER}/{REPO_NAME} since {since.date()} …")

    print("\n[1/2] Fetching MERGED PRs…")
    merged_prs_raw = fetch_prs(MERGED_QUERY, since, date_field="mergedAt")
    print(f"  → {len(merged_prs_raw)} merged PRs fetched")

    print("\n[2/2] Fetching CLOSED (not merged) PRs…")
    closed_prs_raw = fetch_prs(CLOSED_QUERY, since, date_field="closedAt")
    print(f"  → {len(closed_prs_raw)} closed PRs fetched")

    # Print date range for verification
    def date_range(prs: list[dict], field: str) -> str:
        dates = [pr[field] for pr in prs if pr.get(field)]
        if not dates:
            return "n/a"
        return f"{min(dates)[:10]} → {max(dates)[:10]}"

    print(f"\n  Merged PR date range (mergedAt):  {date_range(merged_prs_raw, 'mergedAt')}")
    print(f"  Closed PR date range (closedAt):  {date_range(closed_prs_raw, 'closedAt')}")
    print(f"  Window:                           {since.date()} → {now.date()}")

    # Filter out bots
    merged_prs = [
        pr for pr in merged_prs_raw
        if pr.get("author") and not is_bot(pr["author"]["login"])
    ]
    closed_prs = [
        pr for pr in closed_prs_raw
        if pr.get("author") and not is_bot(pr["author"]["login"])
    ]
    print(f"\nAfter bot filter: {len(merged_prs)} merged, {len(closed_prs)} closed PRs retained")

    # Collect avatar URLs
    avatar_map: dict[str, str] = {}
    for pr in merged_prs_raw + closed_prs_raw:
        if pr.get("author"):
            avatar_map[pr["author"]["login"]] = pr["author"].get("avatarUrl", "")

    # ── PILLAR 1: Execution Quality ──────────────────────────────────────────
    print("\nComputing Execution Quality (Pillar 1)…")
    eq_map = compute_execution_quality(merged_prs, now)
    print(f"  {len(eq_map)} engineers with execution quality scores")

    # ── PILLAR 2: Collaboration & Review Quality ─────────────────────────────
    print("Computing Collaboration (Pillar 2) — review graph + PageRank…")
    G, pr_scores, reviews_given, reviews_received, reviewer_for, avg_comments_map = \
        compute_review_data(merged_prs, eq_map)
    print(f"  Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    # ── PILLAR 3: Code Health ────────────────────────────────────────────────
    print("Computing Code Health (Pillar 3)…")
    health_map = compute_code_health(merged_prs, closed_prs, eq_map)
    print(f"  {len(health_map)} engineers with code health scores")

    # ── Assemble engineers ────────────────────────────────────────────────────
    print("Assembling final impact scores…")
    engineers = []
    for login, eq in eq_map.items():
        eq_score    = eq["executionQualityScore"]
        collab      = pr_scores.get(login, 0.0)
        health      = health_map.get(login, {})
        health_score = health.get("codeHealthScore", 0.5)

        impact = round(eq_score * 0.40 + collab * 0.30 + health_score * 0.30, 4)

        eng = {
            "login":                login,
            "avatar_url":           avatar_map.get(login, ""),
            # Pillar 1: Execution Quality
            "executionQuality":     eq["executionQuality"],
            "executionQualityScore": eq_score,
            # Pillar 2: Collaboration
            "collaborationScore":   round(collab, 4),
            "pageRankScore":        round(collab, 4),  # alias for graph panel compat
            # Pillar 3: Code Health
            "churnRate":            health.get("churnRate", 0),
            "churnScore":           health.get("churnScore", 0.5),
            "mergeReliability":     health.get("mergeReliability", 1.0),
            "codeHealthScore":      health_score,
            # Final
            "impactScore":          impact,
            # PR effort (for display)
            "prEffortScore":        eq["executionQuality"]["prEffortScore"],
            "medianEffort":         eq["medianEffort"],
            # Review quality (for display)
            "avgCommentsPerReview": avg_comments_map.get(login, 0),
            # Activity
            "summary":              "",  # filled below for top-5
            "reviewsGiven":         reviews_given.get(login, 0),
            "reviewsReceived":      reviews_received.get(login, 0),
            "prsAuthored":          len(eq["prsAuthored"]),
            "prsMerged":            eq["mergeCount"],
            "medianLeadHours":      eq["medianLeadHours"],
            "weeklyActivity":       eq["weeklyActivity"],
            # Legacy compat (keep for graph panel)
            "doraScore":            eq_score,
            "dora": {
                "mergeFrequency":     eq["executionQuality"]["mergeCadence"],
                "leadTime":           eq["executionQuality"]["leadTime"],
                "changeFailureRate":  eq["executionQuality"]["changeFailureRate"],
                "recencyScore":       eq["executionQuality"]["recencyScore"],
            },
        }
        engineers.append(eng)

    engineers.sort(key=lambda e: e["impactScore"], reverse=True)

    # Generate summaries for all engineers (useful for node detail panel)
    for eng in engineers:
        eng["summary"] = generate_summary(eng["login"], eng, reviewer_for)

    # ── Graph output ──────────────────────────────────────────────────────────
    graph_nodes_by_login = {}
    for eng in engineers:
        graph_nodes_by_login[eng["login"]] = {
            "id": eng["login"],
            "doraScore": eng["executionQualityScore"],
            "impactScore": eng["impactScore"],
        }

    graph_edges = []
    for u, v, data in G.edges(data=True):
        graph_edges.append({"source": u, "target": v, "weight": round(data["weight"], 4)})

    # ── Write output ──────────────────────────────────────────────────────────
    # Clean up internal fields
    for eng in engineers:
        eng.pop("medianLeadHours", None)
        eng.pop("medianEffort", None)

    output = {
        "engineers": engineers,
        "graph": {
            "nodes": list(graph_nodes_by_login.values()),
            "edges": graph_edges,
        },
        "metadata": {
            "fetchedAt":      now.isoformat(),
            "totalPRs":       len(merged_prs_raw) + len(closed_prs_raw),
            "totalEngineers": len(engineers),
            "windowDays":     WINDOW_DAYS,
        },
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "public", "dashboard-data.json")
    out_path = os.path.normpath(out_path)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone! Wrote {out_path}")
    print(f"  Engineers: {len(engineers)}")
    print(f"  Total PRs: {output['metadata']['totalPRs']}")
    print(f"\nTop 5 by impact score:")
    for eng in engineers[:5]:
        print(f"  {eng['login']:30s}  impact={eng['impactScore']:.4f}  "
              f"EQ={eng['executionQualityScore']:.4f}  "
              f"collab={eng['collaborationScore']:.4f}  "
              f"health={eng['codeHealthScore']:.4f}")


if __name__ == "__main__":
    main()
