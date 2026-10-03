// The tool executor carries JSON as text. Keep source display independent of
// document contents, and tolerate legacy/plain-text tool results and failures.
export function ragSourceDisplay(result: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(result);
    if (!parsed || typeof parsed !== "object" || !("results" in parsed) || !Array.isArray(parsed.results)) return undefined;
    const labels: string[] = [];
    for (const entry of parsed.results) {
      if (entry && typeof entry === "object" && entry.citation && typeof entry.citation.label === "string") {
        labels.push(entry.citation.label);
      }
    }
    if (labels.length) return `Sources:\n${[...new Set(labels)].map((label) => `  ${label}`).join("\n")}`;
    if (!parsed.results.length) return "No relevant documents found.";
    return undefined;
  } catch {
    return undefined;
  }
}
