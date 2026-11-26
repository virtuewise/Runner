# Success Metrics & Telemetry

Status: Proposed measurement contract. Owner: Product Analytics / Engineering.

## North star

Verified successful mission completions per active requester cohort, reported with safety and economics guardrails.

## KPI tree

Acquisition: qualified signups and CAC. Activation: first valid mission. Liquidity: eligible Runner supply by zone/time. Conversion: quote-to-publish and publish-to-assignment. Execution: pickup, on-time leg and handover success. Outcome: verified delivery, cancellation, loss/damage and dispute. Retention: 30/60/90-day repeat use. Economics: GMV, net revenue, payout and contribution margin. Safety: screening rejection, incident and claim rates.

## Event envelope

Include event_id, event_name, occurred_at, schema_version, environment, actor_role, pseudonymous actor_id, mission_id where relevant, correlation_id and source. Never put raw addresses, phone numbers, identity documents, payment data or free-text manifests in analytics.

## Initial events

mission.created, manifest.screened, quote.generated, mission.published, dispatch.candidate_evaluated, leg.assigned, leg.started, custody.handover_initiated, custody.handover_confirmed, leg.completed, mission.delivered, mission.cancelled, mission.disputed, incident.reported.

Separate operational audit records from analytics. Define purpose, lawful basis, retention and access before production collection.