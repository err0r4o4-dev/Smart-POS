# Internal Endpoint Boundary Checklist

- Establish the existing request/response version, supported horizon/grain and unit representation.
- Check missing/extra fields, invalid bounds, malformed JSON, non-finite numbers and unsupported versions where the schema requires them.
- Preserve service authentication and the Go-owned organization/branch snapshot; never accept identifiers as new authorization.
- Separate invalid input, insufficient data, canceled request, unavailable dependency, timeout and invalid inference output according to the existing contract.
- Keep health/readiness independent from forecast-quality claims.
- Carry deadlines and minimize payloads without exposing credentials or private exception details.
- Verify relevant schemas and error behavior through existing tests; deploying, training or changing a provider is a separate task.
