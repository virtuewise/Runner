# Observability & SLOs

Status: Instrumentation plan; dashboards and alerts not deployed. Owner: Platform Engineering.

Metrics: request rate/latency/errors, queue age, candidate counts, assignment conflicts, handover success, provider latency, DB pool saturation and lock waits. Logs: structured JSON with trace/request IDs, role and opaque mission ID. Traces: API → domain → repository → provider.

Never log addresses, contact details, tokens, full manifests, identity documents, payment details or custody secrets.

Dashboards: API health, mission funnel, dispatch liquidity, relay execution, custody, safety/disputes, providers, DB and cost per completion. Define SLOs after baseline data exists; alert on user impact and integrity failures.