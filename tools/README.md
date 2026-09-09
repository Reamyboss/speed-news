# tools/

Offline analysis for the clustering rule. Nothing here ships or runs in
production — these exist so the thresholds in `src/lib/dedupe.ts` can be
re-derived from evidence rather than re-guessed.

| Script | Purpose |
|---|---|
| `dump-corpus.ts` | Dumps the current story corpus to `tools/corpus.json`. |
| `candidates.ts` | Surfaces cross-source pairs with a recall-oriented signal, for labelling. |
| `eval-cluster.ts` | Scores a decision rule against `tests/fixtures/cluster-eval.ts`. |
| `tune-thresholds.ts` | Precision/recall/margin curve for the secondary-tier threshold. |

Typical loop after changing anything in `src/lib/dedupe.ts`:

```bash
npx tsx tools/dump-corpus.ts        # refresh from the database
npx tsx tools/tune-thresholds.ts    # see the trade-off curve
npm test -- cluster-quality         # the committed ratchet
npx tsx scripts/recluster.ts --dry  # what it does to the real archive
```

`corpus.json` and `candidates.json` are gitignored: they are derived from the
database and contain publisher headlines. Regenerate them locally.

The labelled set itself lives in `tests/fixtures/cluster-eval.ts` because it is
a test fixture, not a tool — it is what makes the accuracy claims checkable.
