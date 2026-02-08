import * as THREE from "three";

export const PLAYER_RADIUS = 0.45;
export const GRAVITY = -30;
export const MAX_STEP_DELTA = 1 / 20;

export const AIR_ACCEL = 11;
export const AIR_WISH_SPEED = 30;

export const SURF_ACCEL = 9;
export const SURF_WISH_SPEED = 30;

const SURF_DETACH_SPEED = 2;

export type SurfRamp = {
  surfaceCenter: THREE.Vector3;
  normal: THREE.Vector3;
  right: THREE.Vector3;
  forward: THREE.Vector3;
  halfWidth: number;
  halfLength: number;
};

export type SurfState = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isSurfing: boolean;
};

export type SurfStepInput = {
  delta: number;
  yaw: number;
  moveForward: number;
  moveRight: number;
};

export type RampBoxConfig = {
  size: THREE.Vector3;
  position: THREE.Vector3;
  rotation: THREE.Euler;
};

const clampInput = (value: number) => Math.max(-1, Math.min(1, value));

const projectOnPlane = (
  source: THREE.Vector3,
  normal: THREE.Vector3,
  out: THREE.Vector3,
) => {
  out.copy(source);
  out.addScaledVector(normal, -source.dot(normal));
  return out;
};

export const accelerate = (
  velocity: THREE.Vector3,
  wishDirection: THREE.Vector3,
  wishSpeed: number,
  acceleration: number,
  delta: number,
) => {
  const currentSpeed = velocity.dot(wishDirection);
  const addSpeed = wishSpeed - currentSpeed;
  if (addSpeed <= 0) {
    return;
  }
  const accelSpeed = Math.min(acceleration * wishSpeed * delta, addSpeed);
  velocity.addScaledVector(wishDirection, accelSpeed);
};

const detectSurfContact = (
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  ramp: SurfRamp,
  playerRadius: number,
  wasSurfing: boolean,
) => {
  const relative = position.clone().sub(ramp.surfaceCenter);
  const sideDistance = relative.dot(ramp.right);
  const forwardDistance = relative.dot(ramp.forward);
  if (Math.abs(sideDistance) > ramp.halfWidth + playerRadius) {
    return null;
  }
  if (Math.abs(forwardDistance) > ramp.halfLength + playerRadius) {
    return null;
  }

  const planeDistance = relative.dot(ramp.normal);
  const maxSeparation = wasSurfing ? playerRadius * 2 : playerRadius * 1.35;
  if (planeDistance > maxSeparation || planeDistance < -playerRadius * 2.6) {
    return null;
  }

  const detachSpeed = wasSurfing ? SURF_DETACH_SPEED * 2.4 : SURF_DETACH_SPEED;
  const movingAwayFromRamp = velocity.dot(ramp.normal) > detachSpeed;
  const detachDistance = wasSurfing ? playerRadius * 1.5 : playerRadius * 0.95;
  if (movingAwayFromRamp && planeDistance > detachDistance) {
    return null;
  }

  return { planeDistance };
};

const getViewBasis = (yaw: number) => {
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  return { forward, right };
};

const buildWishDirection = (
  viewForward: THREE.Vector3,
  viewRight: THREE.Vector3,
  moveForward: number,
  moveRight: number,
  out: THREE.Vector3,
) => {
  out.set(0, 0, 0);
  if (moveForward !== 0) {
    out.addScaledVector(viewForward, moveForward);
  }
  if (moveRight !== 0) {
    out.addScaledVector(viewRight, moveRight);
  }
  if (out.lengthSq() > 0) {
    out.normalize();
  }
  return out;
};

export const stepSurfPhysics = (
  state: SurfState,
  input: SurfStepInput,
  ramp: SurfRamp,
  playerRadius = PLAYER_RADIUS,
) => {
  const delta = Math.min(input.delta, MAX_STEP_DELTA);
  if (delta <= 0) {
    return;
  }

  const moveForward = clampInput(input.moveForward);
  const moveRight = clampInput(input.moveRight);

  const { forward: viewForward, right: viewRight } = getViewBasis(input.yaw);
  const wishDirection = new THREE.Vector3();
  const projectedWishDirection = new THREE.Vector3();
  const gravity = new THREE.Vector3(0, GRAVITY, 0);

  const contact = detectSurfContact(
    state.position,
    state.velocity,
    ramp,
    playerRadius,
    state.isSurfing,
  );

  if (contact) {
    state.isSurfing = true;

    state.position.addScaledVector(
      ramp.normal,
      playerRadius - contact.planeDistance,
    );

    projectOnPlane(gravity, ramp.normal, projectedWishDirection);
    state.velocity.addScaledVector(projectedWishDirection, delta);

    buildWishDirection(
      viewForward,
      viewRight,
      moveForward,
      moveRight,
      wishDirection,
    );

    if (wishDirection.lengthSq() > 0) {
      projectOnPlane(wishDirection, ramp.normal, projectedWishDirection);
      if (projectedWishDirection.lengthSq() > 0) {
        projectedWishDirection.normalize();
        accelerate(
          state.velocity,
          projectedWishDirection,
          SURF_WISH_SPEED,
          SURF_ACCEL,
          delta,
        );
      }
    }

    state.velocity.addScaledVector(
      ramp.normal,
      -state.velocity.dot(ramp.normal),
    );
  } else {
    state.isSurfing = false;
    state.velocity.y += GRAVITY * delta;

    buildWishDirection(
      viewForward,
      viewRight,
      moveForward,
      moveRight,
      wishDirection,
    );

    if (wishDirection.lengthSq() > 0) {
      accelerate(
        state.velocity,
        wishDirection,
        AIR_WISH_SPEED,
        AIR_ACCEL,
        delta,
      );
    }
  }

  state.position.addScaledVector(state.velocity, delta);
};

export const createRampFromBox = ({
  size,
  position,
  rotation,
}: RampBoxConfig): SurfRamp => {
  const normal = new THREE.Vector3(0, 1, 0).applyEuler(rotation).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyEuler(rotation).normalize();
  const forward = new THREE.Vector3(0, 0, 1).applyEuler(rotation).normalize();
  const surfaceCenter = position.clone().addScaledVector(normal, size.y * 0.5);

  return {
    surfaceCenter,
    normal,
    right,
    forward,
    halfWidth: size.x * 0.5,
    halfLength: size.z * 0.5,
  };
};
