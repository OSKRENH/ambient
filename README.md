# Ambient Web

Browser granular audio instrument inspired by the parameter and preset data in `ambient_v0.3.zip`. No build step or external JavaScript dependencies. Serve `dist/` over HTTPS (or localhost). AudioWorklet requires a secure context. Open `dist/index.html` via a web server, not `file://`.

## Features

- Local audio import (up to 40 MiB / 120 seconds), generated stereo demo and waveform seeking.
- Sample-accurate granular synthesis in AudioWorklet; size, speed, pitch, position scatter, pitch scatter and pitch quantization.
- Three additional granular pitch layers, random stereo panning, preset amplitude envelopes and grain interval.
- Low-pass / band-pass / high-pass filter, filtered feedback delay, convolution reverb and early reflections.
- Output compression and soft saturation, spectrum and peak meter.
- Stereo PCM16 WAV recording at the actual AudioContext sample rate, up to five minutes.
- 18 original preset value sets, settings JSON export/import and original MIDI CC assignments (with one collision resolved).

## Provenance and compatibility

The provided archive contains only `support/presets.json` and `support/midi.json`; it does **not** contain a Max patch, executable, source audio or DSP implementation. This is an independent audio implementation, not a bit-identical port or emulation. No original UI assets were present. `dist/presets.json` retains the 18 original audio parameter value sets; non-audio Max UI state is omitted. Original values may exceed 127 and are preserved in that file; runtime normalization clamps controls to 0–127.

All mappings are new and explicit in `parameters.js` / `audio.js`: size 20–1500 ms (exponential), speed 0–1.984×, pitch approximately −24…+24 semitones centered on 64, interval 12–960 ms, filter 40 Hz–18 kHz, delay 35–2335 ms, feedback capped at 84%, reverb 0.4–9.4 seconds. Original envelopes are normalized from a 1000-unit domain and applied to each grain with a short edge fade. Quantization is interpreted as off / chromatic / C-major pentatonic transposition offsets. Pitch layers resample grains, not an independent formant-preserving phase vocoder. Grain voice count is capped at 192.

MIDI CC21 is duplicated in the source map (speed and early reverb). The web app assigns it to speed only. The original MIDI file is retained unchanged for reference. MIDI does not request sysex. Availability depends on browser support and permission. No Web MIDI support is required for the on-screen controls.

Audio never leaves the browser. No user account, server processing or media upload is used. Long imported sources and recordings use browser memory, so limits are enforced. For continuous playback/recording, keep the browser foregrounded; mobile browsers may suspend background audio. Stop clears the audio graph and effect tails; pause suspends the context. Browsers must support AudioWorklet, Web Audio, ES modules and native dialog. Google Fonts is optional and falls back to local sans-serif.

## Development

Run `python3 -m http.server 8080 --directory dist`, open localhost:8080. No package install is needed. `npm test` validates granular DSP through a mocked AudioWorklet host, preset normalization and the WAV encoder. Browser playback/visual QA is a separate manual check and is not implied by these tests.

The `.openai/hosting.json` file identifies the private Sites deployment. The exact authored static files in `dist/` are the deployment source. This repository can also be served by a static host using `dist` as the publish directory with no build command.
