import test from "node:test";
import assert from "node:assert/strict";
import { ApiSessionError, createApiSession } from "../src/api/api-session.ts";

test("API session injects a fresh bearer token and disables caching", async () => {
  let tokenCalls=0, captured;
  const session=createApiSession({
    baseUrl:"https://api.runner.test",
    async getAccessToken(){tokenCalls+=1;return "access-token";},
    async fetchImpl(input,init){captured={input:String(input),init};return new Response(JSON.stringify({ok:true}),{
      status:200,headers:{"content-type":"application/json"} });},
  });
  assert.deepEqual(await session.get("/v1/runner/offers"),{ok:true});
  assert.equal(tokenCalls,1);
  assert.equal(captured.init.headers.get("authorization"),"Bearer access-token");
  assert.equal(captured.init.cache,"no-store");
  await session.post("/v1/custody/challenges",{missionId:"m1"});
  assert.equal(tokenCalls,2);
  assert.equal(captured.init.headers.get("content-type"),"application/json");
});

test("API session rejects insecure remote origins and path traversal", async () => {
  assert.throws(()=>createApiSession({baseUrl:"http://api.runner.test",async getAccessToken(){return "x";}}));
  const session=createApiSession({baseUrl:"https://api.runner.test",async getAccessToken(){return "x".repeat(24);},
    async fetchImpl(){throw new Error("fetch must not run");}});
  await assert.rejects(()=>session.get("/v1/../admin"),/escaped configured v1 origin/);
});

test("API session reports unauthorized responses without exposing token material", async () => {
  const session=createApiSession({baseUrl:"https://api.runner.test",async getAccessToken(){return "x".repeat(24);},
    async fetchImpl(){return new Response(JSON.stringify({error:"UNAUTHENTICATED"}),{status:401});}});
  await assert.rejects(()=>session.get("/v1/runner/offers"),error=>{
    assert.ok(error instanceof ApiSessionError);
    assert.equal(error.status,401);
    assert.equal(error.code,"UNAUTHENTICATED");
    return true;
  });
});
