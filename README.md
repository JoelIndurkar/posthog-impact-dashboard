# PostHog Engineering Impact Dashboard

An interactive dashboard that answers: **who are the most impactful engineers at PostHog, and why?** Built on 90 days of GitHub data from the PostHog/posthog repository, it scores 115 engineers across three pillars: execution quality, collaboration depth, and code health.

**Deployed Live**: [posthog-impact-dashboard-eosin.vercel.app](https://posthog-impact-dashboard-eosin.vercel.app/)

## How to Run Locally

```bash
git clone https://github.com/JoelIndurkar/posthog-impact-dashboard.git
cd posthog-impact-dashboard

# Install frontend dependencies
npm install

# Install Python dependencies (for data pipeline)
pip install networkx requests

# Set your GitHub token (needs repo read access)
export GITHUB_TOKEN=ghp_your_token_here

# Run the data pipeline (~5 min, fetches from GitHub GraphQL API)
python scripts/fetch_data.py

# Start the dev server
npm run dev
```

<img width="1918" height="951" alt="Screenshot 2026-03-27 at 11 47 50 PM" src="https://github.com/user-attachments/assets/afce5ab3-9fa6-4c47-8285-16b885275c88" />

The data script outputs `public/dashboard-data.json`. The frontend reads this file statically — no runtime API calls required.

## The Impact Model

DORA metrics are a useful foundation but incomplete — they measure delivery process, not team-level impact. This dashboard supplements DORA-aligned execution metrics with graph-based collaboration analysis and code health signals to produce a more complete picture of engineering impact.

Impact is defined as a weighted composite of three pillars:

### Pillar 1: Execution Quality (40%)

Measures how effectively an engineer ships code. Five sub-metrics, each normalized 0-1:

| Sub-metric | Weight | What it captures |
|---|---|---|
| Merge Cadence | 25% | Throughput — how many PRs land per week |
| Lead Time | 20% | Speed — how quickly PRs go from open to merged |
| Change Failure Rate | 20% | Reliability — ratio of reverted or failed PRs |
| Recency | 15% | Sustained activity — are contributions recent or front-loaded? |
| PR Effort | 20% | Scope — `changedFiles * log1p(additions + deletions)` |

PR effort uses a logarithmic scale because a 10,000-line migration is not 100x more impactful than a 100-line fix. The log dampens extreme outliers while still rewarding substantial contributions.

### Pillar 2: Collaboration & Review Quality (30%)

Measures an engineer's influence on the team through code review. This is where the model diverges most from standard DORA.

A directed graph is constructed where each edge represents a review relationship (reviewer -> author). Edge weights are calculated as:

```
weight = review_count * avg_comments_normalized * reviewer_execution_quality
```

This means reviews from high-performing engineers with substantive comments (not just approvals) carry more weight. A rubber-stamp approval from an inactive reviewer scores lower than a detailed review from a top contributor.

**PageRank** is then computed on this weighted graph using NetworkX. PageRank naturally captures influence: an engineer who is reviewed by many strong reviewers ranks higher than one reviewed by few or weak reviewers. This is the same algorithm Google originally used to rank web pages — applied here to rank engineers by their position in the collaboration network.

### Pillar 3: Code Health (30%)

Measures the durability and reliability of an engineer's contributions:

| Sub-metric | Weight | What it captures |
|---|---|---|
| Code Churn | 50% | How often an engineer touches the same files across multiple PRs. High repeat-touch rates suggest maintenance or rework rather than net-new development. |
| Merge Reliability | 50% | Ratio of merged PRs to total PRs (merged + closed without merge). Low reliability suggests speculative or abandoned work. |

These signals go beyond DORA by measuring what happens *after* code is shipped. A fast merge cadence means less if the code is immediately rewritten.

### Final Score

```
impact = (executionQuality * 0.40) + (collaborationScore * 0.30) + (codeHealth * 0.30)
```

All sub-metrics are min-max normalized across the cohort before weighting, so scores reflect relative standing within the team.

## Data Pipeline

The Python script (`scripts/fetch_data.py`) handles all data acquisition and computation:

- **Source**: GitHub GraphQL API with cursor-based pagination
- **Window**: 90 days of activity
- **Volume**: 7,543 PRs (merged + closed) across 115 engineers
- **Filtering**: Bots are excluded (dependabot, renovate, github-actions, posthog-bot, snyk-bot, mendral-app, and any login matching `[bot]`). Engineers with fewer than 3 merged PRs are excluded.
- **Graph**: NetworkX builds a directed review graph (115 nodes, 2,050 edges) and computes PageRank with DORA-weighted edges

Output is a single static JSON file (`public/dashboard-data.json`) containing all engineer scores, the review graph, and metadata.

## Architecture

```
scripts/fetch_data.py  -->  public/dashboard-data.json  -->  Next.js app
     (Python)                   (static JSON)                (client-side)
```

The architecture is intentionally simple. The Python script does all the heavy lifting — API calls, score computation, graph analysis — and writes a static JSON file. The Next.js app reads this file at build time and renders everything client-side. There are no runtime API calls, no database, no server-side computation. The dashboard loads instantly.

This separation means the data pipeline can be re-run independently (e.g., on a cron job) without redeploying the frontend.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Visualization | react-force-graph-2d (review graph), Recharts (activity charts) |
| Data Pipeline | Python, NetworkX (PageRank), GitHub GraphQL API |
| Fonts | DM Mono, Syne |
| Deployment | Vercel |

## Key Design Decisions

- **PageRank over simple review counts**: Raw review counts don't capture influence. An engineer reviewed by 5 strong contributors is more impactful than one reviewed by 20 inactive ones. PageRank on a weighted graph captures this naturally.

- **Logarithmic PR effort scaling**: `changedFiles * log1p(additions + deletions)` prevents large migrations from dominating the effort metric while still rewarding meaningful scope.

- **DORA-weighted review edges**: edges weighted by the reviewer's execution quality score. This creates a feedback loop where reviews from strong engineers carry more signal — the same principle behind academic citation networks.

- **Code churn as a health signal**: measures how often an engineer re-touches the same files across PRs — a high ratio of total file touches to unique files suggests rework or maintenance rather than forward progress.

- **Static JSON architecture**: All computation happens offline in Python. The frontend is a pure visualization layer with zero runtime dependencies. This makes it fast, cheap to host, and easy to reason about.

- **Interactive review graph**: The force-directed graph visualization is included to make the collaboration network tangible. Nodes are sized by impact score and edges show review weight with full formula breakdowns on hover.
