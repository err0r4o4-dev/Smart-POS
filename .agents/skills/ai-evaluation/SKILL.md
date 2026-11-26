---
name: ai-evaluation
description: 'Plan or perform authorized forecast backtesting against deterministic baselines. Use for quality metrics/uncertainty, not health checks or model changes.'
metadata:
  origin: local-authored
---

# Forecast Evaluation

Define the decision, dataset provenance, target/grain, cutoff, horizon, baseline, metric and allowed compute before execution. Distinguish an evaluation plan from an executed evaluation.

- Use chronological or rolling-origin backtests. Keep the training window before each forecast origin and fit preprocessing only on that window.
- Compare against suitable deterministic baselines, including simple seasonal or last-observation methods when appropriate. Report missing history and insufficient-data cases rather than fabricated accuracy.
- Choose metrics that match the business units and objective. Explain zero-demand behavior, aggregation weights, missing forecasts and stockout/censoring limitations; do not use a single score to hide weak segments.
- Evaluate uncertainty only if it is actually produced and supported. Report interval coverage/width where relevant; do not invent confidence intervals from point forecasts.
- Keep tenant/branch scope and retail-unit conversions intact. Performance or quality improvements need equivalent datasets and reproducible comparisons.
- Separate quality acceptance from deployment or autonomous action. A good score does not authorize stock writes, purchasing, training, paid inference or a model/provider switch.

Read the [evaluation report](references/evaluation-report.md) for evidence to retain. In SmartPOS select smartpos-ai-evaluation for owning policies and python-testing for changed service behavior. Report actual results and uncertainty; unexecuted scenarios are not passes.
