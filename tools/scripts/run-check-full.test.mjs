import assert from "node:assert/strict";
import test from "node:test";
import { allocateFailureLineBudgets } from "./run-check-full.mjs";

test("allocateFailureLineBudgets shares one global limit fairly", () => {
  const budgets = allocateFailureLineBudgets([100, 100, 100], 12);

  assert.deepEqual(budgets, [4, 4, 4]);
  assert.equal(
    budgets.reduce((total, budget) => total + budget, 0),
    12
  );
});

test("allocateFailureLineBudgets redistributes unused lines", () => {
  const budgets = allocateFailureLineBudgets([2, 100, 100], 10);

  assert.deepEqual(budgets, [2, 4, 4]);
});

test("allocateFailureLineBudgets never exceeds available output", () => {
  const budgets = allocateFailureLineBudgets([2, 3, 0], 120);

  assert.deepEqual(budgets, [2, 3, 0]);
});
