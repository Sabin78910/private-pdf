# Design system

Private PDF uses one set of tokens in `src/style.css`. Dark is the default theme, and
`:root[data-theme='light']` switches to light. `tests/styles.test.ts` fails if a rule is left unclosed.

## Colour

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | #0b0f17 | #f6f7f9 | Page background |
| `--surface` / `-2` / `-3` | #121826 / #1a2232 / #222b3d | white and greys | Cards, inputs, selected states |
| `--line` | #263044 | grey | Hairlines and dividers |
| `--primary` | #2dd4bf (teal) | #0f766e | Main action, focus, selected items |
| `--accent` | #818cf8 (indigo) | #4f46e5 | Focus rings, secondary emphasis |
| `--success` `--danger` `--warning` | green, red, amber | darker shades | Status only |

Each tool gets a hue (`toolHue` in `src/core/theme.ts`) for its icon tile. A hue is used only on icons, never on text.

## Type

Inter (Latin) and Noto Sans Devanagari (Nepali) are bundled locally, because the CSP allows fonts only from `'self'`.
Large titles are 32/38 bold, screen titles 22/28, body 16/24, captions 13/18 in upper case with letter spacing.

## Layout

- The base grid is 4px. Screens have a 16px gutter, and content is at most 720px wide.
- Radii: 10px for inputs, 12px for controls, 16px for cards, 24px for sheets.
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
