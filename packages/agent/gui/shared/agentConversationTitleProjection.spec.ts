import { describe, expect, it } from "vitest";
import {
  resolveAgentGUIConversationBrowserFreeTitle,
  resolveAgentGUIConversationTitleDisplayPrompt,
  resolveAgentGUIConversationTitleLeadingMentionKind
} from "./agentConversationTitleProjection";

describe("resolveAgentGUIConversationTitleLeadingMentionKind", () => {
  it("keeps session references textual while mapping task references to rail markers", () => {
    expect(
      resolveAgentGUIConversationTitleLeadingMentionKind(
        "[@Conversation](mention://agent-session/session-1?workspaceId=workspace-1) follow up"
      )
    ).toBeNull();
    expect(
      resolveAgentGUIConversationTitleLeadingMentionKind(
        "[@Task](mention://workspace-issue/issue-1?workspaceId=workspace-1) inspect"
      )
    ).toBe("task");
  });

  it("keeps app and Agent references textual while mapping files to rail markers", () => {
    expect(
      resolveAgentGUIConversationTitleLeadingMentionKind(
        "[@Weather](mention://workspace-app/weather?workspaceId=workspace-1) inspect"
      )
    ).toBeNull();
    expect(
      resolveAgentGUIConversationTitleLeadingMentionKind(
        "[@notes.md](/workspace/notes.md) inspect"
      )
    ).toBe("file");
    expect(
      resolveAgentGUIConversationTitleLeadingMentionKind(
        "[@Codex](mention://agent-target/local%3Acodex?workspaceId=workspace-1) inspect"
      )
    ).toBeNull();
  });

  it("keeps session, app, and Agent references out of rich titles", () => {
    for (const { displayPrompt, title } of [
      {
        displayPrompt:
          "[@Conversation](mention://agent-session/session-1?workspaceId=workspace-1) follow up",
        title: "@Conversation follow up"
      },
      {
        displayPrompt:
          "[@Weather](mention://workspace-app/weather?workspaceId=workspace-1) inspect",
        title: "@Weather inspect"
      },
      {
        displayPrompt:
          "[@Codex](mention://agent-target/local%3Acodex?workspaceId=workspace-1) inspect",
        title: "@Codex inspect"
      }
    ]) {
      expect(
        resolveAgentGUIConversationTitleDisplayPrompt({
          firstUserDisplayPrompt: displayPrompt,
          title
        })
      ).toBeNull();
    }
  });

  it("keeps browser elements in the rich header title without adding a rail marker", () => {
    const displayPrompt =
      "[@<a>](mention://browser-element/element-1?workspaceId=workspace-1&tag=a) inspect";
    expect(
      resolveAgentGUIConversationTitleLeadingMentionKind(displayPrompt)
    ).toBeNull();
    expect(
      resolveAgentGUIConversationTitleDisplayPrompt({
        firstUserDisplayPrompt: displayPrompt,
        title: "@<a> inspect"
      })
    ).toBe(displayPrompt);
  });
});

describe("resolveAgentGUIConversationBrowserFreeTitle", () => {
  const browserPrompt =
    "[@<div>](mention://browser-element/element-1?workspaceId=workspace-1&tag=div) 这里说的什么";

  it("removes browser elements and keeps only the conversation text", () => {
    expect(
      resolveAgentGUIConversationBrowserFreeTitle({
        firstUserDisplayPrompt: browserPrompt,
        title: "@<div> 这里说的什么"
      })
    ).toBe("这里说的什么");
  });

  it("returns an empty presentation title when the prompt contains only browser elements", () => {
    const prompt =
      "[@<div>](mention://browser-element/element-1?workspaceId=workspace-1&tag=div)";

    expect(
      resolveAgentGUIConversationBrowserFreeTitle({
        firstUserDisplayPrompt: prompt,
        title: "@<div>"
      })
    ).toBe("");
  });

  it("preserves an explicitly renamed title", () => {
    expect(
      resolveAgentGUIConversationBrowserFreeTitle({
        firstUserDisplayPrompt: browserPrompt,
        title: "Google 登录链接"
      })
    ).toBe("Google 登录链接");
  });

  it("does not change supported mention-derived titles", () => {
    const prompt =
      "[@Task](mention://workspace-issue/issue-1?workspaceId=workspace-1) 看看";

    expect(
      resolveAgentGUIConversationBrowserFreeTitle({
        firstUserDisplayPrompt: prompt,
        title: "@Task 看看"
      })
    ).toBe("@Task 看看");
  });
});
