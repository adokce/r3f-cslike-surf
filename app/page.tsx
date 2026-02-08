"use client";

import { PointerLockControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const PLAYER_RADIUS = 0.6;
const GRAVITY = -28;
const SURF_ACCEL = 38;
const AIR_ACCEL = 18;
const MAX_AIR_SPEED = 12;
const JUMP_SPEED = 8;
const AIR_TURN_BOOST = 28;

const rampConfig = {
  size: new THREE.Vector3(34, 2, 22),
  position: new THREE.Vector3(0, -2, 0),
  rotation: new THREE.Euler(-Math.PI / 5, 0, 0),
};

const spawnPoint = new THREE.Vector3(0, 10, -8);

const clampMagnitude = (value: number, max: number) =>
  Math.max(-max, Math.min(max, value));

const useKeyMap = () => {
  const [keys, setKeys] = useState({
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent, pressed: boolean) => {
      const key = event.key.toLowerCase();
      setKeys((prev) => ({
        ...prev,
        w: key === "w" ? pressed : prev.w,
        a: key === "a" ? pressed : prev.a,
        s: key === "s" ? pressed : prev.s,
        d: key === "d" ? pressed : prev.d,
        space: key === " " ? pressed : prev.space,
      }));
    };

    const onKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => handleKey(event, false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return keys;
};

const getPlaneInfo = (rampRef: React.RefObject<THREE.Mesh | null>) => {
  if (!rampRef.current) {
    return null;
  }

  const ramp = rampRef.current;
  // Top surface normal in world space (used to project gravity and velocity).
  const normal = new THREE.Vector3(0, 1, 0).applyEuler(ramp.rotation).normalize();
  // Any point on the plane works; the ramp's origin is centered.
  const planePoint = new THREE.Vector3().copy(ramp.position);
  return { normal, planePoint };
};

const PlayerController = ({
  rampRef,
  onSpeedChange,
}: {
  rampRef: React.RefObject<THREE.Mesh | null>;
  onSpeedChange: (speed: number) => void;
}) => {
  const { camera } = useThree();
  const keys = useKeyMap();
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const position = useRef(spawnPoint.clone());
  const previousYaw = useRef(0);
  const jumpLock = useRef(false);

  const rampInverse = useMemo(() => new THREE.Matrix4(), []);
  const rampLocal = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const clampedDelta = clampMagnitude(delta, 0.05);
    const yaw = camera.rotation.y;
    const yawDelta = THREE.MathUtils.euclideanModulo(
      yaw - previousYaw.current + Math.PI,
      Math.PI * 2
    ) - Math.PI;
    previousYaw.current = yaw;

    const forwardInput = (keys.w ? 1 : 0) + (keys.s ? -1 : 0);
    const rightInput = (keys.d ? 1 : 0) + (keys.a ? -1 : 0);

    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(0, yaw, 0)
    );
    const right = new THREE.Vector3(1, 0, 0).applyEuler(
      new THREE.Euler(0, yaw, 0)
    );

    const planeInfo = getPlaneInfo(rampRef);
    let isSurfing = false;

    if (rampRef.current && planeInfo) {
      // Transform player into ramp-local space so we can do bounds checks.
      rampInverse.copy(rampRef.current.matrixWorld).invert();
      rampLocal.copy(position.current).applyMatrix4(rampInverse);
      const half = rampConfig.size.clone().multiplyScalar(0.5);
      const withinX = Math.abs(rampLocal.x) <= half.x + PLAYER_RADIUS;
      const withinZ = Math.abs(rampLocal.z) <= half.z + PLAYER_RADIUS;
      const topSurface = half.y;
      const withinY =
        rampLocal.y <= topSurface + PLAYER_RADIUS &&
        rampLocal.y >= topSurface - PLAYER_RADIUS * 1.5;
      if (withinX && withinZ && withinY) {
        const normal = planeInfo.normal;
        // Signed distance from the player to the ramp plane.
        const distance = new THREE.Vector3()
          .subVectors(position.current, planeInfo.planePoint)
          .dot(normal);
        if (distance <= PLAYER_RADIUS * 1.2) {
          // If we're close and moving into the ramp, we "stick" to it.
          isSurfing = velocity.current.dot(normal) <= 8;
          if (isSurfing) {
            const correction = normal
              .clone()
              .multiplyScalar(PLAYER_RADIUS - distance);
            position.current.add(correction);
          }
        }
      }
    }

    if (isSurfing && planeInfo) {
      const normal = planeInfo.normal;
      const gravity = new THREE.Vector3(0, GRAVITY, 0);
      // Surfing: remove gravity's normal component so it accelerates down the slope.
      const gravityAlongPlane = gravity
        .clone()
        .sub(normal.clone().multiplyScalar(gravity.dot(normal)));
      velocity.current.addScaledVector(gravityAlongPlane, clampedDelta);

      const strafeInput = rightInput;
      if (strafeInput !== 0) {
        // A/D steer along the ramp surface; project the force to keep it planar.
        const surfSteer = right.clone().multiplyScalar(SURF_ACCEL * strafeInput);
        const surfSteerProjected = surfSteer
          .sub(normal.clone().multiplyScalar(surfSteer.dot(normal)));
        velocity.current.addScaledVector(surfSteerProjected, clampedDelta);
      }

      // Kill any upward component so we don't bounce off the ramp.
      const normalSpeed = velocity.current.dot(normal);
      if (normalSpeed > 0) {
        velocity.current.addScaledVector(normal, -normalSpeed);
      }

      if (keys.space && !jumpLock.current) {
        velocity.current.addScaledVector(normal, JUMP_SPEED);
        jumpLock.current = true;
        isSurfing = false;
      }
      if (!keys.space) {
        jumpLock.current = false;
      }
    } else {
      const gravity = new THREE.Vector3(0, GRAVITY, 0);
      velocity.current.addScaledVector(gravity, clampedDelta);

      const wishDirection = new THREE.Vector3();
      if (forwardInput !== 0) {
        wishDirection.addScaledVector(forward, forwardInput);
      }
      if (rightInput !== 0) {
        wishDirection.addScaledVector(right, rightInput);
      }
      if (wishDirection.lengthSq() > 0) {
        wishDirection.normalize();
        // Quake-style air acceleration: push velocity toward desired direction.
        const currentSpeed = velocity.current.dot(wishDirection);
        const addSpeed = Math.max(MAX_AIR_SPEED - currentSpeed, 0);
        if (addSpeed > 0) {
          const accelSpeed = Math.min(
            AIR_ACCEL * MAX_AIR_SPEED * clampedDelta,
            addSpeed
          );
          velocity.current.addScaledVector(wishDirection, accelSpeed);
        }
      }

      const strafeSign = Math.sign(rightInput);
      const turnSign = Math.sign(yawDelta);
      if (strafeSign !== 0 && forwardInput > 0 && turnSign === strafeSign) {
        // Air-strafing boost: yawing into the strafe adds speed (curved trajectory).
        const turnBoost = Math.abs(yawDelta) * AIR_TURN_BOOST;
        velocity.current.addScaledVector(right, turnBoost);
      }
    }

    position.current.addScaledVector(velocity.current, clampedDelta);

    if (position.current.y < -25) {
      position.current.copy(spawnPoint);
      velocity.current.set(0, 0, 0);
    }

    camera.position.copy(position.current);
    onSpeedChange(velocity.current.length());
  });

  return null;
};

const Ramp = ({
  rampRef,
}: {
  rampRef: React.RefObject<THREE.Mesh | null>;
}) => (
  <mesh
    ref={rampRef}
    rotation={rampConfig.rotation}
    position={rampConfig.position}
    receiveShadow
  >
    <boxGeometry
      args={[rampConfig.size.x, rampConfig.size.y, rampConfig.size.z]}
    />
    <meshStandardMaterial color="#2b6cb0" />
  </mesh>
);

const Scene = ({ onSpeedChange }: { onSpeedChange: (speed: number) => void }) => {
  const rampRef = useRef<THREE.Mesh>(null);
  return (
    <>
      <color attach="background" args={["#05080d"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 12, 6]} intensity={0.9} />
      <Ramp rampRef={rampRef} />
      <mesh position={[0, -6, 0]} receiveShadow>
        <boxGeometry args={[120, 2, 120]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <PlayerController rampRef={rampRef} onSpeedChange={onSpeedChange} />
      <PointerLockControls />
    </>
  );
};

export default function Home() {
  const [speed, setSpeed] = useState(0);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <Canvas
        shadows
        camera={{ fov: 80, near: 0.1, far: 200, position: spawnPoint.toArray() }}
        onPointerDown={(event) => event.currentTarget.requestPointerLock()}
      >
        <Scene onSpeedChange={setSpeed} />
      </Canvas>
      <div className="pointer-events-none absolute left-6 top-6 flex flex-col gap-2 rounded-lg bg-black/60 px-4 py-3 text-sm font-semibold uppercase tracking-wide">
        <span className="text-xs text-blue-200">Surf Velocity</span>
        <span className="text-2xl font-bold text-white">
          {speed.toFixed(1)} u/s
        </span>
        <span className="text-[11px] text-slate-300">
          WASD + mouse to air-strafe. Space to hop.
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate-300">
        Click to lock mouse. Drop onto the wave and carve across the slope.
      </div>
    </div>
  );
}
