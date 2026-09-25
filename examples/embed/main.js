// The whole integration: a look exported from the studio, the one engine it
// names, and an audio source. See docs/GUIDE.md for each step.
import { createOrb } from '@lumaform/orb';
import { regard } from '@lumaform/orb/engines';
import { createAudioInput } from '@lumaform/orb/audio';
import look from './orb.json';

const orb = createOrb(document.querySelector('#orb'), {
  engines: { regard }, // must match "engine" in orb.json
  config: look,
});

// Keys this version of the library doesn't know, usually a version mismatch.
if (orb.dropped.length) console.warn('@lumaform/orb ignored:', orb.dropped);

// Audio moves the orb only through a route in the config. orb.json has
// audio1 → Tempo, which the studio adds when you press Mic or Test Tone.
const audio = createAudioInput();
orb.setAudioSource(audio);

const buttons = { tone: document.querySelector('#tone'), mic: document.querySelector('#mic') };
function show(active) {
  for (const [name, button] of Object.entries(buttons)) button.setAttribute('aria-pressed', String(name === active));
}

buttons.tone.addEventListener('click', async () => {
  if (audio.mode === 'tone') { audio.stop(); show(null); return; }
  // Drives the orb without making a sound or asking for permission.
  if (await audio.startTestTone()) show('tone');
});

buttons.mic.addEventListener('click', async () => {
  if (audio.mode === 'mic') { audio.stop(); show(null); return; }
  // Browsers only allow this from a click, and the user can say no.
  if (await audio.startMic()) show('mic');
  else alert('No microphone available, or permission was refused.');
});
