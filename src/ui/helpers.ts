/** Strip terminal controls, including OSC links and ANSI cursor/colour sequences. */
export function safeText(value: string): string {
	return value
		.replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\|\x9c|$)/g, "")
		.replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, "")
		.replace(/\x1b[ -/]*[@-~]/g, "")
		.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "")
		.replace(/\t/g, "  ");
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const graphemes = (value: string): string[] =>
	Array.from(segmenter.segment(value), (part) => part.segment);

export function cellWidth(value: string): number {
	return graphemes(value).reduce((total, char) => {
		const cp = char.codePointAt(0) ?? 0;
		if (/^\p{Mark}+$/u.test(char)) return total;
		const wide =
			/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(char) ||
			(cp >= 0x1100 &&
				(cp <= 0x115f ||
					cp === 0x2329 ||
					cp === 0x232a ||
					(cp >= 0x2e80 && cp <= 0xa4cf) ||
					(cp >= 0xac00 && cp <= 0xd7a3) ||
					(cp >= 0xf900 && cp <= 0xfaff) ||
					(cp >= 0xfe10 && cp <= 0xfe6f) ||
					(cp >= 0xff01 && cp <= 0xff60) ||
					(cp >= 0xffe0 && cp <= 0xffe6) ||
					cp >= 0x20000));
		return total + (wide ? 2 : 1);
	}, 0);
}

export function clip(value: string, width: number): string {
	const clean = safeText(value).replace(/\n/g, " ");
	if (cellWidth(clean) <= width) return clean;
	let result = "";
	for (const char of graphemes(clean)) {
		if (cellWidth(result + char) > Math.max(0, width - 1)) break;
		result += char;
	}
	return width > 0 ? result + "…" : "";
}

export function wrapLine(value: string, width: number): string[] {
	const result: string[] = [];
	let line = "";
	for (const char of graphemes(value)) {
		if (line && cellWidth(line + char) > Math.max(1, width)) {
			result.push(line);
			line = "";
		}
		line += char;
	}
	result.push(line);
	return result;
}

export interface RenderLine {
	text: string;
	kind:
		| "body"
		| "heading"
		| "code"
		| "quote"
		| "user"
		| "assistant"
		| "error"
		| "muted";
}

export function markdownLines(value: string, width: number): RenderLine[] {
	let code = false;
	return safeText(value)
		.split("\n")
		.flatMap((line): RenderLine[] => {
			if (/^\s*```/.test(line)) {
				code = !code;
				return [
					{
						text: code ? `┌ ${line.replace(/^\s*```/, "") || "code"}` : "└",
						kind: "muted",
					},
				];
			}
			let kind: RenderLine["kind"] = code ? "code" : "body";
			let text = line;
			if (!code) {
				if (/^#{1,6}\s/.test(line)) {
					kind = "heading";
					text = line.replace(/^#{1,6}\s+/, "");
				} else if (/^>\s?/.test(line)) {
					kind = "quote";
					text = `│ ${line.replace(/^>\s?/, "")}`;
				} else text = line.replace(/^\s*[-*+]\s+/, "• ");
				// Keep the target visible; never emit clickable terminal escape sequences.
				text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
			}
			return wrapLine(code ? `│ ${text}` : text, width).map((text) => ({
				text,
				kind,
			}));
		});
}

export function formatValue(value: unknown): string {
	try {
		return safeText(JSON.stringify(value, null, 2) ?? String(value));
	} catch {
		return "[Unserializable value]";
	}
}

export function argsSummary(value: unknown, width: number): string {
	if (value && typeof value === "object") {
		const args = value as Record<string, unknown>;
		for (const key of [
			"command",
			"path",
			"filePath",
			"query",
			"code",
			"content",
		]) {
			if (typeof args[key] === "string")
				return clip(`${key}: ${args[key]}`, width);
		}
	}
	return clip(formatValue(value), width);
}

export interface EditorState {
	value: string;
	cursor: number;
	historyIndex: number | null;
	draft: string;
}
export const emptyEditor: EditorState = {
	value: "",
	cursor: 0,
	historyIndex: null,
	draft: "",
};
export type EditAction =
	| "left"
	| "right"
	| "home"
	| "end"
	| "backspace"
	| "delete"
	| "clear"
	| "kill"
	| "word"
	| "up"
	| "down";
export function editInput(
	state: EditorState,
	action: EditAction | { insert: string },
	history: string[] = [],
): EditorState {
	const chars = graphemes(state.value);
	let cursor = state.cursor;
	if (action === "up" || action === "down") {
		if (!history.length) return state;
		const index = state.historyIndex ?? history.length;
		const next = Math.max(
			0,
			Math.min(history.length, index + (action === "up" ? -1 : 1)),
		);
		const draft = state.historyIndex === null ? state.value : state.draft;
		const value = next === history.length ? draft : history[next];
		return {
			value,
			cursor: graphemes(value).length,
			draft,
			historyIndex: next === history.length ? null : next,
		};
	}
	if (action === "left") cursor = Math.max(0, cursor - 1);
	else if (action === "right") cursor = Math.min(chars.length, cursor + 1);
	else if (action === "home") cursor = 0;
	else if (action === "end") cursor = chars.length;
	else if (action === "backspace" && cursor > 0) chars.splice(--cursor, 1);
	else if (action === "delete") chars.splice(cursor, 1);
	else if (action === "clear") {
		chars.length = 0;
		cursor = 0;
	} else if (action === "kill") chars.splice(cursor);
	else if (action === "word") {
		const before = chars
			.slice(0, cursor)
			.join("")
			.replace(/\S+\s*$/, "");
		const start = graphemes(before).length;
		chars.splice(start, cursor - start);
		cursor = start;
	} else if (typeof action === "object") {
		const inserted = graphemes(
			safeText(action.insert.replace(/[\r\n]+/g, " ")),
		);
		chars.splice(cursor, 0, ...inserted);
		cursor += inserted.length;
	}
	return { ...state, value: chars.join(""), cursor };
}

export function inputWindow(value: string, cursor: number, width: number) {
	const chars = graphemes(value);
	const budget = Math.max(1, width - 2);
	let start = cursor;
	let used = 0;
	while (start > 0 && used + cellWidth(chars[start - 1]) <= budget / 2)
		used += cellWidth(chars[--start]);
	let end = cursor;
	used += cellWidth(chars[cursor] ?? " ");
	while (end + 1 < chars.length && used + cellWidth(chars[end + 1]) <= budget)
		used += cellWidth(chars[++end]);
	return {
		before: (start ? "‹" : "") + chars.slice(start, cursor).join(""),
		cursor: chars[cursor] ?? " ",
		after:
			chars.slice(cursor + 1, end + 1).join("") +
			(end + 1 < chars.length ? "›" : ""),
	};
}
