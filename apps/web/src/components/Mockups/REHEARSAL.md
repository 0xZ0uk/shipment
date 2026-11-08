# Rehearsal

Filmed with Stageshow's `scripts/film.mjs` (headless Chromium) in the skill's playground, then checked in the running app (`pnpm dev`, a temporary page with the seeded landing layout, deleted afterwards).

| Mockup         | Gold copied                                                  | Filmed                     | Open film lines                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pageBuilder`  | `linear` (wide hero), `fade-crop`, `static-card` (satellite) | `--states` at 1280 and 390 | `jump` on typed characters and the Publish button: typing feedback and the kit's 0.97 press scale. A satellite gutter line appears only mid-collapse and clears when it settles. |
| `onPage`       | `hero-demo`, `google-docs` (selection under the I-beam)      | `--states` at 1280 and 390 | One `near aligned` line at 390 between the URL and the toolbar status, whose width changes as the status rolls.                                                                  |
| `blockLibrary` | `many-of-one`                                                | `--still` at 1280 and 390  | `uneven gutters` at 390 on a grid tile that bleeds off the top edge. A grid tile, not a lone window.                                                                             |
| `seoAb`        | `static-card`                                                | `--still` at 1280 and 390  | `near aligned` (the ring's centered number) and `uneven inset` (left-aligned list rows): both are false positives for this layout.                                               |

What changed from the gold: the products are Shipment's admin and site. Colors, type and radii were measured from screenshots of the running app, and the picker uses the blocks' own thumbnails.

Checked in the app: the hero at 1440 (1:1 in `max-w-5xl`) and at 390 (compact design, plays on scroll), all three feature rows at 1440 (stages fill their 4:3 cards), and dark mode (light product windows on the dark muted ground). No page or console errors.

Not checked: Safari and Firefox, a real touch device, the `--gate` verdict (the films came back `inconclusive` because headless sampling had gaps over 27ms), reduced motion in the browser (the posters are set to the final frames), and the Hero's Split variant with a card mockup.
