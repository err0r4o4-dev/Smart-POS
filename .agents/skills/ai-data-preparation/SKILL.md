---
name: ai-data-preparation
description: 'Inspect or prepare authorized time-series forecast data with explicit units and cutoff. Use for data quality/leakage, not production exports or training.'
metadata:
  origin: local-authored
---

# Forecast Data Preparation

Establish the approved data source, task, target, grain, units, timezone and prediction cutoff before reading or transforming records. Inspection-only work does not authorize exporting data or writing artifacts.

- Preserve tenant/branch/product identity and provenance. Do not pool unrelated tenants or infer authority from model-returned identifiers.
- Check duplicates, missing periods, corrections/returns, outliers and unavailable history against the owning domain meaning; do not silently fabricate zero demand.
- Separate observed sales from estimated demand. Stockouts, promotions and closures can change what observations mean.
- Build features from information actually available at the prediction cutoff. Fit transformations only on each training window; avoid future, target and cross-tenant leakage.
- Define horizon, unit conversions and aggregation rules explicitly. Preserve exact source quantities until an approved numeric boundary.
- Keep preparation deterministic and version its rules/data provenance when artifacts are requested. Minimize retained identifiers and sensitive fields.

Read [temporal preparation](references/temporal-preparation.md) for splits and reproducibility. In SmartPOS consult smartpos-ai-evaluation for retail semantics. This workflow does not authorize dependency installation, model/provider changes, training or production access.
