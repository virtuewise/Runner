import { planRelay } from "../src/domain/mission/relay.ts";

test("relay planner chooses a feasible multi-hop route and respects handover buffers", () => {
  const nodes = [
    {id:"A",approvedHandover:true,handoverBufferMinutes:0},
    {id:"H",approvedHandover:true,handoverBufferMinutes:30},
    {id:"B",approvedHandover:true,handoverBufferMinutes:0},
  ];
  const edges = [
    {id:"direct",from:"A",to:"B",runnerId:"r0",mode:"car",departureAt:"2026-11-24T10:00:00Z",arrivalAt:"2026-11-24T20:00:00Z",costMinor:9000,reliability:0.99,qualified:true,itemPermitted:true,jurisdictionApproved:true},
    {id:"leg-1",from:"A",to:"H",runnerId:"r1",mode:"car",departureAt:"2026-11-24T10:00:00Z",arrivalAt:"2026-11-24T11:00:00Z",costMinor:1000,reliability:0.98,qualified:true,itemPermitted:true,jurisdictionApproved:true},
    {id:"leg-2",from:"H",to:"B",runnerId:"r2",mode:"rail",departureAt:"2026-11-24T11:20:00Z",arrivalAt:"2026-11-24T13:00:00Z",costMinor:1200,reliability:0.97,qualified:true,itemPermitted:true,jurisdictionApproved:true},
  ];
  const result = planRelay({nodes,edges,origin:"A",destination:"B",earliestDepartureAt:"2026-11-24T09:00:00Z",
    policy:{maxLegs:3,maxCostMinor:5000,minutesWeight:1,costWeight:0.01,riskWeight:100}});
  assert.equal(result.ok,true);
  assert.deepEqual(result.plan.edges.map(e=>e.id),["leg-1","leg-2"]);
  assert.equal(result.plan.totalCostMinor,2200);
});

test("relay planner excludes unqualified and non-compliant edges", () => {
  const result = planRelay({
    nodes:[{id:"A",approvedHandover:true,handoverBufferMinutes:0},{id:"B",approvedHandover:true,handoverBufferMinutes:0}],
    edges:[{id:"bad",from:"A",to:"B",runnerId:"r",mode:"air",departureAt:"2026-11-24T10:00:00Z",arrivalAt:"2026-11-24T11:00:00Z",costMinor:1,reliability:1,qualified:true,itemPermitted:false,jurisdictionApproved:false}],
    origin:"A",destination:"B",earliestDepartureAt:"2026-11-24T09:00:00Z",
    policy:{maxLegs:2,maxCostMinor:10,minutesWeight:1,costWeight:1,riskWeight:1},
  });
  assert.deepEqual(result,{ok:false,reason:"NO_FEASIBLE_ROUTE"});
});

test("relay planner rejects connections without an approved handover node", () => {
  const result = planRelay({
    nodes:[{id:"A",approvedHandover:true,handoverBufferMinutes:0},{id:"H",approvedHandover:false,handoverBufferMinutes:0},{id:"B",approvedHandover:true,handoverBufferMinutes:0}],
    edges:[
      {id:"1",from:"A",to:"H",runnerId:"r1",mode:"car",departureAt:"2026-11-24T10:00:00Z",arrivalAt:"2026-11-24T11:00:00Z",costMinor:1,reliability:1,qualified:true,itemPermitted:true,jurisdictionApproved:true},
      {id:"2",from:"H",to:"B",runnerId:"r2",mode:"air",departureAt:"2026-11-24T12:00:00Z",arrivalAt:"2026-11-24T14:00:00Z",costMinor:1,reliability:1,qualified:true,itemPermitted:true,jurisdictionApproved:true},
    ],
    origin:"A",destination:"B",earliestDepartureAt:"2026-11-24T09:00:00Z",
    policy:{maxLegs:3,maxCostMinor:10,minutesWeight:1,costWeight:1,riskWeight:1},
  });
  assert.deepEqual(result,{ok:false,reason:"NO_FEASIBLE_ROUTE"});
});
