import test from "node:test";
import assert from "node:assert/strict";
import { shouldCreateFollowup } from "../src/followup-policy.mjs";

test("creates a follow-up only when a concrete action and date were both chosen", () => {
  assert.equal(shouldCreateFollowup({ nextAction: "Enviar cotización", nextDate: "2026-09-12" }), true);
  assert.equal(shouldCreateFollowup({ nextAction: "Enviar cotización", nextDate: "" }), false);
  assert.equal(shouldCreateFollowup({ nextAction: "", nextDate: "2026-09-12" }), false);
});

test("does not create generic work from an empty classification", () => {
  assert.equal(shouldCreateFollowup(), false);
  assert.equal(shouldCreateFollowup({ nextAction: "   ", nextDate: "2026-09-12" }), false);
});
