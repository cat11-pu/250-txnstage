import assert from "node:assert";
import { canCommit, isSettledTx } from "../stage.js";
import { step, close } from "../txnrun.js";
import { render } from "../app.js";

const base = {
  state: { prepared: [], committed: [], aborted: [], log: [], applied: [] },
  events: [], budget: 1,
  not_prepared_error_code: "E_NOT_PREPARED", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("canCommit returns a flag", () => {
  assert.strictEqual(typeof canCommit(base.state, 1), "boolean");
});

check("isSettledTx returns a flag", () => {
  assert.strictEqual(typeof isSettledTx(base.state, 1), "boolean");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render exposes budget flag", () => {
  assert.strictEqual(typeof render(base).budget_pair_differs, "boolean");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
