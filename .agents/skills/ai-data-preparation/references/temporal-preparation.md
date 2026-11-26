# Temporal Preparation

Before execution, record target, grain, units, timezone, bucket boundary, prediction cutoff, horizon and authorized data provenance.

1. Keep raw observations separate from corrections and derived features according to domain policy.
2. Resolve duplicates/missing periods explicitly; a closed store, stockout and unknown data are not interchangeable zero-demand observations.
3. For each forecast origin use only information available then, including corrected records or exogenous inputs with their availability dates.
4. Fit scaling, imputation, encoders and feature selection on the training window only.
5. Preserve tenant/product identity across joins and temporal splits; do not share target statistics across unauthorized entities.
6. Check reproducibility and verify leakage/missing-data cases with synthetic fixtures before using real authorized inputs.

Data exports, retained artifacts, training and production access require explicit task scope. Do not log customer or sensitive transaction data as preparation evidence.
