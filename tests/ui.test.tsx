import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import React from "react";
import { render } from "ink";
import {
	cellWidth, clip, editInput, emptyEditor, graphemes, markdownLines,
	safeText, wrapLine,
} from "../src/ui/helpers.ts";
import { Input } from "../src/ui/components/Input.tsx";
import { MessageList } from "../src/ui/components/MessageList.tsx";
import { TokenUsage } from "../src/ui/components/TokenUsage.tsx";
import { ToolApproval } from "../src/ui/components/ToolApproval.tsx";

function harness(node: React.ReactNode, columns = 40, rows = 16) {
	const stdout = Object.assign(new PassThrough(), { columns, rows, isTTY: true });
	const stdin = Object.assign(new PassThrough(), {
		isTTY: true, setRawMode: () => stdin, ref: () => stdin, unref: () => stdin,
	});
	let output = "";
	stdout.on("data", (chunk) => { output += chunk.toString(); });
	const app = render(node, {
		stdout: stdout as unknown as NodeJS.WriteStream,
		stdin: stdin as unknown as NodeJS.ReadStream,
		stderr: stdout as unknown as NodeJS.WriteStream,
		debug: true, patchConsole: false,
	});
	return {
		app, text: () => safeText(output), raw: () => output,
		async keys(...values: string[]) {
			for (const value of values) { stdin.write(value); await delay(40); }
		},
		dispose() {
			app.unmount(); app.cleanup(); stdin.destroy(); stdout.destroy();
		},
	};
}

test("sanitization removes terminal controls; Unicode widths preserve graphemes", () => {
	assert.equal(
		safeText("\x1b[31mred\x1b[0m\x1b]52;c;SECRET\x07safe\x1b[2J\u202eevil\x00"),
		"redsafeevil",
	);
	assert.equal(safeText("a\x9d0;title\x9cb"), "ab");
	assert.equal(safeText("hello\x1b]0;unfinished"), "hello");
	assert.equal(graphemes("e\u0301👩‍💻").length, 2);
	assert.equal(cellWidth("界e\u0301👩‍💻"), 5);
	assert.equal(clip("abcdef", 4), "abc…");
	assert.deepEqual(wrapLine("界界abc", 4), ["界界", "abc"]);
	assert.ok(wrapLine("a".repeat(100), 17).every((line) => cellWidth(line) <= 17));
});

test("input edits Unicode safely, restores history drafts, and respects disabled state", async () => {
	let state = editInput(emptyEditor, { insert: "a👩‍💻b" });
	state = editInput(editInput(state, "left"), "backspace");
	assert.deepEqual([state.value, state.cursor], ["ab", 1]);
	assert.equal(editInput(state, "delete").value, "a");
	assert.equal(editInput(emptyEditor, { insert: "x\r\ny\x1b[31m" }).value, "x y");
	state = editInput(emptyEditor, { insert: "draft" });
	const history = ["first", "second"];
	state = editInput(state, "up", history);
	assert.equal(state.value, "second");
	state = editInput(editInput(state, "up", history), "up", history);
	assert.equal(state.value, "first");
	state = editInput(editInput(state, "down", history), "down", history);
	assert.equal(state.value, "draft");

	const sent: string[] = [];
	const submit = (value: string) => { sent.push(value); };
	const h = harness(<Input onSubmit={submit} width={40} />);
	try {
		await delay(40);
		await h.keys("abc", "\x1b[H", "X", "\x1b[F", "\x1b[D", "\x1b[3~", "\r");
		assert.deepEqual(sent, ["Xab"]);
		h.app.rerender(<Input onSubmit={submit} disabled hidden width={40} />);
		await delay(40); await h.keys("ignored", "\r");
		assert.equal(sent.length, 1);
		h.app.rerender(<Input onSubmit={submit} width={40} />);
		await delay(40); await h.keys("\x1b[A", "\r");
		assert.deepEqual(sent, ["Xab", "Xab"]);
	} finally { h.dispose(); }
});

test("approval defaults to deny; allowing requires explicit selection and resolves once", async () => {
	for (const allow of [false, true]) {
		const decisions: boolean[] = [];
		const h = harness(
			<ToolApproval toolName="runCommand"
				args={{ command: "echo safe", content: "x".repeat(400) }}
				onResolve={(value) => decisions.push(value)} width={36} rows={16} />,
			38, 16,
		);
		try {
			await delay(40);
			assert.match(h.text(), /PERMISSION REQUIRED/);
			assert.match(h.text(), /Arguments 1\//);
			await h.keys("]");
			assert.match(h.text(), /Arguments 2\//);
			if (allow) await h.keys("\x1b[C");
			await h.keys("\r", "\r");
			assert.deepEqual(decisions, [allow]);
		} finally { h.dispose(); }
	}
});

test("narrow Markdown and context render without emitting untrusted escapes", async () => {
	const content = '# Title\n```ts\nconst unsafe = "\x1b[2J\x1b]52;c;SECRET\x07";\n```';
	const lines = markdownLines(content, 18);
	assert.equal(lines[0].kind, "heading");
	assert.ok(lines.some((line) => line.kind === "code"));
	assert.ok(lines.every((line) => cellWidth(line.text) <= 18));
	assert.ok(lines.every((line) => !line.text.includes("\x1b")));
	const usage = {
		inputTokens: 500, outputTokens: 10, totalTokens: 510,
		contextWindow: 1000, threshold: 0.8, percentage: 51,
	};
	const h = harness(
		<><MessageList messages={[{ role: "assistant", content }]} width={18} height={7} />
			<TokenUsage usage={usage} width={18} /></>,
		20, 12,
	);
	try {
		await delay(40);
		assert.match(h.text(), /Title/);
		assert.match(h.text(), /Context ~51/);
		assert.ok(!h.raw().includes("\x1b[2J"));
		assert.ok(!h.raw().includes("\x1b]52"));
	} finally { h.dispose(); }
});
