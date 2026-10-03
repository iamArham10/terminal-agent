import { validateSessionId } from "./sessions/store.ts";

export const HELP = `Usage: agi [--resume [latest|<id>]]
       agi sessions [list]
       agi ingest [directory] [--collection <name>]
       agi --help

Without arguments, start a new conversation. Sessions save automatically after
completed turns. 'agi sessions' lists IDs, titles, timestamps, and project paths.
Bare '--resume' selects latest. Resume restores history without replaying tools
and waits for your next message.
'npm start -- <arguments>' supports the same commands.
`;

export type CliOptions =
	| { command: "help" }
	| { command: "sessions" }
	| { command: "chat"; resume?: string }
	| { command: "ingest"; directory?: string; collection?: string };

export function parseCliArgs(args: string[]): CliOptions {
	if (!args.length) return { command: "chat" };
	if (args.length === 1 && ["--help", "-h", "help"].includes(args[0]!))
		return { command: "help" };
	if (args[0] === "sessions") {
		if (args.length === 2 && ["--help", "-h"].includes(args[1]!))
			return { command: "help" };
		if (args.length === 1 || (args.length === 2 && args[1] === "list"))
			return { command: "sessions" };
		throw new Error("Usage: agi sessions [list]");
	}
	if (args[0] === "--resume" || args[0]?.startsWith("--resume=")) {
		if (args.length === 1 && args[0] === "--resume")
			return { command: "chat", resume: "latest" };
		const inline = args[0].startsWith("--resume=");
		const id = inline ? args[0].slice("--resume=".length) : args[1];
		if (!id || args.length !== (inline ? 1 : 2))
			throw new Error("Usage: agi --resume [latest|<id>]");
		if (id !== "latest") validateSessionId(id);
		return { command: "chat", resume: id };
	}
	if (args[0] === "ingest") {
		if (args.length === 2 && ["--help", "-h"].includes(args[1]!))
			return { command: "help" };
		let directory: string | undefined;
		let collection: string | undefined;
		for (let i = 1; i < args.length; i++) {
			const arg = args[i]!;
			if (arg === "--collection" || arg.startsWith("--collection=")) {
				const value =
					arg === "--collection"
						? args[++i]
						: arg.slice("--collection=".length);
				if (!value || value.startsWith("--") || collection !== undefined)
					throw new Error(
						"--collection requires one nonempty collection name.",
					);
				collection = value;
			} else if (arg.startsWith("-") || directory !== undefined) {
				throw new Error(
					`Unexpected ingest argument: ${arg}. Usage: agi ingest [directory] [--collection <name>]`,
				);
			} else directory = arg;
		}
		return { command: "ingest", directory, collection };
	}
	throw new Error(`Unknown argument: ${args[0]}. Run 'agi --help' for usage.`);
}
