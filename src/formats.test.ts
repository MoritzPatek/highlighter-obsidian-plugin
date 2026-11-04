/**
 * Regression suite over "All formats.md": every construct, many selections.
 * For each selection: paint (pink), pen over it (purple), erase part, remove
 * with a caret; after every step check that the note still means the same.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeEditor } from './fakeEditor';
import { highlightSelection, removeSelectionHighlight } from './editorOps';
import { paintedRanges, violations } from '../e2e/invariants.mjs';

const DOC = readFileSync(new URL('../test-vault/All formats.md', import.meta.url), 'utf8');
const PINK = '#FF5C8A55';
const PURPLE = '#A67CFF55';

// ------------------------------------------------------------- selections

const lineStarts: number[] = [];
{
	let o = 0;
	for (const l of DOC.split('\n')) {
		lineStarts.push(o);
		o += l.length + 1;
	}
}
const docLines = DOC.split('\n');

/** Many (from, to) pairs in the note, aimed at every kind of construct. */
function selections(): { from: number; to: number; label: string }[] {
	const out: { from: number; to: number; label: string }[] = [];
	const push = (from: number, to: number, label: string) => {
		if (to > from && from >= 0 && to <= DOC.length) out.push({ from, to, label });
	};
	docLines.forEach((line, i) => {
		const ls = lineStarts[i] as number;
		const le = ls + line.length;
		if (line.trim() === '') return;
		push(ls, le, `line ${i + 1}: whole line`);
		const words = [...line.matchAll(/\S+/g)];
		words.forEach((w, k) => {
			if (k % 3 === 0) push(ls + (w.index as number), ls + (w.index as number) + w[0].length, `line ${i + 1}: word ${w[0]}`);
		});
		push(ls + 3, ls + 9, `line ${i + 1}: mid-word start`);
		push(ls + Math.floor(line.length / 2) - 3, ls + Math.floor(line.length / 2) + 4, `line ${i + 1}: mid-word middle`);
		push(ls + Math.floor(line.length / 3), le, `line ${i + 1}: from a third to the end`);
		const anchors = /\*\*|\[\[|\]\(|`|\$|%%|<|\[\^|#|\||_|~~|==|\\/g;
		let n = 0;
		for (const m of line.matchAll(anchors)) {
			if (n++ >= 3) break;
			const p = ls + (m.index as number);
			push(p - 3, p + 4, `line ${i + 1}: across ${m[0]} (a)`);
			push(p + 1, p + 9, `line ${i + 1}: into ${m[0]} (b)`);
			push(p - 7, p + 1, `line ${i + 1}: up to ${m[0]} (c)`);
		}
	});
	// multi-line runs across blocks
	for (let i = 0; i + 1 < docLines.length; i += 2) {
		for (const k of [1, 2, 4]) {
			const j = Math.min(i + k, docLines.length - 1);
			push((lineStarts[i] as number) + 2, (lineStarts[j] as number) + Math.min(6, (docLines[j] as string).length), `lines ${i + 1}-${j + 1}`);
		}
	}
	return out;
}

// ------------------------------------------------------------------ tests

describe('All formats.md', () => {
	const sels = selections();

	it('the fixture has every section the suite relies on', () => {
		for (const h of ['Headings', 'Inline formatting', 'Code', 'Links and embeds', 'Tags and block references', 'Math', 'Comments and HTML', 'Lists', 'Blockquotes and callouts', 'Tables', 'Horizontal rules', 'Line structure', 'Text and characters', 'Existing highlights']) {
			expect(DOC, h).toContain(`## ${h}`);
		}
		expect(sels.length).toBeGreaterThan(1500);
	});

	it('paint, pen, erase and remove keep the note intact for every selection', () => {
		const failures: string[] = [];
		let painted = 0;
		let skipped = 0;
		for (const s of sels) {
			const ed = new FakeEditor(DOC, s.from, s.to);
			const res = highlightSelection(ed, PINK);
			if (res === 'nothing') {
				if (ed.doc !== DOC) failures.push(`${s.label}: nothing painted but the note changed`);
				skipped++;
				continue;
			}
			painted++;
			const d1 = ed.doc;
			for (const v of violations(DOC, d1, PINK)) failures.push(`${s.label} [paint]: ${v}`);

			// pen: another color over part of the new highlight and beyond it
			const first = paintedRanges(d1, PINK)[0];
			if (!first) continue;
			const markAt = d1.indexOf('<mark style="background: ' + PINK + ';">');
			const open = d1.indexOf('>', markAt) + 1;
			const close = d1.indexOf('</mark>', open);
			const mid = open + Math.max(1, Math.floor((close - open) / 3));
			const ed2 = new FakeEditor(d1, mid, Math.min(d1.length, close + 9));
			highlightSelection(ed2, PURPLE);
			for (const v of violations(d1, ed2.doc, PURPLE)) failures.push(`${s.label} [pen]: ${v}`);

			// eraser: unwrap the middle of the first mark
			const ed3 = new FakeEditor(ed2.doc, mid, Math.min(ed2.doc.length, mid + 3));
			removeSelectionHighlight(ed3);
			for (const v of violations(ed2.doc, ed3.doc, null)) failures.push(`${s.label} [erase]: ${v}`);

			// caret remove: whole highlight at the caret
			const ed4 = new FakeEditor(ed3.doc, 0, 0);
			const at = ed3.doc.indexOf('>', ed3.doc.indexOf('<mark', 0)) + 2;
			if (at > 1) {
				ed4.sel = { from: at, to: at };
				removeSelectionHighlight(ed4);
				for (const v of violations(ed3.doc, ed4.doc, null)) failures.push(`${s.label} [remove]: ${v}`);
			}
			if (failures.length > 40) break;
		}
		expect(painted).toBeGreaterThan(1000);
		expect(failures.slice(0, 40)).toEqual([]);
		expect(skipped).toBeGreaterThan(50); // code, math, properties, links ... really are skipped
	}, 120000);
});

describe('large selections (owner bug: raw <mark> after a big selection)', () => {
	const note = (n: string) => readFileSync(new URL(`../test-vault/${n}`, import.meta.url), 'utf8');
	for (const name of ['Sample text.md', 'Lists and table.md', 'All formats.md']) {
		it(`select-all over ${name} breaks nothing and paints no indented code`, () => {
			const doc = note(name);
			const ed = new FakeEditor(doc, 0, doc.length);
			expect(highlightSelection(ed, PINK)).toBe('ok');
			expect(violations(doc, ed.doc, PINK)).toEqual([]);
			expect(ed.doc).not.toMatch(/^( {4,}|\t)<mark/m);
			ed.undo();
			expect(ed.doc).toBe(doc);
		});
	}
	it("the owner's selection: from inside a native highlight to the end of a heading", () => {
		const doc = note('Sample text.md');
		const from = doc.indexOf('==a native highlight==') + 4;
		const to = doc.indexOf('## Multi-line paragraphs') + '## Multi-line paragraphs'.length;
		const ed = new FakeEditor(doc, from, to);
		highlightSelection(ed, '#4DA3FF55');
		expect(violations(doc, ed.doc, '#4DA3FF55')).toEqual([]);
		expect(ed.doc).toContain('==a== <mark style="background: #4DA3FF55;">native highlight in the middle.');
		expect(ed.doc).toContain('## <mark style="background: #4DA3FF55;">Multi-line paragraphs</mark>');
	});
});
