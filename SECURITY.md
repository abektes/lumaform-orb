# Security

## Reporting a vulnerability

Report privately through GitHub's [security advisory
form](https://github.com/abektes/lumaform-orb/security/advisories/new) rather
than opening a public issue. Expect an acknowledgement within a week.

## What this project does and does not do

Lumaform Orb is a browser application with no server, no accounts and no
telemetry beyond optional page analytics. That rules out most of what a security
report usually concerns, so it is worth being specific about the surface that
does exist.

**Runs entirely in your browser.** There is no backend. Configurations, findings
and custom presets are held in `localStorage` on your own machine and are never
transmitted anywhere.

**Microphone audio never leaves the page.** Motion Lab can use the microphone to
drive parameters. The signal goes to a Web Audio `AnalyserNode`, is reduced to a
single amplitude number per frame, and is never recorded, stored or sent. The
browser requires a user gesture before capture starts, and denying permission is
handled as a normal outcome rather than an error.

**Analytics are opt-in and off by default.** No measurement ID is configured in
this repository. Analytics only load when `VITE_GA_ID` is set in the build
environment, so clones, forks, CI and local development make no analytics
requests at all. See `.env.example`.

**Imported configurations are validated, not trusted.** A `.json` loaded through
the Export tab is checked against the engine schema: unknown engines are
rejected, unknown keys are dropped, numbers are clamped to their declared range,
colours must match `#rrggbb`, and select values must be in their option list.
See `src/core/config-io.js`.

**Outbound requests.** Google Fonts, and Google Analytics only when configured.
Nothing else.

## Scope

In scope: XSS, unsafe handling of imported configurations, dependency
vulnerabilities, anything that would let a shared configuration file or preset
run code in someone else's browser.

Out of scope: denial of service through deliberately extreme parameter values.
The tool lets you ask the GPU for more than it can deliver — that is a feature of
an exploration instrument, not a vulnerability.
