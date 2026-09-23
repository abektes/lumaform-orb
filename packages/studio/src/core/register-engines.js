// Registering every engine is a studio decision, not a library one.
//
// This used to live in @lumaform/orb, where it bound all 22 factories and sat
// on the package root. That put the whole engine layer one import away from
// every consumer — including one that only wanted a param schema — and no
// amount of `sideEffects: false` could drop a factory named in a live binding.
//
// The studio genuinely does want all 23: it is an exploration tool, and an
// engine you cannot select is an engine you cannot explore. So the cost is
// paid here, by the one consumer for which it is the point.
//
// The catalog supplies ids and schemas; the engines barrel supplies factories
// keyed by the same id. Pairing them is all registration ever was.
import { ENGINE_CATALOG } from '@lumaform/orb';
import * as engineFactories from '@lumaform/orb/engines';

export function registerAllEngines(studio) {
  for (const entry of ENGINE_CATALOG) {
    const factory = engineFactories[entry.id];
    if (typeof factory !== 'function') {
      // A catalog entry with no matching barrel export is a build mistake, not
      // a runtime condition. Log it and carry on: one missing engine should not
      // take the studio down with it.
      console.error(`Engine "${entry.id}" is in the catalog but not exported from @lumaform/orb/engines.`);
      continue;
    }
    studio.registerEngine(entry.id, factory);
  }
}
