import assert from "node:assert/strict";
import test from "node:test";
import {
  browserElementSnapshotFormat,
  browserElementSnapshotMaxHtmlChars,
  normalizeBrowserElementSelectionResult,
  serializeBrowserElementSnapshot
} from "./browserElementSnapshot.ts";

test("browser element snapshots bound content and redact secret-looking URL parameters", () => {
  const result = normalizeBrowserElementSelectionResult({
    status: "selected",
    snapshot: {
      capturedAt: "2026-07-15T00:00:00.000Z",
      page: {
        title: "Example",
        url: "https://example.com/page?token=secret&tab=main#private"
      },
      element: {
        attributes: {},
        bounds: { height: 10, width: 20, x: 1, y: 2 },
        classes: ["primary"],
        domPath: "#app > main.page > button.primary",
        html: "x".repeat(browserElementSnapshotMaxHtmlChars + 100),
        selector: "#submit",
        styles: {},
        tagName: "BUTTON",
        text: "Submit"
      },
      viewport: { height: 800, width: 1200 }
    }
  });

  assert.equal(result?.status, "selected");
  if (result?.status !== "selected") return;
  assert.equal(result.snapshot.format, browserElementSnapshotFormat);
  assert.equal(
    result.snapshot.element.html.length,
    browserElementSnapshotMaxHtmlChars
  );
  assert.equal(result.snapshot.element.tagName, "button");
  assert.equal(
    result.snapshot.page.url,
    "https://example.com/page?token=%5Bredacted%5D&tab=main"
  );
});

test("browser element snapshots serialize to Cursor's three-field text format", () => {
  const result = normalizeBrowserElementSelectionResult({
    status: "selected",
    snapshot: {
      page: { title: "Example", url: "https://example.com" },
      element: {
        bounds: { height: 40.125, width: 120.5, x: 8, y: -0 },
        domPath: "#app > div.page-wrapper-n1Pp9 > a.nav-link",
        html: '<a href="https://example.com">\n  Example home\n</a>',
        tagName: "a"
      }
    }
  });

  assert.equal(result?.status, "selected");
  if (result?.status !== "selected") return;
  assert.equal(
    serializeBrowserElementSnapshot(result.snapshot),
    [
      "DOM Path: #app > div.page-wrapper-n1Pp9 > a.nav-link",
      "Position: top=0px, left=8px, width=120.5px, height=40.13px",
      'HTML Element: <a href="https://example.com"> Example home </a>'
    ].join("\n")
  );
});

test("browser element snapshots reject selected results without identity", () => {
  assert.equal(
    normalizeBrowserElementSelectionResult({
      status: "selected",
      snapshot: { element: {}, page: {}, viewport: {} }
    }),
    null
  );
});
