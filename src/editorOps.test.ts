import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	applyEdit,
	captureSelection,
	pickerCurrentIndex,
	pickerFocusIndex,
	expandSelectionToTarget,
	restoreSelection,
	getSelectionContext,
	highlightSelection,
	removeSelectionHighlight,
	type EditorLike,
	type Pos,
} from './editorOps';
import { findHighlights } from './highlight';
import { DEFAULT_COLORS } from './settings';

/** A string-backed fake of the Obsidian Editor methods we use. */
class FakeEditor implements EditorLike {
	sel: { from: number; to: number };
	constructor(
		public doc: string,
		from: number,
		to: number,
	) {
		this.sel = { from, to };
	}
	lineCount(): number {
		return this.lines().length;
	}
	private lines() {
		return this.doc.split('\n');
	}
	offsetToPos(offset: number): Pos {
		const before = this.doc.slice(0, offset).split('\n');
		return { line: before.length - 1, ch: (before[before.length - 1] as string).length };
	}
	posToOffset(pos: Pos): number {
		const lines = this.lines();
		let o = 0;
		for (let i = 0; i < pos.line; i++) o += (lines[i] as string).length + 1;
		return o + pos.ch;
	}
	getCursor(which: 'from' | 'to' | 'head' | 'anchor' = 'head'): Pos {
		return this.offsetToPos(which === 'from' || which === 'anchor' ? this.sel.from : this.sel.to);
	}
	getLine(line: number): string {
		return this.lines()[line] ?? '';
	}
	getRange(from: Pos, to: Pos): string {
		return this.doc.slice(this.posToOffset(from), this.posToOffset(to));
	}
	replaceRange(text: string, from: Pos, to: Pos = from): void {
		this.doc = this.doc.slice(0, this.posToOffset(from)) + text + this.doc.slice(this.posToOffset(to));
	}
	setSelection(anchor: Pos, head: Pos = anchor): void {
		const a = this.posToOffset(anchor);
		const b = this.posToOffset(head);
		this.sel = { from: Math.min(a, b), to: Math.max(a, b) };
	}
	setCursor(pos: Pos): void {
		const o = this.posToOffset(pos);
		this.sel = { from: o, to: o };
	}
}

const YELLOW = DEFAULT_COLORS[0]!.color;
const plain = (s: string) => s.replace(/<mark[^>]*>|<\/mark>/g, '').replace(/==/g, '');

describe('editor glue with a fake editor', () => {
	const line =
		'This sentence has ==a native highlight== in the middle. Here is ==another one== and ==a third native highlight==. Obsidian only offers this one yellow color.';

	it('applies at the selected offsets, even on a later line, and touches nothing else', () => {
		const doc = `# Title\n\n## Already colored (from this plugin)\n\n${line}\n\nend`;
		const from = doc.indexOf('middle');
		const to = doc.indexOf('Obsidian');
		const ed = new FakeEditor(doc, from, to);
		expect(highlightSelection(ed, YELLOW)).toBe('ok');
		const [head, rest] = [doc.slice(0, from), ed.doc];
		expect(rest.startsWith(head)).toBe(true);
		expect(ed.doc).toContain('## Already colored (from this plugin)');
		expect(ed.doc).toContain(`<mark style="background: ${YELLOW};">middle. Here is another one and a third native highlight.</mark> Obsidian`);
		// natives outside the selection are untouched
		expect(ed.doc).toContain('==a native highlight==');
		expect(plain(ed.doc)).toBe(plain(doc));
	});

	it('a mid-word selection stays mid-word (no shift)', () => {
		const doc = `## H (from this plugin)\n\nsome words here`;
		const from = doc.indexOf('ords');
		const ed = new FakeEditor(doc, from, from + 4);
		highlightSelection(ed, YELLOW);
		expect(ed.doc).toBe(`## H (from this plugin)\n\nsome w<mark style="background: ${YELLOW};">ords</mark> here`);
		expect(ed.getCursor('from').line).toBe(2);
	});

	it('remove restores the plain text', () => {
		const doc = 'a b c';
		const ed = new FakeEditor(doc, 2, 3);
		highlightSelection(ed, YELLOW);
		ed.sel = { from: ed.doc.indexOf('>b<') + 1, to: ed.doc.indexOf('>b<') + 2 };
		removeSelectionHighlight(ed);
		expect(ed.doc).toBe(doc);
	});

	it('refuses inside code', () => {
		const ed = new FakeEditor('```\nx = 1\n```', 5, 8);
		expect(highlightSelection(ed, YELLOW)).toBe('code');
		expect(ed.doc).toBe('```\nx = 1\n```');
	});

	it('restores the selection the user saw if it moved while the picker was open', () => {
		const doc = 'one two three\nfour five six';
		const from = doc.indexOf('two');
		const ed = new FakeEditor(doc, from, from + 3);
		const snap = captureSelection(ed);
		ed.sel = { from: 20, to: 24 }; // moved by something while the picker was open
		expect(restoreSelection(ed, snap)).toBe(true);
		highlightSelection(ed, YELLOW);
		expect(ed.doc).toBe(`one <mark style="background: ${YELLOW};">two</mark> three\nfour five six`);
	});

	it('does not restore when the text under the snapshot changed', () => {
		const ed = new FakeEditor('one two', 4, 7);
		const snap = captureSelection(ed);
		ed.doc = 'xxx yyy';
		ed.sel = { from: 0, to: 1 };
		expect(restoreSelection(ed, snap)).toBe(false);
		expect(ed.sel).toEqual({ from: 0, to: 1 });
	});

	it('expands the visible selection over a cut **bold** run, not over highlights; apply is unchanged by it', () => {
		const doc = 'x **bold** y ==nat== z';
		const from = doc.indexOf('old');
		const to = doc.indexOf(' y');
		const direct = new FakeEditor(doc, from, to);
		highlightSelection(direct, YELLOW);
		const ed = new FakeEditor(doc, from, to);
		expect(expandSelectionToTarget(ed)).toBe(true);
		expect(ed.sel).toEqual({ from: doc.indexOf('**'), to });
		highlightSelection(ed, YELLOW);
		expect(ed.doc).toBe(direct.doc);
		// no widening over a highlight the selection only partly covers
		const hl = new FakeEditor('a ==nat== b', 4, 6);
		expect(expandSelectionToTarget(hl)).toBe(false);
		expect(expandSelectionToTarget(new FakeEditor('plain text', 0, 5))).toBe(false);
		expect(expandSelectionToTarget(new FakeEditor('plain', 2, 2))).toBe(false);
	});

	it('puts the caret one character past </mark> so Live Preview renders it', () => {
		const doc = 'one two three';
		const ed = new FakeEditor(doc, 4, 7);
		highlightSelection(ed, YELLOW);
		expect(ed.doc.slice(ed.sel.from - 8, ed.sel.from)).toBe('</mark> ');
		expect(ed.sel.from).toBe(ed.sel.to);
	});

	it('steps over a whole emoji (surrogate pair) after the mark', () => {
		const ed = new FakeEditor('one two\u{1F389}x', 4, 7);
		highlightSelection(ed, YELLOW);
		expect(ed.doc.slice(0, ed.sel.from).endsWith('</mark>\u{1F389}')).toBe(true);
		expect(ed.doc.slice(ed.sel.from)).toBe('x');
	});

	it('steps over a combining accent after the mark', () => {
		const ed = new FakeEditor('one two\u0065\u0301x', 4, 7);
		highlightSelection(ed, YELLOW);
		expect(ed.doc.slice(ed.sel.from)).toBe('x');
	});

	it('parks the caret behind a native ==x== that touches the new mark (pen split)', () => {
		const doc = 'x ==abc== y';
		const b = doc.indexOf('b');
		const ed = new FakeEditor(doc, b, b + 1);
		highlightSelection(ed, YELLOW);
		expect(ed.doc.slice(0, ed.sel.from).endsWith('==c== ')).toBe(true);
		expect(ed.doc.slice(ed.sel.from)).toBe('y');
	});

	it('parks the caret behind a following <mark> element and a bold run', () => {
		const mark2 = '<mark style="background: #3DDC8455;">g</mark>';
		const ed = new FakeEditor(`one two${mark2} z`, 4, 7);
		highlightSelection(ed, YELLOW);
		expect(ed.doc.slice(0, ed.sel.from).endsWith(`${mark2} `)).toBe(true);
		const ed2 = new FakeEditor('one two**bold** z', 4, 7);
		highlightSelection(ed2, YELLOW);
		expect(ed2.doc.slice(0, ed2.sel.from).endsWith('**bold** ')).toBe(true);
		const ed3 = new FakeEditor('one two~~gone~~', 4, 7);
		highlightSelection(ed3, YELLOW);
		expect(ed3.doc.slice(ed3.sel.from)).toBe('');
	});

	it('at the end of a line the caret goes to the start of the next line', () => {
		const ed = new FakeEditor('one two\nnext', 4, 7);
		highlightSelection(ed, YELLOW);
		expect(ed.getCursor('head')).toEqual({ line: 1, ch: 0 });
	});

	it('at the very end of the document the caret stays after </mark>', () => {
		const ed = new FakeEditor('one two', 4, 7);
		highlightSelection(ed, YELLOW);
		expect(ed.doc.endsWith('</mark>')).toBe(true);
		expect(ed.sel.from).toBe(ed.doc.length);
	});

	it('recoloring from a caret inside a mark also moves the caret out of it', () => {
		const doc = `a <mark style="background: #FFF3A3A6;">word</mark> b`;
		const at = doc.indexOf('rd');
		const ed = new FakeEditor(doc, at, at);
		highlightSelection(ed, YELLOW);
		expect(ed.doc.slice(0, ed.sel.from).endsWith('</mark> ')).toBe(true);
	});

	it('applyEdit does nothing for a null edit', () => {
		const ed = new FakeEditor('abc', 0, 1);
		applyEdit(ed, getSelectionContext(ed), null);
		expect(ed.doc).toBe('abc');
	});
});

describe('property: apply then remove over the sample notes', () => {
	for (const file of ['Sample text.md', 'Lists and table.md']) {
		it(`${file}: only the selected lines change, plain text is preserved, round trip works`, () => {
			const original = readFileSync(new URL(`../test-vault/${file}`, import.meta.url), 'utf8');
			const lines = original.split('\n');
			let checked = 0;
			let offset = 0;
			lines.forEach((ln, li) => {
				const lineStart = offset;
				offset += ln.length + 1;
				if (ln.trim() === '') return;
				// Many (from, to) pairs on this line: caret edges, mid-word, whole line.
				const points = new Set<number>([0, ln.length]);
				for (let i = 1; i < ln.length; i += 3) points.add(i);
				const ps = [...points].sort((x, y) => x - y);
				for (const f of ps) {
					for (const t of ps) {
						if (t <= f) continue;
						if ((f + t) % 5 !== 0 && t - f > 3 && f % 7 !== 0) continue; // thin out
						for (const color of DEFAULT_COLORS) {
							const ed = new FakeEditor(original, lineStart + f, lineStart + t);
							const res = highlightSelection(ed, color.color);
							const after = ed.doc.split('\n');
							const tag = `${file} line ${li + 1} [${f},${t}] ${color.name}`;
							if (res === 'code') {
								expect(ed.doc, tag).toBe(original);
								continue;
							}
							// (c) no other line changes: lines above and below keep their text
							const delta = after.length - lines.length;
							expect(after.slice(0, li), tag).toEqual(lines.slice(0, li));
							expect(after.slice(after.length - (lines.length - li - 1)), tag).toEqual(
								lines.slice(li + 1),
							);
							// the edit is confined to the selected line when it is a single line
							expect(delta, tag).toBe(0);
							const newLine = after[li] as string;
							// (a) text outside the (expanded) range is byte-identical: the part of the
							// line before the earliest touched span/format run and after the latest one
							const spans = findHighlights(ln).filter((s) => s.start < t && s.end > f);
							const runs = [...ln.matchAll(/\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`/g)]
								.map((m) => [m.index as number, (m.index as number) + m[0].length] as const)
								.filter(([s, e]) => s < t && e > f);
							const lo = Math.min(f, ...spans.map((s) => s.start), ...runs.map((r) => r[0]));
							const hi = Math.max(t, ...spans.map((s) => s.end), ...runs.map((r) => r[1]));
							expect(newLine.startsWith(ln.slice(0, lo)), tag).toBe(true);
							expect(newLine.endsWith(ln.slice(hi)), tag).toBe(true);
							// (b) plain text is unchanged
							expect(plain(ed.doc), tag).toBe(plain(original));
							// round trip: remove at the new caret/selection region leaves plain text unchanged
							const mid = ed.doc.indexOf('<mark', lineStart);
							if (mid >= 0) {
								ed.sel = { from: mid + 1, to: mid + 1 };
								removeSelectionHighlight(ed);
								expect(plain(ed.doc), tag).toBe(plain(original));
							}
							checked++;
						}
					}
				}
			});
			expect(checked).toBeGreaterThan(500);
		});
	}
});

describe('property: multi-line selections', () => {
	for (const file of ['Sample text.md', 'Lists and table.md']) {
		it(`${file}: lines outside the selection are untouched, plain text preserved`, () => {
			const original = readFileSync(new URL(`../test-vault/${file}`, import.meta.url), 'utf8');
			const lines = original.split('\n');
			const starts: number[] = [];
			let o = 0;
			for (const l of lines) {
				starts.push(o);
				o += l.length + 1;
			}
			let checked = 0;
			for (let l1 = 0; l1 < lines.length; l1++) {
				for (let l2 = l1 + 1; l2 <= Math.min(l1 + 4, lines.length - 1); l2++) {
					for (const c1 of [0, 3, 10]) {
						for (const c2 of [2, 9, 1000]) {
							const f = starts[l1]! + Math.min(c1, lines[l1]!.length);
							const t = starts[l2]! + Math.min(c2, lines[l2]!.length);
							for (const color of [DEFAULT_COLORS[1]!, DEFAULT_COLORS[3]!]) {
								const ed = new FakeEditor(original, f, t);
								const res = highlightSelection(ed, color.color);
								const tag = `${file} ${l1}:${c1} -> ${l2}:${c2}`;
								if (res === 'code') continue;
								const after = ed.doc.split('\n');
								expect(after.length, tag).toBe(lines.length);
								expect(after.slice(0, l1), tag).toEqual(lines.slice(0, l1));
								expect(after.slice(l2 + 1), tag).toEqual(lines.slice(l2 + 1));
								expect(plain(ed.doc), tag).toBe(plain(original));
								checked++;
							}
						}
					}
				}
			}
			expect(checked).toBeGreaterThan(200);
		});
	}
});

describe('pickerFocusIndex', () => {
	const colors = DEFAULT_COLORS;
	const ctx = (text: string, from: number, to: number) => ({ base: 0, text, from, to, fence: null });
	const mk = (c: string, t: string) => `<mark style="background: ${c};">${t}</mark>`;
	it('focuses the color of the one highlight the caret or selection is in', () => {
		const t = `a ${mk('#3DDC8455', 'green')} b`;
		const at = t.indexOf('reen');
		expect(pickerFocusIndex(ctx(t, at, at), colors, 0)).toBe(1);
		expect(pickerFocusIndex(ctx(t, at, at + 2), colors, 0)).toBe(1);
		expect(pickerFocusIndex(ctx(t, 2, t.indexOf('</mark>') + 7), colors, 3)).toBe(1); // exactly on it
	});
	it('matches case-insensitively', () => {
		const t = mk('#3ddc8455', 'g');
		expect(pickerFocusIndex(ctx(t, t.indexOf('g>') + 2, t.indexOf('g>') + 2), colors, 0)).toBe(1);
	});
	it('falls back to the last-used color otherwise', () => {
		const t = `plain ${mk('#3DDC8455', 'green')} ${mk('#FF5C8A55', 'pink')} ==nat== ${mk('#123456AA', 'odd')}`;
		expect(pickerFocusIndex(ctx(t, 0, 3), colors, 4)).toBe(4); // plain text
		expect(pickerFocusIndex(ctx(t, 0, t.indexOf('pink')), colors, 4)).toBe(4); // starts outside
		expect(pickerFocusIndex(ctx(t, t.indexOf('green'), t.indexOf('pink')), colors, 4)).toBe(4); // two highlights
		expect(pickerFocusIndex(ctx(t, t.indexOf('nat'), t.indexOf('nat')), colors, 2)).toBe(2); // native has no color
		expect(pickerFocusIndex(ctx(t, t.indexOf('odd'), t.indexOf('odd')), colors, 2)).toBe(2); // not in the palette
	});
});

describe('pickerCurrentIndex', () => {
	const ctx = (text: string, from: number, to: number) => ({ base: 0, text, from, to, fence: null });
	it('is the palette index inside one palette-colored highlight, else -1', () => {
		const t = `a <mark style="background: #FF5C8A55;">pink</mark> b`;
		const at = t.indexOf('ink');
		expect(pickerCurrentIndex(ctx(t, at, at), DEFAULT_COLORS)).toBe(3);
		expect(pickerCurrentIndex(ctx(t, 0, 1), DEFAULT_COLORS)).toBe(-1);
		expect(pickerCurrentIndex(ctx('==n==', 2, 2), DEFAULT_COLORS)).toBe(-1);
	});
});
