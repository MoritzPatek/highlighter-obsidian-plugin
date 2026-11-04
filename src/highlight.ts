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
 *   otherwise an empty `<mark ...></mark>` is inserted with the cursor between
 *   the tags. (The plugin's commands do not use this: with nothing selected
 *   and no highlight under the cursor they show a notice instead.)
 * - Multi-line selections are wrapped per line, because an inline HTML tag
 *   that spans a paragraph break does not render. Blank lines are skipped.
 *   Leading list/quote/heading markers (`- `, `1. `, `> `, `# `, `- [ ] `)
 *   stay outside the tags so they keep working. Table rows are wrapped per
 *   cell so the pipes stay outside the tags. Leading and trailing spaces
 *   of each piece stay outside the tags.
 * - Code is never touched: `==x==` or `<mark>` inside inline code or fenced
 *   code blocks (CommonMark fences) is not a highlight. When the text starts
 *   inside a fence opened above it, pass that fence (see `endsInsideFence`).
 *   Indented code blocks are not detected.
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

/**
 * Native `==x==` (Obsidian's rule): no whitespace right after the opener or
 * right before the closer, so `a == b && c == d` is not a highlight.
 */
const NATIVE_SRC = '==(?![\\s=])((?:(?!==)[^\\n])*?(?<![\\s]))==';

function spanRegex(): RegExp {
	// Group 1: color of a <mark>. Group 2: <mark> content. Group 3: native content.
	return new RegExp(
		'<mark(?:\\s+style="\\s*background(?:-color)?\\s*:\\s*([^";<>]*?)\\s*;?\\s*")?\\s*>([\\s\\S]*?)</mark>' +
			'|' +
			NATIVE_SRC,
		'gi',
	);
}

/** Find all highlights (`<mark>` and native `==x==`) in the text, in order. */
export function findHighlights(text: string, fence: Fence | null = null): HighlightSpan[] {
	const spans: HighlightSpan[] = [];
	const re = spanRegex();
	const code = codeRanges(text, fence);
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const start = m.index;
		if (code.some((r) => start >= r.start && start < r.end)) continue; // never inside code
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

// ---------------------------------------------------------------------------
// Code and formatting markers
// ---------------------------------------------------------------------------

interface Range {
	start: number;
	end: number;
	fenced: boolean;
}

/** An open fenced code block: its fence character and length. */
export interface Fence {
	char: '`' | '~';
	len: number;
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
/** Fence at any indent (e.g. nested in a list item). Used where wrongly treating text as code is the safer mistake. */
const FENCE_OPEN_ANY_RE = /^[ \t]*(`{3,}|~{3,})(.*)$/;

/** Advance the fence state over one line (CommonMark: same char, at least as long, indent <= 3, nothing else). */
function stepFence(line: string, fence: Fence | null, anyIndent = false): Fence | null {
	const m = (anyIndent ? FENCE_OPEN_ANY_RE : FENCE_OPEN_RE).exec(line);
	if (!m) return fence;
	const run = m[1] as string;
	const rest = m[2] as string;
	const char = run.charAt(0) as '`' | '~';
	if (fence) {
		return char === fence.char && run.length >= fence.len && rest.trim() === '' ? null : fence;
	}
	if (char === '`' && rest.includes('`')) return null; // not a fence: info string has a backtick
	return { char, len: run.length };
}

/** Fenced blocks and inline code spans in `text`. An unclosed fence runs to the end. */
export function codeRanges(text: string, fence: Fence | null = null, anyIndent = false): Range[] {
	const out: Range[] = [];
	let pos = 0;
	let state = fence;
	let fenceStart = fence ? 0 : -1;
	for (const line of text.split('\n')) {
		const lineEnd = pos + line.length;
		const next = stepFence(line, state, anyIndent);
		if (!state && next) fenceStart = pos;
		else if (state && !next) {
			out.push({ start: fenceStart, end: lineEnd, fenced: true });
			fenceStart = -1;
		} else if (!state && !next) {
			const re = /(`+)(?!`)[^\n]*?(?<!`)\1(?!`)/g;
			let m: RegExpExecArray | null;
			while ((m = re.exec(line)) !== null) {
				out.push({ start: pos + m.index, end: pos + m.index + m[0].length, fenced: false });
			}
		}
		state = next;
		pos = lineEnd + 1;
	}
	if (state) out.push({ start: fenceStart, end: text.length, fenced: true });
	return out;
}

/** The fenced code block the end of `textBefore` is inside, or null. */
export function endsInsideFence(textBefore: string): Fence | null {
	let state: Fence | null = null;
	for (const line of textBefore.split('\n')) state = stepFence(line, state);
	return state;
}

/**
 * Would highlighting [from, to) touch code? True when an edge of the selection
 * is inside an inline code span, the selection overlaps a fenced block, or the
 * selection starts inside a `fence` opened before `text`.
 */
export function selectionTouchesCode(
	text: string,
	from: number,
	to: number,
	fence: Fence | null = null,
): boolean {
	const [a, b] = normalizeRange(text, from, to);
	return codeRanges(text, fence).some((r) =>
		r.fenced
			? a === b
				? a >= r.start && a <= r.end
				: r.start < b && r.end > a
			: (a > r.start && a < r.end) || (b > r.start && b < r.end),
	);
}

/** Formatting runs on one line: code, bold, strike, italic. `ml` is the marker length. */
const FORMAT_RE =
	/`[^`\n]+`|(\*\*|__|~~)(?!\s)[^\n]*?(?<!\s)\1|(?<![*\w])\*(?![\s*])[^\n*]*?(?<![\s*])\*(?!\*)|(?<![\w])_(?![\s_])[^\n_]*?(?<![\s_])_(?!\w)/g;

/**
 * UTF-16 length of the highlight or formatting element that starts `rest`
 * (a `<mark>`, a native `==x==`, a bold/italic/strike/code run, or at least a run
 * of `*` `_` `~` markers), or 0 when `rest` starts with ordinary text. Used to
 * park the caret behind such a neighbour, because a caret touching it makes
 * Live Preview reveal its raw markup.
 */
export function neighborLength(rest: string): number {
	let m = /^<mark(?:\s[^>]*)?>[^\n]*?<\/mark>/i.exec(rest);
	if (m) return m[0].length;
	m = new RegExp('^' + NATIVE_SRC).exec(rest);
	if (m) return m[0].length;
	if (/^[*_~`]/.test(rest)) {
		m = new RegExp('^(?:' + FORMAT_RE.source + ')').exec(rest);
		if (m) return m[0].length;
		m = /^[*_~`]+/.exec(rest);
		if (m) return m[0].length;
	}
	return 0;
}

/**
 * Widen [a, b) so it never cuts through a formatting marker pair: a run that
 * is only partly inside the selection (or whose marker is cut) is included whole.
 */
function expandForMarkers(
	text: string,
	a: number,
	b: number,
	extra: { s: number; e: number; ml: number; always?: boolean }[] = [],
	formatRuns = true,
): [number, number] {
	const runs: { s: number; e: number; ml: number; always?: boolean }[] = [...extra];
	const re = new RegExp(formatRuns ? FORMAT_RE.source : '(?!)', 'g');
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		const ml = m[1] ? m[1].length : 1;
		runs.push({ s: m.index, e: m.index + m[0].length, ml });
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const r of runs) {
			if (!(r.s < b && r.e > a)) continue; // no overlap
			if (a <= r.s && b >= r.e) continue; // contains the whole run
			if (!r.always && a >= r.s + r.ml && b <= r.e - r.ml) continue; // strictly inside the content
			a = Math.min(a, r.s);
			b = Math.max(b, r.e);
			changed = true;
		}
	}
	return [a, b];
}

function normalizeRange(text: string, from: number, to: number): [number, number] {
	let a = Math.min(from, to);
	let b = Math.max(from, to);
	a = Math.max(0, Math.min(a, text.length));
	b = Math.max(0, Math.min(b, text.length));
	return [a, b];
}

/** Highlights touched by the selection; for an empty selection, those containing the cursor. */
function touchedSpans(
	text: string,
	from: number,
	to: number,
	fence: Fence | null,
): HighlightSpan[] {
	const spans = findHighlights(text, fence);
	if (from === to) {
		return spans.filter((s) => s.contentStart <= from && from <= s.contentEnd);
	}
	return spans.filter((s) => s.start < to && s.end > from);
}

/** Tell whether the selection is highlighted, and in which color. */
export function getHighlightState(
	text: string,
	from: number,
	to: number,
	fence: Fence | null = null,
): HighlightState {
	const [a, b] = normalizeRange(text, from, to);
	const touched = touchedSpans(text, a, b, fence);
	const first = touched[0];
	if (!first) return { highlighted: false, color: null, kind: null };
	const withColor = touched.find((s) => s.color !== null);
	return { highlighted: true, color: withColor?.color ?? null, kind: first.kind };
}

/** Remove native `==x==` markers and return the plain content. */
function stripNative(s: string): string {
	return s.replace(new RegExp(NATIVE_SRC, 'g'), (_m, inner: string) => inner);
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

/** `==x==` written inside a `<mark>`: not a span of its own, but it must not be cut in two. */
function nestedNativeRuns(
	text: string,
	spans: HighlightSpan[],
): { s: number; e: number; ml: number; always: boolean }[] {
	const out: { s: number; e: number; ml: number; always: boolean }[] = [];
	for (const sp of spans) {
		if (sp.kind !== 'mark') continue;
		const re = new RegExp(NATIVE_SRC, 'g');
		const content = text.slice(sp.contentStart, sp.contentEnd);
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			out.push({ s: sp.contentStart + m.index, e: sp.contentStart + m.index + m[0].length, ml: 2, always: true });
		}
	}
	return out;
}

/**
 * Pull selection edges out of highlight markup. An edge inside an opening
 * marker (`<mark ...>` / `==`) means "from the start of that highlight" for the
 * start edge and "nothing of it" for the end edge; inside a closing marker it is
 * the other way round.
 */
function snapToContent(a: number, b: number, spans: HighlightSpan[]): [number, number] {
	for (const sp of spans) {
		if (a > sp.start && a < sp.contentStart) a = sp.start;
		else if (a > sp.contentEnd && a < sp.end) a = sp.end;
		if (b > sp.start && b < sp.contentStart) b = sp.start;
		else if (b > sp.contentEnd && b < sp.end) b = sp.end;
	}
	return [a, Math.max(a, b)];
}

/**
 * The range a highlight really paints for the selection [from, to): the
 * selection with its edges moved out of highlight markup and widened over
 * formatting runs (`**`, `*`, `_`, `~~`, `` ` ``) it cuts into, so Markdown never
 * breaks. It does NOT widen over other highlights (pen semantics). Idempotent.
 */
export function highlightRange(
	text: string,
	from: number,
	to: number,
	fence: Fence | null = null,
): [number, number] {
	const [a, b] = normalizeRange(text, from, to);
	if (a === b) return [a, b];
	const spans = findHighlights(text, fence);
	const nested = nestedNativeRuns(text, spans);
	let start = a;
	let end = b;
	for (let prev = ''; prev !== `${start},${end}`; ) {
		prev = `${start},${end}`;
		[start, end] = snapToContent(start, end, spans);
		[start, end] = expandForMarkers(text, start, end, nested);
	}
	return [start, end];
}

/** The text of [start, end) without highlight markup (native-stripped content of every overlapped span). */
function plainInner(text: string, start: number, end: number, spans: HighlightSpan[]): string {
	let out = '';
	let pos = start;
	for (const sp of spans) {
		if (sp.start > pos) out += text.slice(pos, Math.min(sp.start, end));
		const cs = Math.max(start, sp.contentStart);
		const ce = Math.min(end, sp.contentEnd);
		if (ce > cs) out += stripNative(text.slice(cs, ce));
		pos = Math.max(pos, Math.min(end, sp.end));
	}
	return pos < end ? out + text.slice(pos, end) : out;
}

/** A native `==x==` that stays valid: whitespace at the inner edges moves outside. */
function nativePiece(content: string): string {
	const core = content.trim();
	if (core === '') return content;
	const lead = content.slice(0, content.indexOf(core));
	return `${lead}==${core}==${content.slice(lead.length + core.length)}`;
}

/** What is left of a highlight after part of its content was taken away (`content` is the part that stays). */
function remainder(text: string, span: HighlightSpan, content: string): string {
	if (content === '') return '';
	if (span.kind === 'native') return nativePiece(content);
	if (content.trim() === '') return content;
	return text.slice(span.start, span.contentStart) + content + MARK_CLOSE;
}

const normColor = (c: string | null) => (c === null ? null : c.replace(/\s/g, '').toUpperCase());

/**
 * Merge `<mark>`s of equal color that touch each other. Returns the merged text
 * and a function mapping offsets of the input to offsets of the output.
 */
function mergeTouching(region: string): { text: string; map: (offset: number) => number } {
	const spans = findHighlights(region).filter((sp) => sp.kind === 'mark');
	const cuts: [number, number][] = [];
	for (let i = 0; i + 1 < spans.length; i++) {
		const x = spans[i] as HighlightSpan;
		const y = spans[i + 1] as HighlightSpan;
		if (x.end === y.start && x.color !== null && normColor(x.color) === normColor(y.color)) {
			cuts.push([x.contentEnd, y.contentStart]);
		}
	}
	let out = '';
	let pos = 0;
	for (const [from, to] of cuts) {
		out += region.slice(pos, from);
		pos = to;
	}
	out += region.slice(pos);
	const map = (offset: number) => {
		let removed = 0;
		for (const [from, to] of cuts) {
			if (offset >= to) removed += to - from;
			else if (offset > from) removed += offset - from;
		}
		return offset - removed;
	};
	return { text: out, map };
}

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
	fence: Fence | null = null,
): TextEdit | null {
	const [a, b] = normalizeRange(text, from, to);
	const touched = touchedSpans(text, a, b, fence);

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

	// Pen semantics: paint only [start, end); the rest of any highlight it cuts keeps its color.
	const [start, end] = highlightRange(text, a, b, fence);
	if (start === end) return null;
	const all = findHighlights(text, fence);
	const spans = all.filter((sp) => sp.start < end && sp.end > start);
	const wrapped = wrapText(plainInner(text, start, end, spans), linePrefixAt(text, start), color);
	if (!wrapped.changed) return null;

	const leftSpan = spans.find((sp) => sp.start < start);
	const rightSpan = [...spans].reverse().find((sp) => sp.end > end);
	let rs = leftSpan ? leftSpan.start : start;
	let re = rightSpan ? rightSpan.end : end;
	let before = leftSpan
		? remainder(text, leftSpan, text.slice(leftSpan.contentStart, Math.max(start, leftSpan.contentStart)))
		: '';
	let after = rightSpan
		? remainder(text, rightSpan, text.slice(Math.min(end, rightSpan.contentEnd), rightSpan.contentEnd))
		: '';
	// Touching highlights of the same color are merged into one.
	const prev = all.find((sp) => sp.kind === 'mark' && sp.end === rs && normColor(sp.color) === normColor(color));
	if (prev) {
		before = text.slice(prev.start, prev.end) + before;
		rs = prev.start;
	}
	const next = all.find((sp) => sp.kind === 'mark' && sp.start === re && normColor(sp.color) === normColor(color));
	if (next) {
		after += text.slice(next.start, next.end);
		re = next.end;
	}
	const raw = before + wrapped.text + after;
	const merged = mergeTouching(raw);
	return {
		from: rs,
		to: re,
		insert: merged.text,
		selFrom: rs + merged.map(before.length + wrapped.contentStart),
		selTo: rs + merged.map(before.length + wrapped.contentEnd),
	};
}

/**
 * Remove the highlight(s) touched by the selection (or containing the cursor),
 * keeping the text. Whole highlights are unwrapped, even when only part of
 * them is selected. Returns null when nothing is highlighted.
 */
export function removeHighlight(
	text: string,
	from: number,
	to: number,
	fence: Fence | null = null,
): TextEdit | null {
	const [a, b] = normalizeRange(text, from, to);

	if (a === b) {
		// A caret removes the whole highlight it is in.
		const touched = touchedSpans(text, a, b, fence);
		if (touched.length === 0) return null;
		const span = touched[0] as HighlightSpan;
		const insert = unwrap(text, span.start, span.end, [span]);
		const stripped = stripNative(text.slice(span.contentStart, span.contentEnd));
		const pos = Math.min(span.start + (a - span.contentStart), span.start + stripped.length);
		return { from: span.start, to: span.end, insert, selFrom: pos, selTo: pos };
	}

	// Eraser: only the selected part loses its highlight; the rest keeps it.
	const all = findHighlights(text, fence);
	const nested = nestedNativeRuns(text, all);
	let [start, end] = snapToContent(a, b, all);
	[start, end] = snapToContent(...expandForMarkers(text, start, end, nested, false), all);
	const spans = all.filter((sp) => sp.start < end && sp.end > start);
	if (start === end || spans.length === 0) return null;
	const leftSpan = spans.find((sp) => sp.start < start);
	const rightSpan = [...spans].reverse().find((sp) => sp.end > end);
	const rs = leftSpan ? leftSpan.start : start;
	const re = rightSpan ? rightSpan.end : end;
	const before = leftSpan
		? remainder(text, leftSpan, text.slice(leftSpan.contentStart, Math.max(start, leftSpan.contentStart)))
		: '';
	const after = rightSpan
		? remainder(text, rightSpan, text.slice(Math.min(end, rightSpan.contentEnd), rightSpan.contentEnd))
		: '';
	const inner = plainInner(text, start, end, spans);
	return {
		from: rs,
		to: re,
		insert: before + inner + after,
		selFrom: rs + before.length,
		selTo: rs + before.length + inner.length,
	};
}

/** Apply an edit to a string (used by tests and handy for callers without an editor). */
export function applyEdit(text: string, edit: TextEdit): string {
	return text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
}
