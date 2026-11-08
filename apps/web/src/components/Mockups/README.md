# Mockups

Product mockups for the landing page, drawn in code with [Stageshow](https://github.com/benjitaylor/skills/tree/main/stageshow): a faux admin or site in a window, framed like a marketing shot, some with a scripted cursor. Editors pick one in a block's **Illustration** field (Hero, Feature rows), and it shows instead of the image.

| Name           | Slot            | What happens                                                                                                                             |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pageBuilder`  | wide (1024×540) | The admin edits Home: Add Layout opens the picker, a search finds Pricing, the row lands, Publish sends it to the live site (satellite). |
| `blockLibrary` | card (480×360)  | A still: the picker's real thumbnails in a grid, Pricing in focus.                                                                       |
| `onPage`       | card            | The live site with the on-page editor: "this week" is selected and retyped as "today", the draft saves, Publish.                         |
| `seoAb`        | card            | A still: the SEO score with three checks, and an A/B test card over the admin's sidebar.                                                 |

Animated mockups play once when scrolled into view and hold their last frame; under reduced motion they show that frame (`poster`). Each has a phone design (`compact`) for narrow columns.

## Files

- `options.ts`: the names, labels and slots. Server-safe: `illustrationField()` (`src/blocks/shared/fields.ts`) reads it.
- `Illustration.tsx`: renders a mockup by name. Each mockup is a lazy chunk, mounted on the client only (a stage measures its container to pick a design and scale).
- `look.css`: the two looks, the Payload admin (`.sh-admin`) and the site (`.sh-site`), measured from the running app. The card ground is the section's `--muted`.
- `thumbs.ts`: the blocks' own picker thumbnails as data URIs.
- `fonts.ts`: `useFontsReady()`. Stages are keyed on it, so text the kit measures (`Roll`) is measured in Inter, not the fallback font.
- `<Name>/`: one mockup, its script and its CSS, scoped under its root class.

## The kit

`kit/` is Stageshow's kit (MIT, `kit/LICENSE`), copied from `benjitaylor/skills` at `299140f` (skill version 1.1.1). Keep it as upstream wrote it so it can be re-copied: it is excluded from ESLint and oxfmt. One change: `brands/` and `parts/BrandMark` are left out (third-party logos, not covered by the MIT license, unused here).

## Adding one

1. Read the skill's `SKILL.md` and start from its closest gold example. Build and film it in the skill's playground (`examples/<name>/`, `node scripts/film.mjs "<playground>/?capture=<name>" --gate`), at the shown width and at 390.
2. Copy it here as `<Name>/index.tsx` plus its CSS. Import from `../kit`, wrap it in `.sh-admin` or `.sh-site`, key the `Stage` on `useFontsReady()`, and use the slot's size (`wide` 1024×540, `card` 480×360 with a 358×268 `compact` and `fill`).
3. Add it to `options.ts` and the loaders in `Illustration.tsx`, then run `pnpm web generate:types`. The field is a select inside JSON-stored blocks, so a new option needs no migration (`migrate:create` reports no schema changes).

`REHEARSAL.md` records what was filmed and checked.
