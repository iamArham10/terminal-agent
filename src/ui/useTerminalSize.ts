import { useEffect, useState } from "react";
import { useStdout } from "ink";

export function useTerminalSize() {
	const { stdout } = useStdout();
	const measure = () => ({
		columns: Math.max(12, stdout.columns || 80),
		rows: Math.max(10, stdout.rows || 24),
	});
	const [size, setSize] = useState(measure);
	useEffect(() => {
		const resize = () => setSize(measure());
		stdout.on("resize", resize);
		return () => {
			stdout.off("resize", resize);
		};
	}, [stdout]);
	return size;
}
