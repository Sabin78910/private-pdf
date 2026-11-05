# Design system

Private PDF uses one set of tokens in `src/style.css`. Dark is the default theme, and
`:root[data-theme='light']` switches to light. `tests/styles.test.ts` fails if a rule is left unclosed.

## Colour ("Graphite & Signal")

Neutral graphite surfaces with no blue cast, and one signal colour. Dark pairs lime on graphite; light flips
to ink buttons with lime text, so the main action is unmistakable in both themes.

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | #0a0a0b | #f6f6f2 (paper) | Page background |
| `--surface` / `-2` / `-3` | #141416 / #1c1c1f / #27272b | white, #efefea, #e5e5df | Cards, inputs, selected states |
| `--line` | #2a2a2f | #e2e2dc | Hairlines and dividers |
| `--primary` / `--on-primary` | #d4ff3a (signal lime) / #0a0a0b | #0a0a0b (ink) / #d4ff3a | Main action, selected items |
| `--accent` | #a78bfa (violet) | #5b3fd6 | Links, focus rings, secondary emphasis |
| `--success` `--danger` `--warning` | green, red, amber | darker shades | Status only |

Each tool gets a hue (`toolHue` in `src/core/theme.ts`) for its icon tile. A hue is used only on icons, never on text.

## Type

Inter (Latin) and Noto Sans Devanagari (Nepali) are bundled locally, because the CSP allows fonts only from `'self'`.
Large titles are 36/40 at weight 760 with -0.035em tracking, screen titles 22/28, body 16/24, captions 13/18 in upper case with letter spacing.

## Layout

- The base grid is 4px. Screens have a 16px gutter, and content is at most 720px wide.
- Radii: 12px for inputs, 14px for controls, 20px for cards, 28px for sheets.
- Touch targets are at least 44px.

## Patterns

- The app bar is sticky. On tool screens the title fades into it once you scroll.
- The tab bar has four tabs: Home, Tools, Library, Settings.
- Every tool screen has a title and a one-line description. It starts with an empty state that has one primary "Browse files" button.
- Tool options are option cards, or segmented controls when there are up to four short choices. Tool options never use native selects.
- Each tool has one sticky verb button, such as "Compress PDF". The result card offers Save to device, Share, Open and Keep in Library.
- Item actions in the Library open in a bottom sheet.
- Every screen says that files are processed on this device.
- Motion lasts at most 200ms and is turned off under `prefers-reduced-motion`.
