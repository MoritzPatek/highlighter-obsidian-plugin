/**
 * Pure highlight logic. No Obsidian imports, so it can be unit tested in Node.
 *
 * All functions work on a plain string `text` plus a selection range
 * `[from, to)` of character offsets into that string. The editor layer passes
 * the full lines the selection touches (see main.ts), which gives these
 * functions enough surroundings to detect an enclosing highlight.
 *
 * Every mutating function returns a `TextEdit` (or `null` when there is
 * nothing to change). The caller replaces `text[edit.from, edit.to)` with
 * `edit.insert`, then selects `[edit.selFrom, edit.selTo]` (offsets valid in
 * the text after the replacement, because everything before `edit.from` is
 * untouched).
 *
 * Design decisions (also documented in the README):
 *
 * - Output format is `<mark style="background: #RRGGBBAA;">text</mark>`.
 *   The inline style makes it render without the plugin, in Reading view
 *   and in Live Preview.
 * - Recolor, never nest: if the selection touches an existing highlight
 *   (ours, a bare `<mark>`, or a native `==text==`), the selection is
 *   widened to cover that whole highlight, the old markers are stripped and
 *   the combined range is wrapped once in the new color. So selecting part of
 *   a highlighted phrase recolors the whole phrase.
 * - Empty selection: the cursor inside an existing highlight recolors it;
 *   otherwise an empty `<mark ...></mark>` is inserted and the cursor is
 *   placed between the tags so the user can start typing highlighted text.
 * - Multi-line selections are wrapped per line, because an inline HTML tag
 *   that spans a paragraph break does not render. Blank lines are skipped.
 *   Leading list/quote/heading markers (`- `, `1. `, `> `, `# `, `- [ ] `)
 *   stay outside the tags so they keep working. Table rows are wrapped per
 *   cell so the pipes stay outside the tags. Leading and trailing spaces
 *   of each piece stay outside the tags.
 * - Not aware of code blocks or inline code; selecting inside code is the
 *   caller's responsibility.
 */

export interface TextEdit {
	/** Start of the replaced range in the original text. */
	from: number;
	/** End (exclusive) of the replaced range in the original text. */
	to: number;
	/** Replacement text. */
	insert: string;
	/** Suggested selection start, as an offset in the text after the edit. */
	selFrom: number;
	/** Suggested selection end, as an offset in the text after the edit. */
	selTo: number;
}

export type HighlightKind = 'mark' | 'native';

export interface HighlightSpan {
	kind: HighlightKind;
	/** Offset of the opening marker. */
	start: number;
	/** Offset just past the closing marker. */
	end: number;
	/** Offset of the first content character. */
	contentStart: number;
	/** Offset just past the last content character. */
	contentEnd: number;
	/** CSS color of a `<mark>` (as written), or null for native / bare marks. */
	color: string | null;
}

export interface HighlightState {
	/** True when the selection (or cursor) touches any highlight. */
	highlighted: boolean;
	/** Color of the first touched `<mark>` that has one, else null. */
	color: string | null;
	/** Kind of the first touched highlight, else null. */
	kind: HighlightKind | null;
}

const MARK_CLOSE = '</mark>';

/** Build the opening tag for a color. */
export function openTag(color: string): string {
	return `<mark style="background: ${color};">`;
}

/** Wrap text in a mark tag. Does no escaping or line handling. */
export function buildMark(text: string, color: string): string {
	return `${openTag(color)}${text}${MARK_CLOSE}`;
}

function spanRegex(): RegExp {
	// Group 1: color of a <mark>. Group 2: <mark> content. Group 3: native content.
	return new RegExp(
		'<mark(?:\\s+style="\\s*background(?:-color)?\\s*:\\s*([^";<>]*?)\\s*;?\\s*")?\\s*>([\\s\\S]*?)</mark>' +
			'|==(?!=)((?:(?!==)[^\\n])+)==',
		'gi',
	);
}

/** Find all highlights (`<mark>` and native `==x==`) in the text, in order. */
export function findHighlights(text: string): HighlightSpan[] {
	const spans: HighlightSpan[] = [];
	const re = spanRegex();
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (m[3] !== undefined) {
			spans.push({
				kind: 'native',
				start,
				end,
				contentStart: start + 2,
				contentEnd: end - 2,
				color: null,
			});
		} else {
			const contentEnd = end - MARK_CLOSE.length;
			const contentStart = contentEnd - (m[2] ?? '').length;
			const color = m[1] !== undefined && m[1] !== '' ? m[1] : null;
			spans.push({ kind: 'mark', start, end, contentStart, contentEnd, color });
		}
	}
	return spans;
}

function normalizeRange(text: string, from: number, to: number): [number, number] {
	let a = Math.min(from, to);
	let b = Math.max(from, to);
	a = Math.max(0, Math.min(a, text.length));
	b = Math.max(0, Math.min(b, text.length));
	return [a, b];
}

/** Highlights touched by the selection; for an empty selection, those containing the cursor. */
function touchedSpans(text: string, from: number, to: number): HighlightSpan[] {
	const spans = findHighlights(text);
	if (from === to) {
		return spans.filter((s) => s.contentStart <= from && from <= s.contentEnd);
	}
	return spans.filter((s) => s.start < to && s.end > from);
}

/** Tell whether the selection is highlighted, and in which color. */
export function getHighlightState(text: string, from: number, to: number): HighlightState {
	const [a, b] = normalizeRange(text, from, to);
	const touched = touchedSpans(text, a, b);
	const first = touched[0];
	if (!first) return { highlighted: false, color: null, kind: null };
	const withColor = touched.find((s) => s.color !== null);
	return { highlighted: true, color: withColor?.color ?? null, kind: first.kind };
}

/** Remove native `==x==` markers and return the plain content. */
function stripNative(s: string): string {
	return s.replace(/==(?!=)((?:(?!==)[^\n])+)==/g, (_m, inner: string) => inner);
}

/** Text of [start, end) with every given span replaced by its (native-stripped) content. */
function unwrap(text: string, start: number, end: number, spans: HighlightSpan[]): string {
	let out = '';
	let pos = start;
	for (const s of spans) {
		out += text.slice(pos, s.start);
		out += stripNative(text.slice(s.contentStart, s.contentEnd));
		pos = s.end;
	}
	return out + text.slice(pos, end);
}

// ---------------------------------------------------------------------------
// Per-line wrapping
// ---------------------------------------------------------------------------

/** List / task / quote / heading markers that must stay outside the tags. */
const BLOCK_PREFIX = /^\s*(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?)?(?:#{1,6}\s+)?/;

class Wrapper {
	out = '';
	firstContentStart = -1;
	lastContentEnd = -1;
	changed = false;

	constructor(private readonly color: string) {}

	raw(s: string): void {
		this.out += s;
	}

	/** Wrap the trimmed core of `s`, keeping surrounding whitespace outside. */
	piece(s: string): void {
		const core = s.trim();
		if (core === '') {
			this.out += s;
			return;
		}
		const lead = s.slice(0, s.indexOf(core));
		const trail = s.slice(lead.length + core.length);
		const tag = openTag(this.color);
		this.out += lead + tag;
		if (this.firstContentStart < 0) this.firstContentStart = this.out.length;
		this.out += core;
		this.lastContentEnd = this.out.length;
		this.out += MARK_CLOSE + trail;
		this.changed = true;
	}
}

/** Split a table row on unescaped pipes, keeping the pipes as separate tokens. */
function splitTableRow(line: string): string[] {
	const tokens: string[] = [];
	let cur = '';
	for (let i = 0; i < line.length; i++) {
		const ch = line.charAt(i);
		if (ch === '\\' && line.charAt(i + 1) === '|') {
			cur += '\\|';
			i++;
		} else if (ch === '|') {
			tokens.push(cur, '|');
			cur = '';
		} else {
			cur += ch;
		}
	}
	tokens.push(cur);
	return tokens;
}

function isTableDelimiterRow(line: string): boolean {
	return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');
}

function wrapLine(w: Wrapper, line: string, linePrefix: string): void {
	const full = linePrefix + line;
	if (full.trimStart().startsWith('|')) {
		if (isTableDelimiterRow(full)) {
			w.raw(line);
			return;
		}
		for (const tok of splitTableRow(line)) {
			if (tok === '|') w.raw(tok);
			else w.piece(tok);
		}
		return;
	}
	if (linePrefix.trim() === '') {
		// Selection starts at the beginning of the line: keep block markers outside.
		const lead = BLOCK_PREFIX.exec(line);
		const prefix = lead ? lead[0] : '';
		w.raw(prefix);
		w.piece(line.slice(prefix.length));
		return;
	}
	w.piece(line);
}

/**
 * Wrap `inner` (the combined selection text, no old markers) in color marks,
 * line by line. `linePrefix` is the text on the first line before `inner`.
 */
function wrapText(
	inner: string,
	linePrefix: string,
	color: string,
): { text: string; contentStart: number; contentEnd: number; changed: boolean } {
	const w = new Wrapper(color);
	const parts = inner.split(/(\r?\n)/);
	parts.forEach((part, i) => {
		if (i % 2 === 1) w.raw(part);
		else wrapLine(w, part, i === 0 ? linePrefix : '');
	});
	return {
		text: w.out,
		contentStart: Math.max(w.firstContentStart, 0),
		contentEnd: Math.max(w.lastContentEnd, 0),
		changed: w.changed,
	};
}

function linePrefixAt(text: string, offset: number): string {
	const nl = text.lastIndexOf('\n', offset - 1);
	return text.slice(nl + 1, offset);
}

// ---------------------------------------------------------------------------
// Public edits
// ---------------------------------------------------------------------------

/**
 * Highlight the selection in `color` (any CSS color, normally `#RRGGBBAA`).
 * Returns null when nothing can be highlighted (selection is only whitespace
 * or a table separator row).
 */
export function applyHighlight(
	text: string,
	from: number,
	to: number,
	color: string,
): TextEdit | null {
	const [a, b] = normalizeRange(text, from, to);
	const touched = touchedSpans(text, a, b);

	if (a === b) {
		const span = touched[0];
		if (span) {
			// Cursor inside an existing highlight: recolor it.
			const content = stripNative(text.slice(span.contentStart, span.contentEnd));
			const insert = buildMark(content, color);
			const cursor = span.start + openTag(color).length + (a - span.contentStart);
			const pos = Math.min(cursor, span.start + openTag(color).length + content.length);
			return { from: span.start, to: span.end, insert, selFrom: pos, selTo: pos };
		}
		const tag = openTag(color);
		const pos = a + tag.length;
		return { from: a, to: a, insert: tag + MARK_CLOSE, selFrom: pos, selTo: pos };
	}

	const start = touched.reduce((m, s) => Math.min(m, s.start), a);
	const end = touched.reduce((m, s) => Math.max(m, s.end), b);
	const inner = unwrap(text, start, end, touched);
	const wrapped = wrapText(inner, linePrefixAt(text, start), color);
	if (!wrapped.changed) return null;
	return {
		from: start,
		to: end,
		insert: wrapped.text,
		selFrom: start + wrapped.contentStart,
		selTo: start + wrapped.contentEnd,
	};
}

/**
 * Remove the highlight(s) touched by the selection (or containing the cursor),
 * keeping the text. Whole highlights are unwrapped, even when only part of
 * them is selected. Returns null when nothing is highlighted.
 */
export function removeHighlight(text: string, from: number, to: number): TextEdit | null {
	const [a, b] = normalizeRange(text, from, to);
	const touched = touchedSpans(text, a, b);
	if (touched.length === 0) return null;

	const start = touched.reduce((m, s) => Math.min(m, s.start), Infinity);
	const end = touched.reduce((m, s) => Math.max(m, s.end), -Infinity);
	const insert = unwrap(text, start, end, touched);

	if (a === b) {
		const span = touched[0] as HighlightSpan;
		const stripped = stripNative(text.slice(span.contentStart, span.contentEnd));
		const pos = Math.min(span.start + (a - span.contentStart), span.start + stripped.length);
		return { from: start, to: end, insert, selFrom: pos, selTo: pos };
	}
	return { from: start, to: end, insert, selFrom: start, selTo: start + insert.length };
}

/** Apply an edit to a string (used by tests and handy for callers without an editor). */
export function applyEdit(text: string, edit: TextEdit): string {
	return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}
