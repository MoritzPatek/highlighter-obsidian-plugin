/**
 * Block-level state of Markdown text: fenced code, math blocks, and where
 * code lives. Pure.
 */

export interface Range {
	start: number;
	end: number;
	fenced: boolean;
}

/**
 * An open fenced block: code (``` or ~~~ with its length) or a `$$` math block
 * (char '$', len 2).
 */
export interface Fence {
	char: '`' | '~' | '$';
	len: number;
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
/** Fence at any indent (e.g. nested in a list item). Used where wrongly treating text as code is the safer mistake. */
const FENCE_OPEN_ANY_RE = /^[ \t]*(`{3,}|~{3,})(.*)$/;
/** A line that is only `$$` (opens or closes a math block). */
const MATH_FENCE_RE = /^[ \t]*(?:>[ \t]*)*\$\$[ \t]*$/;

/** Advance the fence state over one line (CommonMark: same char, at least as long, indent <= 3, nothing else). */
export function stepFence(line: string, fence: Fence | null, anyIndent = false): Fence | null {
	if (fence?.char === '$') return MATH_FENCE_RE.test(line) ? null : fence;
	if (!fence && MATH_FENCE_RE.test(line)) return { char: '$', len: 2 };
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

/** Fenced blocks (code and math) and inline code spans in `text`. An unclosed fence runs to the end. */
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

/** The fenced block (code or math) the end of `textBefore` is inside, or null. */
export function endsInsideFence(textBefore: string): Fence | null {
	let state: Fence | null = null;
	for (const line of textBefore.split('\n')) state = stepFence(line, state);
	return state;
}

/**
 * Number of lines at the start of `text` that belong to YAML frontmatter, given
 * that `text` starts at document line `firstLine` and the document's frontmatter
 * ends at line `frontmatterEnd` (inclusive, -1 when there is none).
 */
export function frontmatterLinesIn(firstLine: number, frontmatterEnd: number): number {
	return frontmatterEnd >= firstLine ? frontmatterEnd - firstLine + 1 : 0;
}

/** Index of the last frontmatter line of a document (the closing `---`/`...`), or -1 when it has none. */
export function frontmatterEnd(lines: readonly string[]): number {
	if ((lines[0] ?? '').trimEnd() !== '---') return -1;
	for (let i = 1; i < lines.length; i++) {
		const l = (lines[i] as string).trimEnd();
		if (l === '---' || l === '...') return i;
	}
	return -1;
}
