// Type declarations for @lumaform/orb.
//
// Hand-written because the source is plain JS with no build step. If you change
// the root barrel, change this — packages/orb/tests/public-api.test.mjs compares
// the two and fails when they disagree.

export interface ParamDef {
  type: 'number' | 'color' | 'select' | 'boolean';
  label: string;
  /** Which inspector section the control belongs in. */
  section?: string;
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
}

export type ParamSchema = Record<string, ParamDef>;
export type ParamValues = Record<string, number | string | boolean>;

export interface CatalogEntry {
  id: string;
  key: string;
  name: string;
  badge: string;
  description: string;
  defaultPreset: string;
  file: string;
  /**
   * The factory's export name, as a string. Deliberately not the function:
   * binding it would make every consumer of a param schema import every
   * engine. Pair this id with the matching export from '@lumaform/orb/engines'.
   */
  factoryName: string;
  params: ParamSchema;
}

/** Anything that can drive audio-reactive modulation. */
export interface AudioSource {
  /** Current level, 0..1. */
  read(): number;
  readonly isActive: boolean;
  setOptions?(options: { attack?: number; release?: number }): void;
}

export interface OrbConfig {
  version?: number;
  engine: string;
  global?: Record<string, unknown>;
  params?: ParamValues;
  modulation?: Record<string, unknown>;
  states?: Record<string, { params?: ParamValues; tempo?: number }>;
  initialState?: string;
  transition?: Partial<OrbTransition>;
}

/** A state as read back: a patch over the base look, plus a tempo. */
export interface OrbState {
  params: ParamValues;
  tempo: number;
}

export interface OrbTransition {
  durationMs: number;
  easing: 'linear' | 'easeOut' | 'easeInOut' | 'spring' | 'snap';
}

/**
 * A named starting point: its own engine and a config that names it, so
 * importing one template ships one engine.
 */
export interface OrbTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly engine: EngineFactory;
  readonly config: OrbConfig;
}

export interface ConfigRecord {
  engine: string;
  params: ParamValues;
  /** null when the file omits it — distinct from an empty object. */
  global: Record<string, unknown> | null;
  /** null when the file predates modulation; do not wipe a live rack on null. */
  modulation: Record<string, unknown> | null;
  /** null when the file has no states: a single look. */
  states: Record<string, OrbState> | null;
  /** Names an existing state, or null. */
  initialState: string | null;
  transition: OrbTransition;
  /** Keys the file carried that the engine's schema does not define. */
  dropped: string[];
}

export interface RuntimeOptions {
  /** OrbitControls. Off by default: an ambient orb rarely wants drag-to-rotate. */
  controls?: boolean;
  /** Camera auto-rotation. Off by default; motion belongs to the engine. */
  autoRotate?: boolean;
  /** Only consulted when `controls` is true. */
  enableZoom?: boolean;
  /** Needed only to read pixels back with toDataURL. Costs memory every frame. */
  preserveDrawingBuffer?: boolean;
  /**
   * Render density. Defaults to the device's `devicePixelRatio`, capped at 2.
   * A config file never sets it: `dpr` in a file's `global` is ignored.
   */
  pixelRatio?: number;
  audioSource?: AudioSource | null;
}

export type EngineFactory = (context: {
  scene: unknown;
  camera: unknown;
  renderer: unknown;
  composer: unknown;
  pointerTracker: unknown;
  params: ParamValues;
  global: Record<string, unknown>;
}) => {
  update(frame: {
    time: number;
    delta: number;
    pointer: unknown;
    marchQuality: number;
    fps: number;
  }): void;
  setParams?(patch: ParamValues): void;
  dispose(): void;
  onPulse?(): void;
  onResize?(width: number, height: number): void;
  frame?: { radius: number };
};

/**
 * The runtime. Owns no frame loop: call `tick(delta)`, or `advance(delta)` and
 * `render(delta)` separately when you need to interleave your own work.
 */
export declare class OrbRuntime {
  constructor(container: HTMLElement, options?: RuntimeOptions);
  readonly virtualTime: number;
  timeScale: number;
  isPaused: boolean;
  registerEngine(type: string, factory: EngineFactory): void;
  /** Returns true when an engine was constructed, false on a same-type no-op. */
  mountEngine(type: string, state?: {
    params?: ParamValues;
    global?: Record<string, unknown>;
    modulation?: Record<string, unknown>;
    states?: Record<string, OrbState> | null;
    initialState?: string | null;
    transition?: Partial<OrbTransition> | null;
  }): boolean;
  /** Eases toward a named state. Returns false, and warns, for an unknown name. */
  setState(name: string, options?: Partial<OrbTransition>): boolean;
  /** The current state's name, or null when the config has none. */
  readonly state: string | null;
  readonly stateNames: string[];
  applyParams(state: {
    params?: ParamValues;
    global?: Record<string, unknown>;
    modulation?: Record<string, unknown>;
  }): void;
  advance(delta: number): unknown;
  render(delta: number): void;
  tick(delta: number): void;
  setAudioSource(source: AudioSource | null): void;
  dispose(): void;
}

export interface CreateOrbOptions extends RuntimeOptions {
  /** Engine id to factory. Import only the engines you want from './engines'. */
  engines?: Record<string, EngineFactory>;
  config?: OrbConfig | null;
  /** Brings its own engine and config; wins over `config`. */
  template?: OrbTemplate | null;
  /** Starting state; falls back to the config's initialState if unknown. */
  state?: string | null;
  /** Used when no config is given. Falls back to the sole registered engine. */
  engine?: string | null;
  params?: ParamValues | null;
  global?: Record<string, unknown> | null;
  /** Start the loop immediately. Default true. */
  autoStart?: boolean;
}

export interface Orb {
  readonly runtime: OrbRuntime;
  readonly isRunning: boolean;
  /** Keys the initial config carried that the engine's schema does not define. */
  readonly dropped: string[];
  start(): void;
  stop(): void;
  setEngine(type: string, next?: {
    params?: ParamValues;
    global?: Record<string, unknown>;
    modulation?: Record<string, unknown>;
  }): boolean;
  setParams(params: ParamValues, global?: Record<string, unknown>): void;
  loadConfig(config: OrbConfig, options?: { state?: string }): { engine: string; dropped: string[] };
  /** Eases toward a named state; false, and a warning, for an unknown name. */
  setState(name: string, options?: Partial<OrbTransition>): boolean;
  readonly state: string | null;
  readonly states: string[];
  setAudioSource(source: AudioSource | null): void;
  dispose(): void;
}

export declare function createOrb(container: HTMLElement, options?: CreateOrbOptions): Orb;

export declare const ENGINE_CATALOG: readonly CatalogEntry[];
export declare const ENGINE_TYPES: Record<string, string>;
export declare const ENGINE_INFO: Record<string, Omit<CatalogEntry, 'params'>>;
export declare const ENGINE_PARAM_DEFINITIONS: Record<string, ParamSchema>;
export declare function getEngineEntry(id: string): CatalogEntry | undefined;
export declare function getDefaultEngineParams(engineType: string): ParamValues;
export declare function getDefaultPresetName(id: string): string;
export declare function defaultEngineBags(): Record<string, ParamValues>;

export declare const CONFIG_VERSION: number;
export declare function stampVersion<T extends object>(config: T): T & { version: number };
export declare function migrateConfig(config: OrbConfig): OrbConfig;
export declare function parseConfigFile(
  text: string,
  knownEngines: readonly string[]
): { ok: true; configs: OrbConfig[] } | { ok: false; error: string };
export declare function sanitizeParams(
  params: ParamValues | undefined,
  defs: ParamSchema
): { params: ParamValues; dropped: string[] };
export declare function sanitizeStates(
  states: unknown,
  defs: ParamSchema
): { states: Record<string, OrbState> | null; dropped: string[] };
export declare function readConfig(config: OrbConfig, defs: ParamSchema): ConfigRecord;
