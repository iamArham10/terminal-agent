import React, { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { clip, formatValue, wrapLine } from "../helpers.ts";
import { theme } from "../theme.ts";

interface ToolApprovalProps {
	toolName: string;
	args: unknown;
	onResolve: (approved: boolean) => void;
	width?: number;
	rows?: number;
}
export function ToolApproval({
	toolName,
	args,
	onResolve,
	width = 80,
	rows = 24,
}: ToolApprovalProps) {
	const [approve, setApprove] = useState(false);
	const [page, setPage] = useState(0);
	const resolved = useRef(false);
	const lines = formatValue(args)
		.split("\n")
		.flatMap((line) => wrapLine(line, Math.max(1, width - 4)));
	const small = rows < 16;
	const pageSize = Math.max(1, rows - (rows < 14 ? 9 : small ? 10 : 11));
	const pages = Math.max(1, Math.ceil(lines.length / pageSize));
	const currentPage = Math.min(page, pages - 1);
	const resolve = (value: boolean) => {
		if (resolved.current) return;
		resolved.current = true;
		onResolve(value);
	};
	useInput((input, key) => {
		if (key.escape || input.toLowerCase() === "n") {
			resolve(false);
			return;
		}
		if (
			key.leftArrow ||
			key.rightArrow ||
			key.upArrow ||
			key.downArrow ||
			key.tab
		)
			setApprove((prev) => !prev);
		else if (key.pageDown || input === "]")
			setPage((prev) => Math.min(pages - 1, prev + 1));
		else if (key.pageUp || input === "[")
			setPage((prev) => Math.max(0, prev - 1));
		else if (key.return) resolve(approve);
	});
	return (
		<Box
			flexDirection="column"
			borderStyle="round"
			borderColor={theme.warning}
			paddingX={width >= 30 ? 1 : 0}
		>
			<Text color={theme.warning} bold>
				{clip("PERMISSION REQUIRED", width - 4)}
			</Text>
			<Text bold>{clip(toolName, width - 4)}</Text>
			{!small && (
				<Text dimColor>
					{clip(
						"Review before allowing. May read/write files or run commands.",
						width - 4,
					)}
				</Text>
			)}
			<Box flexDirection="column" height={pageSize} overflow="hidden">
				{lines
					.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
					.map((line, i) => (
						<Text key={i} wrap="truncate">
							{line || " "}
						</Text>
					))}
			</Box>
			<Text dimColor>
				{clip(
					`Arguments ${currentPage + 1}/${pages} · [/] or PgUp/PgDn`,
					width - 4,
				)}
			</Text>
			<Text>
				{width < 24 ? (
					<Text inverse color={approve ? theme.success : theme.danger}>
						{approve ? "Allow" : "Deny"}
					</Text>
				) : (
					<>
						<Text inverse={!approve} color={theme.danger}>
							{" "}
							Deny{" "}
						</Text>{" "}
						<Text inverse={approve} color={theme.success}>
							{" "}
							Allow once{" "}
						</Text>
					</>
				)}
			</Text>
			{rows >= 14 && (
				<Text dimColor>
					{clip("←/→ select · Enter confirm · Esc/n deny", width - 4)}
				</Text>
			)}
		</Box>
	);
}
