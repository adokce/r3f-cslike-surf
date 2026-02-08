"use client";

import { PointerLockControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { applyGroundClamp } from "../lib/surfPhysics";

const PLAYER_RADIUS = 0.6;
const GRAVITY = -28;
const SURF_ACCEL = 38;
const AIR_ACCEL = 18;
const MAX_AIR_SPEED = 12;
const JUMP_SPEED = 8;
const AIR_TURN_BOOST = 28;
const TOUCH_LOOK_SENSITIVITY = 0.004;
const TOUCH_MOVE_RADIUS = 60;

const rampConfigs = [
  {
    size: new THREE.Vector3(34, 2, 26),
    position: new THREE.Vector3(-7, -2, 0),
    rotation: new THREE.Euler(-Math.PI / 5, 0, Math.PI / 7),
    color: "#2563eb",
  },
  {
    size: new THREE.Vector3(34, 2, 26),
    position: new THREE.Vector3(7, -2, 0),
    rotation: new THREE.Euler(-Math.PI / 5, 0, -Math.PI / 7),
    color: "#3b82f6",
  },
];

const groundConfig = {
  size: new THREE.Vector3(120, 2, 120),
  position: new THREE.Vector3(0, -6, 0),
};

const spawnPoint = new THREE.Vector3(0, 12, -12);

const clampMagnitude = (value: number, max: number) =>
  Math.max(-max, Math.min(max, value));

const useKeyMap = () => {
  const [keys, setKeys] = useState({
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    reset: false,
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
        reset: key === "r" ? pressed : prev.reset,
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

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const update = () =>
      setIsMobile(
        mediaQuery.matches ||
          /android|iphone|ipad|ipod/i.test(navigator.userAgent)
      );
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
};

const useTouchControls = () => {
  const [move, setMove] = useState({ x: 0, y: 0 });
  const [jump, setJump] = useState(false);
  const lookDelta = useRef({ x: 0, y: 0 });
  const resetRequested = useRef(false);
  const moveTouch = useRef<
    { id: number; origin: { x: number; y: number } } | undefined
  >(undefined);
  const lookTouch = useRef<
    { id: number; origin: { x: number; y: number } } | undefined
  >(undefined);

  const handleMoveStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    moveTouch.current = {
      id: touch.identifier,
      origin: { x: touch.clientX, y: touch.clientY },
    };
  };

  const handleMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!moveTouch.current) return;
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === moveTouch.current?.id
    );
    if (!touch) return;
    const dx = touch.clientX - moveTouch.current.origin.x;
    const dy = touch.clientY - moveTouch.current.origin.y;
    const clampedX = clampMagnitude(dx, TOUCH_MOVE_RADIUS);
    const clampedY = clampMagnitude(dy, TOUCH_MOVE_RADIUS);
    setMove({
      x: clampedX / TOUCH_MOVE_RADIUS,
      y: clampedY / TOUCH_MOVE_RADIUS,
    });
  };

  const handleMoveEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === moveTouch.current?.id
    );
    if (touch) {
      moveTouch.current = undefined;
      setMove({ x: 0, y: 0 });
    }
  };

  const handleLookStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    lookTouch.current = {
      id: touch.identifier,
      origin: { x: touch.clientX, y: touch.clientY },
    };
  };

  const handleLook = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!lookTouch.current) return;
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === lookTouch.current?.id
    );
    if (!touch) return;
    const dx = touch.clientX - lookTouch.current.origin.x;
    const dy = touch.clientY - lookTouch.current.origin.y;
    lookTouch.current.origin = { x: touch.clientX, y: touch.clientY };
    lookDelta.current = {
      x: lookDelta.current.x + dx,
      y: lookDelta.current.y + dy,
    };
  };

  const handleLookEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === lookTouch.current?.id
    );
    if (touch) {
      lookTouch.current = undefined;
    }
  };

  const consumeLookDelta = () => {
    const delta = { ...lookDelta.current };
    lookDelta.current = { x: 0, y: 0 };
    return delta;
  };

  const triggerReset = () => {
    resetRequested.current = true;
  };

  const consumeReset = () => {
    const shouldReset = resetRequested.current;
    resetRequested.current = false;
    return shouldReset;
  };

  return {
    move,
    jump,
    setJump,
    consumeLookDelta,
    triggerReset,
    consumeReset,
    handlers: {
      handleMoveStart,
      handleMove,
      handleMoveEnd,
      handleLookStart,
      handleLook,
      handleLookEnd,
    },
  };
};

const getPlaneInfo = (ramp: THREE.Mesh) => {
  // Top surface normal in world space (used to project gravity and velocity).
  const normal = new THREE.Vector3(0, 1, 0).applyEuler(ramp.rotation).normalize();
  // Any point on the plane works; the ramp's origin is centered.
  const planePoint = new THREE.Vector3().copy(ramp.position);
  return { normal, planePoint };
};

const PlayerController = ({
  rampRefs,
  onSpeedChange,
  isMobile,
  touchMove,
  touchJump,
  consumeLookDelta,
  consumeReset,
}: {
  rampRefs: React.RefObject<(THREE.Mesh | null)[]>;
  onSpeedChange: (speed: number) => void;
  isMobile: boolean;
  touchMove: { x: number; y: number };
  touchJump: boolean;
  consumeLookDelta: () => { x: number; y: number };
  consumeReset: () => boolean;
}) => {
  const { camera } = useThree();
  const keys = useKeyMap();
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const position = useRef(spawnPoint.clone());
  const previousYaw = useRef(0);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const jumpLock = useRef(false);
  const resetLock = useRef(false);

  const rampInverse = useMemo(() => new THREE.Matrix4(), []);
  const rampLocal = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const clampedDelta = clampMagnitude(delta, 0.05);
    if (isMobile) {
      const lookDelta = consumeLookDelta();
      yawRef.current -= lookDelta.x * TOUCH_LOOK_SENSITIVITY;
      pitchRef.current = clampMagnitude(
        pitchRef.current - lookDelta.y * TOUCH_LOOK_SENSITIVITY,
        1.45
      );
      camera.rotation.set(pitchRef.current, yawRef.current, 0);
    }
    const yaw = camera.rotation.y;
    const yawDelta = THREE.MathUtils.euclideanModulo(
      yaw - previousYaw.current + Math.PI,
      Math.PI * 2
    ) - Math.PI;
    previousYaw.current = yaw;

    const touchForward = -touchMove.y;
    const touchRight = touchMove.x;
    const forwardInput =
      (keys.w ? 1 : 0) + (keys.s ? -1 : 0) + touchForward;
    const rightInput = (keys.d ? 1 : 0) + (keys.a ? -1 : 0) + touchRight;

    const forward = new THREE.Vector3(0, 0, -1).applyEuler(
      new THREE.Euler(0, yaw, 0)
    );
    const right = new THREE.Vector3(1, 0, 0).applyEuler(
      new THREE.Euler(0, yaw, 0)
    );

    let isSurfing = false;
    let closestDistance = Number.POSITIVE_INFINITY;
    let activePlane: { normal: THREE.Vector3; planePoint: THREE.Vector3 } | null =
      null;

    if (rampRefs.current) {
      for (const [index, ramp] of rampRefs.current.entries()) {
        if (!ramp) continue;
        const planeInfo = getPlaneInfo(ramp);
        // Transform player into ramp-local space so we can do bounds checks.
        rampInverse.copy(ramp.matrixWorld).invert();
        rampLocal.copy(position.current).applyMatrix4(rampInverse);
        const rampConfig = rampConfigs[index];
        const half = rampConfig.size.clone().multiplyScalar(0.5);
        const withinX = Math.abs(rampLocal.x) <= half.x + PLAYER_RADIUS;
        const withinZ = Math.abs(rampLocal.z) <= half.z + PLAYER_RADIUS;
        const topSurface = half.y;
        const withinY =
          rampLocal.y <= topSurface + PLAYER_RADIUS &&
          rampLocal.y >= topSurface - PLAYER_RADIUS * 1.5;
        if (!withinX || !withinZ || !withinY) continue;
        const normal = planeInfo.normal;
        // Signed distance from the player to the ramp plane.
        const distance = new THREE.Vector3()
          .subVectors(position.current, planeInfo.planePoint)
          .dot(normal);
        if (distance < closestDistance && distance <= PLAYER_RADIUS * 1.4) {
          closestDistance = distance;
          const movingIntoRamp = velocity.current.dot(normal) <= 2;
          isSurfing = movingIntoRamp || distance <= PLAYER_RADIUS * 0.95;
          activePlane = planeInfo;
        }
      }
    }

    if (isSurfing && activePlane) {
      const correction = activePlane.normal
        .clone()
        .multiplyScalar(PLAYER_RADIUS - closestDistance);
      position.current.add(correction);
    }

    if (isSurfing && activePlane) {
      const normal = activePlane.normal;
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

      if ((keys.space || touchJump) && !jumpLock.current) {
        velocity.current.addScaledVector(normal, JUMP_SPEED);
        jumpLock.current = true;
        isSurfing = false;
      }
      if (!keys.space && !touchJump) {
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

    const groundTop = groundConfig.position.y + groundConfig.size.y * 0.5;
    const groundResult = applyGroundClamp(
      position.current.y,
      velocity.current.y,
      groundTop,
      PLAYER_RADIUS
    );
    position.current.y = groundResult.y;
    velocity.current.y = groundResult.velocityY;

    const touchReset = consumeReset();
    if ((keys.reset || touchReset) && !resetLock.current) {
      position.current.copy(spawnPoint);
      velocity.current.set(0, 0, 0);
      resetLock.current = true;
    }
    if (!keys.reset && !touchReset) {
      resetLock.current = false;
    }

    if (position.current.y < -25 || position.current.length() > 220) {
      position.current.copy(spawnPoint);
      velocity.current.set(0, 0, 0);
    }

    camera.position.copy(position.current);
    onSpeedChange(velocity.current.length());
  });

  return null;
};

const Ramp = ({
  onRef,
  config,
}: {
  onRef: (node: THREE.Mesh | null) => void;
  config: (typeof rampConfigs)[number];
}) => (
  <mesh
    ref={onRef}
    rotation={config.rotation}
    position={config.position}
    receiveShadow
  >
    <boxGeometry args={[config.size.x, config.size.y, config.size.z]} />
    <meshStandardMaterial color={config.color} />
  </mesh>
);

const Scene = ({
  onSpeedChange,
  isMobile,
  touchMove,
  touchJump,
  consumeLookDelta,
  consumeReset,
}: {
  onSpeedChange: (speed: number) => void;
  isMobile: boolean;
  touchMove: { x: number; y: number };
  touchJump: boolean;
  consumeLookDelta: () => { x: number; y: number };
  consumeReset: () => boolean;
}) => {
  const rampRefs = useRef<(THREE.Mesh | null)[]>([]);
  return (
    <>
      <color attach="background" args={["#05080d"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 12, 6]} intensity={0.9} />
      {rampConfigs.map((config, index) => (
        <Ramp
          key={`ramp-${config.position.x}`}
          onRef={(node) => {
            rampRefs.current[index] = node;
          }}
          config={config}
        />
      ))}
      <mesh position={groundConfig.position.toArray()} receiveShadow>
        <boxGeometry args={groundConfig.size.toArray()} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <PlayerController
        rampRefs={rampRefs}
        onSpeedChange={onSpeedChange}
        isMobile={isMobile}
        touchMove={touchMove}
        touchJump={touchJump}
        consumeLookDelta={consumeLookDelta}
        consumeReset={consumeReset}
      />
      {!isMobile && <PointerLockControls />}
    </>
  );
};

export default function Home() {
  const [speed, setSpeed] = useState(0);
  const isMobile = useIsMobile();
  const { move, jump, setJump, consumeLookDelta, triggerReset, consumeReset,
    handlers } = useTouchControls();

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <Canvas
        shadows
        camera={{ fov: 80, near: 0.1, far: 200, position: spawnPoint.toArray() }}
        onPointerDown={(event) => {
          if (!isMobile) {
            event.currentTarget.requestPointerLock();
          }
        }}
      >
        <Scene
          onSpeedChange={setSpeed}
          isMobile={isMobile}
          touchMove={move}
          touchJump={jump}
          consumeLookDelta={consumeLookDelta}
          consumeReset={consumeReset}
        />
      </Canvas>
      <div className="pointer-events-none absolute left-6 top-6 flex flex-col gap-2 rounded-lg bg-black/60 px-4 py-3 text-sm font-semibold uppercase tracking-wide">
        <span className="text-xs text-blue-200">Surf Velocity</span>
        <span className="text-2xl font-bold text-white">
          {speed.toFixed(1)} u/s
        </span>
        <span className="text-[11px] text-slate-300">
          WASD + mouse to air-strafe. Space to hop. Press R to reset.
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-slate-300">
        Click to lock mouse. On mobile, use the touch pads to surf.
      </div>
      {isMobile && (
        <>
          <div
            className="pointer-events-auto absolute bottom-8 left-6 h-32 w-32 rounded-full border border-white/30 bg-white/5"
            onTouchStart={handlers.handleMoveStart}
            onTouchMove={handlers.handleMove}
            onTouchEnd={handlers.handleMoveEnd}
            onTouchCancel={handlers.handleMoveEnd}
          >
            <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
          </div>
          <div
            className="pointer-events-auto absolute bottom-8 right-6 h-32 w-32 rounded-full border border-white/30 bg-white/5"
            onTouchStart={handlers.handleLookStart}
            onTouchMove={handlers.handleLook}
            onTouchEnd={handlers.handleLookEnd}
            onTouchCancel={handlers.handleLookEnd}
          >
            <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
          </div>
          <button
            type="button"
            className="pointer-events-auto absolute bottom-10 right-44 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide"
            onTouchStart={() => setJump(true)}
            onTouchEnd={() => setJump(false)}
            onTouchCancel={() => setJump(false)}
          >
            Jump
          </button>
          <button
            type="button"
            className="pointer-events-auto absolute bottom-24 right-44 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-xs uppercase tracking-wide"
            onClick={triggerReset}
          >
            Reset
          </button>
        </>
      )}
    </div>
  );
}
