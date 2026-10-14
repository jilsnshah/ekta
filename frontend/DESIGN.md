# Ekta — design system

Ekta means *unity*. The product unites three people around one consignment:
the control room that plans it, the customer who books it, and the driver who
moves it. The design language follows from that: one calm, exact system, with
colour reserved for the state of the freight.

## What the audit found

Measured on every page at 1440px and 390px before the redesign.

**Identity.** Default-blue buttons, a grey canvas, a letter "F" in a square and
the old FleetOps name. Nothing about it was ownable.

**Hierarchy.** Every surface was the same white card with the same hairline,
so a KPI, a filter bar and a data table all carried equal weight. Uppercase
grey labels sat on every figure and column, which is what made screens read as
spreadsheets.

**Density in the wrong places.** The orders table overflowed a 1440px screen,
with pickup dates wrapping onto four lines. The trucks filter stacked three
full-width controls. Status filters wrapped onto four rows on a phone.

**Phones.** Control-room tables scrolled sideways inside cards. The app
scrolled inside a fixed-height `<main>`, so the address bar never collapsed
and the assignment board nested two scrolling panes in a scrolling page.
Assigning by drag and drop could not be done on a touchscreen at all, because
HTML5 drag events never fire from touch.

**Small mistakes that cost trust.** "3 trucks delayed — on schedule". "2
order(s)". Buttons and sort selects that looked identical.

## Direction

**Ink and signal.** A deep navy *night* carries the brand: the sidebar, the
sign-in panels and the logo. Content sits on white. One indigo *signal* marks
what you can act on — primary buttons, links, selection, focus — and nothing
else. Status colours are the only other hues in the product, so a red badge is
always news.

**Quiet structure, loud facts.** Labels are small, sentence-case and dim.
Figures are large, tabular and dark. Surfaces separate by soft elevation, not
by boxes inside boxes.

**Same intent, native form.** Each screen keeps its job across sizes but
changes shape: tables become cards, dialogs become bottom sheets, the sidebar
becomes a tab bar, drag becomes tap.

## Tokens

All defined in `src/index.css` under `@theme`. Utilities are generated from
the names, so `bg-night`, `text-ink-soft` and `bg-st-delayed/10` all exist.

| Token | Use |
| --- | --- |
| `night`, `night-raised`, `night-line`, `on-night`, `on-night-dim` | Brand surfaces |
| `canvas` | Page background |
| `surface-1/2/3` | Cards, subtle fills, tracks and pressed states |
| `line`, `line-strong` | Hairlines and dividers |
| `ink`, `ink-soft`, `ink-dim` | Primary, secondary, tertiary text |
| `brand`, `brand-hover`, `brand-tint`, `brand-soft` | The signal colour |
| `st-*` | Status hues — never decoration |

**Type.** Geist for interface text, Geist Mono for anything a person reads
character by character: order codes, registrations, phone numbers. Page titles
24px, panel titles 16px, body 15px, metadata 13px. Headings track tight.

**Shape.** Radii of 8px (controls), 12px (cards) and 16px (sheets). Three
shadows: `card` (resting), `raised` (popovers, sticky bars), `overlay`
(dialogs).

**Motion.** 150–220ms, ease-out, and only to explain a change: a sheet rises,
a toast slides in, a selected card lifts. Reduced-motion is respected.

## Patterns

- **Status** is a pill: dot, label, soft tint, no border.
- **Filters** are one horizontally scrolling row of chips with true counts.
- **Lists** render as a table from `md` up and as cards below, from the same
  rows (`ResponsiveList`).
- **Dialogs** are centred on a desk and rise from the bottom on a phone
  (`Modal`).
- **Primary action** sits top-right on a desk and in a sticky bottom bar on a
  phone, within thumb reach.
- **Assignment** works by tap everywhere and by drag where there is a mouse:
  select orders, every truck shows at once whether the selection fits, tap
  one, review the load plan, assign.

## Rules

1. Colour means state. If it is not a status or an action, it is ink.
2. No uppercase labels.
3. Never "order(s)". Count properly.
4. Every number that can be compared is tabular.
5. Touch targets are 44px below `sm`.
6. A page never scrolls sideways. Tables scroll inside themselves, and only
   from `md` up.
