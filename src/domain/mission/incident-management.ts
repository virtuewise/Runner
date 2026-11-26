export type IncidentCategory = "safety" | "loss" | "damage" | "delay" | "custody_dispute" | "suspected_fraud" | "customs" | "other";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "triaged" | "investigating" | "resolved" | "dismissed";
export type IncidentActorRole = "requester" | "runner" | "dispatcher" | "trust_operator";
export interface IncidentActor { readonly actorId: string; readonly role: IncidentActorRole; }
export interface Incident {
  readonly id: string; readonly missionId: string; readonly legId: string | null;
  readonly reporterId: string; readonly reporterRole: IncidentActorRole;
  readonly category: IncidentCategory; readonly severity: IncidentSeverity; readonly status: IncidentStatus;
  readonly title: string; readonly description: string; readonly evidenceRefs: readonly string[];
  readonly assignedOperatorId: string | null; readonly resolutionCode: string | null;
  readonly resolutionNote: string | null; readonly createdAt: string; readonly updatedAt: string;
  readonly resolvedAt: string | null; readonly version: number;
}
export interface IncidentTransaction {
  createIncident(input: {
    readonly id: string; readonly missionId: string; readonly legId: string | null;
    readonly actor: IncidentActor; readonly idempotencyKey: string; readonly category: IncidentCategory;
    readonly severity: IncidentSeverity; readonly title: string; readonly description: string;
    readonly evidenceRefs: readonly string[]; readonly now: string;
  }): Promise<{ readonly incident: Incident | null; readonly replayed: boolean }>;
  loadIncidentForUpdate(incidentId: string): Promise<Incident | null>;
  hasIncidentEvent(input: { readonly incidentId: string; readonly actorId: string; readonly idempotencyKey: string }): Promise<boolean>;
  saveIncident(input: { readonly incident: Incident; readonly expectedVersion: number }): Promise<boolean>;
  appendIncidentEvent(input: {
    readonly incidentId: string; readonly sequence: number; readonly actor: IncidentActor;
    readonly eventType: string; readonly idempotencyKey: string;
    readonly payload: Readonly<Record<string, string>>; readonly occurredAt: string;
  }): Promise<void>;
  placeMissionSafetyHold(input: {
    readonly missionId: string; readonly actor: IncidentActor; readonly reason: string;
    readonly idempotencyKey: string; readonly now: string;
  }): Promise<"placed" | "replayed" | "not_found" | "terminal" | "conflict">;
}
export interface IncidentRepository { transaction<T>(work: (tx: IncidentTransaction) => Promise<T>): Promise<T>; }
export type IncidentCommandResult =
  | { readonly ok: true; readonly incident: Incident; readonly replayed?: boolean }
  | { readonly ok: false; readonly reason: "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_TRANSITION" };

const categories: readonly IncidentCategory[] = ["safety","loss","damage","delay","custody_dispute","suspected_fraud","customs","other"];
const severities: readonly IncidentSeverity[] = ["low","medium","high","critical"];
const transitions: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  open: ["triaged","investigating","dismissed"],
  triaged: ["investigating","resolved","dismissed"],
  investigating: ["resolved","dismissed"],
  resolved: [],
  dismissed: [],
};
const validText = (value: string, min: number, max: number) => typeof value === "string" && value.trim().length >= min && value.length <= max;
function validateEvidence(refs: readonly string[]): boolean {
  return Array.isArray(refs) && refs.length <= 20 &&
    refs.every(ref => validText(ref, 1, 128) && !/[\s]/.test(ref));
}

export async function reportMissionIncident(input: {
  readonly repository: IncidentRepository; readonly id: string; readonly missionId: string; readonly legId?: string;
  readonly actor: IncidentActor; readonly idempotencyKey: string; readonly category: IncidentCategory;
  readonly severity: IncidentSeverity; readonly title: string; readonly description: string;
  readonly evidenceRefs?: readonly string[]; readonly now: string;
}): Promise<IncidentCommandResult> {
  if (!input.id || !input.missionId || !input.actor.actorId || !input.idempotencyKey ||
      input.idempotencyKey.length > 128 || !Number.isFinite(Date.parse(input.now)) ||
      !categories.includes(input.category) || !severities.includes(input.severity) ||
      !validText(input.title,3,120) || !validText(input.description,3,4000) ||
      !validateEvidence(input.evidenceRefs ?? [])) throw new Error("Invalid incident report");
  return input.repository.transaction(async tx => {
    const created = await tx.createIncident({
      id: input.id, missionId: input.missionId, legId: input.legId ?? null, actor: input.actor,
      idempotencyKey: input.idempotencyKey, category: input.category, severity: input.severity,
      title: input.title.trim(), description: input.description.trim(), evidenceRefs: input.evidenceRefs ?? [],
      now: new Date(Date.parse(input.now)).toISOString(),
    });
    if (!created.incident) return { ok: false, reason: "FORBIDDEN" };
    if (!created.replayed) await tx.appendIncidentEvent({
      incidentId: created.incident.id, sequence: created.incident.version, actor: input.actor,
      eventType: "incident.reported", idempotencyKey: "report:" + input.idempotencyKey,
      payload: { category: input.category, severity: input.severity }, occurredAt: input.now,
    });
    return { ok: true, incident: created.incident, ...(created.replayed ? { replayed: true } : {}) };
  });
}

export async function transitionMissionIncident(input: {
  readonly repository: IncidentRepository; readonly incidentId: string; readonly actor: IncidentActor;
  readonly expectedVersion: number; readonly nextStatus: IncidentStatus; readonly idempotencyKey: string;
  readonly assignedOperatorId?: string; readonly resolutionCode?: string; readonly resolutionNote?: string;
  readonly now: string;
}): Promise<IncidentCommandResult> {
  if (input.actor.role !== "trust_operator") return { ok: false, reason: "FORBIDDEN" };
  if (!input.incidentId || !input.actor.actorId || !input.idempotencyKey ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 ||
      !Number.isFinite(Date.parse(input.now)) || !Object.hasOwn(transitions,input.nextStatus))
    throw new Error("Invalid incident transition");
  return input.repository.transaction(async tx => {
    if (await tx.hasIncidentEvent({incidentId:input.incidentId,actorId:input.actor.actorId,idempotencyKey:input.idempotencyKey})) {
      const replay = await tx.loadIncidentForUpdate(input.incidentId);
      return replay ? {ok:true,incident:replay,replayed:true} : {ok:false,reason:"NOT_FOUND"};
    }
    const current = await tx.loadIncidentForUpdate(input.incidentId);
    if (!current) return {ok:false,reason:"NOT_FOUND"};
    if (current.version !== input.expectedVersion) return {ok:false,reason:"CONFLICT"};
    if (!transitions[current.status].includes(input.nextStatus)) return {ok:false,reason:"INVALID_TRANSITION"};
    const terminal = input.nextStatus === "resolved" || input.nextStatus === "dismissed";
    if (terminal && (!validText(input.resolutionCode ?? "",2,80) || !validText(input.resolutionNote ?? "",3,1000)))
      throw new Error("Resolution code and note are required");
    const next: Incident = {
      ...current, status:input.nextStatus, version:current.version+1,
      updatedAt:new Date(Date.parse(input.now)).toISOString(),
      ...(input.assignedOperatorId ? {assignedOperatorId:input.assignedOperatorId} : {}),
      ...(terminal ? {resolutionCode:input.resolutionCode!.trim(),resolutionNote:input.resolutionNote!.trim(),resolvedAt:new Date(Date.parse(input.now)).toISOString()} : {}),
    };
    if (!await tx.saveIncident({incident:next,expectedVersion:current.version})) return {ok:false,reason:"CONFLICT"};
    await tx.appendIncidentEvent({incidentId:next.id,sequence:next.version,actor:input.actor,
      eventType:"incident."+input.nextStatus,idempotencyKey:input.idempotencyKey,
      payload:{from:current.status,to:next.status,reason:input.resolutionCode ?? ""},occurredAt:input.now});
    return {ok:true,incident:next};
  });
}

export async function placeMissionSafetyHold(input: {
  readonly repository: IncidentRepository; readonly missionId: string; readonly actor: IncidentActor;
  readonly reason: string; readonly idempotencyKey: string; readonly now: string;
}): Promise<{readonly ok:true;readonly replayed?:boolean}|{readonly ok:false;readonly reason:"FORBIDDEN"|"NOT_FOUND"|"TERMINAL"|"CONFLICT"}> {
  if (input.actor.role !== "trust_operator") return {ok:false,reason:"FORBIDDEN"};
  if (!input.missionId || !input.actor.actorId || !validText(input.reason,3,500) ||
      !input.idempotencyKey || !Number.isFinite(Date.parse(input.now))) throw new Error("Invalid safety hold");
  const result = await input.repository.transaction(tx => tx.placeMissionSafetyHold({
    missionId:input.missionId,actor:input.actor,reason:input.reason.trim(),
    idempotencyKey:input.idempotencyKey,now:new Date(Date.parse(input.now)).toISOString(),
  }));
  if (result === "placed") return {ok:true};
  if (result === "replayed") return {ok:true,replayed:true};
  return {ok:false,reason:result==="not_found"?"NOT_FOUND":result==="terminal"?"TERMINAL":"CONFLICT"};
}
