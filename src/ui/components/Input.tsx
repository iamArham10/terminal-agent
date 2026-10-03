import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import {
	clip,
	editInput,
	emptyEditor,
	inputWindow,
	type EditAction,
} from "../helpers.ts";
import { theme } from "../theme.ts";

interface InputProps {
	onSubmit: (value: string) => void;
	disabled?: boolean;
	width?: number;
	compact?: boolean;
	hidden?: boolean;
}
export function Input({
	onSubmit,
	disabled = false,
	width = 80,
	compact = false,
	hidden = false,
}: InputProps) {
	const [state, setState] = useState(emptyEditor);
	const [history, setHistory] = useState<string[]>([]);
	const { internal_eventEmitter } = useStdin();
	useEffect(() => {
		if (disabled) return;
		// Ink 6 consumes Home/End without exposing them in its Key object.
		const handleNavigation = (sequence: string) => {
			const action = /^\u001b(?:\[H|\[1~|\[7~|OH)$/.test(sequence)
				? "home"
				: /^\u001b(?:\[F|\[4~|\[8~|OF)$/.test(sequence)
					? "end"
					: null;
			if (action) setState((prev) => editInput(prev, action));
		};
		internal_eventEmitter.on("input", handleNavigation);
		return () => {
			internal_eventEmitter.off("input", handleNavigation);
		};
	}, [disabled, internal_eventEmitter]);
	useInput(
		(input, key) => {
			if (key.return) {
				if (state.value.trim()) {
					setHistory((prev) =>
						[...prev.filter((item) => item !== state.value), state.value].slice(
							-100,
						),
					);
					setState(emptyEditor);
					onSubmit(state.value.trim());
				}
				return;
			}
			let action: EditAction | { insert: string } | undefined;
			if (key.ctrl)
				action = (
					{
						a: "home",
						e: "end",
						u: "clear",
						k: "kill",
						w: "word",
						p: "up",
						n: "down",
					} as Record<string, EditAction>
				)[input];
			else if (key.leftArrow) action = "left";
			else if (key.rightArrow) action = "right";
			else if (key.upArrow) action = "up";
			else if (key.downArrow) action = "down";
			else if (key.backspace) action = "backspace";
			else if (key.delete) action = "delete";
			else if (
				input &&
				!key.meta &&
				!key.escape &&
				!key.tab &&
				!key.pageUp &&
				!key.pageDown
			)
				action = { insert: input };
			if (action) setState((prev) => editInput(prev, action, history));
		},
		{ isActive: !disabled },
	);
	const visible = inputWindow(
		state.value,
		state.cursor,
		Math.max(1, width - 6),
	);
	return (
		<Box
			display={hidden ? "none" : "flex"}
			flexDirection="column"
			borderStyle="round"
			borderColor={disabled ? theme.muted : theme.accent}
			paddingX={width >= 30 ? 1 : 0}
		>
			<Text wrap="truncate">
				<Text color={theme.accent} bold>
					{"› "}
				</Text>
				{disabled ? (
					<Text dimColor>Agent working…</Text>
				) : state.value ? (
					<>
						<Text>{visible.before}</Text>
						<Text inverse>{visible.cursor}</Text>
						<Text>{visible.after}</Text>
					</>
				) : (
					<>
						<Text inverse> </Text>
						<Text dimColor> Ask anything…</Text>
					</>
				)}
			</Text>
			{!compact && (
				<Text dimColor>
					{clip(
						disabled
							? "Input paused · Ctrl+C exit"
							: "Enter send · ↑/↓ history · PgUp/PgDn scroll · Ctrl+C exit",
						width - 4,
					)}
				</Text>
			)}
		</Box>
	);
}
