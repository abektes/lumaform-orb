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
   * binding it would make every consumer of a param schema import all 23
   * engines. Pair this id with the matching export from '@lumaform/orb/engines'.
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
}

export interface ConfigRecord {
  engine: string;
  params: ParamValues;
  /** null when the file omits it — distinct from an empty object. */
  global: Record<string, unknown> | null;
  /** null when the file predates modulation; do not wipe a live rack on null. */
  modulation: Record<string, unknown> | null;
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
  }): boolean;
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
  loadConfig(config: OrbConfig): { engine: string; dropped: string[] };
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
export declare function readConfig(config: OrbConfig, defs: ParamSchema): ConfigRecord;
