# Design guide

The aesthetic is Linear, ported to pure black. Clean, dense, opinionated, dark-first. Every choice below is load-bearing — deviate only with a reason.

## Principles

- **Quiet by default.** Color earns its place. Most of the screen is `#000`, white text, and a single accent. Resist decoration.
- **Density over whitespace.** Information-dense layouts beat airy ones. Trust the user to read.
- **Sharp, not soft.** Small radii. Hairline borders. No drop shadows on flat surfaces.
- **Motion is feedback, not flair.** ~150ms, ease-out, on state changes only. Never animate to impress.
- **One accent.** Indigo. Used for primary actions, focus, and active state. Nowhere else.

## Color

Pure-black base. All non-black surfaces are white at low opacity so they read as "elevation" rather than as separate grays — this keeps the palette coherent regardless of background.

Token names match the Tailwind utility they generate (e.g. `surface` → `bg-surface`, `muted-foreground` → `text-muted-foreground`).

| Token                | Value                       | Use                                       |
| -------------------- | --------------------------- | ----------------------------------------- |
| `background`         | `#000000`                   | Page background. Always.                  |
| `surface`            | `rgba(255,255,255,0.03)`    | Cards, panels, sidebars.                  |
| `surface-hover`      | `rgba(255,255,255,0.06)`    | Hover state on any surface.               |
| `surface-active`     | `rgba(255,255,255,0.09)`    | Pressed / selected.                       |
| `border`             | `rgba(255,255,255,0.08)`    | Default divider, input border.            |
| `border-strong`      | `rgba(255,255,255,0.14)`    | Focus, emphasis.                          |
| `foreground`         | `#F7F8F8`                   | Primary text. Not pure white — too harsh. |
| `muted-foreground`   | `rgba(247,248,248,0.62)`    | Labels, metadata.                         |
| `subtle-foreground`  | `rgba(247,248,248,0.40)`    | Disabled, placeholder, captions.          |
| `accent`             | `#5E6AD2`                   | Primary buttons, focus ring, links.       |
| `accent-hover`       | `#6E79D6`                   | Hover state on accent.                    |
| `accent-foreground`  | `#FFFFFF`                   | Text/icons on top of `accent`.            |
| `danger`             | `#EB5757`                   | Destructive only. Never decorative.       |
| `success`            | `#4CB782`                   | Confirmation only.                        |

Never use mid-grays (`#333`, `#666`). Use white-at-opacity so transparency layers correctly over any future surface.

## Typography

Geist Sans is already wired in `app/layout.tsx` — keep it. It reads close enough to Linear's Inter Display.

- **Family:** `--font-geist-sans` for everything. `--font-geist-mono` for code, IDs, file paths.
- **Tracking:** tight. `-0.01em` body, `-0.02em` headings ≥ 20px, `-0.03em` for display.
- **Weights:** 400 body, 500 UI labels and buttons, 600 headings. Never 700+.
- **Line height:** 1.5 for prose, 1.25 for headings, 1.0 for single-line UI.

Type scale (px):

| Role          | Size | Weight | Tracking |
| ------------- | ---- | ------ | -------- |
| Display       | 48   | 600    | -0.03em  |
| H1            | 32   | 600    | -0.02em  |
| H2            | 24   | 600    | -0.02em  |
| H3            | 18   | 600    | -0.01em  |
| Body          | 14   | 400    | -0.01em  |
| Body small    | 13   | 400    | -0.01em  |
| UI label      | 13   | 500    | -0.01em  |
| Caption       | 12   | 400    | 0        |

Default body is 14px, not 16px. This is the density signal.

## Spacing & layout

4px base unit. Use multiples: 4, 8, 12, 16, 20, 24, 32, 48, 64. Skip 6 and 10.

- **Inline padding (buttons, inputs):** 12px horizontal, 6–8px vertical.
- **Card padding:** 16px.
- **Section gap:** 24px or 32px.
- **Max content width:** 720px for prose, 1200px for app shells. Don't stretch full-bleed unless intentional.
- **Sidebar width:** 240px fixed. Doesn't resize.

Density target: a typical row is 28–32px tall, not 44px+. This isn't a touch-first product.

## Components

### Buttons

- **Primary:** `bg-accent text-accent-foreground`, 6px radius, 32px height, 12px padding.
- **Secondary:** `bg-surface text-foreground border`, same dimensions.
- **Ghost:** transparent, `text-muted-foreground`, hover to `bg-surface-hover`.
- **Destructive:** same as primary but `accent` → `danger`. Confirm before firing.
- All buttons: 150ms ease-out on `background` and `border-color`. Never animate transforms on click — too fidgety.

### Inputs

- 32px height, 6px radius, `bg-surface`, 1px `border`, 12px padding.
- Focus: border-color → `accent`, no glow, no ring expansion. Just the color swap.
- Placeholder: `text-subtle-foreground`. No floating labels.

### Cards / panels

- `bg-surface border`, 8px radius. No shadow.
- Hover (if interactive): `bg-surface-hover`. Don't scale, don't lift.

### Modals

- `bg-[#0A0A0A]` (slightly lifted off pure black so the backdrop has contrast), 1px `border-strong`, 12px radius.
- Backdrop: `bg-black/60` with 4px backdrop-blur.
- Width: 480px default, 640px for forms. Never full-screen on desktop.

### Navigation

- Sidebar `bg-background`, items 28px tall, 8px padding, 4px radius.
- Active item: `bg-surface-active text-foreground`. Inactive: `text-muted-foreground`.
- Icon left, label right, 8px gap.

### Tables / lists

- Row height 32px. Hairline `border` between rows, never above the first or below the last.
- Hover row: `bg-surface-hover`.
- Selected row: `bg-surface-active` with a 2px `accent` left bar (no full background tint).

## Motion

- **Duration:** 120ms for micro (hover, focus), 180ms for state (open, close), 240ms only for layout shifts.
- **Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` for entrances, `cubic-bezier(0.4, 0, 1, 1)` for exits. Default `ease-out` is fine for hover.
- **What to animate:** color, opacity, transform (translate / scale). Never animate `width`, `height`, `top`, `left` — use transform.
- **What not to animate:** page loads, list renders, anything triggered without a user action.

Reduced-motion: respect `prefers-reduced-motion: reduce` — drop all transitions to 0ms, keep state changes instant.

## Iconography

- **Style:** outline, 1.5px stroke, square caps, rounded joins.
- **Size:** 16px in UI rows, 14px inside buttons, 20px in nav and empty states.
- **Color:** inherits `currentColor`. Default to `text-muted-foreground`, brighten to `text-foreground` on hover or active.
- **Source:** [Lucide](https://lucide.dev) — matches the weight and style. Don't mix icon sets.

Never use filled or duotone icons. Never use emoji as UI.

## Implementation notes

Tokens live in `app/globals.css` as CSS custom properties on `:root`, exposed to Tailwind via `@theme inline`. Token names match their Tailwind utility (e.g. `--color-surface` → `bg-surface`). Use the utilities — do not inline hex values in components.

The site is locked to dark by design — there is no `prefers-color-scheme` branch and no light mode. The default `border-color` is pinned to `var(--border)` in the base layer, so a bare `border` class on any element renders the right hairline without specifying a color.

Body sets the 14px / 1.5 / `-0.01em` baseline; only override per the type scale.

## When in doubt

Look at how Linear renders the same primitive. If Linear wouldn't ship it, neither do we.

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
