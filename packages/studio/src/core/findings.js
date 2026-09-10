// The findings shelf keeps good accidents browsable without turning the
// notebook format into a published interchange contract.

export const FINDINGS_KEY = 'lumaform_findings_v1';

// localStorage is typically ~5 MB per origin and the preset store shares it.
export const MAX_BYTES = 4_000_000;

let counter = 0;

export function makeFinding({ engine, global, params, modulation, thumb, note = '' }) {
  counter += 1;
  const createdAt = Date.now();
  return {
    id: `f${createdAt.toString(36)}-${counter.toString(36)}`,
    createdAt,
    note: String(note),
    engine,
    global,
    params,
    modulation,
    thumb,
  };
}

export function estimateBytes(value) {
  const json = JSON.stringify(value);
  if (!json) return 0;
  // Notes may contain non-ASCII text, whose storage cost is larger than its JS
  // string length. TextEncoder is available in browsers and current Node.
  return new TextEncoder().encode(json).byteLength;
}

// Entries arrive newest-first and are dropped from the oldest end.
export function pruneToQuota(entries, maxBytes = MAX_BYTES) {
  const out = [...entries];
  while (out.length > 1 && estimateBytes(out) > maxBytes) out.pop();
  return out;
}

export function createFindingsStore(storage) {
  let lastError = null;

  function read() {
    try {
      const raw = storage?.getItem?.(FINDINGS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      lastError = err;
      // A corrupt or unavailable shelf must not take out the app.
      return [];
    }
  }

  function write(entries) {
    let candidates = pruneToQuota(entries);
    lastError = null;

    // Browser quotas vary. If the nominal budget still fails, preserve the
    // newest work and retry while dropping older entries.
    while (candidates.length) {
      try {
        if (typeof storage?.setItem !== 'function') throw new Error('Storage is unavailable');
        storage.setItem(FINDINGS_KEY, JSON.stringify(candidates));
        lastError = null;
        return true;
      } catch (err) {
        lastError = err;
        if (candidates.length === 1) break;
        candidates = candidates.slice(0, -1);
      }
    }

    // Clearing should still work when an implementation rejects setItem().
    if (!entries.length) {
      try {
        storage?.removeItem?.(FINDINGS_KEY);
        return true;
      } catch (err) {
        lastError = err;
      }
    }

    console.warn('Could not persist findings (storage full or unavailable)', lastError);
    return false;
  }

  return {
    get lastError() {
      return lastError;
    },
    list() {
      return read().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    },
    add(entry) {
      write([entry, ...read()]);
      return entry;
    },
    remove(id) {
      write(read().filter((entry) => entry.id !== id));
    },
    rename(id, note) {
      write(read().map((entry) => (
        entry.id === id ? { ...entry, note: String(note) } : entry
      )));
    },
    clear() {
      write([]);
    },
  };
}
