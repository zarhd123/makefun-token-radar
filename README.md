# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/zarhd123/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/zarhd123/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks the pre-token protocols in a sealed DefiLlama snapshot by the implied value a token launch would carry, and shows how to farm each one. The model is comparables-based: every protocol's multiple is the median market-cap-to-TVL ratio the live protocols in its own category already trade at (or the snapshot-wide median where a category has too few live peers), times TVL, seven-day growth, how long it has run with no token, and chain breadth. The dashboard is a static page — a ranked board with a top-5 spotlight, search, category and chain filters, a live-token view set aside from the ranking, a per-protocol detail view with the model's own inputs and a seven-step farm plan, and a sandbox that previews a different weighting of the same model.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node 22.18 or later, standard library only. It reads the snapshot, writes the ranked board to `out/board.json`, the dashboard's data to `out/data.js`, and copies `dashboard/` and `screenshots/` to `out/` with `out/dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=kpx4mmmd&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
