/**
 * Rewrite the colors of our `<mark style="background: #HEX;">` highlights.
 * Pure (no Obsidian imports). Used when the palette changes, so existing
 * highlights follow the new color instead of being left behind.
 */
import { codeRanges } from './highlight';

export interface Replacement {
	from: number;
	to: number;
	insert: string;
}

const MARK_STYLE_RE = /<mark\s+style="([^"]*)"/gi;
const BG_RE = /(background(?:-color)?\s*:\s*)(#[0-9a-f]{6}(?:[0-9a-f]{2})?)/gi;

/**
 * The edits that recolor marks. `map` is old -> new hex, both upper-case
 * #RRGGBBAA (the lookup is case-insensitive). Only the hex inside a `<mark
 * style="...">` of a note is replaced; marks inside inline code or code blocks,
 * native `==x==` and other attributes are left alone. All replacements keep the
 * text length when old and new hex have the same length.
 */
export function recolorEdits(text: string, map: ReadonlyMap<string, string>): Replacement[] {
	if (map.size === 0 || !/<mark/i.test(text)) return [];
	// Fences at any indent count as code (also fences nested in list items): leaving a mark alone is the safe mistake.
	const code = codeRanges(text, null, true);
	const out: Replacement[] = [];
	let m: RegExpExecArray | null;
	MARK_STYLE_RE.lastIndex = 0;
	while ((m = MARK_STYLE_RE.exec(text)) !== null) {
		const tagStart = m.index;
		if (code.some((r) => tagStart >= r.start && tagStart < r.end)) continue;
		const styleStart = tagStart + m[0].length - 1 - (m[1] as string).length;
		const style = m[1] as string;
		BG_RE.lastIndex = 0;
		let b: RegExpExecArray | null;
		while ((b = BG_RE.exec(style)) !== null) {
			const hex = (b[2] as string).toUpperCase();
			const next = map.get(hex);
			if (next === undefined) continue;
			const from = styleStart + b.index + (b[1] as string).length;
			out.push({ from, to: from + hex.length, insert: next });
		}
	}
	return out;
}

/** Apply `recolorEdits` to a string. */
export function recolorMarks(
	text: string,
	map: ReadonlyMap<string, string>,
): { text: string; count: number } {
	const edits = recolorEdits(text, map);
	if (edits.length === 0) return { text, count: 0 };
	let out = '';
	let pos = 0;
	for (const e of edits) {
		out += text.slice(pos, e.from) + e.insert;
		pos = e.to;
	}
	return { text: out + text.slice(pos), count: edits.length };
}
