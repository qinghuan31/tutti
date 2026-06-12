import assert from "node:assert/strict";
import test from "node:test";

import { installWorkspaceAppLinkInterception } from "./workspaceAppLinks.ts";

test("workspace app link interception forwards _blank opens through workspace app IPC", () => {
  const originalElement = globalThis.Element;
  const originalHTMLAnchorElement = globalThis.HTMLAnchorElement;
  class FakeElement {
    parentElement: FakeElement | null = null;

    closest(): FakeElement | null {
      return null;
    }
  }
  class FakeAnchorElement extends FakeElement {
    href = "https://example.com/product";
    private readonly attrs = new Map<string, string>([["target", "_blank"]]);

    getAttribute(name: string): string | null {
      return this.attrs.get(name) ?? null;
    }

    hasAttribute(name: string): boolean {
      return this.attrs.has(name);
    }
  }

  Object.assign(globalThis, {
    Element: FakeElement,
    HTMLAnchorElement: FakeAnchorElement
  });

  const listeners: EventListener[] = [];
  const fakeWindow = {
    document: { readyState: "complete" },
    location: { href: "https://app.local" },
    addEventListener(type: string, listener: EventListener) {
      if (type === "click") {
        listeners.push(listener);
      }
    },
    removeEventListener(type: string, listener: EventListener) {
      if (type !== "click") {
        return;
      }
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }
  } as unknown as Window;
  const sent: Array<{ channel: string; payload: unknown }> = [];

  try {
    const dispose = installWorkspaceAppLinkInterception({
      scope: fakeWindow,
      send(channel, payload) {
        sent.push({ channel, payload });
      }
    });

    assert.equal(listeners.length, 1);

    const anchor = new FakeAnchorElement();
    const event = {
      altKey: false,
      button: 0,
      composedPath: () => [anchor],
      ctrlKey: false,
      defaultPrevented: false,
      metaKey: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      shiftKey: false,
      stopImmediatePropagation() {
        this.stoppedImmediate = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      stopped: false,
      stoppedImmediate: false,
      target: anchor
    };

    listeners[0]?.(event as unknown as MouseEvent);

    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    assert.equal(event.stoppedImmediate, true);
    assert.deepEqual(sent, [
      {
        channel: "workspace-app:open-url",
        payload: { url: "https://example.com/product" }
      }
    ]);

    dispose();

    assert.equal(listeners.length, 0);
  } finally {
    Object.assign(globalThis, {
      Element: originalElement,
      HTMLAnchorElement: originalHTMLAnchorElement
    });
  }
});

test("workspace app window.open forwards external URLs through workspace app IPC", () => {
  const fakeWindow = createFakeWorkspaceAppWindow();
  const sent: Array<{ channel: string; payload: unknown }> = [];

  installWorkspaceAppLinkInterception({
    scope: fakeWindow,
    send(channel, payload) {
      sent.push({ channel, payload });
    }
  });

  fakeWindow.open(
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
    "_blank"
  );

  assert.deepEqual(sent, [
    {
      channel: "workspace-app:open-url",
      payload: {
        url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=test"
      }
    }
  ]);
});

test("workspace app window.open forwards deferred popup navigation target", () => {
  const fakeWindow = createFakeWorkspaceAppWindow();
  const sent: Array<{ channel: string; payload: unknown }> = [];

  installWorkspaceAppLinkInterception({
    scope: fakeWindow,
    send(channel, payload) {
      sent.push({ channel, payload });
    }
  });

  const popup = fakeWindow.open("/loading-preview", "_blank");

  assert.deepEqual(sent, []);

  if (!popup) {
    throw new Error("expected window.open to return a popup proxy");
  }
  popup.location.href = "/canvas?id=project-1";

  assert.deepEqual(sent, [
    {
      channel: "workspace-app:open-url",
      payload: { url: "https://app.local/canvas?id=project-1" }
    }
  ]);
});

function createFakeWorkspaceAppWindow(): Window {
  const listeners: EventListener[] = [];
  return {
    document: { readyState: "complete" },
    location: { href: "https://app.local/projects" },
    addEventListener(type: string, listener: EventListener) {
      if (type === "click") {
        listeners.push(listener);
      }
    },
    removeEventListener(type: string, listener: EventListener) {
      if (type !== "click") {
        return;
      }
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
    open() {
      return null;
    }
  } as unknown as Window;
}
