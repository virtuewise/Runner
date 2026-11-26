import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresNetworkOperationsQueries } from "../src/domain/mission/network-operations-queries.ts";

test("Runner inbox is scoped to the authenticated Runner and excludes expired/non-open offers", async () => {
  let query, values;
  const queries=createPostgresNetworkOperationsQueries({async query(sql,args){query=sql;values=args;return {rows:[{
    offer_id:"offer",mission_id:"mission",leg_id:"leg",expires_at:"2026-11-26T12:01:00Z",
    created_at:"2026-11-26T12:00:00Z",category:"parcel",pickup:{locality:"A"},destination:{locality:"B"},
    declared_value_minor:"1200",currency:"ZAR",leg_number:1,leg_status:"open",
    service_window_start:null,service_window_end:null,
  }]};}});
  const inbox=await queries.getRunnerOfferInbox({authenticatedRunnerId:"verified-server-runner",now:"2026-11-26T12:00:00Z"});
  assert.equal(values[0],"verified-server-runner");
  assert.match(query,/o.runner_id=$1/);
  assert.match(query,/o.expires_at>$2/);
  assert.equal(inbox[0].declaredValueMinor,1200);
  assert.equal(inbox[0].status,"offered");
});

test("mission tracking rejects unauthorized requester and Runner principals by returning no record", async () => {
  let calls=0;
  const queries=createPostgresNetworkOperationsQueries({async query(){calls++;return {rows:[]};}});
  const result=await queries.getMissionTracking({
    principal:{actorId:"unrelated-user",role:"requester"},missionId:"mission",now:"2026-11-26T12:00:00Z",
  });
  assert.equal(result,null);
  assert.equal(calls,1);
});

test("mission tracking only returns consented, unexpired location snapshots", async () => {
  let count=0;
  const queries=createPostgresNetworkOperationsQueries({async query(sql){
    count++;
    if(count===1)return {rows:[{id:"mission",status:"in_custody",version:3,created_at:"2026-11-26T12:00:00Z",
      updated_at:"2026-11-26T12:01:00Z",pickup:{},destination:{}}]};
    if(count===2){assert.match(sql,/s.expires_at>$2/);assert.match(sql,/consent.enabled=true/);return {rows:[{
      leg_id:"leg",leg_number:1,status:"in_custody",assigned_runner_id:"runner",origin:{},destination:{},
      service_window_start:null,service_window_end:null,location_latitude:-26.2,location_longitude:28.0,
      location_accuracy_metres:10,location_captured_at:"2026-11-26T12:00:30Z",location_expires_at:"2026-11-26T12:05:00Z",
    }]};}
    return {rows:[]};
  }});
  const result=await queries.getMissionTracking({
    principal:{actorId:"requester",role:"requester"},missionId:"mission",now:"2026-11-26T12:01:00Z",
  });
  assert.equal(result.legs[0].location.latitude,-26.2);
  assert.equal(result.events.length,0);
});

test("Runner principals cannot read dispatcher queue", async () => {
  let called=false;
  const queries=createPostgresNetworkOperationsQueries({async query(){called=true;return {rows:[]};}});
  await assert.rejects(()=>queries.getDispatcherQueue({
    principal:{actorId:"runner",role:"runner"},now:"2026-11-26T12:00:00Z",
  }),/Dispatcher role required/);
  assert.equal(called,false);
});

test("dispatcher queue is ordered to surface safety holds and only exposes fresh consented location", async () => {
  let sql,values;
  const queries=createPostgresNetworkOperationsQueries({async query(q,args){sql=q;values=args;return {rows:[]};}});
  await queries.getDispatcherQueue({
    principal:{actorId:"dispatcher",role:"dispatcher"},now:"2026-11-26T12:00:00Z",limit:75,
  });
  assert.match(sql,/safety_hold/);
  assert.match(sql,/s.expires_at>$1/);
  assert.match(sql,/consent.enabled=true/);
  assert.equal(values[1],75);
});

test("Runner availability query is scoped to authenticated identity and excludes elapsed windows",async()=>{
  let sql,values;
  const queries=createPostgresNetworkOperationsQueries({async query(q,args){sql=q;values=args;return {rows:[{
    id:"window",available_from:"2026-11-26T12:00:00Z",available_until:"2026-11-26T13:00:00Z",status:"available",
  }]};}});
  const windows=await queries.getRunnerAvailability({authenticatedRunnerId:"runner-auth",now:"2026-11-26T12:00:00Z"});
  assert.equal(values[0],"runner-auth");
  assert.match(sql,/available_until>$2/);
  assert.equal(windows[0].status,"available");
});
