import assert from "node:assert/strict";
import test from "node:test";
import { parseRichTextMentionHref } from "@tutti-os/ui-rich-text/core";
import {
  browserElementMentionLabel,
  createBrowserElementMentionMarkdown,
  presentBrowserElementMention
} from "./browserElementMention.ts";

test("browser element mentions preserve prompt text and show only the DOM tag", () => {
  const context = [
    "DOM Path: #app > div",
    "Position: top=0px",
    "HTML Element: <div>Hello</div>"
  ].join("\n");
  const markdown = createBrowserElementMentionMarkdown({
    context,
    id: "browser-element:1",
    tagName: "A",
    workspaceId: "workspace-1"
  });
  const href = markdown.slice(markdown.indexOf("(") + 1, -1);
  const mention = parseRichTextMentionHref(href);

  assert.match(markdown, /^\[@a\]\(/u);
  assert.equal(browserElementMentionLabel(mention?.scope?.tag ?? ""), "<a>");
  assert.equal(mention?.providerId, "browser-element");
  assert.equal(mention?.scope?.context, context);
  assert.equal(mention?.scope?.workspaceId, "workspace-1");
});

test("browser element mentions reject incomplete references", () => {
  assert.equal(
    createBrowserElementMentionMarkdown({
      context: "",
      id: "browser-element:1",
      tagName: "div",
      workspaceId: "workspace-1"
    }),
    ""
  );
});

test("historical browser element mentions remain presentable without inline context", () => {
  assert.deepEqual(
    presentBrowserElementMention({
      label: "a",
      scope: { tag: "a", workspaceId: "workspace-1" }
    }),
    { name: "<a>", workspaceId: "workspace-1" }
  );
});
