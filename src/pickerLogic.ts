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

	// The popover stays inside the editor (its scrollbar is not part of `editor`) and the window.
	const minX = Math.max(margin, editor.left + margin);
	const maxX = Math.min(viewport.width, editor.right) - popup.width - margin;
	const minY = margin;
	const maxY = Math.min(viewport.height, Math.max(editor.bottom, anchor ? anchor.bottom : 0)) - popup.height - margin;

	let left: number;
	let top: number;
	if (anchor) {
		left = anchor.left;
		top = anchor.bottom + gap;
		if (top > maxY) {
			top = anchor.top - gap - popup.height;
		}
	} else {
		left = (editor.left + editor.right) / 2 - popup.width / 2;
		top = editor.top + (editor.bottom - editor.top) / 3;
	}

	left = Math.max(minX, Math.min(left, Math.max(minX, maxX)));
	top = Math.max(minY, Math.min(top, Math.max(minY, maxY)));
	return { left, top };
}

export interface AutoShowInput {
	enabled: boolean;
	isMobile: boolean;
	/** PointerEvent.pointerType of the press that started the selection. */
	pointerType: string;
	/** The press started inside an editor (not in the popover or elsewhere). */
	startedInEditor: boolean;
	/** 'source' covers Live Preview and Source mode; 'preview' is Reading view; null is no markdown view. */
	viewMode: 'source' | 'preview' | null;
	selectionCount: number;
	from: number;
	to: number;
	composing: boolean;
	pickerOpen: boolean;
}

/** Should the picker open by itself after a pointer selection? Keyboard selections never reach this. */
export function shouldAutoShow(i: AutoShowInput): boolean {
	if (!i.enabled || i.isMobile || i.composing || i.pickerOpen) return false;
	if (i.pointerType !== 'mouse' && i.pointerType !== 'pen') return false;
	if (!i.startedInEditor || i.viewMode !== 'source') return false;
	if (i.selectionCount !== 1) return false;
	return i.from !== i.to;
}

/**
 * UTF-16 length of the first user-visible character of `rest`: one code point
 * (a surrogate pair counts as one) plus any combining marks after it. 0 for "".
 */
export function firstCharLength(rest: string): number {
	const m = /^(?:[\uD800-\uDBFF][\uDC00-\uDFFF]|[^])\p{M}*/u.exec(rest);
	return m ? m[0].length : 0;
}
