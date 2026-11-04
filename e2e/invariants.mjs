// Invariants shared by the unit suite (src/formats.test.ts) and the real-Obsidian suite (e2e/run.mjs).
// Plain JS on purpose, and written without the plugin's own helpers.

// ---------------------------------------------------------------- helpers

/**
 * Obsidian re-aligns a table (pads every column to its widest cell, rewrites the separator row) when a cell
 * was edited and is left. That changes only spacing, so table lines are compared in a canonical form.
 */
export const canonTableLine = (l) => (/^\s*\|/.test(l) ? l.replace(/\s+/g, ' ').replace(/ ?\| ?/g, '|').replace(/-+/g, '-').replace(/:?-:?/g, (m) => m).trim() : l);
export const canonDoc = (t) => t.split('\n').map(canonTableLine).join('\n');

/** The note as a reader sees it: our marks and native ==markers== removed (table spacing ignored). */
export const strip = (t) => canonDoc(t.replace(/<\/?mark\b[^>]*>/gi, '').replace(/==/g, ''));

/**
 * Parts of a note (in `strip`ped coordinates) that must never contain a highlight.
 * Deliberately written without the plugin's own helpers.
 */
export function forbiddenRegions(stripped) {
	const out = [];
	const add = (re, why) => {
		for (const m of stripped.matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length, why });
	};
	// lines: properties, fences, math blocks, rules, table separators
	let pos = 0;
	let fence = null;
	let math = false;
	const lines = stripped.split('\n');
	let fmEnd = -1;
	if (lines[0] === '---') fmEnd = lines.findIndex((l, i) => i > 0 && (l === '---' || l === '...'));
	lines.forEach((line, i) => {
		const end = pos + line.length;
		const f = /^\s*(`{3,}|~{3,})/.exec(line);
		const isMath = /^\s*\$\$\s*$/.test(line);
		if (i <= fmEnd) out.push({ start: pos, end: end + 1, why: 'properties' });
		else if (fence) {
			out.push({ start: pos, end: end + 1, why: 'code block' });
			if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
		} else if (math) {
			out.push({ start: pos, end: end + 1, why: 'math block' });
			if (isMath) math = false;
		} else if (f) {
			fence = f[1];
			out.push({ start: pos, end: end + 1, why: 'fence line' });
		} else if (isMath) {
			math = true;
			out.push({ start: pos, end: end + 1, why: 'math fence' });
		} else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line) || /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('|')) {
			out.push({ start: pos, end: end + 1, why: 'rule or table separator' });
		} else {
			// block prefixes
			const pm = /^(?:\s*>)*\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?)?(?:#{1,6}\s+)?(?:\[![\w-]+\][+-]?\s*)?(?:\[\^[^\]]+\]:\s*)?/.exec(line);
			if (pm && pm[0].length) out.push({ start: pos, end: pos + pm[0].length, why: 'block prefix' });
		}
		pos = end + 1;
	});
	add(/`+[^`\n]+`+/g, 'code span');
	add(/!?\[\[[^\]\n]*\]\]/g, 'wikilink/embed');
	add(/!?\[[^\]\n]*\]\([^)\n]*\)/g, 'markdown link/image');
	add(/\[\^[^\]\n]+\]/g, 'footnote ref');
	add(/\$\$[^\n]*?\$\$/g, 'math');
	add(/\$(?![\s$])[^\n$]*?(?<![\s\\])\$(?!\d)/g, 'math');
	add(/%%[^\n]*?%%/g, 'comment');
	add(/<(?:https?|mailto):[^>\s]*>/g, 'autolink');
	add(/\bhttps?:\/\/[^\s<>)]+/g, 'url');
	add(/<\/?[A-Za-z][^>\n]*>/g, 'html tag');
	add(/<([A-Za-z]\w*)\b[^>\n]*>[^\n]*?<\/\1>/g, 'html element');
	add(/(?<![\w/&#\\])#[\p{L}\p{N}_/-]+/gu, 'tag');
	add(/(?<=\s|^)\^[A-Za-z0-9-]+[ \t]*$/gm, 'block id');
	add(/\\[\\`*_{}[\]()#+\-.!|<>~$%^&=]/g, 'escape');
	add(/[*_~]+/g, 'emphasis marker');
	add(/\|/g, 'table pipe');
	return out;
}

/** Contents of marks of `color` in `doc`, in `strip`ped coordinates. */
export function paintedRanges(doc, color) {
	const out = [];
	const re = new RegExp(`<mark style="background: ${color};">([\\s\\S]*?)</mark>`, 'g');
	for (const m of doc.matchAll(re)) {
		const contentStart = m.index + m[0].indexOf('>') + 1;
		const start = strip(doc.slice(0, contentStart)).length;
		out.push({ start, end: start + strip(m[1]).length, text: m[1] });
	}
	return out;
}

export const TOKENS = ['[[', ']]', '](', '`', '$', '%%', '**', '__', '~~', '\\*', '\\_', '![[', '[^', '|', '```', '~~~', '$$', '>', '^'];
const count = (s, t) => s.split(t).length - 1;

/** Violations of "the note still means the same" after an edit from `before` to `after`. */
export function violations(before, after, color) {
	const v = [];
	// (a) visible text unchanged
	if (strip(after) !== strip(before)) v.push('visible text changed');
	// (b) structure: same lines outside the touched ones, same syntax tokens, same prefixes
	const bl = before.split('\n');
	const al = after.split('\n');
	if (bl.length !== al.length) v.push(`line count ${bl.length} -> ${al.length}`);
	const noMarks = (t) => t.replace(/<\/?mark\b[^>]*>/gi, '');
	for (const t of TOKENS) {
		if (count(noMarks(before), t) !== count(noMarks(after), t)) v.push(`count of ${JSON.stringify(t)} changed`);
	}
	const regions = forbiddenRegions(strip(before));
	// lines in properties/code/math: byte-identical
	let pos = 0;
	const stripLines = strip(before).split('\n');
	stripLines.forEach((line, i) => {
		const end = pos + line.length;
		const r = regions.find((x) => x.start <= pos && x.end >= end && /properties|code block|math block|fence|math fence|rule/.test(x.why));
		const same = (x, y) => (r && /table/.test(r.why) ? canonTableLine(x) === canonTableLine(y) : x === y);
		if (r && !same(noMarks(al[i] ?? ''), noMarks(bl[i] ?? ''))) v.push(`${r.why} line ${i + 1} changed`);
		if (r && !same(al[i] ?? '', bl[i] ?? '')) v.push(`${r.why} line ${i + 1} not byte-identical`);
		pos = end + 1;
	});
	// (c)+(d) a new highlight never sits inside a construct that would not render it
	if (color) {
		// only highlights this edit added (the note may already hold marks of the same color)
		const had = paintedRanges(before, color).map((p) => p.text);
		const added = paintedRanges(after, color).filter((p) => {
			const i = had.indexOf(p.text);
			if (i >= 0) {
				had.splice(i, 1);
				return false;
			}
			return true;
		});
		for (const p of added) {
			const bad = regions.find((r) => p.start < r.end && p.end > r.start);
			if (bad) v.push(`${color} mark over ${bad.why}: ${JSON.stringify(p.text)}`);
			if (/[*_~`[\]\\|]/.test(p.text.replace(/\\/g, '')) && /[*`[\]]/.test(p.text)) v.push(`syntax characters inside a mark: ${JSON.stringify(p.text)}`);
		}
	}
	return v;
}

