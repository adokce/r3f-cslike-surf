const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const THREE = require("three");
const { applySurfForces } = require("../lib/surfPhysics");

describe("applySurfForces", () => {
  it("projects gravity along the ramp plane", () => {
    const velocity = new THREE.Vector3();
    const normal = new THREE.Vector3(0, 1, 0).applyAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -Math.PI / 4
    );
    const gravity = new THREE.Vector3(0, -28, 0);
    const right = new THREE.Vector3(1, 0, 0);

    applySurfForces({
      velocity,
      normal,
      gravity,
      right,
      strafeInput: 0,
      delta: 1,
      surfAccel: 0,
    });

    assert.ok(Math.abs(velocity.dot(normal)) < 1e-4);
    assert.ok(velocity.length() > 0);
  });

  it("adds lateral acceleration when strafing", () => {
    const velocity = new THREE.Vector3();
    const normal = new THREE.Vector3(0, 1, 0).applyAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 6
    );
    const gravity = new THREE.Vector3(0, -28, 0);
    const right = new THREE.Vector3(1, 0, 0);

    applySurfForces({
      velocity,
      normal,
      gravity,
      right,
      strafeInput: 1,
      delta: 0.5,
      surfAccel: 30,
    });

    assert.ok(velocity.dot(right) > 0);
  });
});
