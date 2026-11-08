/**
 * Where a popover anchored to a card goes.
 *
 * Both the card menu and the attack picker hang from a card that may sit
 * anywhere — the hand fan runs along the bottom of a phone, a permanent can be
 * under the last row of the battlefield. Placing them with one fixed rule
 * (`top: anchor.bottom`) put the menu off-screen in the case that matters most:
 * measured at 1440×900, the picker of a creature in the lower half opened at
 * y = 890 in a 900 px viewport and only its title row was visible.
 *
 * The rules, in order: below the anchor when the whole box fits; above it when
 * it does not; overlaying the anchor when neither side has room (a short
 * landscape phone) — never smaller than the 8 px safe margin, so the popover is
 * always reachable and scrollable by the page.
 *
 * Pure arithmetic, no DOM: the caller measures and passes the four numbers.
 */

export type AnchorRect = { left: number; right: number; top: number; bottom: number };
export type Size = { width: number; height: number };
export type Placement = { top: number; left: number };

const MARGIN = 8;
/** Distance between the card edge and the popover. */
const GAP = 6;

export function placePopover(
  anchor: AnchorRect,
  size: Size,
  viewport: Size,
  gap: number = GAP
): Placement {
  const maxLeft = Math.max(MARGIN, viewport.width - size.width - MARGIN);
  const rightAligned = anchor.right - size.width;
  const left = Math.min(Math.max(MARGIN, rightAligned), maxLeft);

  const below = anchor.bottom + gap;
  const above = anchor.top - size.height - gap;
  const limit = viewport.height - size.height - MARGIN;

  let top: number;
  if (below <= limit) top = below;
  else if (above >= MARGIN) top = above;
  else top = Math.max(MARGIN, Math.min(below, limit));

  return { top, left };
}
