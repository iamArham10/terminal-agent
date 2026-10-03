import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { createSession, SessionStore, validateSession } from "../src/sessions/store.ts";

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agi-sessions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return new SessionStore(path.join(root, "sessions"));
}
const filename = (store: SessionStore, id: string) => path.join(store.directory, `${id}.json`);

function conversation() {
  const session = createSession("/tmp/project");
  session.title = "Read a file";
  session.history = [
    { role: "user", content: "Read a file" },
    { role: "assistant", content: [
      { type: "reasoning", text: "Read it", providerOptions: { openai: { itemId: "reasoning-id" } } },
      { type: "tool-call", toolCallId: "call-1", toolName: "readFile", input: { path: "README.md" } },
    ] },
    { role: "tool", content: [{
      type: "tool-result", toolCallId: "call-1", toolName: "readFile",
      output: { type: "text", value: "Hello" },
    }] },
    { role: "assistant", content: "The file says Hello" },
  ];
  session.messages = [
    { role: "user", content: "Read a file" },
    { role: "assistant", content: "The file says Hello" },
  ];
  session.tokenUsage = {
    inputTokens: 10, outputTokens: 5, totalTokens: 15,
    contextWindow: 1000, threshold: 0.8, percentage: 1.5,
  };
  return session;
}

test("roundtrip preserves paired tools, provider metadata, rendered UI and session metadata", async (t) => {
  const store = await fixture(t);
  const original = conversation();
  const saved = await store.save(original);
  assert.equal(saved.revision, 1);
  assert.deepEqual({ ...saved, revision: original.revision, updatedAt: original.updatedAt }, original);
  assert.deepEqual(await new SessionStore(store.directory).load(saved.id), saved);
  assert.doesNotThrow(() => validateSession(saved));
});

test("empty store and latest listing use update order across projects", async (t) => {
  const store = await fixture(t);
  assert.deepEqual(await store.list(), { sessions: [], warnings: [] });
  await assert.rejects(store.latest(), /No valid saved sessions/);
  const older = await store.save(conversation());
  const newer = await store.save({ ...conversation(), projectDirectory: "/tmp/other" });
  // Fixed timestamps make ordering independent of clock resolution.
  older.updatedAt = "2030-01-01T00:00:00.000Z";
  newer.updatedAt = "2031-01-01T00:00:00.000Z";
  await writeFile(filename(store, older.id), JSON.stringify(older));
  await writeFile(filename(store, newer.id), JSON.stringify(newer));
  const listing = await store.list();
  assert.deepEqual(listing.sessions.map((session) => session.id), [newer.id, older.id]);
  assert.deepEqual(listing.warnings, []);
  assert.equal((await store.latest()).session.id, newer.id);
});

test("corrupt sessions are skipped; invalid IDs and incomplete histories are rejected", async (t) => {
  const store = await fixture(t);
  const good = await store.save(conversation());
  const broken = randomUUID();
  await writeFile(filename(store, broken), "{broken");
  await writeFile(path.join(store.directory, "not-an-id.json"), "{}");
  const listing = await store.list();
  assert.deepEqual(listing.sessions.map((session) => session.id), [good.id]);
  assert.equal(listing.warnings.length, 2);
  assert.equal((await store.latest()).session.id, good.id);
  await assert.rejects(store.load(broken), /Cannot load session/);
  for (const id of ["../escape", "/tmp/file", "a\\b", `${good.id}.json`]) {
    await assert.rejects(store.load(id), /Invalid session ID/);
    await assert.rejects(store.save({ ...good, id }), /Invalid or unsupported/);
  }
  for (const invalid of [
    { ...good, version: 999 },
    { ...good, history: good.history.slice(0, 2) },
    { ...good, history: good.history.slice(2) },
  ]) assert.throws(() => validateSession(invalid));
  await writeFile(filename(store, good.id), JSON.stringify({ ...good, id: randomUUID() }));
  await assert.rejects(store.load(good.id), /does not match/);
  await assert.rejects(store.save(good), /does not match/);
});

test("private atomic writes reject conflicting writers, locks and symlink files", async (t) => {
  const store = await fixture(t);
  const saved = await store.save(conversation());
  assert.equal((await stat(store.directory)).mode & 0o777, 0o700);
  assert.equal((await stat(filename(store, saved.id))).mode & 0o777, 0o600);
  const writes = await Promise.allSettled([
    store.save({ ...saved, title: "writer one" }),
    new SessionStore(store.directory).save({ ...saved, title: "writer two" }),
  ]);
  assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(writes.filter((result) => result.status === "rejected").length, 1);
  const winner = await store.load(saved.id);
  assert.equal(winner.revision, 2);
  await assert.rejects(store.save(saved), /changed in another process/);
  assert.deepEqual(await store.load(saved.id), winner);
  const lock = `${filename(store, saved.id)}.lock`;
  await writeFile(lock, "other-process");
  await assert.rejects(store.save(winner), /being saved elsewhere/);
  await rm(lock);
  const retried = await store.save({ ...winner, title: "recovered" });
  assert.equal(retried.revision, 3);
  assert.deepEqual(await readdir(store.directory), [`${saved.id}.json`]);
  const linkedId = randomUUID();
  await symlink(filename(store, saved.id), filename(store, linkedId));
  await assert.rejects(store.load(linkedId), /Cannot load session/);
});
