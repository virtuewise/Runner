import type { Incident, IncidentActor, IncidentRepository, IncidentTransaction } from "./incident-management.ts";
interface QueryResult<Row> { readonly rows: readonly Row[]; readonly rowCount: number | null; }
interface PgClient { query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>; release(): void; }
export interface IncidentPgPool { connect(): Promise<PgClient>; }
interface IncidentRow {
  id:string;mission_id:string;leg_id:string|null;reporter_id:string;reporter_role:Incident["reporterRole"];
  category:Incident["category"];severity:Incident["severity"];status:Incident["status"];
  title:string;description:string;evidence_refs:string[];assigned_operator_id:string|null;
  resolution_code:string|null;resolution_note:string|null;created_at:Date|string;updated_at:Date|string;
  resolved_at:Date|string|null;version:number;
}
const iso=(v:Date|string|null):string|null=>v===null?null:v instanceof Date?v.toISOString():new Date(v).toISOString();
function fromRow(r:IncidentRow):Incident{return{
  id:r.id,missionId:r.mission_id,legId:r.leg_id,reporterId:r.reporter_id,reporterRole:r.reporter_role,
  category:r.category,severity:r.severity,status:r.status,title:r.title,description:r.description,
  evidenceRefs:r.evidence_refs??[],assignedOperatorId:r.assigned_operator_id,resolutionCode:r.resolution_code,
  resolutionNote:r.resolution_note,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!,
  resolvedAt:iso(r.resolved_at),version:Number(r.version),
};}
class PostgresIncidentTransaction implements IncidentTransaction {
  private readonly client:PgClient;
  constructor(client:PgClient){this.client=client;}
  async createIncident(input:Parameters<IncidentTransaction["createIncident"]>[0]){
    await this.client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[input.missionId+":"+input.actor.actorId+":"+input.idempotencyKey]);
    const existing=await this.client.query<IncidentRow>(`select * from public.mission_incidents
      where mission_id=$1 and reporter_id=$2 and idempotency_key=$3 for update`,
      [input.missionId,input.actor.actorId,input.idempotencyKey]);
    if(existing.rows[0])return{incident:fromRow(existing.rows[0]),replayed:true};
    const mission=await this.client.query<{requester_id:string}>(`select requester_id from public.missions where id=$1 for update`,[input.missionId]);
    if(!mission.rows[0])return{incident:null,replayed:false};
    let authorized=input.actor.role==="dispatcher"||input.actor.role==="trust_operator";
    if(input.actor.role==="requester")authorized=mission.rows[0].requester_id===input.actor.actorId;
    if(input.actor.role==="runner"){
      const assigned=await this.client.query<{id:string}>(`select id from public.mission_legs
        where mission_id=$1 and assigned_runner_id=$2 and ($3::uuid is null or id=$3) limit 1`,
        [input.missionId,input.actor.actorId,input.legId]);
      authorized=assigned.rows.length===1;
    }
    if(!authorized)return{incident:null,replayed:false};
    if(input.legId){
      const leg=await this.client.query<{id:string}>(`select id from public.mission_legs where id=$1 and mission_id=$2`,[input.legId,input.missionId]);
      if(!leg.rows.length)return{incident:null,replayed:false};
    }
    const inserted=await this.client.query<IncidentRow>(`insert into public.mission_incidents
      (id,mission_id,leg_id,reporter_id,reporter_role,idempotency_key,category,severity,title,description,evidence_refs,created_at,updated_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12,$12) returning *`,
      [input.id,input.missionId,input.legId,input.actor.actorId,input.actor.role,input.idempotencyKey,
        input.category,input.severity,input.title,input.description,input.evidenceRefs,input.now]);
    return{incident:inserted.rows[0]?fromRow(inserted.rows[0]):null,replayed:false};
  }
  async loadIncidentForUpdate(id:string):Promise<Incident|null>{
    const q=await this.client.query<IncidentRow>("select * from public.mission_incidents where id=$1 for update",[id]);
    return q.rows[0]?fromRow(q.rows[0]):null;
  }
  async hasIncidentEvent(input:{incidentId:string;actorId:string;idempotencyKey:string}):Promise<boolean>{
    const q=await this.client.query("select 1 from public.mission_incident_events where incident_id=$1 and actor_id=$2 and idempotency_key=$3",
      [input.incidentId,input.actorId,input.idempotencyKey]);return q.rows.length>0;
  }
  async saveIncident(input:{incident:Incident;expectedVersion:number}):Promise<boolean>{
    const r=input.incident;
    const q=await this.client.query(`update public.mission_incidents set status=$1,assigned_operator_id=$2,
      resolution_code=$3,resolution_note=$4,resolved_at=$5,updated_at=$6,version=$7
      where id=$8 and version=$9 returning id`,
      [r.status,r.assignedOperatorId,r.resolutionCode,r.resolutionNote,r.resolvedAt,r.updatedAt,r.version,r.id,input.expectedVersion]);
    return q.rows.length===1;
  }
  async appendIncidentEvent(input:Parameters<IncidentTransaction["appendIncidentEvent"]>[0]):Promise<void>{
    await this.client.query(`insert into public.mission_incident_events
      (incident_id,sequence,actor_id,actor_role,event_type,idempotency_key,payload,occurred_at)
      values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [input.incidentId,input.sequence,input.actor.actorId,input.actor.role,input.eventType,input.idempotencyKey,
        JSON.stringify(input.payload),input.occurredAt]);
  }
  async placeMissionSafetyHold(input:Parameters<IncidentTransaction["placeMissionSafetyHold"]>[0]){
    await this.client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[input.missionId+":"+input.actor.actorId+":"+input.idempotencyKey]);
    const replay=await this.client.query("select 1 from public.mission_events where mission_id=$1 and actor_id=$2 and idempotency_key=$3",
      [input.missionId,input.actor.actorId,"safety-hold:"+input.idempotencyKey]);
    if(replay.rows.length)return "replayed" as const;
    const mission=await this.client.query<{status:string;version:number}>(`select status,version from public.missions where id=$1 for update`,[input.missionId]);
    if(!mission.rows[0])return "not_found" as const;
    if(["delivered","closed","cancelled","expired","failed"].includes(mission.rows[0].status))return "terminal" as const;
    if(mission.rows[0].status==="safety_hold")return "conflict" as const;
    const updated=await this.client.query(`update public.missions set status='safety_hold',version=version+1,updated_at=$2
      where id=$1 and version=$3 returning version`,[input.missionId,input.now,mission.rows[0].version]);
    if(!updated.rows[0])return "conflict" as const;
    const sequence=await this.client.query<{next_sequence:number}>(`select coalesce(max(sequence),0)+1 as next_sequence
      from public.mission_events where mission_id=$1`,[input.missionId]);
    await this.client.query(`insert into public.mission_events
      (event_id,mission_id,sequence,actor_id,actor_role,event_type,idempotency_key,from_status,to_status,payload,occurred_at)
      values(gen_random_uuid(),$1,$2,$3,'trust_operator','mission.safety_hold_placed',$4,$5,'safety_hold',$6::jsonb,$7)`,
      [input.missionId,sequence.rows[0].next_sequence,input.actor.actorId,"safety-hold:"+input.idempotencyKey,
        mission.rows[0].status,JSON.stringify({reason:input.reason}),input.now]);
    return "placed" as const;
  }
}
export class PostgresIncidentRepository implements IncidentRepository {
  private readonly pool:IncidentPgPool;
  constructor(pool:IncidentPgPool){this.pool=pool;}
  async transaction<T>(work:(tx:IncidentTransaction)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();
    try{await client.query("begin");const result=await work(new PostgresIncidentTransaction(client));await client.query("commit");return result;}
    catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
}
export function createPostgresIncidentRepository(pool:IncidentPgPool):IncidentRepository{return new PostgresIncidentRepository(pool);}
