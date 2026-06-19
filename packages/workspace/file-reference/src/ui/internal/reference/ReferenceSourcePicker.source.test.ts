import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./ReferenceSourcePicker.tsx", import.meta.url),
  "utf8"
);

test("preview hierarchy exposes the complete path through a UI System tooltip", () => {
  assert.match(source, /Tooltip,\s*TooltipContent,\s*TooltipTrigger,/s);
  assert.match(
    source,
    /<TooltipTrigger asChild>\s*<div[\s\S]*className="flex flex-wrap items-center gap-y-1 text-\[12px\] leading-5"[\s\S]*<\/div>\s*<\/TooltipTrigger>/
  );
  assert.match(source, /<TooltipContent[\s\S]*>\s*{hierarchyTitle}/);
  assert.match(source, /backgroundColor:\s*"var\(--background-fronted\)"/);
  assert.match(source, /border:\s*"1px solid var\(--border-1\)"/);
});

test("sidebar groups collapse after five items and keep load more for remote pages", () => {
  assert.match(source, /const SIDEBAR_GROUP_PAGE_SIZE = 5;/);
  assert.match(
    source,
    /const visibleCount = Math\.max\(groups\.length,\s*limit\);/
  );
  assert.match(source, /<ChevronDownIcon[\s\S]*size=\{12\}/);
});

test("reference source picker overflow badge exposes all selected names", () => {
  assert.match(
    source,
    /selection\s*\.\s*map\(\(node\) => node\.displayName\)\s*\.\s*join\("\\n"\)/
  );
  assert.match(source, /<Badge\s+asChild/);
  assert.match(source, /className="shrink-0 cursor-default"/);
  assert.match(
    source,
    /<button[\s\S]*>\s*\+{selection\.length - 2}\s*<\/button>/
  );
  assert.match(source, /aria-describedby=\{selectionTooltipId\}/);
  assert.match(source, /aria-label=\{selectionTooltipLabel\}/);
  assert.match(source, /aria-hidden=\{!selectionTooltipOpen\}/);
  assert.match(
    source,
    /onMouseEnter=\{\(\) => setSelectionTooltipOpen\(true\)\}/
  );
  assert.match(
    source,
    /onMouseLeave=\{\(\) => setSelectionTooltipOpen\(false\)\}/
  );
  assert.match(source, /role="tooltip"/);
  assert.match(source, /z-\[var\(--z-tooltip,100700\)\]/);
  assert.match(
    source,
    /opacity: selectionTooltipOpen \? 1 : 0,[\s\S]*visibility: selectionTooltipOpen \? "visible" : "hidden"/
  );
  assert.match(source, /<span[\s\S]*>\s*{selectionTooltipLabel}\s*<\/span>/);
});

test("truncated picker labels expose full text through UI System tooltips", () => {
  assert.match(
    source,
    /function FullTextTooltip\(\{[\s\S]*<Tooltip delayDuration=\{300\}>[\s\S]*<TooltipTrigger asChild>\{children\}<\/TooltipTrigger>[\s\S]*<TooltipContent[\s\S]*>\s*\{content\}\s*<\/TooltipContent>/s
  );
  assert.match(
    source,
    /<FullTextTooltip content=\{group\.displayName\}>[\s\S]*data-autofit-label[\s\S]*\{group\.displayName\}[\s\S]*<\/FullTextTooltip>/
  );
  assert.match(
    source,
    /<FullTextTooltip content=\{node\.displayName\}>[\s\S]*text-\[13px\] font-medium[\s\S]*\{node\.displayName\}[\s\S]*<\/FullTextTooltip>/
  );
  assert.match(
    source,
    /<FullTextTooltip content=\{contextLabel\}>[\s\S]*text-\[11px\] text-\[var\(--text-secondary\)\][\s\S]*\{contextLabel\}[\s\S]*<\/FullTextTooltip>/
  );
  assert.match(
    source,
    /<FullTextTooltip content=\{node\.displayName\}>[\s\S]*<p className="truncate text-\[15px\] font-semibold">[\s\S]*<\/FullTextTooltip>/
  );
  assert.match(
    source,
    /<FullTextTooltip content=\{node\.displayName\}>[\s\S]*data-autofit-label[\s\S]*\{node\.displayName\}[\s\S]*<\/FullTextTooltip>/
  );
});
