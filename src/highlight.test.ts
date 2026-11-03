import { describe, expect, it } from 'vitest';
import {
	applyEdit,
	applyHighlight,
	buildMark,
	findHighlights,
	getHighlightState,
	removeHighlight,
	type TextEdit,
} from './highlight';

const Y = '#FFF3A3A6';
const G = '#BBFABBA6';
const mark = (t: string, c = Y) => `<mark style="background: ${c};">${t}</mark>`;

/** Highlight the first occurrence of `sel` in `text` and return the new text and edit. */
function apply(text: string, sel: string, color = Y) {
	const from = text.indexOf(sel);
	expect(from).toBeGreaterThanOrEqual(0);
	const edit = applyHighlight(text, from, from + sel.length, color) as TextEdit;
	expect(edit).not.toBeNull();
	return { out: applyEdit(text, edit), edit };
}

function remove(text: string, sel: string) {
	const from = text.indexOf(sel);
	const edit = removeHighlight(text, from, from + sel.length);
	return edit ? applyEdit(text, edit) : null;
}

describe('buildMark', () => {
	it('uses the inline background format', () => {
		expect(buildMark('hi', Y)).toBe('<mark style="background: #FFF3A3A6;">hi</mark>');
	});
});

describe('findHighlights', () => {
	it('finds marks and native highlights with colors and content offsets', () => {
		const text = `a ${mark('one')} b ==two== c`;
		const spans = findHighlights(text);
		expect(spans.map((s) => [s.kind, s.color])).toEqual([
			['mark', Y],
			['native', null],
		]);
		const first = spans[0]!;
		expect(text.slice(first.contentStart, first.contentEnd)).toBe('one');
		const second = spans[1]!;
		expect(text.slice(second.contentStart, second.contentEnd)).toBe('two');
	});

	it('recognizes bare <mark> and background-color, case-insensitively', () => {
		const spans = findHighlights('<mark>a</mark> <MARK style="background-color:#fff;">b</MARK>');
		expect(spans).toHaveLength(2);
		expect(spans[0]!.color).toBeNull();
		expect(spans[1]!.color).toBe('#fff');
	});

	it('ignores marks with unrelated attributes', () => {
		expect(findHighlights('<mark class="x">a</mark>')).toHaveLength(0);
	});

	it('does not treat === or a lone == as highlights', () => {
		expect(findHighlights('a === b')).toHaveLength(0);
		expect(findHighlights('x == y')).toHaveLength(0);
	});
});

describe('applyHighlight: plain selection', () => {
	it('wraps the selection', () => {
		const { out } = apply('hello big world', 'big');
		expect(out).toBe(`hello ${mark('big')} world`);
	});

	it('selects the highlighted content afterwards', () => {
		const { out, edit } = apply('hello big world', 'big');
		expect(out.slice(edit.selFrom, edit.selTo)).toBe('big');
	});

	it('keeps surrounding whitespace outside the tags', () => {
		const { out } = apply('a  big word  b', '  big word  ');
		expect(out).toBe(`a  ${mark('big word')}  b`);
	});

	it('returns null for a whitespace-only selection', () => {
		expect(applyHighlight('a   b', 1, 4, Y)).toBeNull();
	});

	it('clamps out-of-range and reversed offsets', () => {
		const edit = applyHighlight('abc', 5, 1, Y) as TextEdit;
		expect(applyEdit('abc', edit)).toBe(`a${mark('bc')}`);
	});

	it('keeps markdown formatting inside the mark', () => {
		const { out } = apply('x **bold** y', '**bold**');
		expect(out).toBe(`x ${mark('**bold**')} y`);
	});
});

describe('applyHighlight: recolor, never nest', () => {
	const text = `before ${mark('target')} after`;

	it('recolors when the selection is the content', () => {
		const { out } = apply(text, 'target', G);
		expect(out).toBe(`before ${mark('target', G)} after`);
	});

	it('recolors when the selection includes the tags', () => {
		const { out } = apply(text, mark('target'), G);
		expect(out).toBe(`before ${mark('target', G)} after`);
	});

	it('recolors the whole mark when the selection is a part of the content', () => {
		const { out } = apply(`x ${mark('two words')} y`, 'words', G);
		expect(out).toBe(`x ${mark('two words', G)} y`);
	});

	it('recoloring with the same color is stable', () => {
		const { out } = apply(text, 'target', Y);
		expect(out).toBe(text);
	});

	it('merges a selection that partially overlaps a mark', () => {
		const t = `aa ${mark('bb cc')} dd`;
		// Selection runs from the start of "aa" into the middle of the mark's content.
		const edit = applyHighlight(t, 0, t.indexOf('bb') + 2, G) as TextEdit;
		expect(applyEdit(t, edit)).toBe(`${mark('aa bb cc', G)} dd`);
	});

	it('merges several marks covered by one selection', () => {
		const t = `${mark('a')} and ${mark('b', G)}`;
		const { out } = apply(t, t, G);
		expect(out).toBe(mark('a and b', G));
	});

	it('does not touch an adjacent mark that is only bordering the selection', () => {
		const t = `${mark('a')}bc`;
		const { out } = apply(t, 'bc', G);
		expect(out).toBe(`${mark('a')}${mark('bc', G)}`);
	});

	it('removes native markers nested inside a mark', () => {
		const { out } = apply(`<mark>x ==y== z</mark>`, 'y', G);
		expect(out).toBe(mark('x y z', G));
	});

	it('handles a bare <mark>', () => {
		const { out } = apply('a <mark>b</mark> c', 'b', G);
		expect(out).toBe(`a ${mark('b', G)} c`);
	});
});

describe('applyHighlight: native ==x== conversion', () => {
	it('converts when the selection includes the markers', () => {
		const { out } = apply('see ==this== now', '==this==');
		expect(out).toBe(`see ${mark('this')} now`);
	});

	it('converts when the selection is the content', () => {
		const { out } = apply('see ==this one== now', 'this');
		expect(out).toBe(`see ${mark('this one')} now`);
	});

	it('converts several native highlights inside a selection', () => {
		const { out } = apply('==a== plain ==b==', '==a== plain ==b==');
		expect(out).toBe(mark('a plain b'));
	});
});

describe('applyHighlight: empty selection', () => {
	it('inserts an empty mark with the cursor between the tags', () => {
		const text = 'ab';
		const edit = applyHighlight(text, 1, 1, Y) as TextEdit;
		const out = applyEdit(text, edit);
		expect(out).toBe(`a${mark('')}b`);
		expect(edit.selFrom).toBe(edit.selTo);
		expect(out.slice(0, edit.selFrom).endsWith('">')).toBe(true);
		expect(out.slice(edit.selTo).startsWith('</mark>')).toBe(true);
	});

	it('recolors the highlight the cursor is in, keeping the cursor', () => {
		const text = `x ${mark('hello')} y`;
		const cursor = text.indexOf('llo');
		const edit = applyHighlight(text, cursor, cursor, G) as TextEdit;
		const out = applyEdit(text, edit);
		expect(out).toBe(`x ${mark('hello', G)} y`);
		expect(out.slice(edit.selFrom, edit.selFrom + 3)).toBe('llo');
	});

	it('recolors when the cursor is at the end of the content', () => {
		const text = mark('hi');
		const cursor = text.indexOf('</mark>');
		const out = applyEdit(text, applyHighlight(text, cursor, cursor, G) as TextEdit);
		expect(out).toBe(mark('hi', G));
	});

	it('converts the native highlight the cursor is in', () => {
		const text = 'a ==hey== b';
		const cursor = text.indexOf('ey');
		const out = applyEdit(text, applyHighlight(text, cursor, cursor, G) as TextEdit);
		expect(out).toBe(`a ${mark('hey', G)} b`);
	});

	it('inserts a new empty mark when the cursor is just outside a highlight', () => {
		const text = `${mark('hi')} x`;
		const cursor = text.indexOf(' x');
		const out = applyEdit(text, applyHighlight(text, cursor, cursor, G) as TextEdit);
		expect(out).toBe(`${mark('hi')}${mark('', G)} x`);
	});
});

describe('applyHighlight: multi-line', () => {
	it('wraps each line and skips blank lines', () => {
		const { out } = apply('one\ntwo\n\nthree', 'one\ntwo\n\nthree');
		expect(out).toBe(`${mark('one')}\n${mark('two')}\n\n${mark('three')}`);
	});

	it('keeps CRLF line endings', () => {
		const { out } = apply('a\r\nb', 'a\r\nb');
		expect(out).toBe(`${mark('a')}\r\n${mark('b')}`);
	});

	it('does not wrap a trailing newline', () => {
		const { out } = apply('a\nb\nc', 'a\nb\n');
		expect(out).toBe(`${mark('a')}\n${mark('b')}\nc`);
	});

	it('wraps a mid-line start and end', () => {
		const { out } = apply('start one\ntwo end', 'one\ntwo');
		expect(out).toBe(`start ${mark('one')}\n${mark('two')} end`);
	});

	it('selection covers from first to last wrapped content', () => {
		const { out, edit } = apply('a\nb', 'a\nb');
		expect(out.slice(edit.selFrom, edit.selTo)).toBe(`a${'</mark>'}\n${'<mark style="background: ' + Y + ';">'}b`);
	});

	it('recolors a user-written mark that spans lines by re-wrapping per line', () => {
		const t = `<mark>one\ntwo</mark>`;
		const { out } = apply(t, 'one', G);
		expect(out).toBe(`${mark('one', G)}\n${mark('two', G)}`);
	});
});

describe('applyHighlight: block structure', () => {
	it('keeps list markers outside the marks', () => {
		const sel = '- one\n- two\n  - three';
		const { out } = apply(sel, sel);
		expect(out).toBe(`- ${mark('one')}\n- ${mark('two')}\n  - ${mark('three')}`);
	});

	it('keeps numbered, task, quote and heading markers outside', () => {
		const sel = '1. a\n- [ ] b\n> c\n## d\n> - e';
		const { out } = apply(sel, sel);
		expect(out).toBe(
			`1. ${mark('a')}\n- [ ] ${mark('b')}\n> ${mark('c')}\n## ${mark('d')}\n> - ${mark('e')}`,
		);
	});

	it('treats a selection starting after indentation as the line start', () => {
		const t = '  - item';
		const { out } = apply(t, '- item');
		expect(out).toBe(`  - ${mark('item')}`);
	});

	it('does not strip markers when the selection starts mid-line', () => {
		const { out } = apply('text - not a list', '- not');
		expect(out).toBe(`text ${mark('- not')} a list`);
	});

	it('wraps table cells separately and leaves pipes and the delimiter row alone', () => {
		const sel = '| a | b |\n|---|:-:|\n| c d | e |';
		const { out } = apply(sel, sel);
		expect(out).toBe(
			`| ${mark('a')} | ${mark('b')} |\n|---|:-:|\n| ${mark('c d')} | ${mark('e')} |`,
		);
	});

	it('wraps only the cell when the selection is inside a table cell', () => {
		const t = '| alpha | beta |';
		const { out } = apply(t, 'beta');
		expect(out).toBe(`| alpha | ${mark('beta')} |`);
	});

	it('does not split on escaped pipes in table cells', () => {
		const sel = '| a \\| b | c |';
		const { out } = apply(sel, sel);
		expect(out).toBe(`| ${mark('a \\| b')} | ${mark('c')} |`);
	});
});

describe('applyHighlight: special characters', () => {
	it('keeps HTML, ampersands and angle brackets untouched', () => {
		const sel = 'a < b && c > d <b>bold</b> &amp;';
		const { out } = apply(`x ${sel} y`, sel);
		expect(out).toBe(`x ${mark(sel)} y`);
	});

	it('does not interpret $ replacement patterns', () => {
		const { out } = apply('cost $& $1 $$ here', '$& $1 $$');
		expect(out).toBe(`cost ${mark('$& $1 $$')} here`);
	});

	it('handles a stray unclosed <mark> in the selection without throwing', () => {
		const { out } = apply('a <mark> b', '<mark> b');
		expect(out).toBe(`a ${mark('<mark> b')}`);
	});

	it('keeps wiki links, emoji and quotes', () => {
		const sel = '[[Note|alias]] "q" 🎉 `code`';
		const { out } = apply(sel, sel);
		expect(out).toBe(mark(sel));
	});

	it('writes whatever color string it is given', () => {
		const { out } = apply('a', 'a', '#12345678');
		expect(out).toBe(mark('a', '#12345678'));
	});
});

describe('removeHighlight', () => {
	it('unwraps a mark when the content is selected', () => {
		expect(remove(`a ${mark('b')} c`, 'b')).toBe('a b c');
	});

	it('unwraps a mark when the tags are selected too', () => {
		expect(remove(`a ${mark('b')} c`, mark('b'))).toBe('a b c');
	});

	it('unwraps the whole mark when part of the content is selected', () => {
		expect(remove(`a ${mark('two words')} c`, 'words')).toBe('a two words c');
	});

	it('unwraps a native highlight', () => {
		expect(remove('a ==b== c', 'b')).toBe('a b c');
	});

	it('unwraps all highlights in a multi-line selection', () => {
		const t = `${mark('a')}\n${mark('b', G)}\n==c==`;
		expect(remove(t, t)).toBe('a\nb\nc');
	});

	it('leaves unrelated highlights alone', () => {
		const t = `${mark('a')} ${mark('b', G)}`;
		expect(remove(t, 'a')).toBe(`a ${mark('b', G)}`);
	});

	it('returns null when nothing is highlighted', () => {
		expect(removeHighlight('plain text', 0, 5)).toBeNull();
		expect(removeHighlight('plain text', 2, 2)).toBeNull();
	});

	it('removes the highlight around the cursor and keeps the cursor on the same character', () => {
		const text = `x ${mark('hello')} y`;
		const cursor = text.indexOf('llo');
		const edit = removeHighlight(text, cursor, cursor) as TextEdit;
		const out = applyEdit(text, edit);
		expect(out).toBe('x hello y');
		expect(out.slice(edit.selFrom, edit.selFrom + 3)).toBe('llo');
	});

	it('strips native markers nested in a removed mark', () => {
		expect(remove('<mark>x ==y== z</mark>', 'x')).toBe('x y z');
	});

	it('is the inverse of apply for a simple selection', () => {
		const { out } = apply('hello big world', 'big');
		expect(remove(out, 'big')).toBe('hello big world');
	});
});

describe('getHighlightState', () => {
	it('reports plain text as not highlighted', () => {
		expect(getHighlightState('abc def', 0, 3)).toEqual({ highlighted: false, color: null, kind: null });
	});

	it('reports a selected mark with its color', () => {
		const t = `a ${mark('b', G)} c`;
		const from = t.indexOf('b');
		expect(getHighlightState(t, from, from + 1)).toEqual({ highlighted: true, color: G, kind: 'mark' });
	});

	it('reports a native highlight', () => {
		const t = 'a ==b== c';
		expect(getHighlightState(t, 5, 6)).toEqual({ highlighted: true, color: null, kind: 'native' });
	});

	it('reports a cursor inside a highlight', () => {
		const t = mark('abc');
		const c = t.indexOf('bc');
		expect(getHighlightState(t, c, c).highlighted).toBe(true);
	});

	it('reports a selection that merely touches the edge as not highlighted', () => {
		const t = `${mark('a')}bc`;
		const from = t.indexOf('bc');
		expect(getHighlightState(t, from, from + 2).highlighted).toBe(false);
	});

	it('reports a mixed selection as highlighted', () => {
		const t = `plain ${mark('b')} plain`;
		expect(getHighlightState(t, 0, t.length).highlighted).toBe(true);
	});
});
