---
name: post-elim energy study
overview: Measure pre-dig and post-dig "energy" in the `occupied` segments that bracket each candidate `eliminating` plateau, to test whether a shy-cat pause (ghost plateau) is distinguishable from a real elimination, on the `both` false-positive cohort. Ship a one-off analysis script + a results markdown; no classifier change yet.
todos:
  - id: script
    content: "Write `postElimEnergyStudy.ts` one-off: replay fixtures, compute pre/post-dig window features for each predicted `eliminating` period, label via bouts.csv (primary) / heuristic (fallback), emit CSV + JSON summary."
    status: pending
  - id: run
    content: Run the script against the exported annotated fixtures; inspect `post_elim_energy_rows.csv` + ROC-AUC summary.
    status: pending
  - id: writeup
    content: Write `summaries/post-elim-energy-study-results.md` with hypotheses, method, top-feature table, what-if on the `both` false-positive cohort, and go/no-go decision; cross-link from the existing both-FP summary.
    status: pending
isProject: false
---

## Problem, restated in the codebase

`determineEliminationType` in [packages/api/src/services/devices/providers/esphome/StateAnalyzer.ts](packages/api/src/services/devices/providers/esphome/StateAnalyzer.ts) labels a session `both` when two `eliminating` periods straddle `URINATION_VARIANCE_THRESHOLD_G` on the per-second RMS median (`eliminatingPeriodMotionMetric`). A shy cat that pauses mid-visit can turn its predator-check stillness into a second, low-variance `eliminating` plateau — hence GT `urination` or `defecation` -> pred `both` (23 visits in [metrics_baseline.json](packages/api/src/services/devices/providers/esphome/test/metrics_baseline.json)).

The period model already knows what sits **around** each plateau: `occupied` runs (digging, posture shifts). The existing classifier never reads those; this study asks whether they separate "real elimination" plateaus from "ghost / predator-check" plateaus.

## Hypotheses

- **H1 (post-dig asymmetry).** The cat's motion energy at any point **after** a real elimination is higher than after a predator-check pause (cats bury after leaving something) — when aggregated across all non-eliminating samples in the session tail, not only the immediately adjacent `occupied` run.
- **H2 (pre-dig priming).** Real eliminations are preceded by more motion energy (hole-making) than ghost pauses — aggregated across all non-eliminating samples in the session head.
- **H3 (bracketing).** A combined pre+post feature (sum or product of energies, min of the two) separates ghosts from real plateaus better than either alone.
- **H4 (duration asymmetry).** Ghost plateaus are shorter than real ones; duration combined with pre/post energy amplifies the signal over either component.

## Windows are not always contiguous with the plateau

Observed example (user-provided trace): a true urination plateau at ~140–160 s, then the cat **steps off** the box, re-enters, and does the real digging from a better angle on the *re-entry* `occupied` run. Because the re-entry happens inside `reentryWindow` (15 s in [StateAnalyzer.ts](packages/api/src/services/devices/providers/esphome/StateAnalyzer.ts)), the session does **not** end; the merged `periods` array becomes roughly `... -> eliminating -> occupied(brief) -> gap -> entering -> occupied(digging) -> ...`, and the digging energy lives in the **second** occupied run, not the first.

Any "energy around the plateau" definition must therefore:

- Span the whole session tail / head, not just the immediately adjacent period.
- Tolerate intervening `gap` (weight below `entryThreshold`) and `entering` periods without treating them as a reset.
- Treat `gap` samples as zero-or-low signal (the cat is off the box), *not* as high motion — done by masking them out of the numerator and not counting their duration in the "digging time" denominator.
- Still allow a near-window variant (fixed 5 s / 10 s right after P.end) for contrast, so we can check whether proximity or totals discriminate better.

## Prerequisites

The script reads exported fixtures from `packages/api/src/services/devices/providers/esphome/test/`: `visits.csv`, `streams/*.txt`, and (optionally) `bouts.csv`. If those are missing, export them first from the dev DB per [summaries/analyzer-benchmark-annotated-fixtures.md](summaries/analyzer-benchmark-annotated-fixtures.md):

```bash
cd packages/api
node --experimental-strip-types \
  src/services/devices/providers/esphome/test/exportHumanVerifiedLitterboxFixtures.ts \
  --selection annotated --limit 3000 \
  --out src/services/devices/providers/esphome/test
```

`loadVisits`, `loadStream`, `loadBouts` and the `VisitRow` / `BoutRow` / `TimeBout` types are already exported from [analyzerHarness.test.ts](packages/api/src/services/devices/providers/esphome/test/analyzerHarness.test.ts) and [analyzerHarnessMetrics.ts](packages/api/src/services/devices/providers/esphome/test/analyzerHarnessMetrics.ts); reuse them directly.

## Study design (per eliminating period, within each visit)

**CSV cohort (rows emitted):** every visit with at least one predicted `eliminating` period. One row per period. This gives plenty of 1-plateau material for the window-family contrast.

**Primary analysis cohort (for AUC / separation stats):** visits where the current classifier predicts `both` OR where GT session class is `both`. The rest are present as context / sanity rows.

Secondary cohort for the what-if table: GT `both` (24 visits in [metrics_baseline.json](packages/api/src/services/devices/providers/esphome/test/metrics_baseline.json)) as the positive control — both plateaus must remain "real" after any proposed rule.

### Window definitions (compute all, pick later)

Given merged `periods` from `StateAnalyzer.processEvent(weights)`, for each `eliminating` period P at indices `[P.start, P.end]`, let `onBox(range)` denote indices whose period state is `occupied` or `entering` (i.e. excluding `gap` where the cat has stepped off). Let `prevElimEnd(P)` be the `end` of the nearest previous `eliminating` period (or session start if none), and `nextElimStart(P)` be the `start` of the nearest next `eliminating` period (or session end if none).

**Primary (inter-plateau bounded) — credit each plateau only with its own side of the neighbor plateau:**

- **preBetween**: `onBox` samples in `[prevElimEnd(P), P.start]`. In 1-plateau visits this is the whole on-box session head.
- **postBetween**: `onBox` samples in `[P.end, nextElimStart(P)]`. In 1-plateau visits this is the whole on-box session tail.
- **postBetweenGapTrim**: same as `postBetween` but also drops a 2 s buffer after any `gap -> entering` boundary to trim the re-entry thump.

In a 2-plateau visit the inter-plateau chunk is shared — it appears in `postBetween(P1)` **and** `preBetween(P2)`. That's intentional: the same digging is evidence for both neighbors, and each per-period row reflects the digging adjacent to *that* plateau.

**Contrast windows (kept in the CSV to empirically validate the tightening, expected to be dropped later):**

- **preAdjacent / postAdjacent**: the single `occupied`/`entering` period immediately preceding / following P, clipped to 20 s. Tests whether session-wide aggregation beats "just the neighbor period" on exit-and-reenter traces.
- **preFixed5s / postFixed5s**: fixed 5 s window on either side of P, restricted to `onBox(...)` samples. Tests whether proximity alone is enough.
- **preSessionOnBox / postSessionOnBox**: untightened version — `onBox` samples from session start / to session end (crossing foreign eliminating periods). Expected to be noisier than the `between` variant in multi-plateau visits and identical to it in single-plateau visits; kept only to prove that.

**Edge-buffer trimming (applied to every window).** To skip the transition jolt on entry/exit of the plateau, use the same 10-sample (1 s at 10 Hz) buffer as `StateAnalyzer.processEvent` uses for its own period variance:

- Any `pre*` window ends at `P.start - 10` (drop the last 10 samples before the plateau starts).
- Any `post*` window starts at `P.end + 10` (drop the first 10 samples after the plateau ends).
- For `preBetween` / `postBetween`, the `prevElimEnd` / `nextElimStart` boundary also gets a 10-sample inset on the adjacent side (so the foreign-plateau exit/entry jolt is not counted).
- `preFixed5s` / `postFixed5s` are measured *after* the edge-buffer trim, so their effective span is 5 s of settled on-box samples, not 5 s including the jolt.

### Energy metrics (compute all per window)

All run on the raw window samples in grams. Windows defined as a set of possibly non-contiguous sample indices get their `medianPerSecRms` / `fracSecAboveT` computed over 1 s sub-windows that consist entirely of in-window samples (partials dropped), and `meanAbsDiff` over pairs of adjacent **in-window** samples (differences across a gap are skipped, not zero-padded).

- `medianPerSecRms` — reuse [`eliminatingPeriodMotionMetric`](packages/api/src/services/devices/providers/esphome/StateAnalyzer.ts), comparable scale to `URINATION_VARIANCE_THRESHOLD_G`.
- `meanAbsDiff` — mean of `|w_t - w_{t-1}|`, impulse/jerk sensitive.
- `fracSecAboveT_{2,4,6}` — fraction of 1 s sub-windows whose RMS exceeds T in g.
- `durationS` — window length in seconds (on-box samples only for session-level windows).
- `offBoxFracS` — fraction of the session head/tail span spent in `gap` (not included in the energy but reported as context; a cat that bounces off repeatedly is a different animal).

### Per-period labeling

- **Primary label** (when the visit has per-bout GT, `bout_annotation_level=per_bout` in `visits.csv`, with intervals in `bouts.csv`): `greedyBoutPairing` from [analyzerHarnessMetrics.ts](packages/api/src/services/devices/providers/esphome/test/analyzerHarnessMetrics.ts) matches by overlap on inflated intervals — adapt it (or inline a single-pass variant) to return **which predicted period index** matched. Matched → `real`; unmatched → `ghost`. This is the only label used for AUC, ROC and separation stats.
- **Descriptive label** (session-only GT visits, `bout_annotation_level=session_only`): for 2-plateau visits with GT single-type, mark the period whose `variance` is more consistent with GT as `real_candidate`, the other as `ghost_candidate` (urination-consistent ⇔ `variance < URINATION_VARIANCE_THRESHOLD_G`, defecation-consistent ⇔ variance ≥). Ambiguous cases (both variances on the same side of the threshold, GT `no_elimination`, 1-plateau rows under GT single-type, etc.) → `unknown`. These labels are **reported only as distribution context** — they are never fed into AUC / separation stats, only eyeballed against the `real` / `ghost` distributions.

### Outputs

One row per predicted `eliminating` period in a new CSV `post_elim_energy_rows.csv` (gitignored, alongside `metrics_latest.json`). Rows emitted for **every** visit with at least one predicted `eliminating` period.

Columns:

- **Visit / period identity**: `visit_id`, `gt_session_elim`, `pred_session_elim`, `period_index` (0-based), `n_eliminating_periods`, `elim_variance`.
- **Window features**, cross-product of:
  - window = `{preBetween, postBetween, postBetweenGapTrim, preAdjacent, postAdjacent, preFixed5s, postFixed5s, preSessionOnBox, postSessionOnBox}` (note: `betweenGapTrim` is post-only; no `preBetweenGapTrim`).
  - metric = `{medianPerSecRms, meanAbsDiff, fracSecAboveT_2, fracSecAboveT_4, fracSecAboveT_6, durationS, offBoxFracS}`.
  - Column name: `{window}_{metric}`, e.g. `postBetween_medianPerSecRms`.
- **Label**: `real` / `ghost` / `real_candidate` / `ghost_candidate` / `unknown`.
- **Row-level context** (same for all rows of a given visit):
  - `gap_between_periods_s`: for 2-plateau visits, `(P2.start - P1.end) / hz`; else `NaN`.
  - `session_tail_s`: `(sessionEnd - P.end) / hz` measured against the last sample written to the CSV row's visit (full stream length), not the last plateau.
  - `n_reentries_after`: count of `gap -> entering` transitions in `[P.end, nextElimStart(P)]` (so bounded by the next plateau, not session end).

A JSON sibling `post_elim_energy_summary.json` holds per-feature distribution stats (median, p90, ROC-AUC for `ghost` vs `real` on the primary-labeled rows). **AUC implementation: roll-your-own trapezoidal sweep over sorted thresholds; no stats/ML dep.**

## Script

New file: `packages/api/src/services/devices/providers/esphome/test/postElimEnergyStudy.ts`. Writes `post_elim_energy_rows.csv` and `post_elim_energy_summary.json` next to the fixtures. No changes to `StateAnalyzer` or `determineEliminationType`.

Run (from repo root):

```bash
cd packages/api
node --experimental-strip-types \
  src/services/devices/providers/esphome/test/postElimEnergyStudy.ts
```

Pseudo-structure:

```ts
for (const v of visits) {
  const w = await loadStream(FIXTURE_DIR, v.stream_relpath);
  const r = new StateAnalyzer(v.knownGrams).processEvent(w);
  const predElim = determineEliminationType(r.periods);
  const elimIndices = r.periods
    .map((p, i) => (p.state === 'eliminating' ? i : -1))
    .filter((i) => i >= 0);
  if (elimIndices.length === 0) continue;
  for (const i of elimIndices) {
    const feats = computeWindowFeatures(w, r.periods, i, v.sample_rate_hz);
    const label = labelPeriod(v, r.periods, i, boutsByVisit.get(v.visit_id));
    rows.push({ visit_id: v.visit_id, period_index: i, pred_session_elim: predElim, ...feats, label });
  }
}
```

Use `v.sample_rate_hz` from `visits.csv` for the hz parameter (falls back to 10 inside `StateAnalyzer` but the window maths must match the stream's actual rate).

## Analyses / "results" pass

Computed in the script (to be written into the markdown after the first run):

- **Per-feature separation (primary labels)**: ROC-AUC, 50th/90th percentile by label for each `{window, metric}` combo; pick the top 3.
- **Window family head-to-head**: AUC of `{between, adjacent, fixed5s, sessionOnBox}` on the same energy metric, reported separately for 1-plateau and 2-plateau visit cohorts. Expectation: `between` ≈ `sessionOnBox` on 1-plateau rows (they are literally equal), `between` ≥ `sessionOnBox` on 2-plateau rows (tightening removes foreign-plateau contamination), both ≥ `adjacent` / `fixed5s` on exit-and-reenter traces like the user's example.
- **Confusion preview**: for the top feature, pick a cutoff that keeps GT `both` recall at 1.0 on the per-bout cohort (24 visits today); count how many false-`both` rows would be flipped back to the single-type consistent with GT. Present as a what-if table, nothing wired yet.
- **Pre vs post vs bracketing**: does `min(preEnergy, postEnergy)` or `preEnergy + postEnergy` outperform either alone?
- **Sanity check**: on `no_elimination -> pred urination/defecation` visits (25 in baseline), how do the same features distribute? Recorded as a secondary table.

## Deliverables

- [packages/api/src/services/devices/providers/esphome/test/postElimEnergyStudy.ts](packages/api/src/services/devices/providers/esphome/test/postElimEnergyStudy.ts) — one-off script, no test added.
- Generated (gitignored): `post_elim_energy_rows.csv`, `post_elim_energy_summary.json` alongside the fixtures.
- [summaries/post-elim-energy-study-results.md](summaries/post-elim-energy-study-results.md) — hypotheses, method, measurements, results table (top features + what-if), decision on whether to proceed to a rule.
- A short cross-link appended to [summaries/elimination-both-false-positive-experiments.md](summaries/elimination-both-false-positive-experiments.md) pointing at the results doc.

## What is explicitly **not** in this plan

- No edits to [`StateAnalyzer.ts`](packages/api/src/services/devices/providers/esphome/StateAnalyzer.ts) or [`determineEliminationType`](packages/api/src/services/devices/providers/esphome/StateAnalyzer.ts). Study first; rule only after a feature wins.
- No baseline refresh in [metrics_baseline.json](packages/api/src/services/devices/providers/esphome/test/metrics_baseline.json).
- Single-plateau false positives (GT `no_elimination` -> pred urination/defecation) are observed in the sanity check only, not optimized against here.

## Go / no-go for a future rule

Worth shipping a pre/post-dig gate if the top feature:

1. Reclassifies at least ~half of the current false-`both` rows (~11 of 23) to the GT-consistent single type, **and**
2. Keeps GT `both` recall at 1.0 on the per-bout cohort, **and**
3. Leaves `bout P/R/F1` within the 5 % regression gate in the harness on a dry-run integration.
