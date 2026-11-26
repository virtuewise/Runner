import type { NetworkOperationsRepository, RunnerAvailabilityInput, RunnerLocationInput } from "./network-operations.ts";
interface QueryResult<Row> { readonly rows: readonly Row[]; readonly rowCount: number | null; }
interface PgClient { query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>; release(): void; }
export interface NetworkOperationsPgPool { connect(): Promise<PgClient>; }
export class PostgresNetworkOperationsRepository implements NetworkOperationsRepository {
  constructor(private readonly pool: NetworkOperationsPgPool) {}
  async recordLocation(input: { runnerId: string; location: RunnerLocationInput; receivedAt: string; expiresAt: string }): Promise<"recorded" | "stale" | "sharing_disabled"> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select runner_id from public.runner_profiles where runner_id=$1 for update", [input.runnerId]);
      const consent = await client.query<{ enabled: boolean }>(
        "select enabled from public.runner_location_sharing where runner_id=$1 and purpose='active_mission' for update",
        [input.runnerId],
      );
      if (consent.rows[0]?.enabled !== true) {
        await client.query("commit");
        return "sharing_disabled";
      }
      const result = await client.query<{ sequence: number }>(`insert into public.runner_location_snapshots
        (runner_id,latitude,longitude,accuracy_metres,heading_degrees,speed_metres_per_second,
         captured_at,received_at,expires_at,sequence)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        on conflict (runner_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,
          accuracy_metres=excluded.accuracy_metres,heading_degrees=excluded.heading_degrees,
          speed_metres_per_second=excluded.speed_metres_per_second,captured_at=excluded.captured_at,
          received_at=excluded.received_at,expires_at=excluded.expires_at,sequence=excluded.sequence
        where public.runner_location_snapshots.sequence < excluded.sequence
        returning sequence`, [
        input.runnerId,input.location.latitude,input.location.longitude,input.location.accuracyMetres,
        input.location.headingDegrees ?? null,input.location.speedMetresPerSecond ?? null,
        input.location.capturedAt,input.receivedAt,input.expiresAt,input.location.sequence,
      ]);
      await client.query("commit");
      return result.rows.length === 1 ? "recorded" : "stale";
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async setLocationSharing(input: { runnerId: string; enabled: boolean; updatedAt: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select runner_id from public.runner_profiles where runner_id=$1 for update", [input.runnerId]);
      await client.query(`insert into public.runner_location_sharing(runner_id,purpose,enabled,updated_at)
        values($1,'active_mission',$2,$3)
        on conflict (runner_id,purpose) do update set enabled=excluded.enabled,updated_at=excluded.updated_at`,
        [input.runnerId,input.enabled,input.updatedAt]);
      if (!input.enabled) {
        await client.query("delete from public.runner_location_snapshots where runner_id=$1", [input.runnerId]);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async setAvailability(input: { runnerId: string; window: RunnerAvailabilityInput; recordedAt: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select runner_id from public.runner_profiles where runner_id=$1 for update", [input.runnerId]);
      await client.query(`update public.runner_availability_windows set status='cancelled'
        where runner_id=$1 and status in ('available','unavailable')
          and tstzrange(available_from,available_until,'[)') &&
              tstzrange($2::timestamptz,$3::timestamptz,'[)')`,
        [input.runnerId,input.window.availableFrom,input.window.availableUntil]);
      await client.query(`insert into public.runner_availability_windows
        (runner_id,available_from,available_until,status,created_at)
        values($1,$2,$3,$4,$5)`,
        [input.runnerId,input.window.availableFrom,input.window.availableUntil,input.window.status,input.recordedAt]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
export function createPostgresNetworkOperationsRepository(pool: NetworkOperationsPgPool): NetworkOperationsRepository {
  return new PostgresNetworkOperationsRepository(pool);
}
