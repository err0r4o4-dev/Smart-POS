---
name: smartpos-ai-evaluation
description: Plan or perform scoped offline evaluation of SmartPOS demand forecasts, deterministic baselines, data preparation, and supported uncertainty. Use for forecast-quality changes or backtesting requests; not health/schema checks alone, autonomous business actions, or authorization for production data access, model training, or paid inference.
---

# SmartPOS AI Evaluation

## Scope and inputs

Read `AGENTS.md`, `docs/architecture/ai.md`, the affected AI/domain code and tests,
current diff, and the supplied dataset/result metadata. Paths are repository-root
relative. Distinguish an evaluation plan, boundary tests, and an executed quality
evaluation. An unimplemented model has no measured accuracy.

Use `smartpos-ai-service` when inference/data-preparation code changes. Go retains
tenant authorization, business acceptance, and persistence; evaluations do not
authorize writing stock, ordering goods, confirming sales, or changing production.
Inspection-only requests do not authorize training, inference, artifact writes,
dependency installation, data exports, or starting services.

## Define the evaluation contract

Before execution, establish the concrete decision and scope:

- Target: observed sales, estimated demand, stockout risk, or another approved
  quantity. Observed sales during stockouts are not automatically true demand.
- Grain and units: organization/branch/product/base unit, bucket boundaries,
  business timezone, cutoff, and forecast horizon. Preserve authorized scope and
  exact business-unit conversions rather than pooling tenants or mixing units.
- Method/model version, baseline, input/schema version, and allowed compute/data
  sources. Do not choose a provider/model or invent a training requirement.
- Dataset provenance/version, available history, missing/duplicate handling,
  returns/corrections policy, and information actually available at prediction time.
- Acceptance criteria, representative segments, and output/artifact permissions.
  Ask for material unresolved business definitions or release thresholds; do not
  fabricate numerical targets merely to mark an evaluation passed.

## Offline evaluation workflow

1. Inspect approved data and result schemas without exposing raw customer data or
   credentials. Prefer supplied authorized snapshots and reproducible small test
   fixtures for boundary checks; synthetic fixtures do not establish real accuracy.
2. Check dates/order, duplicates, history gaps, unit consistency, finite values,
   stockouts, promotions, returns, and leakage risks relevant to the target. Missing
   days are not zero sales unless the dataset contract establishes that meaning.
   Stop or label limitations when history or target validity is insufficient.
3. Use chronological holdouts or rolling-origin backtests suited to the forecast
   horizon. At each cutoff, build features/transforms only from information then
   available. Keep fitting, tuning, and final test windows separate; do not use
   future sales, realized promotions/stock, or full-dataset scaling as features.
4. Compare with a simple relevant baseline, such as naive or seasonal-naive, using
   the same cutoffs, horizons, target, and preprocessing policy. Label deterministic
   reorder rules separately; they are not automatically probabilistic forecasts.
   Do not add models or train them unless the evaluation scope explicitly allows it.
5. Select metrics aligned with the decision: point error/bias and, where supported,
   interval coverage/width or quantile loss. Explain units, aggregation/weighting,
   zero-demand handling, and any undefined denominators. Do not rely on MAPE alone
   for zero/intermittent demand or invent uncertainty from point-only output.
6. Report relevant horizons and segments, not only a favorable global average.
   Include sparse/new products, low/high volume, and stockout-affected periods
   when relevant and adequately represented. Show coverage, omitted cases,
   baseline comparison, and limitations without exposing cross-tenant data.
7. Check insufficient_data, unavailable, malformed/non-finite output, schema/model
   mismatch, and stale-result cases through relevant boundary tests. Never convert
   those states into a confident zero forecast or a successful recommendation.
8. If an authorized code/model change is evaluated, compare versions on a fixed
   held-out policy. Record regressions and threshold failures honestly. Evaluation
   evidence informs a human decision; it does not authorize automatic model
   promotion, provider changes, production rollout, or retail mutations.

## Reproducibility and operating limits

- Record dataset/version or approved fingerprint, cutoff/folds, horizon, units,
  transformations, model/baseline versions, parameters, and seeds where relevant.
  Capture dependency/runtime versions from actual tools, not assumed latest ones.
- Establish sample/compute/time/cost limits before expensive work. Use existing
  tooling; do not download datasets/models or call paid APIs without approval.
  Report incomplete/failed runs rather than replacing missing evidence with scores.
- Do not persist raw snapshots or prompts in logs/artifacts by default. Store only
  authorized minimized results in the agreed location and preserve retention rules.
- When monitoring is requested, define drift/data-quality/latency signals and a
  human response. Do not silently retrain, switch models, or automate replenishment.

Methodology reference when needed: Forecasting: Principles and Practice,
[time series cross-validation](https://otexts.com/fpp3/tscv.html). Apply the method
to the approved retail target; the reference supplies no SmartPOS release threshold.

## Verification and delivery

Inspect `apps/ai/pyproject.toml`, `apps/ai/tests`, and existing runners before
choosing commands. Reuse current pytest patterns for relevant regression tests;
do not install an evaluation framework or add ML dependencies merely to provide
a score. Health/schema tests, lint, and builds do not establish forecast quality.

Report the evaluation objective, data scope/provenance, cutoffs, baseline, model,
metrics, segments, actual results, acceptance decision, and limitations. Separate
planned checks, executed checks, insufficient evidence, and blocked prerequisites.
For skills/documentation-only changes, validate metadata/references/formatting/diff;
do not run an artificial training/evaluation job to validate these instructions.
