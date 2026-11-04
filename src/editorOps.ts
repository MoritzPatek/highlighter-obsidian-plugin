/**
 * Editor-facing glue between the pure highlight logic and an Obsidian Editor.
 * Depends only on the small `EditorLike` interface, so it can be tested with a
 * fake editor backed by a string.
 */
import {
	applyHighlight,
	endsInsideFence,
	getHighlightState,
	findHighlights,
	highlightRange,
	removeHighlight,
	highlightPieces,
	type Fence,
	type HighlightState,
	type TextEdit,
} from './highlight';
import { firstCharLength } from './pickerLogic';
import { neighborLength } from './highlight';
import { frontmatterEnd, frontmatterLinesIn } from './blocks';

export interface Pos {
	line: number;
	ch: number;
}

/** The subset of Obsidian's Editor that we use. */
export interface EditorLike {
	getCursor(which?: 'from' | 'to' | 'head' | 'anchor'): Pos;
	getLine(line: number): string;
	getRange(from: Pos, to: Pos): string;
	posToOffset(pos: Pos): number;
	offsetToPos(offset: number): Pos;
	replaceRange(text: string, from: Pos, to?: Pos): void;
	setCursor(pos: Pos): void;
	setSelection(anchor: Pos, head?: Pos): void;
	lineCount(): number;
}

/** The text of the lines touched by the selection, and the selection inside it. */
export interface SelectionContext {
	/** Document offset of the start of the first touched line. */
	base: number;
	text: string;
	from: number;
	to: number;
	/** The selection starts inside a fenced block (code or math) opened above. */
	fence: Fence | null;
	/** Number of leading lines of `text` that are properties (frontmatter). */
	frontLines: number;
}

/**
 * Only the primary selection is handled; with several cursors the others
 * are ignored.
 */
export function getSelectionContext(editor: EditorLike): SelectionContext {
	const a = editor.getCursor('from');
	const b = editor.getCursor('to');
	const startPos = { line: a.line, ch: 0 };
	const endPos = { line: b.line, ch: editor.getLine(b.line).length };
	const base = editor.posToOffset(startPos);
	return {
		base,
		text: editor.getRange(startPos, endPos),
		from: editor.posToOffset(a) - base,
		to: editor.posToOffset(b) - base,
		fence: endsInsideFence(editor.getRange({ line: 0, ch: 0 }, startPos)),
		frontLines: frontmatterLinesIn(a.line, documentFrontmatterEnd(editor)),
	};
}

/** Last line of the note's properties block, or -1. Only the top of the note is read. */
function documentFrontmatterEnd(editor: EditorLike): number {
	if (editor.getLine(0).trimEnd() !== '---') return -1;
	const lines = ['---'];
	for (let i = 1; i < Math.min(editor.lineCount(), 400); i++) {
		lines.push(editor.getLine(i));
		if (frontmatterEnd(lines) >= 0) return i;
	}
	return -1;
}

/** True when the selection contains plain text a highlight can be painted on (a caret always can). */
export function canPaint(ctx: SelectionContext): boolean {
	return ctx.from === ctx.to || highlightPieces(ctx.text, ctx.from, ctx.to, ctx.fence, ctx.frontLines).length > 0;
}

export function getState(ctx: SelectionContext): HighlightState {
	return getHighlightState(ctx.text, ctx.from, ctx.to, ctx.fence);
}

/**
 * Replace the edited range and put the caret after it.
 *
 * Live Preview shows the raw `<mark …>` source while the caret touches the
 * element (measured in Obsidian 1.15: caret at either end or inside reveals it,
 * one character past `</mark>` renders it). So after highlighting, the caret
 * goes one character past the closing tag, or to the start of the next line
 * when the highlight ends the line.
 */
export function applyEdit(
	editor: EditorLike,
	ctx: SelectionContext,
	edit: TextEdit | null,
	mode: 'highlight' | 'remove' = 'highlight',
): void {
	if (!edit) return;
	const at = (offset: number) => editor.offsetToPos(ctx.base + offset);
	editor.replaceRange(edit.insert, at(edit.from), at(edit.to));
	let end = edit.selTo;
	if (mode === 'highlight') {
		const closing = '</mark>';
		const idx = edit.insert.indexOf(closing, Math.max(0, edit.selTo - edit.from));
		if (idx >= 0) {
			end = edit.from + idx + closing.length;
			const pos = at(end);
			const rest = editor.getLine(pos.line).slice(pos.ch);
			// Skip highlights / formatting that touch the new mark: a caret next to them reveals their markup.
			let skipped = 0;
			for (let n = neighborLength(rest); n > 0 && skipped < rest.length; n = neighborLength(rest.slice(skipped))) {
				skipped += n;
			}
			end += skipped;
			const step = firstCharLength(rest.slice(skipped));
			if (step > 0) end += step; // one whole character (code point plus combining marks)
			else if (pos.line + 1 < editor.lineCount()) end += 1; // the newline: start of next line
			// else: end of the note, the caret stays next to the markup and Live Preview shows the source
		}
	}
	// A caret inside a table row makes Live Preview open that cell's editor, which shows the raw
	// <mark> source until you click away. Park the caret after the table instead.
	const target = at(end);
	if (mode === 'highlight' && isTableLine(editor.getLine(target.line))) {
		let line = target.line;
		while (line + 1 < editor.lineCount() && isTableLine(editor.getLine(line + 1))) line++;
		if (line + 1 < editor.lineCount()) {
			editor.setCursor({ line: line + 1, ch: 0 });
			return;
		}
		editor.setCursor({ line, ch: editor.getLine(line).length });
		return;
	}
	editor.setCursor(target);
}

const isTableLine = (line: string) => /^[ \t]*(?:>[ \t]*)*\|/.test(line);

/**
 * Highlight the current selection. 'nothing' when it holds no plain text to paint
 * (only code, math, links, properties, ...).
 */
export function highlightSelection(editor: EditorLike, color: string): 'ok' | 'nothing' {
	const ctx = getSelectionContext(editor);
	if (!canPaint(ctx)) return 'nothing';
	applyEdit(editor, ctx, applyHighlight(ctx.text, ctx.from, ctx.to, color, ctx.fence, ctx.frontLines));
	return 'ok';
}

/** Remove highlights touched by the current selection (an eraser for a partial selection). */
export function removeSelectionHighlight(editor: EditorLike): 'ok' {
	const ctx = getSelectionContext(editor);
	applyEdit(editor, ctx, removeHighlight(ctx.text, ctx.from, ctx.to, ctx.fence), 'remove');
	return 'ok';
}

/** The selection as the user saw it when the picker opened (absolute document offsets). */
export interface SelectionSnapshot {
	from: number;
	to: number;
	/** The selected text, to check the document did not change underneath. */
	text: string;
}

export function captureSelection(editor: EditorLike): SelectionSnapshot {
	const from = editor.posToOffset(editor.getCursor('from'));
	const to = editor.posToOffset(editor.getCursor('to'));
	return { from, to, text: editor.getRange(editor.offsetToPos(from), editor.offsetToPos(to)) };
}

/**
 * Make the selection the one the user saw when choosing, if something moved it
 * while the picker was open (focus changes, re-renders) and the text there is
 * unchanged. Returns true when the selection was restored.
 */
export function restoreSelection(editor: EditorLike, snap: SelectionSnapshot): boolean {
	const live = captureSelection(editor);
	if (live.from === snap.from && live.to === snap.to) return false;
	const at = editor.getRange(editor.offsetToPos(snap.from), editor.offsetToPos(snap.to));
	if (at !== snap.text) return false;
	editor.setSelection(editor.offsetToPos(snap.from), editor.offsetToPos(snap.to));
	return true;
}

/**
 * Make the visible selection equal to what a highlight will really cover (whole
 * native/mark spans and formatting runs the selection cuts into), so the user
 * sees the true target before choosing. Returns true when the selection grew.
 */
export function expandSelectionToTarget(editor: EditorLike): boolean {
	const ctx = getSelectionContext(editor);
	if (ctx.from === ctx.to) return false;
	const [s, e] = highlightRange(ctx.text, ctx.from, ctx.to, ctx.fence);
	if (s === ctx.from && e === ctx.to) return false;
	editor.setSelection(editor.offsetToPos(ctx.base + s), editor.offsetToPos(ctx.base + e));
	return true;
}

/**
 * The palette color of the highlight the selection or caret is in: the index of
 * the color when it is inside exactly ONE existing highlight whose color is a
 * palette color, otherwise -1 (plain text, several highlights, natives, colors
 * that are not in the palette).
 */
export function pickerCurrentIndex(ctx: SelectionContext, colors: readonly { color: string }[]): number {
	const norm = (c: string) => c.replace(/\s/g, '').toUpperCase();
	const touched = findHighlights(ctx.text, ctx.fence).filter((sp) =>
		ctx.from === ctx.to
			? sp.start <= ctx.from && ctx.from <= sp.end
			: sp.start < ctx.to && sp.end > ctx.from,
	);
	const only = touched.length === 1 ? touched[0] : undefined;
	if (only && only.color && ctx.from >= only.start && ctx.to <= only.end) {
		return colors.findIndex((c) => norm(c.color) === norm(only.color as string));
	}
	return -1;
}

/** Which palette color the picker focuses first: the current color of the highlight, else the last-used one. */
export function pickerFocusIndex(
	ctx: SelectionContext,
	colors: readonly { color: string }[],
	lastUsedIndex: number,
): number {
	const i = pickerCurrentIndex(ctx, colors);
	return i >= 0 ? i : lastUsedIndex;
}
