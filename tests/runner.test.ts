import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { simulateReadableStream, tool, type ModelMessage } from "ai";
import { MockLanguageModelV2 } from "ai/test";
import type { LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { z } from "zod";
import { runAgentLoop } from "../src/agent/loop.ts";
import type { AgentCallbacks } from "../src/types.ts";
import { createSession, SessionStore, validateSession } from "../src/sessions/store.ts";

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const finish = (reason: "stop" | "tool-calls" | "length"): LanguageModelV2StreamPart =>
  ({ type: "finish", finishReason: reason, usage });
const call = (id: string): LanguageModelV2StreamPart =>
  ({ type: "tool-call", toolCallId: id, toolName: "echo", input: JSON.stringify({ text: id }) });
const text = (value: string): LanguageModelV2StreamPart[] => [
  { type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: value }, { type: "text-end", id: "text" },
];
const model = (...steps: LanguageModelV2StreamPart[][]) => new MockLanguageModelV2({
  doStream: steps.map((chunks) => ({
    stream: simulateReadableStream({ chunks, initialDelayInMs: null, chunkDelayInMs: null }), warnings: [],
  })),
});
const initial: ModelMessage[] = [{ role: "system", content: "Fresh prompt" }, { role: "user", content: "Use echo" }];
function harness(approve: AgentCallbacks["onToolApproval"] = async () => true) {
  const executions: string[] = [], completed: string[] = [], ended: string[] = [], dispatched: string[] = [];
  const echo = tool({ inputSchema: z.object({ text: z.string() }), execute: async ({ text }) => {
    executions.push(text); return text;
  } });
  const callbacks: AgentCallbacks = {
    onToken: () => {}, onToolCallStart: () => {}, onToolApproval: approve,
    onToolCallEnd: (_name, result) => { ended.push(result); },
    onComplete: (response) => { completed.push(response); },
  };
  return { tools: { echo }, callbacks, executions, completed, ended, dispatched,
    executeTool: async (name: string, args: Record<string, unknown>) => {
      dispatched.push(name);
      return String(await echo.execute!({ text: String(args.text) }, { toolCallId: "test", messages: [] }));
    },
  };
}
async function storeFor(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agi-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return new SessionStore(path.join(root, "sessions"));
}

// These use the real SDK stream machinery, not a mocked streamText implementation.
test("approved tool executes once; completed history saves/resumes without replay", { timeout: 10000 }, async (t) => {
  const h = harness();
  const source = model([call("fresh"), finish("tool-calls")], [...text("Done"), finish("stop")]);
  const history = await runAgentLoop({ ...h, model: source, messages: initial });
  assert.deepEqual(h.executions, ["fresh"]);
  assert.deepEqual(h.dispatched, ["echo"]);
  assert.deepEqual(h.completed, ["Done"]);
  assert.equal(source.doStreamCalls.length, 2);
  assert.equal(history.some((message) => message.role === "system"), false);
  const store = await storeFor(t);
  const saved = await store.save({ ...createSession(), history });
  const loaded = await store.load(saved.id);
  assert.deepEqual(loaded.history, history);
  await runAgentLoop({ ...h, model: model([...text("Continued"), finish("stop")]),
    messages: [...loaded.history, { role: "user", content: "Continue" }],
  });
  assert.deepEqual(h.executions, ["fresh"]);
});

test("pending approval executes nothing; any denial cancels and pairs the entire batch", { timeout: 10000 }, async (t) => {
  let release!: (approved: boolean) => void, ready!: () => void;
  const pending = new Promise<boolean>((resolve) => { release = resolve; });
  t.after(() => release(false));
  const reachedApproval = new Promise<void>((resolve) => { ready = resolve; });
  let approvals = 0;
  const h = harness(async () => {
    if (++approvals === 1) return true;
    ready(); return pending;
  });
  const source = model([call("first"), call("second"), call("third"), finish("tool-calls")]);
  const running = runAgentLoop({ ...h, model: source, messages: initial });
  await reachedApproval;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(h.executions, []);
  release(false);
  const history = await running;
  assert.deepEqual(h.executions, []);
  assert.deepEqual(h.dispatched, []);
  assert.equal(approvals, 2);
  assert.equal(h.ended.length, 3);
  assert.ok(h.ended.every((result) => result.startsWith("Cancelled:")));
  assert.match(h.completed[0]!, /batch cancelled/);
  assert.equal(source.doStreamCalls.length, 1);
  assert.equal(history.filter((message) => message.role === "tool").length, 3);
  assert.doesNotThrow(() => validateSession({ ...createSession(), history }));
});

test("partial stream errors, noncompletion and result failures never complete or checkpoint", { timeout: 10000 }, async (t) => {
  const store = await storeFor(t);
  const cases: LanguageModelV2StreamPart[][] = [
    [call("unsafe"), ...text("Partial"), { type: "error", error: new Error("stream failed") }, finish("stop")],
    [call("unsafe"), ...text("Truncated"), finish("length")],
    [], // No completed SDK step: result promises reject.
  ];
  for (const chunks of cases) {
    const h = harness();
    await assert.rejects(async () => {
      const history = await runAgentLoop({ ...h, model: model(chunks), messages: initial });
      await store.save({ ...createSession(), history });
    });
    assert.deepEqual(h.executions, []);
    assert.deepEqual(h.completed, []);
  }
  assert.deepEqual((await store.list()).sessions, []);
  assert.equal(initial.length, 2);
});
