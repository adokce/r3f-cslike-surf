import assert from "node:assert/strict";
import * as THREE from "three";
import {
  GRAVITY,
  PLAYER_RADIUS,
  createRampFromBox,
  stepSurfPhysics,
  type SurfState,
} from "../lib/surfPhysics";

const TEST_RAMP = createRampFromBox({
  size: new THREE.Vector3(180, 2.4, 720),
  position: new THREE.Vector3(0, 16, 0),
  rotation: new THREE.Euler(0, -0.2, 1.02),
});
const AIR_TEST_RAMP = createRampFromBox({
  size: new THREE.Vector3(180, 2.4, 720),
  position: new THREE.Vector3(10000, 10000, 10000),
  rotation: new THREE.Euler(0, -0.2, 1.02),
});

const makeState = (
  position: THREE.Vector3,
  velocity = new THREE.Vector3(),
): SurfState => ({
  position,
  velocity,
  isSurfing: false,
});

const horizontalSpeed = (vector: THREE.Vector3) =>
  Math.hypot(vector.x, vector.z);

const simulate = (
  state: SurfState,
  steps: number,
  runStep: (step: number) => { yaw: number; right: number },
  ramp = TEST_RAMP,
) => {
  for (let step = 0; step < steps; step += 1) {
    const input = runStep(step);
    stepSurfPhysics(
      state,
      {
        delta: 1 / 120,
        yaw: input.yaw,
        moveForward: 0,
        moveRight: input.right,
      },
      ramp,
    );
  }
};

(() => {
  const downhill = new THREE.Vector3(0, GRAVITY, 0)
    .projectOnPlane(TEST_RAMP.normal)
    .normalize();

  const state = makeState(
    TEST_RAMP.surfaceCenter
      .clone()
      .addScaledVector(TEST_RAMP.right, TEST_RAMP.halfWidth * 0.7)
      .addScaledVector(TEST_RAMP.forward, -TEST_RAMP.halfLength * 0.2)
      .addScaledVector(TEST_RAMP.normal, 14),
  );

  const startDownhillProjection = state.position.dot(downhill);
  let surfFrames = 0;
  let maxNormalSpeed = 0;
  let maxPlaneError = 0;

  for (let step = 0; step < 450; step += 1) {
    stepSurfPhysics(
      state,
      {
        delta: 1 / 120,
        yaw: 0,
        moveForward: 0,
        moveRight: 0,
      },
      TEST_RAMP,
    );

    if (state.isSurfing) {
      surfFrames += 1;
      const planeDistance = state.position
        .clone()
        .sub(TEST_RAMP.surfaceCenter)
        .dot(TEST_RAMP.normal);
      maxNormalSpeed = Math.max(
        maxNormalSpeed,
        Math.abs(state.velocity.dot(TEST_RAMP.normal)),
      );
      maxPlaneError = Math.max(
        maxPlaneError,
        Math.abs(planeDistance - PLAYER_RADIUS),
      );
    }
  }

  const endDownhillProjection = state.position.dot(downhill);
  assert.ok(
    surfFrames > 90,
    "player should stay surfing for many frames after landing",
  );
  assert.ok(
    endDownhillProjection - startDownhillProjection > 25,
    "gravity projected on the ramp should move the player downhill",
  );
  assert.ok(
    maxNormalSpeed < 1e-4,
    "surf velocity should remain tangent to the ramp plane",
  );
  assert.ok(
    maxPlaneError < 0.02,
    "player should remain snapped near surf contact distance",
  );
})();

(() => {
  const runAirStrafe = (turnRate: number, sideInput: number) => {
    const state = makeState(
      new THREE.Vector3(0, 120, 90),
      new THREE.Vector3(0, 0, -16),
    );
    let yaw = 0;
    simulate(
      state,
      220,
      () => {
        yaw += turnRate / 120;
        return {
          yaw,
          right: sideInput,
        };
      },
      AIR_TEST_RAMP,
    );

    assert.equal(
      state.isSurfing,
      false,
      "air-strafe scenario should stay airborne",
    );
    return horizontalSpeed(state.velocity);
  };

  const matchedTurnSpeed = runAirStrafe(1.8, 1);
  const oppositeTurnSpeed = runAirStrafe(-1.8, 1);
  const noTurnSpeed = runAirStrafe(0, 1);

  assert.ok(
    matchedTurnSpeed > noTurnSpeed + 5,
    "coordinated turn + strafe should gain noticeably more speed than strafing without turning",
  );
  assert.ok(
    matchedTurnSpeed > oppositeTurnSpeed + 2.5,
    "turning against the strafe direction should be substantially slower",
  );
})();

console.log("physics tests passed");
