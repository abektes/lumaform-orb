// Syntax highlighting for the export tab's embed snippet.
//
// Shiki is ~350 kB — far too much to put in the main bundle for one snippet on
// one tab, so it is dynamically imported and Vite splits it into its own chunk
// that only downloads when the Export tab is first opened. Until it resolves the
// snippet renders as escaped plain text, so it is always readable and always
// copy-able even if the chunk never loads.
//
// The fine-grained bundle is core + one language + one theme + the JavaScript
// RegExp engine; the JS engine avoids shipping the Oniguruma WASM binary.

export function escapeHtml(code) {
  return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function plainCode(code) {
  return `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
}

let highlighter = null;
let loading = null;
let failed = false;

// Resolves to a highlighter, or null if shiki could not be loaded. Safe to call
// repeatedly — the import and the highlighter are created at most once.
export function ensureHighlighter() {
  if (highlighter || failed) return Promise.resolve(highlighter);
  if (!loading) {
    loading = Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/themes/github-dark'),
    ])
      .then(([core, engine, lang, theme]) => {
        highlighter = core.createHighlighterCoreSync({
          themes: [theme.default],
          langs: [lang.default],
          engine: engine.createJavaScriptRegexEngine(),
        });
        return highlighter;
      })
      .catch((err) => {
        // Highlighting is decoration; a failure must never take out the panel.
        console.warn('Syntax highlighting unavailable, using plain text', err);
        failed = true;
        return null;
      });
  }
  return loading;
}

// Synchronous. Returns highlighted HTML once the chunk has loaded, otherwise the
// escaped fallback.
export function highlightJs(code) {
  if (!highlighter) return plainCode(code);
  try {
    return highlighter.codeToHtml(code, { lang: 'javascript', theme: 'github-dark' });
  } catch (err) {
    console.warn('Failed to highlight snippet, using plain text', err);
    return plainCode(code);
  }
}
