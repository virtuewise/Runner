import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresMissionRepository } from "../src/domain/mission/postgres-repository.ts";

function fakePool() {
  const statements = [];
  let released = false;
  const client = {
    async query(sql) {
      statements.push(sql.trim().toLowerCase());
      return { rows: [], rowCount: 0 };
    },
    release() { released = true; },
  };
  return { statements, get released() { return released; }, async connect() { return client; } };
}

test("PostgreSQL unit of work commits once and releases the connection", async () => {
  const pool = fakePool();
  const repository = createPostgresMissionRepository(pool);
  const value = await repository.unitOfWork.run(async () => "committed");
  assert.equal(value, "committed");
  assert.deepEqual(pool.statements, ["begin", "commit"]);
  assert.equal(pool.released, true);
});

test("PostgreSQL unit of work rolls back on command failure", async () => {
  const pool = fakePool();
  const repository = createPostgresMissionRepository(pool);
  await assert.rejects(repository.unitOfWork.run(async () => { throw new Error("command failed"); }), /command failed/);
  assert.deepEqual(pool.statements, ["begin", "rollback"]);
  assert.equal(pool.released, true);
});
