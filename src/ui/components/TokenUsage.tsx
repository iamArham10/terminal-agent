import React from "react";
import { Text } from "ink";
import type { TokenUsageInfo } from "../../types.ts";
import { clip } from "../helpers.ts";
import { theme } from "../theme.ts";

export function TokenUsage({
	usage,
	width = 80,
}: {
	usage: TokenUsageInfo | null;
	width?: number;
}) {
	if (!usage)
		return (
			<Text dimColor>
				{clip("Context · estimate available after first message", width)}
			</Text>
		);
	const percent = Number.isFinite(usage.percentage)
		? Math.max(0, usage.percentage)
		: 0;
	const color =
		percent >= usage.threshold * 100
			? theme.danger
			: percent >= usage.threshold * 75
				? theme.warning
				: theme.muted;
	const count = (n: number) =>
		n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
	const bar = "━"
		.repeat(Math.min(8, Math.round((percent / 100) * 8)))
		.padEnd(8, "─");
	return (
		<Text color={color}>
			{clip(
				width < 48
					? `Context ~${percent.toFixed(1)}% · ${count(usage.totalTokens)}/${count(usage.contextWindow)}`
					: `Context ${bar} ~${percent.toFixed(1)}% · ${count(usage.totalTokens)}/${count(usage.contextWindow)} tokens · compact at ${Math.round(usage.threshold * 100)}%`,
				width,
			)}
		</Text>
	);
}
