import test from "node:test";
import assert from "node:assert/strict";
import { reportMissionIncident, transitionMissionIncident, placeMissionSafetyHold } from "../src/domain/mission/incident-management.ts";
const now="2026-11-26T12:00:00.000Z";
function fixture(initial){
  let incident=initial??null;const events=[];let hold="placed";
  const repository={async transaction(work){return work({
    async createIncident(input){if(incident)return{incident,replayed:true};incident={id:input.id,missionId:input.missionId,legId:input.legId,
      reporterId:input.actor.actorId,reporterRole:input.actor.role,category:input.category,severity:input.severity,status:"open",
      title:input.title,description:input.description,evidenceRefs:input.evidenceRefs,assignedOperatorId:null,
      resolutionCode:null,resolutionNote:null,createdAt:input.now,updatedAt:input.now,resolvedAt:null,version:1};return{incident,replayed:false};},
    async loadIncidentForUpdate(){return incident;},
    async hasIncidentEvent(input){return events.some(e=>e.idempotencyKey===input.idempotencyKey);},
    async saveIncident(input){if(incident.version!==input.expectedVersion)return false;incident=input.incident;return true;},
    async appendIncidentEvent(event){events.push(event);},
    async placeMissionSafetyHold(){return hold;},
  });}};
  return{repository,events,get incident(){return incident;},set hold(value){hold=value;}};
}
test("report incident stores opaque evidence references and emits audit event",async()=>{
 const f=fixture();const result=await reportMissionIncident({repository:f.repository,id:"i1",missionId:"m1",
  actor:{actorId:"runner",role:"runner"},idempotencyKey:"report-001",category:"custody_dispute",severity:"high",
  title:"Handover not acknowledged",description:"Receiving Runner disputes custody handover.",evidenceRefs:["evidence_123"],now});
 assert.equal(result.ok,true);assert.equal(result.incident.status,"open");assert.equal(f.events[0].eventType,"incident.reported");
});
test("incident report validates evidence reference count and rejects URLs",async()=>{
 const f=fixture();
 await assert.rejects(()=>reportMissionIncident({repository:f.repository,id:"i1",missionId:"m1",
  actor:{actorId:"runner",role:"runner"},idempotencyKey:"report-001",category:"safety",severity:"critical",
  title:"Unsafe situation",description:"A reported unsafe condition.",evidenceRefs:["https://example.com"],now}),/Invalid incident report/);
});
test("only trust operators can transition an incident",async()=>{
 const f=fixture();
 const result=await transitionMissionIncident({repository:f.repository,incidentId:"i1",
  actor:{actorId:"runner",role:"runner"},expectedVersion:1,nextStatus:"triaged",idempotencyKey:"triage-1",now});
 assert.deepEqual(result,{ok:false,reason:"FORBIDDEN"});
});
test("incident transitions require expected version and valid progression",async()=>{
 const f=fixture();await reportMissionIncident({repository:f.repository,id:"i1",missionId:"m1",
  actor:{actorId:"requester",role:"requester"},idempotencyKey:"report-001",category:"delay",severity:"medium",
  title:"Courier delayed",description:"The mission has exceeded its pickup window.",now});
 const stale=await transitionMissionIncident({repository:f.repository,incidentId:"i1",
  actor:{actorId:"trust",role:"trust_operator"},expectedVersion:2,nextStatus:"triaged",idempotencyKey:"triage-1",now});
 assert.deepEqual(stale,{ok:false,reason:"CONFLICT"});
 const triaged=await transitionMissionIncident({repository:f.repository,incidentId:"i1",
  actor:{actorId:"trust",role:"trust_operator"},expectedVersion:1,nextStatus:"triaged",idempotencyKey:"triage-1",now});
 assert.equal(triaged.ok,true);assert.equal(triaged.incident.status,"triaged");
});
test("incident resolution requires an auditable resolution code and note",async()=>{
 const f=fixture();await reportMissionIncident({repository:f.repository,id:"i1",missionId:"m1",
  actor:{actorId:"requester",role:"requester"},idempotencyKey:"report-001",category:"loss",severity:"high",
  title:"Parcel missing",description:"The parcel could not be located.",now});
 await assert.rejects(()=>transitionMissionIncident({repository:f.repository,incidentId:"i1",
  actor:{actorId:"trust",role:"trust_operator"},expectedVersion:1,nextStatus:"resolved",
  idempotencyKey:"resolve-1",now}),/Resolution code and note are required/);
});
test("safety hold is restricted to trust operators and supports idempotent replay",async()=>{
 const f=fixture();const denied=await placeMissionSafetyHold({repository:f.repository,missionId:"m1",
  actor:{actorId:"runner",role:"runner"},reason:"Unsafe location",idempotencyKey:"hold-1",now});
 assert.deepEqual(denied,{ok:false,reason:"FORBIDDEN"});
 const placed=await placeMissionSafetyHold({repository:f.repository,missionId:"m1",
  actor:{actorId:"trust",role:"trust_operator"},reason:"Safety incident reported",idempotencyKey:"hold-1",now});
 assert.deepEqual(placed,{ok:true});f.hold="replayed";
 const replay=await placeMissionSafetyHold({repository:f.repository,missionId:"m1",
  actor:{actorId:"trust",role:"trust_operator"},reason:"Safety incident reported",idempotencyKey:"hold-1",now});
 assert.deepEqual(replay,{ok:true,replayed:true});
});
