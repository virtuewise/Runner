export type OperationsPrincipal =
  | { readonly actorId: string; readonly role: "runner" | "requester" }
  | { readonly actorId: string; readonly role: "dispatcher" | "trust_operator" };

export interface RunnerAvailabilityView {
  readonly id: string;
  readonly availableFrom: string;
  readonly availableUntil: string;
  readonly status: "available" | "unavailable";
}
export interface RunnerOfferInboxItem {
  readonly offerId: string;
  readonly missionId: string;
  readonly legId: string;
  readonly status: "offered";
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly missionCategory: string;
  readonly pickup: Readonly<Record<string, unknown>>;
  readonly destination: Readonly<Record<string, unknown>>;
  readonly declaredValueMinor: number;
  readonly currency: string;
  readonly legNumber: number;
  readonly legStatus: string;
  readonly serviceWindowStart: string | null;
  readonly serviceWindowEnd: string | null;
}
export interface MissionTrackingLeg {
  readonly legId: string;
  readonly legNumber: number;
  readonly status: string;
  readonly runnerId: string | null;
  readonly origin: Readonly<Record<string, unknown>>;
  readonly destination: Readonly<Record<string, unknown>>;
  readonly serviceWindowStart: string | null;
  readonly serviceWindowEnd: string | null;
  readonly location: null | {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracyMetres: number;
    readonly capturedAt: string;
    readonly expiresAt: string;
  };
}
export interface MissionTrackingView {
  readonly missionId: string;
  readonly status: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pickup: Readonly<Record<string, unknown>>;
  readonly destination: Readonly<Record<string, unknown>>;
  readonly legs: readonly MissionTrackingLeg[];
  readonly events: readonly { readonly sequence: number; readonly type: string; readonly occurredAt: string }[];
}
export interface DispatcherQueueItem {
  readonly missionId: string;
  readonly missionStatus: string;
  readonly missionCreatedAt: string;
  readonly category: string;
  readonly pickup: Readonly<Record<string, unknown>>;
  readonly destination: Readonly<Record<string, unknown>>;
  readonly legId: string;
  readonly legNumber: number;
  readonly legStatus: string;
  readonly serviceWindowStart: string | null;
  readonly serviceWindowEnd: string | null;
  readonly assignedRunnerId: string | null;
  readonly activeOfferId: string | null;
  readonly activeOfferStatus: string | null;
  readonly offerExpiresAt: string | null;
  readonly runnerLocation: null | {
    readonly latitude: number;
    readonly longitude: number;
    readonly accuracyMetres: number;
    readonly capturedAt: string;
    readonly expiresAt: string;
  };
}
interface QueryResult<Row> { readonly rows: readonly Row[]; }
interface PgQueryable { query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>; }
export interface NetworkOperationsReadPool extends PgQueryable {}

type RawRow = Record<string, any>;
const asIso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const asObject = (value: unknown): Readonly<Record<string, unknown>> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function mapLocation(row: RawRow): MissionTrackingLeg["location"] {
  if (row.location_latitude === null || row.location_latitude === undefined) return null;
  return {
    latitude: Number(row.location_latitude),
    longitude: Number(row.location_longitude),
    accuracyMetres: Number(row.location_accuracy_metres),
    capturedAt: asIso(row.location_captured_at)!,
    expiresAt: asIso(row.location_expires_at)!,
  };
}

/** Read models only. All identity and role values must come from verified server authentication. */
export class PostgresNetworkOperationsQueries {
  private readonly pool: NetworkOperationsReadPool;
  constructor(pool: NetworkOperationsReadPool) { this.pool = pool; }

  async getRunnerAvailability(input: {
    readonly authenticatedRunnerId: string;
    readonly now: string;
  }): Promise<readonly RunnerAvailabilityView[]> {
    if (!input.authenticatedRunnerId || !Number.isFinite(Date.parse(input.now)))
      throw new Error("Invalid Runner availability query");
    const result = await this.pool.query<RawRow>(`select id,available_from,available_until,status
      from public.runner_availability_windows
      where runner_id=$1 and status in ('available','unavailable') and available_until>$2::timestamptz
      order by available_from asc limit 100`,[input.authenticatedRunnerId,input.now]);
    return result.rows.map(row => ({
      id: row.id, availableFrom: asIso(row.available_from)!,
      availableUntil: asIso(row.available_until)!, status: row.status,
    }));
  }

  async getRunnerOfferInbox(input: {
    readonly authenticatedRunnerId: string;
    readonly now: string;
    readonly limit?: number;
  }): Promise<readonly RunnerOfferInboxItem[]> {
    const limit = input.limit ?? 50;
    if (!input.authenticatedRunnerId || !Number.isFinite(Date.parse(input.now)) ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid offer inbox query");
    const result = await this.pool.query<RawRow>(`select o.id as offer_id,o.mission_id,o.leg_id,o.status,
      o.expires_at,o.created_at,m.category,m.pickup,m.destination,m.declared_value_minor,m.currency,
      l.leg_number,l.status as leg_status,l.service_window_start,l.service_window_end
      from public.dispatch_offers o
      join public.missions m on m.id=o.mission_id
      join public.mission_legs l on l.id=o.leg_id
      where o.runner_id=$1 and o.status='offered' and o.expires_at>$2::timestamptz
        and l.status='open' and m.status in ('open','matching')
      order by o.expires_at asc,o.created_at desc limit $3`,
      [input.authenticatedRunnerId,input.now,limit]);
    return result.rows.map(row => ({
      offerId: row.offer_id, missionId: row.mission_id, legId: row.leg_id,
      status: "offered", expiresAt: asIso(row.expires_at)!, createdAt: asIso(row.created_at)!,
      missionCategory: row.category, pickup: asObject(row.pickup), destination: asObject(row.destination),
      declaredValueMinor: Number(row.declared_value_minor), currency: row.currency,
      legNumber: Number(row.leg_number), legStatus: row.leg_status,
      serviceWindowStart: asIso(row.service_window_start), serviceWindowEnd: asIso(row.service_window_end),
    }));
  }

  async getMissionTracking(input: {
    readonly principal: OperationsPrincipal;
    readonly missionId: string;
    readonly now: string;
  }): Promise<MissionTrackingView | null> {
    if (!input.missionId || !input.principal.actorId || !Number.isFinite(Date.parse(input.now)))
      throw new Error("Invalid mission tracking query");
    const accessPredicate = input.principal.role === "requester"
      ? "m.requester_id=$2"
      : input.principal.role === "runner"
        ? "exists(select 1 from public.mission_legs own_leg where own_leg.mission_id=m.id and own_leg.assigned_runner_id=$2)"
        : "true";
    const header = await this.pool.query<RawRow>(`select m.id,m.status,m.version,m.created_at,m.updated_at,m.pickup,m.destination
      from public.missions m where m.id=$1 and ${accessPredicate} limit 1`,
      [input.missionId,input.principal.actorId]);
    if (!header.rows[0]) return null;
    const legs = await this.pool.query<RawRow>(`select l.id as leg_id,l.leg_number,l.status,l.assigned_runner_id,
      l.origin,l.destination,l.service_window_start,l.service_window_end,
      s.latitude as location_latitude,s.longitude as location_longitude,
      s.accuracy_metres as location_accuracy_metres,s.captured_at as location_captured_at,
      s.expires_at as location_expires_at
      from public.mission_legs l
      left join public.runner_location_snapshots s on s.runner_id=l.assigned_runner_id
        and s.expires_at>$2::timestamptz
        and exists(select 1 from public.runner_location_sharing consent
          where consent.runner_id=s.runner_id and consent.purpose='active_mission' and consent.enabled=true)
      where l.mission_id=$1 order by l.leg_number`,[input.missionId,input.now]);
    const events = await this.pool.query<RawRow>(`select sequence,event_type,occurred_at
      from public.mission_events where mission_id=$1 order by sequence desc limit 100`,[input.missionId]);
    const row = header.rows[0];
    return {
      missionId: row.id, status: row.status, version: Number(row.version),
      createdAt: asIso(row.created_at)!, updatedAt: asIso(row.updated_at)!,
      pickup: asObject(row.pickup), destination: asObject(row.destination),
      legs: legs.rows.map(leg => ({
        legId: leg.leg_id, legNumber: Number(leg.leg_number), status: leg.status,
        runnerId: leg.assigned_runner_id, origin: asObject(leg.origin), destination: asObject(leg.destination),
        serviceWindowStart: asIso(leg.service_window_start), serviceWindowEnd: asIso(leg.service_window_end),
        location: mapLocation(leg),
      })),
      events: events.rows.map(event => ({
        sequence: Number(event.sequence), type: event.event_type, occurredAt: asIso(event.occurred_at)!,
      })).reverse(),
    };
  }

  async getDispatcherQueue(input: {
    readonly principal: OperationsPrincipal;
    readonly now: string;
    readonly limit?: number;
  }): Promise<readonly DispatcherQueueItem[]> {
    if (input.principal.role !== "dispatcher" && input.principal.role !== "trust_operator")
      throw new Error("Dispatcher role required");
    const limit = input.limit ?? 100;
    if (!input.principal.actorId || !Number.isFinite(Date.parse(input.now)) ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 250) throw new Error("Invalid dispatcher queue query");
    const result = await this.pool.query<RawRow>(`select m.id as mission_id,m.status as mission_status,m.created_at as mission_created_at,
      m.category,m.pickup,m.destination,l.id as leg_id,l.leg_number,l.status as leg_status,
      l.service_window_start,l.service_window_end,l.assigned_runner_id,
      o.id as active_offer_id,o.status as active_offer_status,o.expires_at as offer_expires_at,
      s.latitude as location_latitude,s.longitude as location_longitude,
      s.accuracy_metres as location_accuracy_metres,s.captured_at as location_captured_at,
      s.expires_at as location_expires_at
      from public.missions m join public.mission_legs l on l.mission_id=m.id
      left join lateral (select offer.id,offer.status,offer.expires_at from public.dispatch_offers offer
        where offer.leg_id=l.id and offer.status in ('offered','accepted')
        order by offer.created_at desc limit 1) o on true
      left join public.runner_location_snapshots s on s.runner_id=l.assigned_runner_id
        and s.expires_at>$1::timestamptz
        and exists(select 1 from public.runner_location_sharing consent
          where consent.runner_id=s.runner_id and consent.purpose='active_mission' and consent.enabled=true)
      where m.status in ('open','matching','assigned','runner_en_route','at_pickup','in_custody',
        'en_route_to_destination','disputed','safety_hold','customs_hold')
        and l.status not in ('delivered','cancelled','failed')
      order by case when m.status in ('safety_hold','customs_hold','disputed') then 0 else 1 end,
        l.service_window_start nulls last,m.created_at
      limit $2`,[input.now,limit]);
    return result.rows.map(row => ({
      missionId: row.mission_id, missionStatus: row.mission_status,
      missionCreatedAt: asIso(row.mission_created_at)!, category: row.category,
      pickup: asObject(row.pickup), destination: asObject(row.destination),
      legId: row.leg_id, legNumber: Number(row.leg_number), legStatus: row.leg_status,
      serviceWindowStart: asIso(row.service_window_start), serviceWindowEnd: asIso(row.service_window_end),
      assignedRunnerId: row.assigned_runner_id, activeOfferId: row.active_offer_id,
      activeOfferStatus: row.active_offer_status, offerExpiresAt: asIso(row.offer_expires_at),
      runnerLocation: mapLocation(row),
    }));
  }
}

export function createPostgresNetworkOperationsQueries(pool: NetworkOperationsReadPool): PostgresNetworkOperationsQueries {
  return new PostgresNetworkOperationsQueries(pool);
}
