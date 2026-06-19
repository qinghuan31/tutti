import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./WorkspaceFileReferencePickerTree.tsx", import.meta.url),
  "utf8"
);

test("search result paths expose the full path through a UI System tooltip", () => {
  assert.match(source, /Tooltip,\s*TooltipContent,\s*TooltipTrigger,/);
  assert.match(
    source,
    /<TooltipContent[\s\S]*\{entry\.path\}[\s\S]*<\/TooltipContent>/
  );
});
