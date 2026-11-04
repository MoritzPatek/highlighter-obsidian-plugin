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
import { blockStateAfter, type BlockState } from './runs';

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
	/** All changes and the new caret in ONE undo step (Obsidian's Editor.transaction). */
	transaction(tx: { changes?: { from: Pos; to?: Pos; text: string }[]; selection?: { from: Pos; to?: Pos } }): void;
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
	/** What the lines above the selection say about indented code and list items. */
	block: BlockState | null;
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
		block: blockStateAbove(editor, a.line),
	};
}

/** Block state (indented code / list context) at the start of `line`, from the lines above it. */
function blockStateAbove(editor: EditorLike, line: number): BlockState {
	const above: string[] = [];
	for (let i = 0; i < line; i++) above.push(editor.getLine(i));
	return blockStateAfter(above, documentFrontmatterEnd(editor));
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
	return ctx.from === ctx.to || highlightPieces(ctx.text, ctx.from, ctx.to, ctx.fence, ctx.frontLines, ctx.block).length > 0;
}

export function getState(ctx: SelectionContext): HighlightState {
	return getHighlightState(ctx.text, ctx.from, ctx.to, ctx.fence);
}

/**
 * Replace the edited range and put the caret after it, as ONE edit (one undo step).
 *
 * Live Preview shows the raw `<mark ...>` source while the caret touches the element
 * (measured in Obsidian 1.15: caret at either end or inside reveals it, one character past
 * `</mark>` renders it). So after highlighting, the caret goes one character past the
 * closing tag, or to the start of the next line when the highlight ends the line.
 *
 * When there is no such place (the caret would end up at the very end of the note, or in a
 * table row), a single "\n" is appended to the note in the same edit and the caret goes on
 * that new empty line, so the highlight renders at once. One undo removes both.
 */
export function applyEdit(
	editor: EditorLike,
	ctx: SelectionContext,
	edit: TextEdit | null,
	mode: 'highlight' | 'remove' = 'highlight',
): void {
	if (!edit) return;
	const at = (offset: number) => editor.offsetToPos(ctx.base + offset);
	const firstLine = at(0).line;
	const oldLines = ctx.text.split('\n');
	const newText = ctx.text.slice(0, edit.from) + edit.insert + ctx.text.slice(edit.to);
	const newLines = newText.split('\n');
	const lastTouched = firstLine + oldLines.length - 1;
	// the edit reaches the end of the note, or only the final empty line (a trailing newline) follows it
	const isLastOfNote =
		lastTouched === editor.lineCount() - 1 ||
		(lastTouched === editor.lineCount() - 2 && editor.getLine(editor.lineCount() - 1) === '');
	/** Line `i` of the note after the edit (the edit does not change the number of lines it touches... but be safe). */
	const lineAfter = (i: number) =>
		i < firstLine
			? editor.getLine(i)
			: i - firstLine < newLines.length
				? (newLines[i - firstLine] as string)
				: editor.getLine(i - (newLines.length - oldLines.length));
	const lineCountAfter = editor.lineCount() + (newLines.length - oldLines.length);
	/** Position in the new text for an offset within `newText`. */
	const posIn = (off: number): Pos => {
		const before = newText.slice(0, off).split('\n');
		return { line: firstLine + before.length - 1, ch: (before[before.length - 1] as string).length };
	};

	let caret: Pos;
	let appendNewline = false;
	if (mode === 'highlight') {
		let end = edit.selTo;
		const closing = '</mark>';
		const idx = edit.insert.indexOf(closing, Math.max(0, edit.selTo - edit.from));
		if (idx >= 0) {
			end = edit.from + idx + closing.length;
			const here = posIn(end);
			const rest = lineAfter(here.line).slice(here.ch);
			// Skip highlights / formatting that touch the new mark: a caret next to them reveals their markup.
			let skipped = 0;
			for (let n = neighborLength(rest); n > 0 && skipped < rest.length; n = neighborLength(rest.slice(skipped))) {
				skipped += n;
			}
			end += skipped;
			const step = firstCharLength(rest.slice(skipped));
			if (step > 0) end += step; // one whole character (code point plus combining marks)
			else if (here.line + 1 < lineCountAfter) end += 1; // the newline: start of next line
		}
		// past the end of the touched text means the start of the next line
		caret = end > newText.length ? { line: firstLine + newLines.length, ch: 0 } : posIn(end);
		// A caret inside a table row makes Live Preview open that cell's editor, which shows the raw
		// <mark> source until you click away. Park the caret after the table instead.
		if (isTableLine(lineAfter(caret.line))) {
			let line = caret.line;
			while (line + 1 < lineCountAfter && isTableLine(lineAfter(line + 1))) line++;
			caret = line + 1 < lineCountAfter ? { line: line + 1, ch: 0 } : { line, ch: lineAfter(line).length };
		}
		// Nowhere to put the caret that is clear of the mark: add one empty line at the end of the note.
		const lastLine = lineCountAfter - 1;
		if (isLastOfNote && caret.ch >= lineAfter(caret.line).length) {
			if (caret.line === lastLine && lineAfter(lastLine) !== '') appendNewline = true;
			// the note already ends with a newline: just use that last empty line
			else if (caret.line === lastLine - 1 && lineAfter(lastLine) === '') caret = { line: lastLine, ch: 0 };
		}
	} else {
		caret = posIn(Math.min(edit.selTo, newText.length));
	}

	const changes = [{ from: at(edit.from), to: at(edit.to), text: edit.insert }];
	if (appendNewline) {
		const docEnd = editor.offsetToPos(editor.posToOffset({ line: editor.lineCount() - 1, ch: editor.getLine(editor.lineCount() - 1).length }));
		const change = changes[0] as { text: string; to: Pos };
		if (edit.to === ctx.text.length) change.text += '\n'; // the edit reaches the end of the note: one change
		else changes.push({ from: docEnd, to: docEnd, text: '\n' });
		caret = { line: lineCountAfter, ch: 0 };
	}
	editor.transaction({ changes, selection: { from: caret } });
}

const isTableLine = (line: string) => /^[ \t]*(?:>[ \t]*)*\|/.test(line);

/**
 * Highlight the current selection. 'nothing' when it holds no plain text to paint
 * (only code, math, links, properties, ...).
 */
export function highlightSelection(editor: EditorLike, color: string): 'ok' | 'nothing' {
	const ctx = getSelectionContext(editor);
	if (!canPaint(ctx)) return 'nothing';
	applyEdit(editor, ctx, applyHighlight(ctx.text, ctx.from, ctx.to, color, ctx.fence, ctx.frontLines, ctx.block));
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
