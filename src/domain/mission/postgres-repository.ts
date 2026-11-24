import type { Mission, MissionEvent, MissionQuote, MissionTerms, RunnerEligibility } from "./types.ts";
import type { IdempotencyClaim, MissionRepository, MissionTransaction } from "./persistence.ts";

interface QueryResult<Row> { readonly rows: readonly Row[]; readonly rowCount: number | null; }
interface PgQueryable {
  query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
}
interface PgClient extends PgQueryable { release(): void; }
export interface PgPool extends PgQueryable { connect(): Promise<PgClient>; }

interface MissionRow {
  id: string; requester_id: string; status: Mission["status"]; category: MissionTerms["category"];
  manifest: Record<string, unknown>; pickup: MissionTerms["pickup"]; destination: MissionTerms["destination"];
  declared_value_minor: string | number; currency: string; quote: MissionQuote | null;
  assigned_runner_id: string | null; created_at: Date | string; updated_at: Date | string; version: string | number;
}
interface RunnerRow {
  runner_id: string; identity_status: string; qualification_status: string; is_active: boolean;
  vehicle_class: RunnerEligibility["vehicleClass"] | null; capabilities: string[]; jurisdictions: string[];
}
interface ReceiptRow {
  request_hash_hex: string; response_status: number | null; response_body: unknown; completed_at: Date | string | null;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function missionFromRow(row: MissionRow): Mission {
  const manifest = row.manifest;
  return {
    id: row.id,
    requesterId: row.requester_id,
    status: row.status,
    terms: {
      category: row.category,
      description: String(manifest.description ?? ""),
      currency: row.currency,
      declaredValueMinor: Number(row.declared_value_minor),
      weightGrams: Number(manifest.weightGrams ?? 0),
      pickup: row.pickup,
      destination: row.destination,
      requiredCapabilities: Array.isArray(manifest.requiredCapabilities) ? manifest.requiredCapabilities as string[] : [],
      ...(typeof manifest.requiredVehicleClass === "string" ? { requiredVehicleClass: manifest.requiredVehicleClass as NonNullable<MissionTerms["requiredVehicleClass"]> } : {}),
      prohibitedItemScreeningPassed: manifest.prohibitedItemScreeningPassed === true,
    },
    ...(row.quote ? { quote: row.quote } : {}),
    ...(row.assigned_runner_id ? { assignedRunnerId: row.assigned_runner_id } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    version: Number(row.version),
  };
}
function manifestFromMission(mission: Mission): Record<string, unknown> {
  return {
    description: mission.terms.description,
    weightGrams: mission.terms.weightGrams,
    requiredCapabilities: mission.terms.requiredCapabilities,
    ...(mission.terms.requiredVehicleClass ? { requiredVehicleClass: mission.terms.requiredVehicleClass } : {}),
    prohibitedItemScreeningPassed: mission.terms.prohibitedItemScreeningPassed,
  };
}

class PostgresMissionTransaction implements MissionTransaction {
  constructor(private readonly client: PgClient) {}

  async insertMission(mission: Mission): Promise<void> {
    await this.client.query(
      `insert into public.missions
       (id, requester_id, status, category, manifest, pickup, destination, declared_value_minor,
        currency, quote, assigned_runner_id, pricing_version, quote_expires_at, version, created_at, updated_at)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16)`,
      [mission.id, mission.requesterId, mission.status, mission.terms.category,
        JSON.stringify(manifestFromMission(mission)), JSON.stringify(mission.terms.pickup),
        JSON.stringify(mission.terms.destination), mission.terms.declaredValueMinor, mission.terms.currency,
        mission.quote ? JSON.stringify(mission.quote) : null, mission.assignedRunnerId ?? null,
        mission.quote?.pricingVersion ?? null, mission.quote?.expiresAt ?? null, mission.version,
        mission.createdAt, mission.updatedAt],
    );
  }

  async loadMissionForUpdate(missionId: string): Promise<Mission | null> {
    const result = await this.client.query<MissionRow>(
      "select * from public.missions where id = $1 for update", [missionId],
    );
    return result.rows[0] ? missionFromRow(result.rows[0]) : null;
  }

  async loadRunnerEligibility(runnerId: string): Promise<RunnerEligibility | null> {
    const result = await this.client.query<RunnerRow>(
      `select rp.runner_id, rp.identity_status, rp.qualification_status, rp.is_active, rp.vehicle_class,
        coalesce((select array_agg(rc.capability_code) from public.runner_capabilities rc
          where rc.runner_id = rp.runner_id and rc.status = 'verified'
          and (rc.valid_until is null or rc.valid_until > now())), array[]::text[]) as capabilities,
        coalesce((select array_agg(rj.country_code) from public.runner_jurisdictions rj
          where rj.runner_id = rp.runner_id and rj.status = 'approved'), array[]::text[]) as jurisdictions
       from public.runner_profiles rp where rp.runner_id = $1`, [runnerId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      runnerId: row.runner_id,
      identityVerified: row.identity_status === "verified",
      qualified: row.qualification_status === "qualified",
      active: row.is_active,
      capabilities: row.capabilities ?? [],
      jurisdictionCodes: row.jurisdictions ?? [],
      ...(row.vehicle_class ? { vehicleClass: row.vehicle_class } : {}),
    };
  }

  async saveMission(mission: Mission, expectedVersion: number): Promise<boolean> {
    if (mission.version !== expectedVersion + 1) return false;
    const result = await this.client.query(
      `update public.missions set status=$1, manifest=$2::jsonb, quote=$3::jsonb,
        assigned_runner_id=$4, pricing_version=$5, quote_expires_at=$6,
        updated_at=$7, version=$8
       where id=$9 and version=$10`,
      [mission.status, JSON.stringify(manifestFromMission(mission)),
        mission.quote ? JSON.stringify(mission.quote) : null, mission.assignedRunnerId ?? null,
        mission.quote?.pricingVersion ?? null, mission.quote?.expiresAt ?? null,
        mission.updatedAt, mission.version, mission.id, expectedVersion],
    );
    return result.rowCount === 1;
  }

  async appendEvents(events: readonly MissionEvent[]): Promise<void> {
    for (const item of events) {
      await this.client.query(
        `insert into public.mission_events
         (event_id, mission_id, sequence, actor_id, actor_role, event_type, idempotency_key,
          from_status, to_status, payload, occurred_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
        [item.eventId, item.missionId, item.sequence, item.actorId, item.actorRole, item.type,
          item.idempotencyKey, item.fromStatus ?? null, item.toStatus,
          JSON.stringify(item.metadata ?? {}), item.occurredAt],
      );
    }
  }

  async claimIdempotency(input: {
    actorId: string; scope: string; key: string; requestHash: string;
  }): Promise<IdempotencyClaim> {
    if (!/^[a-f0-9]{64}$/i.test(input.requestHash)) return { kind: "conflict" };
    const inserted = await this.client.query(
      `insert into public.idempotency_receipts (actor_id, scope, idempotency_key, request_hash)
       values ($1,$2,$3,decode($4,'hex')) on conflict do nothing returning actor_id`,
      [input.actorId, input.scope, input.key, input.requestHash],
    );
    if (inserted.rows.length === 1) return { kind: "claimed" };
    const existing = await this.client.query<ReceiptRow>(
      `select encode(request_hash,'hex') as request_hash_hex, response_status, response_body, completed_at
       from public.idempotency_receipts
       where actor_id=$1 and scope=$2 and idempotency_key=$3 for update`,
      [input.actorId, input.scope, input.key],
    );
    const receipt = existing.rows[0];
    if (!receipt || receipt.request_hash_hex.toLowerCase() !== input.requestHash.toLowerCase()) return { kind: "conflict" };
    if (receipt.completed_at && receipt.response_status !== null) {
      return { kind: "replay", responseStatus: receipt.response_status, responseBody: receipt.response_body };
    }
    return { kind: "conflict" };
  }

  async completeIdempotency(input: {
    actorId: string; scope: string; key: string; responseStatus: number; responseBody: unknown;
  }): Promise<void> {
    const result = await this.client.query(
      `update public.idempotency_receipts
       set response_status=$4, response_body=$5::jsonb, completed_at=now()
       where actor_id=$1 and scope=$2 and idempotency_key=$3 and completed_at is null`,
      [input.actorId, input.scope, input.key, input.responseStatus, JSON.stringify(input.responseBody)],
    );
    if (result.rowCount !== 1) throw new Error("Could not complete idempotency receipt");
  }
}

export function createPostgresMissionRepository(pool: PgPool): MissionRepository {
  return {
    unitOfWork: {
      async run<T>(work: (transaction: MissionTransaction) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await work(new PostgresMissionTransaction(client));
          await client.query("commit");
          return result;
        } catch (error) {
          try { await client.query("rollback"); } catch { /* Preserve the original failure. */ }
          throw error;
        } finally {
          client.release();
        }
      },
    },
  };
}
