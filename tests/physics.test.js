const assert = require("node:assert/strict");

const GRAVITY = -28;
const SURF_ACCEL = 38;
const AIR_ACCEL = 18;
const MAX_AIR_SPEED = 12;
const AIR_TURN_BOOST = 28;

const addScaled = (vec, other, scale) => {
  vec.x += other.x * scale;
  vec.y += other.y * scale;
  vec.z += other.z * scale;
};

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

const length = (v) => Math.hypot(v.x, v.y, v.z);

const normalize = (v) => {
  const len = length(v) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const simulateSurfStep = ({ velocity, normal, right, delta }) => {
  const gravity = { x: 0, y: GRAVITY, z: 0 };
  const gravityAlongPlane = {
    x: gravity.x - normal.x * dot(gravity, normal),
    y: gravity.y - normal.y * dot(gravity, normal),
    z: gravity.z - normal.z * dot(gravity, normal),
  };
  addScaled(velocity, gravityAlongPlane, delta);
  const surfSteer = {
    x: right.x * SURF_ACCEL,
    y: right.y * SURF_ACCEL,
    z: right.z * SURF_ACCEL,
  };
  const surfSteerProjected = {
    x: surfSteer.x - normal.x * dot(surfSteer, normal),
    y: surfSteer.y - normal.y * dot(surfSteer, normal),
    z: surfSteer.z - normal.z * dot(surfSteer, normal),
  };
  addScaled(velocity, surfSteerProjected, delta);
  const normalSpeed = dot(velocity, normal);
  addScaled(velocity, normal, -normalSpeed);
};

const simulateAirStrafeStep = ({ velocity, forward, right, delta, yawDelta }) => {
  const wishDirection = normalize({
    x: forward.x + right.x,
    y: forward.y + right.y,
    z: forward.z + right.z,
  });
  const currentSpeed = dot(velocity, wishDirection);
  const addSpeed = Math.max(MAX_AIR_SPEED - currentSpeed, 0);
  if (addSpeed > 0) {
    const accelSpeed = Math.min(AIR_ACCEL * MAX_AIR_SPEED * delta, addSpeed);
    addScaled(velocity, wishDirection, accelSpeed);
  }
  const turnBoost = Math.abs(yawDelta) * AIR_TURN_BOOST;
  addScaled(velocity, right, turnBoost);
};

const surfVelocity = { x: 0, y: 0, z: 0 };
const surfNormal = normalize({ x: 0, y: 1, z: 0.6 });
const surfRight = normalize({ x: 1, y: 0, z: 0 });
simulateSurfStep({ velocity: surfVelocity, normal: surfNormal, right: surfRight, delta: 0.016 });
assert.ok(length(surfVelocity) > 0.01, "surfing should add velocity along the plane");

const airVelocity = { x: 3, y: 0, z: 0 };
const forward = normalize({ x: 0, y: 0, z: -1 });
const right = normalize({ x: 1, y: 0, z: 0 });
const beforeSpeed = length(airVelocity);
simulateAirStrafeStep({ velocity: airVelocity, forward, right, delta: 0.016, yawDelta: 0.05 });
assert.ok(length(airVelocity) > beforeSpeed, "air-strafing should increase speed when turning");

console.log("physics tests passed");
