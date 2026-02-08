"use client";

import { PointerLockControls, Sky } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createRampFromBox,
  GRAVITY,
  stepSurfPhysics,
  type SurfState,
} from "@/lib/surfPhysics";

const WAVE_CONFIG = {
  size: new THREE.Vector3(180, 2.4, 720),
  position: new THREE.Vector3(0, 16, 0),
  rotation: new THREE.Euler(0, -0.2, 1.02),
};

const WAVE_RAMP = createRampFromBox(WAVE_CONFIG);
const DOWNHILL_DIRECTION = new THREE.Vector3(0, GRAVITY, 0)
  .addScaledVector(
    WAVE_RAMP.normal,
    -new THREE.Vector3(0, GRAVITY, 0).dot(WAVE_RAMP.normal),
  )
  .normalize();

const SLOPE_DOWN = DOWNHILL_DIRECTION.clone();
const SLOPE_ACROSS = new THREE.Vector3()
  .crossVectors(WAVE_RAMP.normal, SLOPE_DOWN)
  .normalize();

const SLOPE_SPAN =
  Math.abs(SLOPE_DOWN.dot(WAVE_RAMP.right)) * WAVE_RAMP.halfWidth +
  Math.abs(SLOPE_DOWN.dot(WAVE_RAMP.forward)) * WAVE_RAMP.halfLength;

const ACROSS_SPAN =
  Math.abs(SLOPE_ACROSS.dot(WAVE_RAMP.right)) * WAVE_RAMP.halfWidth +
  Math.abs(SLOPE_ACROSS.dot(WAVE_RAMP.forward)) * WAVE_RAMP.halfLength;

const surfacePoint = (
  downhillFactor: number,
  acrossFactor: number,
  normalLift = 0.2,
) =>
  WAVE_RAMP.surfaceCenter
    .clone()
    .addScaledVector(SLOPE_DOWN, SLOPE_SPAN * downhillFactor)
    .addScaledVector(SLOPE_ACROSS, ACROSS_SPAN * acrossFactor)
    .addScaledVector(WAVE_RAMP.normal, normalLift);

const SPAWN_POINT = surfacePoint(-0.96, 0.52, 62);

const UPHILL_BEACON = surfacePoint(-0.87, 0, 1.3);
const DOWNHILL_BEACON = surfacePoint(0.87, 0, 1.3);

const UPHILL_RGB = { r: 245, g: 158, b: 11 };
const DOWNHILL_RGB = { r: 34, g: 211, b: 238 };
const toHexChannel = (value: number) =>
  Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, "0");
const mixColor = (t: number) => {
  const r = UPHILL_RGB.r + (DOWNHILL_RGB.r - UPHILL_RGB.r) * t;
  const g = UPHILL_RGB.g + (DOWNHILL_RGB.g - UPHILL_RGB.g) * t;
  const b = UPHILL_RGB.b + (DOWNHILL_RGB.b - UPHILL_RGB.b) * t;
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
};

const FLOW_MARKERS = (() => {
  const markers: Array<{
    position: THREE.Vector3;
    color: string;
    size: number;
  }> = [];

  for (let index = 0; index < 22; index += 1) {
    const t = index / 21;
    const downhillFactor = -0.85 + t * 1.7;
    const color = mixColor(t);

    markers.push({
      position: surfacePoint(downhillFactor, 0, 0.16),
      color,
      size: 0.5,
    });
    markers.push({
      position: surfacePoint(downhillFactor, -0.33, 0.12),
      color,
      size: 0.34,
    });
    markers.push({
      position: surfacePoint(downhillFactor, 0.33, 0.12),
      color,
      size: 0.34,
    });
  }

  return markers;
})();

const WORLD_RESET_HEIGHT = -260;
const WORLD_BOUNDS = 1500;

const useKeyMap = () => {
  const [keys, setKeys] = useState({
    a: false,
    d: false,
    r: false,
  });

  useEffect(() => {
    const onKeyEvent = (event: KeyboardEvent, pressed: boolean) => {
      const key = event.key.toLowerCase();
      setKeys((previous) => ({
        ...previous,
        a: key === "a" ? pressed : previous.a,
        d: key === "d" ? pressed : previous.d,
        r: key === "r" ? pressed : previous.r,
      }));
    };

    const onKeyDown = (event: KeyboardEvent) => onKeyEvent(event, true);
    const onKeyUp = (event: KeyboardEvent) => onKeyEvent(event, false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return keys;
};

const resetPlayerState = (state: SurfState) => {
  state.position.copy(SPAWN_POINT);
  state.velocity.set(0, 0, 0);
  state.isSurfing = false;
};

const PlayerController = ({
  onSpeedChange,
  onSurfStateChange,
}: {
  onSpeedChange: (speed: number) => void;
  onSurfStateChange: (isSurfing: boolean) => void;
}) => {
  const { camera } = useThree();
  const keys = useKeyMap();
  const stateRef = useRef<SurfState>({
    position: SPAWN_POINT.clone(),
    velocity: new THREE.Vector3(),
    isSurfing: false,
  });
  const lookDirection = useRef(new THREE.Vector3());

  useEffect(() => {
    const flatDownhill = DOWNHILL_DIRECTION.clone().setY(0).normalize();
    const flatForward = WAVE_RAMP.forward.clone().setY(0).normalize();
    const defaultView = flatDownhill
      .multiplyScalar(0.84)
      .add(flatForward.multiplyScalar(0.16));

    if (defaultView.lengthSq() === 0) {
      defaultView.set(0, 0, -1);
    } else {
      defaultView.normalize();
    }

    camera.position.copy(stateRef.current.position);
    camera.lookAt(stateRef.current.position.clone().add(defaultView));
  }, [camera]);

  useFrame((_, delta) => {
    const sideInput = (keys.d ? 1 : 0) + (keys.a ? -1 : 0);

    const playerState = stateRef.current;
    if (keys.r) {
      resetPlayerState(playerState);
    }

    camera.getWorldDirection(lookDirection.current);
    lookDirection.current.y = 0;
    if (lookDirection.current.lengthSq() < 1e-8) {
      lookDirection.current.set(0, 0, -1);
    } else {
      lookDirection.current.normalize();
    }

    const yaw = Math.atan2(lookDirection.current.x, -lookDirection.current.z);

    stepSurfPhysics(
      playerState,
      {
        delta,
        yaw,
        moveForward: 0,
        moveRight: sideInput,
      },
      WAVE_RAMP,
    );

    if (
      playerState.position.y < WORLD_RESET_HEIGHT ||
      Math.abs(playerState.position.x) > WORLD_BOUNDS ||
      Math.abs(playerState.position.z) > WORLD_BOUNDS
    ) {
      resetPlayerState(playerState);
    }

    camera.position.copy(playerState.position);
    onSpeedChange(playerState.velocity.length());
    onSurfStateChange(playerState.isSurfing);
  });

  return null;
};

const SurfWave = () => (
  <>
    <mesh
      position={WAVE_CONFIG.position.toArray()}
      rotation={WAVE_CONFIG.rotation}
      receiveShadow
      castShadow
    >
      <boxGeometry args={WAVE_CONFIG.size.toArray()} />
      <meshStandardMaterial color="#3f8ca7" roughness={0.5} metalness={0.08} />
    </mesh>

    {FLOW_MARKERS.map((marker, index) => (
      <mesh key={`flow-${index}`} position={marker.position.toArray()}>
        <sphereGeometry args={[marker.size, 10, 10]} />
        <meshStandardMaterial
          color={marker.color}
          emissive={marker.color}
          emissiveIntensity={0.22}
        />
      </mesh>
    ))}

    <mesh position={UPHILL_BEACON.toArray()}>
      <cylinderGeometry args={[0.8, 0.8, 7.6, 14]} />
      <meshStandardMaterial
        color="#f97316"
        emissive="#f97316"
        emissiveIntensity={0.45}
      />
    </mesh>
    <mesh position={DOWNHILL_BEACON.toArray()}>
      <cylinderGeometry args={[0.8, 0.8, 7.6, 14]} />
      <meshStandardMaterial
        color="#06b6d4"
        emissive="#06b6d4"
        emissiveIntensity={0.45}
      />
    </mesh>
  </>
);

const Scene = ({
  onSpeedChange,
  onSurfStateChange,
}: {
  onSpeedChange: (speed: number) => void;
  onSurfStateChange: (isSurfing: boolean) => void;
}) => (
  <>
    <color attach="background" args={["#9cc2d1"]} />
    <Sky
      distance={450000}
      sunPosition={[30, 8, -15]}
      turbidity={9}
      rayleigh={1.35}
      mieCoefficient={0.008}
      mieDirectionalG={0.82}
    />
    <fog attach="fog" args={["#9fc4d2", 120, 780]} />
    <ambientLight intensity={0.46} />
    <hemisphereLight
      skyColor="#d9f1ff"
      groundColor="#2d4c5b"
      intensity={0.48}
    />
    <directionalLight
      position={[18, 26, 9]}
      intensity={1.05}
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
    />

    <SurfWave />

    <mesh position={[0, -90, 0]} receiveShadow>
      <boxGeometry args={[2200, 2, 2200]} />
      <meshStandardMaterial color="#355260" />
    </mesh>
    <gridHelper
      args={[2100, 210, "#7fb2c7", "#456675"]}
      position={[0, -88.99, 0]}
    />

    <PlayerController
      onSpeedChange={onSpeedChange}
      onSurfStateChange={onSurfStateChange}
    />
    <PointerLockControls pointerSpeed={2.5} />
  </>
);

export default function Home() {
  const [speed, setSpeed] = useState(0);
  const [isSurfing, setIsSurfing] = useState(false);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900 text-white">
      <Canvas
        shadows
        camera={{
          fov: 74,
          near: 0.1,
          far: 2200,
          position: SPAWN_POINT.toArray(),
        }}
        onPointerDown={(event) => {
          event.currentTarget.requestPointerLock();
        }}
      >
        <Scene onSpeedChange={setSpeed} onSurfStateChange={setIsSurfing} />
      </Canvas>

      <div className="pointer-events-none absolute left-6 top-6 rounded-lg bg-black/60 px-4 py-3 text-xs uppercase tracking-wide text-cyan-100">
        <div className="text-[10px] text-cyan-300">Speed</div>
        <div className="text-3xl font-bold text-white">
          {speed.toFixed(1)} u/s
        </div>
        <div className="text-[10px] text-slate-200">
          {isSurfing ? "surf" : "air"}
        </div>
      </div>

      <div className="pointer-events-none absolute right-6 top-6 rounded-lg bg-black/60 px-3 py-2 text-[11px] text-slate-100">
        Orange marker: uphill spawn side
        <br />
        Cyan marker: downhill flow side
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />

      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-black/50 px-4 py-2 text-[11px] text-slate-100">
        Click to lock mouse. Use A and D only while steering with mouse to
        strafe and hold the wave. Press R to reset.
      </div>
    </div>
  );
}
