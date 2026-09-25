# Using `@lumaform/orb` in your app

This guide goes from a look you designed in the studio to that orb running in your own page, reacting to a microphone or to your assistant's voice. A runnable version is in [examples/embed](../examples/embed): from the repository root, `npx vite examples/embed` serves it.

## 1. Design a look and export it

1. Open the studio at [orb.lumaform.xyz](https://orb.lumaform.xyz), or `npm run dev` in this repository. Pick an engine or a preset and tune it.
2. **If it should react to sound,** press **Mic** or **Test Tone** once in the Motion Lab. That switches the modulation rack on and adds a route from the audio input to Tempo, so the orb speeds up while there is sound. You can retarget or delete the route in the rack like any other. Without a route, audio changes nothing.
3. **If it should sit on your page** rather than on its own backdrop, choose **Transparent** among the background buttons. Glow then adds light over your page instead of covering it.
4. Open the **Export** tab and choose **Download .json**.

The file holds the look: the engine, its parameters, global settings (exposure, bloom, background) and the modulation rack, plus a `version` so later releases can migrate it. It deliberately leaves out your render-quality setting and whether you had paused the orb. Those belong to your session, not to the look. **Export → Full Suite → Code for your app** gives the same config already wrapped in the code from step 3.

## 2. Install

```bash
npm install @lumaform/orb three
```

`three` is a peer dependency (0.160 or newer, below 1.0), so your app decides its version. The package is plain ES modules and works with any modern bundler: Vite, webpack 5, esbuild, or a Next.js client component. It needs a browser with WebGL2.

## 3. Mount it

Give the orb an element with a size. The canvas fills that element and follows its size as it changes.

```html
<div id="orb" style="width: 400px; height: 400px"></div>
```

```js
import { createOrb } from '@lumaform/orb';
import { regard } from '@lumaform/orb/engines';
import look from './orb-regard.json';

const orb = createOrb(document.querySelector('#orb'), {
  engines: { regard },
  config: look,
});

if (orb.dropped.length) console.warn('@lumaform/orb ignored:', orb.dropped);
```

**Import the engine the file names.** Its `"engine"` field says which one: `"engine": "nebula"` needs `import { nebula } from '@lumaform/orb/engines'`. Each engine is a separate import, so your bundle holds only the ones you name.

`orb.dropped` lists keys in the file that this version of the library doesn't know, usually because the file came from a newer studio. It's empty when everything was understood.

If the file comes from a user rather than your own bundle, read it with `parseConfigFile(text, knownEngines)` first. It validates and migrates the file, and refuses a file from a newer format version with an error naming both versions.

## 4. Control it

```js
orb.stop();                 // pause; costs nothing while stopped
orb.start();                // resume without a jump
orb.loadConfig(otherLook);  // switch looks; import every engine your looks use
orb.dispose();              // free the GPU and remove the canvas it added
```

In a component framework, create it when the element mounts and dispose of it when it unmounts. In React:

```jsx
function Orb({ look }) {
  const ref = useRef(null);
  useEffect(() => {
    const orb = createOrb(ref.current, { engines: { regard }, config: look });
    return () => orb.dispose();
  }, [look]);
  return <div ref={ref} style={{ width: 400, height: 400 }} />;
}
```

## 5. Make it react to sound

Audio lives in its own entry point, `@lumaform/orb/audio`. If you never import it, no microphone code ships and no permission prompt can appear. The orb reads any **audio source**: an object with `read()`, returning a loudness from 0 to 1 each frame, and `isActive`. Hand one over with `orb.setAudioSource(source)`, and remember the route from step 1.

### The user's microphone

```js
import { createAudioInput } from '@lumaform/orb/audio';

const audio = createAudioInput();
orb.setAudioSource(audio);

micButton.addEventListener('click', async () => {
  // Browsers only allow this from a click. Resolves false if the user refuses.
  if (!(await audio.startMic())) console.warn('No microphone, or permission refused.');
});
```

`audio.startTestTone()` drives the orb from a silent built-in tone, without sound or a permission prompt. It's useful for checking your setup. `audio.stop()` ends either one.

### Your assistant's voice

For an assistant orb, the more telling signal is usually its own speech. Connect whatever plays that speech to an analyser and wrap it:

```js
import { createLevelFollower, rmsFromTimeDomain } from '@lumaform/orb/audio';

const ctx = new AudioContext();
const analyser = ctx.createAnalyser();
ctx.createMediaElementSource(voiceAudioElement).connect(analyser);
analyser.connect(ctx.destination); // keep the voice audible
const bytes = new Uint8Array(analyser.fftSize);
const follower = createLevelFollower(); // smooths loudness so it reads as a voice, not flicker

orb.setAudioSource({
  get isActive() { return !voiceAudioElement.paused; },
  read() { analyser.getByteTimeDomainData(bytes); return follower.push(rmsFromTimeDomain(bytes)); },
  setOptions: (o) => follower.setOptions(o), // picks up the attack and release set in the studio
});
```

A few browser rules apply here:
- An `AudioContext` starts suspended until the user has clicked something, so call `ctx.resume()` from a click handler.
- `createMediaElementSource` can be called only once per element.
- Audio from another origin reads as silence unless it's served with CORS and the element has `crossorigin="anonymous"`.

For a WebRTC or other `MediaStream`, use `ctx.createMediaStreamSource(stream)` in place of `createMediaElementSource`.

## 6. Sharpness and performance

The orb renders at the device's pixel density, capped at 2. Past that, a glow gets slower without looking sharper. Choose a density yourself when you know better, for example to save battery on a small ambient orb:

```js
createOrb(el, { engines: { regard }, config: look, pixelRatio: 1 });
```

A config file never sets the density, whatever it contains.

## 7. Driving your own frame loop

`createOrb` runs its own `requestAnimationFrame` loop. If your app already has one, for example a game or a larger three.js scene, construct `OrbRuntime` directly and call `tick(delta)` from your loop, or call `advance(delta)` and `render()` separately to do your own work in between. The runtime never calls back into your code. See the package [README](../packages/orb/README.md#orbruntime).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Nothing appears | The engine the file names isn't in `engines` (the console says `Engine type "…" not registered`). The container has no height. Or the browser has no WebGL2. |
| `orb.dropped` isn't empty | The file came from a newer studio than your library version. Update `@lumaform/orb`. |
| Audio does nothing | The file has no route from the audio input (step 1), `isActive` is false, the `AudioContext` is still suspended, or the audio is cross-origin without CORS. |
| The orb looks soft | A `pixelRatio` below the device's density was passed. |
