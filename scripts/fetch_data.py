#!/usr/bin/env python3
"""
PostHog Engineering Impact Dashboard — Data Fetcher
Fetches merged/closed PRs from PostHog/posthog via GitHub GraphQL,
computes DORA metrics, runs PageRank on the review graph, and writes
public/dashboard-data.json.
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
    """Paginate through PRs, stopping when updatedAt falls outside the window.

    Results are ordered by UPDATED_AT DESC, so we use updatedAt as the stop
    condition — it matches the sort key and avoids premature stops caused by
    old createdAt values on recently-updated PRs.  After collecting all pages
    we discard PRs whose `date_field` is outside the window.
    """
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
            # Stop once updatedAt (the sort key) crosses out of our window.
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


# ─── DORA computation ─────────────────────────────────────────────────────────

def week_index(dt: datetime, now: datetime) -> int:
    """0 = most recent week, higher = older."""
    delta = now - dt
    return int(delta.days // 7)


def compute_dora(merged_prs: list[dict], now: datetime) -> dict:
    """
    Returns a dict keyed by engineer login with raw DORA components.
    """
    stats: dict[str, dict] = defaultdict(lambda: {
        "merge_count": 0,
        "lead_times_hours": [],
        "revert_count": 0,
        "weekly_counts": defaultdict(int),
        "recency_weight": 0.0,
        "prs_authored": [],
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

        if "revert" in pr["title"].lower():
            s["revert_count"] += 1

    # Normalize helpers
    def norm(val: float, min_val: float, max_val: float, invert: bool = False) -> float:
        if max_val == min_val:
            return 1.0 if not invert else 0.0
        n = (val - min_val) / (max_val - min_val)
        return 1.0 - n if invert else n

    # Minimum activity threshold: at least 3 merged PRs to appear in rankings
    stats = {login: s for login, s in stats.items() if s["merge_count"] >= 3}

    logins = list(stats.keys())
    if not logins:
        return {}

    merge_counts    = [stats[l]["merge_count"] for l in logins]
    recency_weights = [stats[l]["recency_weight"] for l in logins]
    lead_medians    = [median(stats[l]["lead_times_hours"]) if stats[l]["lead_times_hours"] else 0 for l in logins]
    cfr_rates       = [
        stats[l]["revert_count"] / stats[l]["merge_count"] if stats[l]["merge_count"] else 0
        for l in logins
    ]

    max_merge   = max(merge_counts)
    min_merge   = min(merge_counts)
    max_recency = max(recency_weights)
    min_recency = min(recency_weights)
    max_lead    = max(lead_medians)
    min_lead    = min(lead_medians)
    max_cfr     = max(cfr_rates)
    min_cfr     = min(cfr_rates)

    result = {}
    for login in logins:
        s = stats[login]
        mf  = norm(s["merge_count"],                   min_merge,   max_merge)
        lt  = norm(median(s["lead_times_hours"]) if s["lead_times_hours"] else 0,
                   min_lead, max_lead, invert=True)
        cfr = norm(
            s["revert_count"] / s["merge_count"] if s["merge_count"] else 0,
            min_cfr, max_cfr, invert=True,
        )
        rec = norm(s["recency_weight"], min_recency, max_recency)

        dora_score = mf * 0.30 + lt * 0.25 + cfr * 0.25 + rec * 0.20

        # Weekly activity (last 13 weeks)
        weekly_activity = []
        for wk in range(13):
            week_start = now - timedelta(weeks=wk + 1)
            week_label = week_start.strftime("%Y-%m-%d")
            weekly_activity.append({"week": week_label, "prCount": s["weekly_counts"].get(wk, 0)})
        weekly_activity.reverse()

        result[login] = {
            "dora": {
                "mergeFrequency":      round(mf, 4),
                "leadTime":            round(lt, 4),
                "changeFailureRate":   round(cfr, 4),
                "recencyScore":        round(rec, 4),
            },
            "doraScore":        round(dora_score, 4),
            "mergeCount":       s["merge_count"],
            "revertCount":      s["revert_count"],
            "medianLeadHours":  round(median(s["lead_times_hours"]) if s["lead_times_hours"] else 0, 1),
            "prsAuthored":      s["prs_authored"],
            "weeklyActivity":   weekly_activity,
        }

    return result


# ─── Review graph ─────────────────────────────────────────────────────────────

def build_review_graph(merged_prs: list[dict], dora_map: dict) -> nx.DiGraph:
    """
    Directed edge: reviewer → PR author.
    Weight = review count between pair * reviewer's DORA score.
    """
    pair_counts: dict[tuple, int] = defaultdict(int)

    for pr in merged_prs:
        author = pr.get("author")
        if not author:
            continue
        pr_author = author["login"]
        if is_bot(pr_author) or pr_author not in dora_map:
            continue

        for review in pr.get("reviews", {}).get("nodes", []):
            rev_author = review.get("author")
            if not rev_author:
                continue
            reviewer = rev_author["login"]
            if is_bot(reviewer) or reviewer == pr_author:
                continue
            pair_counts[(reviewer, pr_author)] += 1

    G = nx.DiGraph()
    for login in dora_map:
        G.add_node(login)

    for (reviewer, pr_author), count in pair_counts.items():
        reviewer_dora = dora_map.get(reviewer, {}).get("doraScore", 0)
        weight = count * reviewer_dora
        if G.has_edge(reviewer, pr_author):
            G[reviewer][pr_author]["weight"] += weight
        else:
            G.add_edge(reviewer, pr_author, weight=weight)

    return G


# ─── Review stats ─────────────────────────────────────────────────────────────

def compute_review_stats(merged_prs: list[dict], dora_map: dict) -> tuple[dict, dict]:
    reviews_given:    dict[str, int] = defaultdict(int)
    reviews_received: dict[str, int] = defaultdict(int)
    reviewer_for:     dict[str, list] = defaultdict(list)  # reviewer → [pr_authors reviewed]

    for pr in merged_prs:
        author = pr.get("author")
        if not author:
            continue
        pr_author = author["login"]
        if is_bot(pr_author):
            continue

        seen_reviewers = set()
        for review in pr.get("reviews", {}).get("nodes", []):
            rev_author = review.get("author")
            if not rev_author:
                continue
            reviewer = rev_author["login"]
            if is_bot(reviewer) or reviewer == pr_author:
                continue
            reviews_given[reviewer] += 1
            reviews_received[pr_author] += 1
            if reviewer not in seen_reviewers:
                reviewer_for[reviewer].append(pr_author)
                seen_reviewers.add(reviewer)

    return dict(reviews_given), dict(reviews_received), dict(reviewer_for)


# ─── Summary generation ───────────────────────────────────────────────────────

def generate_summary(login: str, data: dict, reviewer_for: dict) -> str:
    merged   = data["prsMerged"]
    total    = data["prsAuthored"]
    rate     = round(merged / total * 100) if total else 0
    lead     = data["medianLeadHours"]
    top_prs  = reviewer_for.get(login, [])
    # deduplicate while preserving order
    seen = set()
    unique_top = []
    for name in top_prs:
        if name not in seen:
            seen.add(name)
            unique_top.append(name)
    top3 = unique_top[:3]

    if top3:
        top_str = ", ".join(f"@{t}" for t in top3)
        return (
            f"Merged {merged} PRs with {rate}% merge rate, "
            f"median lead time of {lead} hours. "
            f"Top reviewer for {top_str}."
        )
    return (
        f"Merged {merged} PRs with {rate}% merge rate, "
        f"median lead time of {lead} hours."
    )


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

    # Filter out bots from merged list (closed list used only for metadata)
    merged_prs = [
        pr for pr in merged_prs_raw
        if pr.get("author") and not is_bot(pr["author"]["login"])
    ]
    print(f"\nAfter bot filter: {len(merged_prs)} merged PRs retained")

    # Collect avatar URLs
    avatar_map: dict[str, str] = {}
    for pr in merged_prs_raw + closed_prs_raw:
        if pr.get("author"):
            avatar_map[pr["author"]["login"]] = pr["author"].get("avatarUrl", "")

    # ── DORA ──────────────────────────────────────────────────────────────────
    print("\nComputing DORA metrics…")
    dora_map = compute_dora(merged_prs, now)
    print(f"  {len(dora_map)} engineers with DORA scores")

    # ── Review graph & PageRank ───────────────────────────────────────────────
    print("Building review graph…")
    G = build_review_graph(merged_prs, dora_map)
    print(f"  Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    print("Running PageRank…")
    pr_scores_raw = nx.pagerank(G, weight="weight")

    # Normalize PageRank 0-1
    pr_min = min(pr_scores_raw.values()) if pr_scores_raw else 0
    pr_max = max(pr_scores_raw.values()) if pr_scores_raw else 1
    pr_range = pr_max - pr_min or 1
    pr_scores = {k: (v - pr_min) / pr_range for k, v in pr_scores_raw.items()}

    # ── Review stats ──────────────────────────────────────────────────────────
    reviews_given, reviews_received, reviewer_for = compute_review_stats(merged_prs, dora_map)

    # ── Assemble engineers ────────────────────────────────────────────────────
    print("Assembling final scores…")
    engineers = []
    for login, d in dora_map.items():
        dora_score  = d["doraScore"]
        pr_score    = pr_scores.get(login, 0.0)
        impact      = round(dora_score * 0.60 + pr_score * 0.40, 4)

        eng = {
            "login":          login,
            "avatar_url":     avatar_map.get(login, ""),
            "dora":           d["dora"],
            "doraScore":      dora_score,
            "pageRankScore":  round(pr_score, 4),
            "impactScore":    impact,
            "summary":        "",  # filled below for top-5
            "reviewsGiven":   reviews_given.get(login, 0),
            "reviewsReceived": reviews_received.get(login, 0),
            "prsAuthored":    len(d["prsAuthored"]),
            "prsMerged":      d["mergeCount"],
            "medianLeadHours": d["medianLeadHours"],
            "weeklyActivity": d["weeklyActivity"],
        }
        engineers.append(eng)

    engineers.sort(key=lambda e: e["impactScore"], reverse=True)

    # Generate summaries for top-5
    for eng in engineers[:5]:
        eng["summary"] = generate_summary(eng["login"], eng, reviewer_for)

    # Remove medianLeadHours from output (internal only)
    for eng in engineers:
        eng.pop("medianLeadHours", None)

    # ── Graph output ──────────────────────────────────────────────────────────
    graph_nodes = [
        {"id": login, "doraScore": dora_map[login]["doraScore"], "impactScore": eng["impactScore"]}
        for login, eng in zip(
            [e["login"] for e in engineers],
            engineers,
        )
    ]
    graph_nodes_by_login = {
        login: {"id": login, "doraScore": dora_map[login]["doraScore"], "impactScore": next(e["impactScore"] for e in engineers if e["login"] == login)}
        for login in dora_map
    }

    graph_edges = []
    for u, v, data in G.edges(data=True):
        graph_edges.append({"source": u, "target": v, "weight": round(data["weight"], 4)})

    # ── Write output ──────────────────────────────────────────────────────────
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
        print(f"  {eng['login']:30s}  impact={eng['impactScore']:.4f}  dora={eng['doraScore']:.4f}  pagerank={eng['pageRankScore']:.4f}")


if __name__ == "__main__":
    main()
