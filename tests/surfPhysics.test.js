import test from "node:test";
import assert from "node:assert/strict";

import { applyGroundClamp } from "../lib/surfPhysics.js";

test("applyGroundClamp clamps downward motion to the ground", () => {
  const result = applyGroundClamp(-5, -12, -5, 0.6);
  assert.equal(result.y, -4.4);
  assert.equal(result.velocityY, 0);
  assert.equal(result.grounded, true);
});

test("applyGroundClamp leaves airborne motion alone", () => {
  const result = applyGroundClamp(10, 3, -5, 0.6);
  assert.equal(result.y, 10);
  assert.equal(result.velocityY, 3);
  assert.equal(result.grounded, false);
});
