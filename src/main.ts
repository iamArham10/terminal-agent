import os from "node:os";
import path from "node:path";
import { HELP, parseCliArgs } from "./cliArgs.ts";
import { createSession, SessionStore } from "./sessions/store.ts";

const terminalSafe = (value: string) =>
	value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");

export async function main(args = process.argv.slice(2)): Promise<void> {
	try {
		const options = parseCliArgs(args);
		if (options.command === "help") {
			console.log(HELP);
			return;
		}
		const store = new SessionStore();
		if (options.command === "sessions") {
			const { sessions, warnings } = await store.list();
			for (const warning of warnings)
				console.error(`Warning: ${terminalSafe(warning)}`);
			if (!sessions.length) {
				console.log(
					"No saved sessions. Start a conversation with 'agi'; completed turns save automatically.",
				);
				return;
			}
			console.log(
				"ID | Updated (UTC) | Created (UTC) | Title | Project directory",
			);
			for (const session of sessions) {
				console.log(
					[
						session.id,
						session.updatedAt,
						session.createdAt,
						terminalSafe(session.title),
						terminalSafe(session.projectDirectory),
					].join(" | "),
				);
			}
			console.log("Resume: agi --resume latest  or  agi --resume <id>");
			return;
		}
		let session = createSession();
		if (options.command === "chat" && options.resume) {
			if (options.resume === "latest") {
				const latest = await store.latest();
				session = latest.session;
				for (const warning of latest.warnings)
					console.error(`Warning: ${terminalSafe(warning)}`);
			} else session = await store.load(options.resume);
			// Tool paths must use the original working directory, not the invocation directory.
			process.chdir(session.projectDirectory);
		}
		// Local management commands never initialize model integrations or need .env.
		if (typeof process.loadEnvFile === "function") {
			try {
				process.loadEnvFile(path.resolve(".env"));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		if (options.command === "ingest") {
			const { ingestDirectory } = await import("./agent/rag/ingest.js");
			const { ragConfig } = await import("./agent/rag/config.js");
			const input = options.directory;
			const directory = !input
				? process.cwd()
				: input === "~"
					? os.homedir()
					: input.startsWith("~/")
						? path.join(os.homedir(), input.slice(2))
						: path.resolve(input);
			const collection = options.collection ?? ragConfig.collectionName;
			console.log(`Indexing documents in: ${directory}`);
			console.log(`Collection: ${collection}`);
			await ingestDirectory(directory, { collection });
			return;
		}
		const [{ render }, { default: React }, { App }] = await Promise.all([
			import("ink"),
			import("react"),
			import("./ui/App.tsx"),
		]);
		render(
			React.createElement(App, {
				initialSession: session,
				sessionStore: store,
			}),
		);
	} catch (error) {
		console.error(
			`Error: ${terminalSafe(error instanceof Error ? error.message : String(error))}`,
		);
		console.error("Run 'agi --help' for usage.");
		process.exitCode = 1;
	}
}
