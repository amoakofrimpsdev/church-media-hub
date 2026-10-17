# Design system

The look of RCW Media follows the **RCW LA Media logo**: royal blue, white and
silver. The app is light and bright by default, so the church's photos are the
most colourful thing on screen, with a deep-navy dark mode for anyone who
prefers it (Light, Dark or Auto under the profile menu, remembered per device).

The structure (pill buttons, cards that look like what they are, one accent
colour, photos first) is adapted from the **Spotify** entry in
[awesome-design-md](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/spotify).
The first two versions of the app used a light Airbnb-style design and then a
dark charcoal one; see DECISIONS.md for why each was replaced.

The tokens live in [`app/globals.css`](../app/globals.css) inside `@theme`, which
turns each one into a Tailwind utility. Dark mode redefines the same variables
under `html[data-theme="dark"]`, so a screen built from the utilities works in
both without extra classes. Do not use raw hex values or Tailwind's default
colour palette (`zinc-500`, `blue-600` and so on).

The logo is `public/brand/logo.jpg`, shown through `components/ui/logo.tsx`
(cropped to its circle). `app/icon.jpg` and `app/apple-icon.jpg` are the
browser and home-screen icons.

## Principles

1. **Photos are the colour.** Surfaces are white and pale blue-grey. Wherever a
   screen can show real photos (a service's cover, recent uploads), it does.
2. **One accent.** Royal blue marks the main action on a screen, the active
   navigation item, and data in charts.
3. **One brand banner per screen at most.** The `theme-brand` class turns a
   section royal blue with white text (the home page's main card, the sign-in
   panel). Everything inside restyles itself because it reads the same tokens.
4. **Fewest taps.** The thing someone most likely came to do is on the first
   screen, as a button, not behind a card that leads to another page.
5. **Alive, not busy.** Things rise in when a page opens, numbers count up,
   buttons press in, cards respond to hover. All of it stops for people who ask
   their device for reduced motion.
6. **Phone first.** Design at 375px wide, then add columns. Anything tappable is
   at least 44px tall, and primary actions 48px.

## Colour

Values are light mode / dark mode.

### Surfaces

| Utility | Value | Use |
|---|---|---|
| `canvas` | `#f3f6fb` / `#0a1022` | The page, the sidebar |
| `surface` | `#ffffff` / `#111a33` | Cards and panels (with `shadow-card`) |
| `surface-soft` | `#eef2f9` / `#18223f` | Rows inside a card, inputs |
| `surface-strong` | `#e1e7f2` / `#212d50` | Active nav item, neutral badges, chart tracks |
| `surface-hover` | `#d5ddeb` / `#2a385f` | Hover on the step above |

### Text and lines

| Utility | Value | Use |
|---|---|---|
| `ink` | `#0b1530` / `#ffffff` | Headings, primary text (deep navy, not black) |
| `ink-soft` | `#2c3856` / `#d6ddef` | Body paragraphs |
| `muted` | `#5a6582` / `#9ba7c5` | Secondary text, metadata |
| `muted-soft` | `#8691aa` / `#6c7999` | Placeholders, axis labels, inactive tabs |
| `hairline` | `#dde3ee` / `#25325a` | Dividers, gridlines, input borders (cool silver) |
| `hairline-soft` | `#e9edf5` / `#1b2546` | The faintest dividers |
| `border-strong` | `#b3bdd0` / `#44527c` | Outlined buttons |

### Accent

| Utility | Value | Use |
|---|---|---|
| `primary` | `#1d4ed8` / `#6b97ff` | Main action, active nav icon, chart marks |
| `primary-active` | `#1a3fb0` / `#8cafff` | Hover and pressed |
| `primary-soft` | 10% / 18% blue | Accent badges, soft washes |
| `on-primary` | `#ffffff` / `#061233` | Text on a blue button |

### Status

Status is never shown by colour alone: always pair it with a word or icon.

| Meaning | Text | Background | Used for |
|---|---|---|---|
| Good | `success` | `success-soft` | Delivered, uploaded, connected |
| Waiting | `warning` | `warning-soft` | Pending, due soon, still to upload |
| Problem | `danger` | `danger-soft` | Late, failed upload, expired connection |

## Type

Figtree. Bold or regular, little in between: hierarchy comes from weight.

| Utility | Size / weight | Use |
|---|---|---|
| `text-hero` | 40px / 800 | The home greeting, the sign-in headline |
| `text-display` | 30px / 800 | Page titles, big numbers in stat tiles |
| `text-title-lg` | 22px / 700 | Section headings |
| `text-title` | 16px / 700 | Card titles |
| `text-body` | 16px / 400 | Paragraphs, inputs |
| `text-body-sm` | 14px / 400 | Most interface text, buttons (bold) |
| `text-caption` | 13px / 400 | Metadata, footnotes |
| `text-label` | 11px / 700, uppercase, wide | Small section labels ("ADMIN", "UP NEXT") |
| `text-badge` | 11px / 700 | Badges |

## Shape, depth and motion

- **Pills for anything you press** (`rounded-full`): buttons, badges, filter chips.
- **Soft corners for anything you read:** `rounded-md` 10px (rows, inputs, photos),
  `rounded-lg` 16px (cards), `rounded-xl` 24px (the hero card, sheets).
- **Soft, navy-tinted shadows:** `shadow-card` lifts white cards off the pale
  page; `shadow-float` is for sheets, menus and the brand banner.
- **Motion utilities:** `animate-rise` (enter from below), `animate-grow-x` /
  `animate-grow-y` (bars and columns), and the `stagger` class on a container to
  bring its children in one after another.

## Layout

| Breakpoint | Width | Navigation | Columns |
|---|---|---|---|
| default | under 744px | Top bar and bottom tab bar | 1 (2 for stat tiles) |
| `tablet:` | 744px and up | Same | 2 |
| `desktop:` | 1100px and up | Sidebar | 3 or 4 |

Content is capped at 1200px. On desktop every section, including each admin
page, is one click away in the sidebar. On phones the four main sections are in
the tab bar and the rest are in the "More" sheet.

## Components

- **`components/ui`**: `Button` (primary, secondary, ghost, danger; pill shaped),
  `Badge`, `Card`, `Input`, `Select`, `Avatar` and `AvatarStack` (initials on a
  pastel tint that is always the same for a person), `ProgressRing`,
  `ActionButton`, `Logo`, `ThemeToggle`.
- **`components/ui/modal.tsx`**: `Modal`, a button that opens a panel (a bottom
  sheet on phones, a dialog on larger screens).
- **`components/admin`**: the admin screens. Each kind of thing is a card that
  looks like what it is (a folder for a category, a calendar tile for a weekly
  service) in a grid, ending with a dashed "new" tile. Tapping a card opens its
  controls in a panel.
- **`components/shell`**: `AppShell`, the frame around every signed-in page.
- **`components/upload`**: `UploadProvider` (the upload sheet, its queue and the
  floating progress pill, available on every page) and `UploadButton`, which
  opens the sheet already pointed at a service or category.
- **`components/services`**, **`components/gallery`**, **`components/dashboard`**:
  one "view" per screen. A view takes plain data and draws it; a loader in
  `lib/` fetches that data. This split is what makes the previews possible.
- **`components/charts`**: `ColumnChart`, `BarList`, `CountUp`.

## Charts

Charts follow a few fixed rules so they read the same everywhere.

- **One hue for "how many".** Columns and bars are blue; the current period is
  full strength and earlier ones are dimmer. Colour is not used to tell
  categories apart, because a label does that better.
- **Thin marks.** Columns are at most 24px wide, rounded at the top and square on
  the baseline. Bars are thin lines on a darker track.
- **Numbers are written out.** Every bar has its value beside it. The column
  chart shows a value on hover, focus or tap, and has the same data as a table
  for screen readers.
- **Text is never the data colour.** Labels and values use the text tokens.
- **Status colours mean status.** Green, amber and red appear only where the
  thing shown is good, waiting or a problem, such as the on-time meter.

## Previewing screens

`/preview/<screen>` renders a real screen with sample data, with no sign-in and
no database. Screens: `dashboard`, `dashboard-empty`, `dashboard-member`,
`dashboard-viewer`, `service`, `services`, `album`, `gallery`, `upload` (the
upload sheet open), `categories`, `category-open`, `teams`, `people`,
`schedule`, `shares`, `share` (what a visitor sees on a share link),
`share-unavailable`, `login` and `login-error`. They exist only in local development
(`npm run dev`); on a deployed build they are a 404.

```bash
node tests/tools/screenshot.mjs http://localhost:3000 ./shots dashboard login
```

takes phone and desktop screenshots of them. Add `--dark` for dark mode.
