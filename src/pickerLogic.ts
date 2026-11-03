/**
 * Pure helpers for the color popover: focus navigation and positioning.
 * No DOM or Obsidian imports so they can be unit tested.
 */

export type Move = 'next' | 'prev' | 'first' | 'last';

/** Move the focus within `count` items. next/prev wrap around. */
export function moveIndex(current: number, count: number, move: Move): number {
	if (count <= 0) return 0;
	switch (move) {
		case 'next':
			return (current + 1) % count;
		case 'prev':
			return (current - 1 + count) % count;
		case 'first':
			return 0;
		case 'last':
			return count - 1;
	}
}

/** "1".."9" -> 0-based index when a color with that number exists, else -1. */
export function digitToIndex(key: string, colorCount: number): number {
	if (!/^[1-9]$/.test(key)) return -1;
	const n = Number(key);
	return n <= colorCount ? n - 1 : -1;
}

/** Clamp the initial focus into range (the saved last-used index may be stale). */
export function clampIndex(index: number, count: number): number {
	if (count <= 0) return 0;
	return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

/** Rectangle in viewport coordinates. */
export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface PositionInput {
	/** Start of the selection (top-left) and bottom of its last line; null when unknown. */
	anchor: { left: number; top: number; bottom: number } | null;
	/** The editor's bounding box, used for the fallback. */
	editor: Rect;
	popup: { width: number; height: number };
	viewport: { width: number; height: number };
	/** Gap between selection and popup (8) and minimum distance from the viewport edge (8). */
	gap?: number;
	margin?: number;
}

/**
 * Where to put the popover (viewport coordinates, for position: fixed).
 * Below the selection, flipped above when it would overflow the bottom,
 * clamped horizontally. Without an anchor: horizontally centered in the
 * editor, a third of the way down.
 */
export function computePopoverPosition(input: PositionInput): { left: number; top: number } {
	const gap = input.gap ?? 8;
	const margin = input.margin ?? 8;
	const { popup, viewport, anchor, editor } = input;

	let left: number;
	let top: number;
	if (anchor) {
		left = anchor.left;
		top = anchor.bottom + gap;
		if (top + popup.height > viewport.height - margin) {
			top = anchor.top - gap - popup.height;
		}
	} else {
		left = (editor.left + editor.right) / 2 - popup.width / 2;
		top = editor.top + (editor.bottom - editor.top) / 3;
	}

	const maxLeft = viewport.width - popup.width - margin;
	left = Math.max(margin, Math.min(left, maxLeft));
	const maxTop = viewport.height - popup.height - margin;
	top = Math.max(margin, Math.min(top, maxTop));
	return { left, top };
}
