import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const issueSectionsSource = readFileSync(
  new URL("./IssueManagerIssueSections.tsx", import.meta.url),
  "utf8"
);

test("execution outputs render as explicit open controls", () => {
  assert.match(issueSectionsSource, /FileIcon/);
  assert.match(issueSectionsSource, /ArrowRightIcon/);
  assert.match(
    issueSectionsSource,
    /aria-label=\{copy\.t\("actions\.openReference"\)\}/
  );
  assert.match(
    issueSectionsSource,
    /title=\{copy\.t\("actions\.openReference"\)\}/
  );
});
