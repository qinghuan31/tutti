import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./WorkspaceFileReferencePickerSections.tsx", import.meta.url),
  "utf8"
);

test("workspace file reference picker overflow badge exposes all selected names", () => {
  assert.match(source, /useId/);
  assert.match(source, /useState/);
  assert.match(
    source,
    /selectedRefs\s*\.\s*map\(\(ref\) =>\s*resolveWorkspaceFileReferenceLabel\(ref\)\)/
  );
  assert.match(source, /<Badge\s+asChild/);
  assert.match(
    source,
    /className=\{`\$\{workspaceFileReferencePickerSelectedBadgeClassName\} cursor-default`\}/
  );
  assert.match(source, /aria-describedby=\{selectedRefsTooltipId\}/);
  assert.match(
    source,
    /<button[\s\S]*>\s*\+{selectedRefs\.length - 2}\s*<\/button>/
  );
  assert.match(
    source,
    /onMouseEnter=\{\(\) => setSelectedRefsTooltipOpen\(true\)\}/
  );
  assert.match(
    source,
    /onMouseLeave=\{\(\) => setSelectedRefsTooltipOpen\(false\)\}/
  );
  assert.match(
    source,
    /onFocus=\{\(\) => setSelectedRefsTooltipOpen\(true\)\}/
  );
  assert.match(
    source,
    /onBlur=\{\(\) => setSelectedRefsTooltipOpen\(false\)\}/
  );
  assert.match(source, /role="tooltip"/);
  assert.match(source, /id=\{selectedRefsTooltipId\}/);
  assert.match(source, /aria-hidden=\{!selectedRefsTooltipOpen\}/);
  assert.match(source, /z-\[var\(--z-tooltip,100700\)\]/);
  assert.match(
    source,
    /opacity: selectedRefsTooltipOpen \? 1 : 0,[\s\S]*visibility: selectedRefsTooltipOpen \? "visible" : "hidden"/
  );
  assert.match(source, /<span[\s\S]*>\s*{selectedRefsLabel}\s*<\/span>/);
});
