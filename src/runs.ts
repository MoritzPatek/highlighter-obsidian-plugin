/**
 * Where a highlight may be painted: the plain-text runs of a piece of Markdown.
 *
 * Obsidian's Live Preview shows the content of an inline `<mark>` literally (no
 * Markdown inside it) and a mark inside a link, tag or math is not rendered
 * as such. So a highlight must never contain Markdown syntax. Instead, the
 * selection is cut into plain-text runs and each run is painted on its own;
 * everything else is a "hole" that stays untouched:
 *
 *  - block syntax: list/quote/heading/task/callout/footnote prefixes, table pipes
 *    and separator rows, rules, fence lines, code and math blocks, properties
 *  - inline syntax: emphasis markers (`*` `_` `~`), code spans, math, comments,
 *    escapes, wikilinks and embeds, links and images, footnote references,
 *    URLs and autolinks, tags, HTML, block ids, stray brackets
 *
 * Over-excluding is safe (a character stays unpainted), so patterns are
 * deliberately generous. Existing highlights (`<mark>` tags, `==`) are not holes.
 * Pure.
 */
import { stepFence, type Fence } from './blocks';

/** Block prefixes at the start of a line, consumed repeatedly (a list inside a quote, a task in a list, ...). */
const PREFIX_PATTERNS: RegExp[] = [
	/^[ \t]*>[ \t]?/, // quote
	/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[^\]\n]\][ \t]+)?/, // list item, optionally a task
	/^[ \t]*#{1,6}[ \t]+/, // heading
	/^\[![\w-]+\][+-]?[ \t]*/, // callout type
	/^\[\^[^\]\n]+\]:[ \t]*/, // footnote definition
];

export function blockPrefixLength(line: string): number {
	let pos = 0;
	for (let guard = 0; guard < 12; guard++) {
		let advanced = false;
		for (const re of PREFIX_PATTERNS) {
			const m = re.exec(line.slice(pos));
			if (m && m[0].length > 0) {
				pos += m[0].length;
				advanced = true;
				break;
			}
		}
		if (!advanced) break;
	}
	return pos;
}

/** Inline constructs that are never painted. Order matters: earlier patterns win at the same position. */
const HOLES: RegExp[] = [
	/\\[\\`*_{}[\]()#+\-.!|<>~=$%^&]/g, // escaped character
	/(`+)(?!`)[^\n]*?(?<!`)\1(?!`)/g, // code span
	/\$\$[^\n]*?\$\$/g, // inline block math
	/\$(?![\s$])[^\n$]*?(?<![\s\\])\$(?!\d)/g, // inline math
	/%%[^\n]*?%%/g, // comment
	/!?\[\[[^\]\n]*\]\]/g, // wikilink, embed
	/\[\^[^\]\n]+\]/g, // footnote reference
	/!?\[[^\]\n]*\]\([^)\n]*\)/g, // markdown link, image
	/!?\[[^\]\n]*\]\[[^\]\n]*\]/g, // reference link
	/<(?:https?|mailto|ftp):[^>\s]*>/gi, // autolink
	/\b(?:https?|ftp):\/\/[^\s<>]+/gi, // bare URL
	/<([A-Za-z][\w-]*)\b(?![\w-]*mark\b)[^>\n]*>[^\n]*?<\/\1\s*>/g, // inline HTML element with content
	/<\/?(?!mark\b)[A-Za-z][^>\n]*>/g, // any other HTML tag
	/(?<![\w/&#])#[\p{L}\p{N}_/-]+/gu, // tag
	/(?<=\s|^)\^[A-Za-z0-9-]+[ \t]*$/g, // block id
	/[\p{L}\p{N}]+(?:_+[\p{L}\p{N}]+)+/gu, // snake_case: a mark next to these underscores would turn them into emphasis
	/[*_~]+/g, // emphasis markers (also literal ones: unpainted is harmless)
	/[[\]]/g, // stray brackets
	/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, // an entity: a mark decodes it, plain Live Preview text does not
	/[<>]/g, // a literal < or > inside a mark confuses the editor's HTML detection (Live Preview showed the raw tag)
];

/** Our own highlight tags: transparent, they belong to the surrounding text run. */
const MARK_TAG = /<\/?mark\b[^>\n]*>/gi;

const CANDIDATES: [RegExp, boolean][] = [[MARK_TAG, false], ...HOLES.map((re) => [re, true] as [RegExp, boolean])];

/** Hole ranges of one line segment `line.slice(start, end)`, as offsets into `line`. */
function inlineHoles(line: string, start: number, end: number): [number, number][] {
	const holes: [number, number][] = [];
	let pos = start;
	const segment = line.slice(0, end);
	while (pos < end) {
		let best: { index: number; length: number; hole: boolean } | null = null;
		for (const [re, hole] of CANDIDATES) {
			re.lastIndex = pos;
			const m = re.exec(segment);
			if (m && m[0].length > 0 && (!best || m.index < best.index)) {
				best = { index: m.index, length: m[0].length, hole };
			}
		}
		if (!best) break;
		if (best.hole) holes.push([best.index, best.index + best.length]);
		pos = best.index + best.length;
	}
	return holes;
}

/** Split a table row (after its prefix) into the ranges of its cells; pipes are not part of any cell. */
function tableCells(line: string, start: number): [number, number][] {
	const cells: [number, number][] = [];
	let cellStart = start;
	for (let i = start; i < line.length; i++) {
		const ch = line.charAt(i);
		if (ch === '\\' && line.charAt(i + 1) === '|') {
			i++;
		} else if (ch === '[' && line.startsWith('[[', i) && line.indexOf(']]', i) > 0) {
			i = line.indexOf(']]', i) + 1; // a pipe inside [[a|b]] is the alias separator, not a cell border
		} else if (ch === '`') {
			const close = line.indexOf('`', i + 1);
			if (close > 0) i = close; // nor inside a code span
		} else if (ch === '|') {
			cells.push([cellStart, i]);
			cellStart = i + 1;
		}
	}
	cells.push([cellStart, line.length]);
	return cells;
}

const HR_RE = /^[ \t]*(?:>[ \t]*)*(?:([-*_])[ \t]*){3,}$/;
const TABLE_DELIM_RE = /^[ \t]*(?:>[ \t]*)*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Plain-text runs of a single line (offsets into `line`). */
export function lineRuns(line: string): [number, number][] {
	if (line.trim() === '' || HR_RE.test(line)) return [];
	// Reading view drops inline HTML in footnote definitions, so a highlight there would only exist in the source.
	if (/^\[\^[^\]\n]+\]:/.test(line)) return [];
	const start = blockPrefixLength(line);
	if (TABLE_DELIM_RE.test(line) && line.includes('-') && line.includes('|')) return [];
	const isTable = /^[ \t]*(?:>[ \t]*)*\|/.test(line);
	const segments: [number, number][] = isTable ? tableCells(line, start) : [[start, line.length]];
	const runs: [number, number][] = [];
	for (const [s, e] of segments) {
		if (e <= s) continue;
		let pos = s;
		for (const [hs, he] of inlineHoles(line, s, e)) {
			if (hs > pos) runs.push([pos, hs]);
			pos = Math.max(pos, he);
		}
		if (pos < e) runs.push([pos, e]);
	}
	return runs;
}

/**
 * Plain-text runs of `text` (offsets into `text`). `fence` is the fenced block
 * `text` starts inside, `frontLines` the number of leading lines that are
 * frontmatter (properties).
 */
/**
 * What the lines above say about indented code: whether the previous line was blank,
 * whether we are inside an indented code block, and whether we are inside a list item
 * (where indented lines are item content, not code).
 */
export interface BlockState {
	prevBlank: boolean;
	inIndented: boolean;
	listContext: boolean;
}

export const initialBlockState = (): BlockState => ({ prevBlank: true, inIndented: false, listContext: false });

const QUOTE_PREFIX = /^(?:[ \t]{0,3}>[ \t]?)+/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]/;

/**
 * Advance the indented-code state over one line (outside fences and properties).
 * Returns true when the line belongs to an indented code block. A blockquote prefix is
 * looked through (`>     code` is code inside the quote).
 */
export function stepBlock(st: BlockState, line: string): boolean {
	const content = line.replace(QUOTE_PREFIX, '');
	const blank = content.trim() === '';
	let code = false;
	if (!blank) {
		const indent = /^(?: {4,}|\t)/.test(content);
		if (indent && !st.listContext && (st.prevBlank || st.inIndented)) {
			st.inIndented = true;
			code = true;
		} else {
			st.inIndented = false;
			// a list item opens a context in which indented lines are item content, not code
			if (LIST_ITEM.test(content)) st.listContext = true;
			else if (!/^[ \t]{2,}/.test(content)) st.listContext = false;
		}
	} else if (st.inIndented) {
		code = false; // blank line inside a code block: nothing to paint anyway
	}
	st.prevBlank = blank;
	return code;
}

/**
 * The block state at the end of `linesAbove` (the lines of the note before the text that is
 * being looked at). `fence` is the fenced block state at the START of those lines (null at the
 * top of the note) and `frontEnd` the index of the last properties line (-1 for none).
 */
export function blockStateAfter(linesAbove: readonly string[], frontEnd = -1): BlockState {
	const st = initialBlockState();
	let fence: Fence | null = null;
	linesAbove.forEach((line, i) => {
		const before = fence;
		fence = stepFence(line, fence);
		if (i <= frontEnd || before || fence) return;
		stepBlock(st, line);
	});
	return st;
}

export function paintableRuns(
	text: string,
	fence: Fence | null = null,
	frontLines = 0,
	block: BlockState | null = null,
): [number, number][] {
	const out: [number, number][] = [];
	let pos = 0;
	let state = fence;
	const st: BlockState = block ? { ...block } : initialBlockState();
	text.split('\n').forEach((line, i) => {
		const lineStart = pos;
		pos += line.length + 1;
		const before = state;
		state = stepFence(line, state);
		let code = false;
		if (!before && !state && i >= frontLines) code = stepBlock(st, line);
		if (i < frontLines || before || state || code) return; // properties, code and math blocks, fence lines, indented code
		for (const [s, e] of lineRuns(line)) out.push([lineStart + s, lineStart + e]);
	});
	return out;
}
