import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const richTextTextareaSource = readFileSync(
  new URL("./IssueManagerRichTextTextarea.tsx", import.meta.url),
  "utf8"
);

test("rich text textarea opens @ providers before a query is typed", () => {
  assert.match(richTextTextareaSource, /minQueryLength=\{0\}/);
});
