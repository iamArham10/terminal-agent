import { constants } from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	open,
	readdir,
	rename,
	unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { SavedSession } from "../types.ts";

const idSchema = z.string().uuid();
const providerMetadata = {
	providerOptions: z
		.record(z.string(), z.record(z.string(), z.json()))
		.optional(),
};
const textPart = z
	.object({ type: z.literal("text"), text: z.string() })
	.extend(providerMetadata)
	.passthrough();
const reasoningPart = z
	.object({ type: z.literal("reasoning"), text: z.string() })
	.extend(providerMetadata)
	.passthrough();
const filePart = z
	.object({ type: z.literal("file"), data: z.string(), mediaType: z.string() })
	.extend(providerMetadata)
	.passthrough();
const imagePart = z
	.object({ type: z.literal("image"), image: z.string() })
	.extend(providerMetadata)
	.passthrough();
const toolCall = z
	.object({
		type: z.literal("tool-call"),
		toolCallId: z.string().min(1),
		toolName: z.string().min(1),
		input: z.json(),
		providerExecuted: z.boolean().optional(),
	})
	.extend(providerMetadata)
	.passthrough();
const toolOutput = z.discriminatedUnion("type", [
	z.object({ type: z.literal("text"), value: z.string() }),
	z.object({ type: z.literal("json"), value: z.json() }),
	z.object({ type: z.literal("error-text"), value: z.string() }),
	z.object({ type: z.literal("error-json"), value: z.json() }),
	z.object({
		type: z.literal("content"),
		value: z.array(
			z.discriminatedUnion("type", [
				z.object({ type: z.literal("text"), text: z.string() }),
				z.object({
					type: z.literal("media"),
					data: z.string(),
					mediaType: z.string(),
				}),
			]),
		),
	}),
]);
const toolResult = z
	.object({
		type: z.literal("tool-result"),
		toolCallId: z.string().min(1),
		toolName: z.string().min(1),
		output: toolOutput,
	})
	.extend(providerMetadata)
	.passthrough();
const modelMessage = z.discriminatedUnion("role", [
	z
		.object({ role: z.literal("system"), content: z.string() })
		.extend(providerMetadata)
		.passthrough(),
	z
		.object({
			role: z.literal("user"),
			content: z.union([
				z.string(),
				z.array(z.union([textPart, filePart, imagePart])),
			]),
		})
		.extend(providerMetadata)
		.passthrough(),
	z
		.object({
			role: z.literal("assistant"),
			content: z.union([
				z.string(),
				z.array(
					z.union([textPart, reasoningPart, filePart, toolCall, toolResult]),
				),
			]),
		})
		.extend(providerMetadata)
		.passthrough(),
	z
		.object({ role: z.literal("tool"), content: z.array(toolResult).min(1) })
		.extend(providerMetadata)
		.passthrough(),
]);
const sessionSchema = z.object({
	version: z.literal(1),
	id: idSchema,
	revision: z.number().int().nonnegative(),
	title: z.string().min(1).max(100),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	projectDirectory: z
		.string()
		.refine(path.isAbsolute, "Project directory must be absolute"),
	history: z.array(modelMessage),
	messages: z.array(
		z.object({ role: z.enum(["user", "assistant"]), content: z.string() }),
	),
	tokenUsage: z
		.object({
			inputTokens: z.number().nonnegative(),
			outputTokens: z.number().nonnegative(),
			totalTokens: z.number().nonnegative(),
			contextWindow: z.number().positive(),
			threshold: z.number().min(0).max(1),
			percentage: z.number().nonnegative(),
		})
		.nullable(),
});
const MAX_BYTES = 64 * 1024 * 1024;

export class SessionError extends Error {}

export function validateSessionId(id: string): string {
	if (!idSchema.safeParse(id).success) {
		throw new SessionError(
			"Invalid session ID: use the full UUID shown by 'agi sessions list'.",
		);
	}
	return id;
}

export function defaultSessionDirectory(
	env: NodeJS.ProcessEnv = process.env,
	home = os.homedir(),
): string {
	const state = env.XDG_STATE_HOME;
	return path.join(
		state && path.isAbsolute(state)
			? state
			: path.join(home, ".local", "state"),
		"terminal-agent",
		"sessions",
	);
}

export function createSession(projectDirectory = process.cwd()): SavedSession {
	const now = new Date().toISOString();
	return {
		version: 1,
		id: randomUUID(),
		revision: 0,
		title: "New conversation",
		createdAt: now,
		updatedAt: now,
		projectDirectory: path.resolve(projectDirectory),
		history: [],
		messages: [],
		tokenUsage: null,
	};
}

export function sessionTitle(input: string): string {
	return (
		input
			.replace(/[\x00-\x1f\x7f]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 100) || "New conversation"
	);
}

export function validateSession(value: unknown): SavedSession {
	const parsed = sessionSchema.safeParse(value);
	if (!parsed.success)
		throw new SessionError("Invalid or unsupported session data.");
	const session = parsed.data;
	if (Date.parse(session.updatedAt) < Date.parse(session.createdAt))
		throw new SessionError("Invalid session timestamps.");
	// A saved checkpoint must not contain pending tool work. Loading only restores data;
	// execution is exclusively driven by new model output after the next user input.
	const pending = new Map<string, string>();
	const seen = new Set<string>();
	for (const message of session.history) {
		if (!Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (part.type === "tool-call") {
				if (seen.has(part.toolCallId))
					throw new SessionError("Duplicate tool call in session.");
				seen.add(part.toolCallId);
				pending.set(part.toolCallId, part.toolName);
			} else if (part.type === "tool-result") {
				if (pending.get(part.toolCallId) !== part.toolName)
					throw new SessionError("Unmatched tool result in session.");
				pending.delete(part.toolCallId);
			}
		}
	}
	if (pending.size)
		throw new SessionError(
			"Session contains incomplete tool calls; refusing to resume.",
		);
	return session as SavedSession;
}

function errorCode(error: unknown): string | undefined {
	return (error as NodeJS.ErrnoException)?.code;
}

export class SessionStore {
	private queues = new Map<string, Promise<unknown>>();
	constructor(readonly directory = defaultSessionDirectory()) {}

	private filename(id: string): string {
		return path.join(this.directory, `${validateSessionId(id)}.json`);
	}

	private async checkDirectory(): Promise<void> {
		const stat = await lstat(this.directory);
		if (!stat.isDirectory() || stat.isSymbolicLink())
			throw new SessionError(
				"Session directory must be a real directory, not a symlink.",
			);
		if (process.getuid && stat.uid !== process.getuid())
			throw new SessionError("Session directory is owned by another user.");
	}

	private async ensureDirectory(): Promise<void> {
		await mkdir(this.directory, { recursive: true, mode: 0o700 });
		await this.checkDirectory();
		await chmod(this.directory, 0o700);
	}

	async load(id: string): Promise<SavedSession> {
		const filename = this.filename(id);
		let handle;
		try {
			await this.checkDirectory();
			handle = await open(
				filename,
				constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
			);
			const stat = await handle.stat();
			if (!stat.isFile() || stat.size > MAX_BYTES)
				throw new SessionError(
					"Session file is not a regular file or is too large.",
				);
			const session = validateSession(
				JSON.parse(await handle.readFile("utf8")),
			);
			if (session.id !== id)
				throw new SessionError("Session ID does not match its filename.");
			return session;
		} catch (error) {
			if (errorCode(error) === "ENOENT")
				throw new SessionError(
					`Session '${id}' not found. Run 'agi sessions list'.`,
				);
			throw new SessionError(
				`Cannot load session '${id}': ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			await handle?.close();
		}
	}

	async list(): Promise<{ sessions: SavedSession[]; warnings: string[] }> {
		let entries;
		try {
			await this.checkDirectory();
			entries = await readdir(this.directory, { withFileTypes: true });
		} catch (error) {
			if (errorCode(error) === "ENOENT") return { sessions: [], warnings: [] };
			throw new SessionError(
				`Cannot list sessions: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		const sessions: SavedSession[] = [];
		const warnings: string[] = [];
		for (const entry of entries) {
			if (!entry.name.endsWith(".json")) continue;
			const id = entry.name.slice(0, -5);
			try {
				validateSessionId(id);
				sessions.push(await this.load(id));
			} catch (error) {
				warnings.push(
					`Skipped ${JSON.stringify(entry.name)}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		sessions.sort(
			(a, b) =>
				Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
				b.id.localeCompare(a.id),
		);
		return { sessions, warnings };
	}

	async latest(): Promise<{ session: SavedSession; warnings: string[] }> {
		const { sessions, warnings } = await this.list();
		if (!sessions.length)
			throw new SessionError(
				`No valid saved sessions found. Start a conversation with 'agi'.${warnings.length ? ` ${warnings.join(" ")}` : ""}`,
			);
		return { session: sessions[0]!, warnings };
	}

	save(session: SavedSession): Promise<SavedSession> {
		// Capture before queuing so callers cannot mutate a pending checkpoint.
		let snapshot: SavedSession;
		try {
			snapshot = validateSession(JSON.parse(JSON.stringify(session)));
		} catch (error) {
			return Promise.reject(error);
		}
		const previous = this.queues.get(snapshot.id) ?? Promise.resolve();
		const next = previous
			.catch(() => undefined)
			.then(() => this.write(snapshot));
		this.queues.set(snapshot.id, next);
		void next
			.finally(() => {
				if (this.queues.get(snapshot.id) === next)
					this.queues.delete(snapshot.id);
			})
			.catch(() => undefined);
		return next;
	}

	private async write(snapshot: SavedSession): Promise<SavedSession> {
		await this.ensureDirectory();
		const filename = this.filename(snapshot.id);
		const lockname = `${filename}.lock`;
		const tempname = path.join(
			this.directory,
			`.${snapshot.id}.${randomUUID()}.tmp`,
		);
		let lock;
		let temp;
		try {
			// Cross-process exclusion plus optimistic revision checking prevents a stale
			// resumed process from overwriting a newer checkpoint from another process.
			try {
				lock = await open(lockname, "wx", 0o600);
			} catch (error) {
				if (errorCode(error) === "EEXIST")
					throw new SessionError(
						"Session is being saved elsewhere (or has a stale .lock file). Try again after checking other agi processes.",
					);
				throw error;
			}
			await lock.writeFile(String(process.pid));
			let exists = true;
			try {
				await lstat(filename);
			} catch (error) {
				if (errorCode(error) === "ENOENT") exists = false;
				else throw error;
			}
			// Do not overwrite corrupt or unreadable existing sessions.
			const existing = exists ? await this.load(snapshot.id) : undefined;
			if (
				(existing?.revision ?? 0) !== snapshot.revision ||
				(!existing && snapshot.revision !== 0)
			) {
				throw new SessionError(
					"Session changed in another process. Resume it again before saving; your conversation remains in memory.",
				);
			}
			if (
				existing &&
				(existing.createdAt !== snapshot.createdAt ||
					existing.projectDirectory !== snapshot.projectDirectory)
			) {
				throw new SessionError(
					"Session identity changed; refusing to overwrite it.",
				);
			}
			const saved = {
				...snapshot,
				revision: snapshot.revision + 1,
				updatedAt: new Date(
					Math.max(Date.now(), Date.parse(snapshot.updatedAt) + 1),
				).toISOString(),
			};
			const json = JSON.stringify(saved, null, 2) + "\n";
			if (Buffer.byteLength(json) > MAX_BYTES)
				throw new SessionError("Session exceeds the 64 MiB storage limit.");
			temp = await open(tempname, "wx", 0o600);
			await temp.writeFile(json);
			await temp.sync();
			await temp.close();
			temp = undefined;
			await rename(tempname, filename);
			return saved;
		} finally {
			await temp?.close();
			await unlink(tempname).catch(() => undefined);
			if (lock) {
				await lock.close();
				await unlink(lockname).catch(() => undefined);
			}
		}
	}
}
