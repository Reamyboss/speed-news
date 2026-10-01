# tools/

Offline analysis. Nothing here ships or runs in production — these exist so
claims about accuracy (clustering thresholds, AI grounding) can be re-derived
from evidence rather than re-guessed.

## Clustering

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

The labelled set itself lives in `tests/fixtures/cluster-eval.ts` because it is
a test fixture, not a tool — it is what makes the accuracy claims checkable.

## AI grounding (hallucination rate)

| Script | Purpose |
|---|---|
| `dump-ai-corpus.ts` | Dumps every AI-enriched story to `tools/ai-corpus.json`, material and output together. |
| `eval-ai.ts` | Scores `checkGrounding` (`src/lib/ai/grounding.ts`) against `tests/fixtures/ai-eval.ts`. Pass `--verbose` for the false-positive/false-negative detail. |

Typical loop after changing anything in `src/lib/ai/grounding.ts`:

```bash
npx tsx tools/dump-ai-corpus.ts     # refresh from the database, once there's new enriched output
npx tsx tools/eval-ai.ts --verbose
npm test -- ai-quality              # the committed ratchet
```

The labelled set lives in `tests/fixtures/ai-eval.ts`, same reasoning as
clustering's — see its header for what it contains and why precision (never
flagging genuinely clean output) matters more here than recall.

`corpus.json`, `candidates.json` and `ai-corpus.json` are gitignored
(`tools/*.json`): they are derived from the database and contain publisher
headlines and model output. Regenerate them locally.
