const THREE = require("three");

const projectOnPlane = (vector, normal) =>
  vector.clone().sub(normal.clone().multiplyScalar(vector.dot(normal)));

const applySurfForces = ({
  velocity,
  normal,
  gravity,
  right,
  strafeInput,
  delta,
  surfAccel,
}) => {
  // Surfing: remove gravity's normal component so it accelerates down the slope.
  const gravityAlongPlane = projectOnPlane(gravity, normal);
  velocity.addScaledVector(gravityAlongPlane, delta);

  if (strafeInput !== 0) {
    // A/D steer along the ramp surface; project the force to keep it planar.
    const surfSteer = right.clone().multiplyScalar(surfAccel * strafeInput);
    const surfSteerProjected = projectOnPlane(surfSteer, normal);
    velocity.addScaledVector(surfSteerProjected, delta);
  }

  return velocity;
};

module.exports = {
  applySurfForces,
  projectOnPlane,
};
