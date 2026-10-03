import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { HELP, parseCliArgs } from "../src/cliArgs.ts";

test("resume accepts bare latest shorthand, explicit latest, full IDs and equals syntax", () => {
  assert.deepEqual(parseCliArgs([]), { command: "chat" });
  assert.deepEqual(parseCliArgs(["--resume"]), { command: "chat", resume: "latest" });
  for (const target of ["latest", randomUUID()]) {
    for (const args of [["--resume", target], [`--resume=${target}`]]) {
      assert.deepEqual(parseCliArgs(args), { command: "chat", resume: target });
    }
  }
  assert.match(HELP, /--resume \[latest\|<id>\]/);
  assert.match(HELP, /Bare '--resume' selects latest/);
});

test("listing/help and ingest parse correctly; malformed options give useful errors", () => {
  for (const args of [["sessions"], ["sessions", "list"]]) {
    assert.deepEqual(parseCliArgs(args), { command: "sessions" });
  }
  for (const args of [["--help"], ["sessions", "--help"]]) {
    assert.deepEqual(parseCliArgs(args), { command: "help" });
  }
  assert.deepEqual(parseCliArgs(["ingest", "~/notes", "--collection", "notes"]), {
    command: "ingest", directory: "~/notes", collection: "notes",
  });
  for (const args of [
    ["--resume="], ["--resume", "../escape"], ["--resume", "--help"],
    ["--resume", "latest", "extra"], ["sessions", "delete"], ["--unknown"],
    ["ingest", "--collection"], ["ingest", "--collection=a", "--collection=b"],
  ]) {
    assert.throws(() => parseCliArgs(args), /Usage|Invalid|Unknown|Unexpected|requires/);
  }
});
