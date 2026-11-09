/**
 * The live nook: the scene file (or the placeholder blockout) under a warm
 * desk lamp and cool moonlight, a camera that follows the scroll from stop
 * to stop, dust in the lamp light. Frames render only while the canvas is on
 * screen and the tab is shown.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ACESFilmicToneMapping,
  Color,
  Vector3,
  type Object3D,
  type SpotLight as SpotLightType,
} from 'three';
import { oklchToHex } from '../lib/color';
import { GPU_CONTEXT } from '../tour/gate';
import type { TourScroll } from '../tour/scroll';
import { DESK_TOP, LAST_STOP, PHONE_FRAME, RIBBON_POINTS, STOPS } from '../tour/stops';
import { readAnchors, type Anchors } from './anchors';
import { CameraRig } from './CameraRig';
import { Mascot, useGltfPromise, useLoaders } from './Models';
import { Motes } from './Motes';
import { Desk, useDeskPromise } from './Desk';
import { Ribbon } from './Ribbon';
import { createRibbonCurve } from './ribbonPath';
import { useEnvironment } from './environment';
import {
  DPR_RANGE,
  FrameTimes,
  HOPELESS_FRAME,
  PERFORMANCE,
  SLOW_FRAME,
  adaptiveDpr,
} from './quality';

export interface SceneOptions {
  scroll: TourScroll;
  mascotUrl: string | null;
  capture: 'stops' | 'mobile' | null;
  onReady: () => void;
  onFail: (reason: string) => void;
}

const BACKGROUND = '#0b0910';
const DEFAULT_RIBBON = RIBBON_POINTS.map(([x, y, z]) => new Vector3(x, DESK_TOP + y, z));
/** How fast the camera's progress chases the page's, per second. */
const FOLLOW = 6;

class Boundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Tour progress as a ref, eased a little behind the page (exact when still). */
function useProgress(scroll: TourScroll, still: boolean) {
  const goal = useRef(scroll.read());
  const ref = useRef(goal.current);
  useEffect(() => scroll.subscribe(p => void (goal.current = p)), [scroll]);
  useFrame((_, delta) => {
    const left = goal.current - ref.current;
    if (still || Math.abs(left) < 1e-4) ref.current = goal.current;
    else ref.current += left * (1 - Math.exp(-FOLLOW * Math.min(delta, 0.05)));
  }, -1);
  return ref;
}

/** Runs the loop only while the canvas is on screen and the tab is shown. */
function useLiveFrames() {
  const { gl, setFrameloop } = useThree();
  useEffect(() => {
    let onScreen = true;
    const apply = () => setFrameloop(onScreen && !document.hidden ? 'always' : 'never');
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      apply();
    });
    observer.observe(gl.domElement);
    document.addEventListener('visibilitychange', apply);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', apply);
    };
  }, [gl, setFrameloop]);
}

/**
 * Draws at the ratio adaptiveDpr picks, lets R3F regress it while a slow GPU
 * scrolls, and gives up on the live scene if even the lowest ratio stays far
 * over budget.
 */
function useAdaptiveDpr(scroll: TourScroll, still: boolean, onFail: (reason: string) => void) {
  const times = useRef(new FrameTimes());
  const strikes = useRef(0);
  const regress = useThree(s => s.performance.regress);
  useEffect(() => {
    if (still) return;
    return scroll.subscribe(() => {
      const median = times.current.median();
      if (median !== null && median > SLOW_FRAME) regress();
    });
  }, [scroll, still, regress]);
  useFrame(state => {
    const { performance: quality, size, viewport, setDpr } = state;
    times.current.tick(performance.now(), !still);
    const dpr = adaptiveDpr(devicePixelRatio, size, still ? 1 : quality.current);
    if (dpr !== viewport.dpr) setDpr(dpr);
    const median = times.current.median();
    if (still || median === null) return;
    if (median > HOPELESS_FRAME) {
      regress();
      if (++strikes.current > 180) onFail('too-slow');
    } else {
      strikes.current = 0;
    }
  });
}

/** Fires once the first frames with the models are drawn. */
function Ready({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current || ++frames.current < 3) return;
    done.current = true;
    onReady();
  });
  return null;
}

/** The lamp's spot light. Shadows render once: nothing that casts them moves. */
function Lamp({ anchors }: { anchors: Anchors }) {
  const light = useRef<SpotLightType>(null);
  const gl = useThree(s => s.gl);
  useEffect(() => {
    const spot = light.current;
    if (!spot) return;
    spot.target.position.copy(anchors.lampTarget);
    spot.target.updateMatrixWorld();
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
  }, [anchors, gl]);
  useFrame(state => {
    // A filament that wavers a touch.
    const t = state.clock.elapsedTime;
    if (light.current)
      light.current.intensity = 1.05 + Math.sin(t * 7.1) * 0.05 + Math.sin(t * 2.3) * 0.08;
  });
  return (
    <>
      <spotLight
        ref={light}
        position={anchors.lamp}
        angle={0.9}
        penumbra={0.75}
        distance={1.4}
        decay={1.8}
        intensity={1.05}
        color="#ffcf91"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-radius={4}
      />
      <pointLight position={anchors.lamp} intensity={0.12} distance={1} decay={2} color="#ffd9a8" />
    </>
  );
}

/** A rim light from behind the desk, tinted by the page's cover colour. */
function Rim() {
  const color = useRef(new Color());
  const light = useRef<{ color: Color } | null>(null);
  const frame = useRef(0);
  useFrame(() => {
    if (++frame.current % 12 !== 1 || !light.current) return;
    const css = getComputedStyle(document.documentElement);
    const h = Number.parseFloat(css.getPropertyValue('--seed-h')) || 268;
    const c = Number.parseFloat(css.getPropertyValue('--seed-c')) || 0.13;
    light.current.color.copy(color.current.set(oklchToHex(0.7, Math.min(0.16, c * 1.2), h)));
  });
  return <directionalLight ref={light} position={[0.4, 0.9, -2.4]} intensity={0.7} />;
}

function World(props: SceneOptions) {
  const still = props.capture !== null;
  const progress = useProgress(props.scroll, still);
  const head = useRef(0);
  useLiveFrames();
  useAdaptiveDpr(props.scroll, still, props.onFail);
  useEnvironment();
  const loaders = useLoaders();
  const mascotPromise = useGltfPromise(loaders, props.mascotUrl);
  const desk = useDeskPromise(loaders, !mascotPromise);
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const onModel = useCallback((root: Object3D) => setAnchors(readAnchors(root)), []);
  const fail = useCallback(() => props.onFail('model-failed'), [props]);
  const frames = anchors?.frames ?? STOPS.map(s => s.frame);
  const ribbon = useMemo(() => createRibbonCurve(anchors?.ribbon ?? DEFAULT_RIBBON), [anchors]);

  return (
    <>
      <color attach="background" args={[BACKGROUND]} />
      <hemisphereLight args={['#7d76b8', '#140f18', 0.2]} />
      <directionalLight position={[-0.6, 1.8, 1.6]} intensity={0.32} color="#d8d2f0" />
      <Rim />
      <Boundary onError={fail}>
        <Suspense fallback={null}>
          <Desk dressed={desk} onModel={onModel} />
          {mascotPromise && anchors?.mascot && (
            <Mascot
              promise={mascotPromise}
              at={anchors.mascot}
              faceTo={(frames[LAST_STOP] ?? STOPS[LAST_STOP]!.frame).position}
              still={still}
            />
          )}
          {anchors && (
            <>
              <Ribbon curve={ribbon} head={head} still={still} />
              <Lamp anchors={anchors} />
              <Motes around={anchors.lamp} still={still} />
              <Ready onReady={props.onReady} />
            </>
          )}
        </Suspense>
      </Boundary>
      <CameraRig
        frames={frames}
        ribbon={ribbon}
        progress={progress}
        head={head}
        still={still}
        fixed={props.capture === 'mobile' ? PHONE_FRAME : undefined}
      />
    </>
  );
}

export function Scene(props: SceneOptions) {
  return (
    <Canvas
      dpr={DPR_RANGE}
      performance={PERFORMANCE}
      shadows="percentage"
      camera={{
        fov: STOPS[0].frame.fov,
        near: 0.03,
        far: 12,
        position: [...STOPS[0].frame.position],
      }}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false, ...GPU_CONTEXT }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        gl.domElement.addEventListener('webglcontextlost', e => {
          e.preventDefault();
          props.onFail('context-lost');
        });
      }}
      aria-hidden="true"
      tabIndex={-1}
    >
      <World {...props} />
    </Canvas>
  );
}
