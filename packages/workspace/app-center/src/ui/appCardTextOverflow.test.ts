import assert from "node:assert/strict";
import test from "node:test";
import { isTextOverflowing } from "./appCardTextOverflow.ts";

test("detects horizontal and vertical text overflow", () => {
  assert.equal(
    isTextOverflowing({
      clientHeight: 20,
      clientWidth: 100,
      scrollHeight: 20,
      scrollWidth: 102
    }),
    true
  );
  assert.equal(
    isTextOverflowing({
      clientHeight: 40,
      clientWidth: 100,
      scrollHeight: 42,
      scrollWidth: 100
    }),
    true
  );
});

test("ignores sub-pixel measurement noise", () => {
  assert.equal(
    isTextOverflowing({
      clientHeight: 20,
      clientWidth: 100,
      scrollHeight: 20.5,
      scrollWidth: 100.5
    }),
    false
  );
});
