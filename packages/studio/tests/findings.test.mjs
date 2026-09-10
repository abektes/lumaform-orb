import {
  FINDINGS_KEY,
  MAX_BYTES,
  makeFinding,
  estimateBytes,
  pruneToQuota,
  createFindingsStore,
} from '../src/core/findings.js';

let failures = 0;
function ok(name, condition, extra = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!condition) failures++;
}

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const base = {
  engine: 'quantum',
  global: { bloomStrength: 0.6 },
  params: { edgeGlow: 1.2 },
  modulation: { enabled: false, sources: {}, routes: [] },
  thumb: 'data:image/jpeg;base64,AAAA',
};

const first = makeFinding(base);
ok('has an id', typeof first.id === 'string' && first.id.length > 0);
ok('has a timestamp', typeof first.createdAt === 'number' && first.createdAt > 0);
ok('note defaults to empty', first.note === '');
ok('carries the config', first.engine === 'quantum' && first.params.edgeGlow === 1.2);
ok('ids are unique', new Set([
  makeFinding(base).id,
  makeFinding(base).id,
  makeFinding(base).id,
]).size === 3);
ok('note is preserved', makeFinding({ ...base, note: 'thinking?' }).note === 'thinking?');

ok('estimates a positive size', estimateBytes(first) > 0);
ok(
  'a bigger thumb estimates bigger',
  estimateBytes(makeFinding({ ...base, thumb: 'x'.repeat(5000) })) > estimateBytes(first)
);
ok(
  'counts UTF-8 bytes',
  estimateBytes({ note: '🟡' }) > JSON.stringify({ note: '🟡' }).length
);

const many = [];
for (let i = 0; i < 20; i++) {
  many.push(makeFinding({ ...base, thumb: 'x'.repeat(1000), note: `n${i}` }));
}
const pruned = pruneToQuota(many, 6000);
ok('prunes to fit quota', estimateBytes(pruned) <= 6000 || pruned.length === 1, String(pruned.length));
ok('prunes from the oldest end', pruned[0].note === many[0].note);
ok('keeps at least one entry', pruneToQuota(many, 1).length === 1);
ok('leaves a small list untouched', pruneToQuota(many.slice(0, 2), MAX_BYTES).length === 2);
ok('handles an empty list', pruneToQuota([], 1000).length === 0);

const storage = memoryStorage();
const store = createFindingsStore(storage);
ok('starts empty', store.list().length === 0);
const added = store.add(makeFinding({ ...base, note: 'first' }));
ok('add returns the entry', added.note === 'first');
ok('add persists', store.list().length === 1);
ok('uses the documented key', storage.getItem(FINDINGS_KEY) !== null);

store.add(makeFinding({ ...base, note: 'second' }));
ok('newest is first', store.list()[0].note === 'second');
const id = store.list()[0].id;
store.rename(id, 'renamed');
ok('rename works', store.list()[0].note === 'renamed');
store.rename('missing', 'ignored');
ok('rename ignores unknown ids', store.list().length === 2);
store.remove(id);
ok('remove works', store.list().length === 1 && store.list()[0].note === 'first');
store.remove('missing');
ok('remove ignores unknown ids', store.list().length === 1);
store.clear();
ok('clear empties the store', store.list().length === 0);

ok(
  'tolerates corrupt json',
  createFindingsStore(memoryStorage({ [FINDINGS_KEY]: '{not json' })).list().length === 0
);
ok(
  'tolerates a non-array payload',
  createFindingsStore(memoryStorage({ [FINDINGS_KEY]: '{"a":1}' })).list().length === 0
);
ok('tolerates missing storage', createFindingsStore(null).list().length === 0);

const throwing = {
  getItem: () => null,
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => {},
};
ok('survives throwing storage', (() => {
  try {
    const unavailable = createFindingsStore(throwing);
    unavailable.add(makeFinding(base));
    return unavailable.lastError instanceof Error;
  } catch {
    return false;
  }
})());

const quotaMap = new Map();
const tightStorage = {
  getItem: (key) => quotaMap.get(key) ?? null,
  setItem: (key, value) => {
    if (value.length > 1800) throw new Error('QuotaExceededError');
    quotaMap.set(key, value);
  },
  removeItem: (key) => quotaMap.delete(key),
};
const tightStore = createFindingsStore(tightStorage);
tightStore.add(makeFinding({ ...base, thumb: 'x'.repeat(600), note: 'oldest' }));
tightStore.add(makeFinding({ ...base, thumb: 'x'.repeat(600), note: 'middle' }));
tightStore.add(makeFinding({ ...base, thumb: 'x'.repeat(600), note: 'newest' }));
ok('retries after quota errors', tightStore.lastError === null);
ok('quota retries preserve newest entries', tightStore.list()[0].note === 'newest');
ok('quota retries drop older entries', tightStore.list().length < 3);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
