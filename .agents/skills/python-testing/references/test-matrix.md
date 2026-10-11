# Python Test Matrix

| Boundary             | Relevant cases                                                                    |
| -------------------- | --------------------------------------------------------------------------------- |
| Schema               | Required/extra fields, bounds, finite values, supported versions and units        |
| Internal HTTP        | Success, authentication failure, malformed request and established error envelope |
| Integration client   | Deadline, canceled work, dependency unavailable and invalid response              |
| Forecast preparation | Missing history, duplicates, cutoff, units and cross-tenant separation            |
| Output               | Point/interval shape, supported uncertainty and insufficient-data status          |

Use synthetic, deterministic fixtures. Quality scores require an authorized dataset and backtest, not merely an HTTP 200 assertion. Report prerequisites if the local Python environment is unavailable instead of installing it automatically.
