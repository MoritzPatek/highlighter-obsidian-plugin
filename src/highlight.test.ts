import { describe, expect, it } from 'vitest';
import {
	applyEdit,
	applyHighlight,
	buildMark,
	endsInsideFence,
	codeRanges,
	findHighlights,
	getHighlightState,
	removeHighlight,
	selectionTouchesCode,
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

describe('review fixes: == in prose and code', () => {
	it('does not treat `a == b && c == d` as a native highlight', () => {
		const t = 'if (a == b && c == d)';
		expect(findHighlights(t)).toEqual([]);
		const { out } = apply(t, 'b');
		expect(out).toBe(`if (a == ${mark('b')} && c == d)`);
		expect(out.match(/==/g)).toHaveLength(2);
	});
	it('does not treat `a == b == c` as a native highlight; remove is a no-op', () => {
		expect(findHighlights('a == b == c')).toEqual([]);
		const t = 'a == b == c';
		const at = t.indexOf('b');
		expect(removeHighlight(t, at, at)).toBeNull();
	});
	it('leaves prose like `x == y` alone', () => {
		expect(findHighlights('x == y')).toEqual([]);
		expect(apply('x == y', 'y').out).toBe(`x == ${mark('y')}`);
	});
	it('still finds real native highlights', () => {
		expect(findHighlights('a ==real one== b')).toHaveLength(1);
		expect(findHighlights('==x==')).toHaveLength(1);
		expect(findHighlights('== no==')).toEqual([]);
		expect(findHighlights('==no ==')).toEqual([]);
	});
	it('ignores highlights inside inline code and fenced blocks', () => {
		expect(findHighlights('use `==x==` here')).toEqual([]);
		expect(findHighlights('```\n==x==\n```')).toEqual([]);
	});
	it('detects selections touching code', () => {
		const t = 'see `code here` ok';
		expect(selectionTouchesCode(t, t.indexOf('code'), t.indexOf('here'))).toBe(true);
		expect(selectionTouchesCode(t, 0, 3)).toBe(false);
		expect(selectionTouchesCode(t, 0, t.length)).toBe(false); // whole span is fine
		expect(selectionTouchesCode('```\nx = 1\n```', 4, 9)).toBe(true);
		expect(selectionTouchesCode('x = 1', 0, 3, { char: '`', len: 3 })).toBe(true);
	});
	it('knows when the document is inside an open fence', () => {
		expect(endsInsideFence('a\n```js\nx')).toEqual({ char: '`', len: 3 });
		expect(endsInsideFence('a\n```js\nx\n```\nb')).toBeNull();
	});
});

describe('review fixes: formatting markers', () => {
	it('expands a partial selection to the whole bold run', () => {
		const t = '**bold** text';
		const { out } = apply(t, 'bold** t');
		expect(out).toBe(`${mark('**bold** t')}ext`);
	});
	it('expands when the selection starts inside the opening marker', () => {
		const t = 'a **bold** b';
		const from = t.indexOf('**') + 1;
		const edit = applyHighlight(t, from, t.indexOf('bold') + 2, Y) as TextEdit;
		expect(applyEdit(t, edit)).toBe(`a ${mark('**bold**')} b`);
	});
	it('handles italic, strike and code runs', () => {
		expect(apply('x *it* y', 'it* y').out).toBe(`x ${mark('*it* y')}`);
		expect(apply('x ~~gone~~ y', 'x ~~go').out).toBe(`${mark('x ~~gone~~')} y`);
		expect(apply('x `c` y', 'x `').out).toBe(`${mark('x `c`')} y`);
	});
	it('leaves a selection strictly inside the run content alone', () => {
		expect(apply('**bold text**', 'old').out).toBe(`**b${mark('old')} text**`);
	});
	it('does not mistake list stars or snake_case for markers', () => {
		expect(apply('* item here', 'item').out).toBe(`* ${mark('item')} here`);
		expect(apply('a snake_case_name b', 'case').out).toBe(`a snake_${mark('case')}_name b`);
	});
});

describe('final fixes: remove respects code, CommonMark fences', () => {
	const fence3 = { char: '`', len: 3 } as const;
	it('does not find or remove ==x== inside a fence opened above', () => {
		const t = '==x== in code';
		expect(findHighlights(t, fence3)).toEqual([]);
		expect(removeHighlight(t, 2, 2, fence3)).toBeNull();
		expect(removeHighlight(t, 2, 2)).not.toBeNull(); // outside code it still works
		expect(getHighlightState(t, 2, 2, fence3).highlighted).toBe(false);
		expect(applyHighlight('abc', 0, 3, Y, fence3)).not.toBeNull(); // pure logic only ignores spans
	});
	it('ignores ==x== inside a fence within the text', () => {
		expect(removeHighlight('```\n==x==\n```', 6, 6)).toBeNull();
	});
	it('a four-backtick fence is not closed by a three-backtick line', () => {
		const t = '````\n```\n==x==\n````\n==y==';
		const spans = findHighlights(t);
		expect(spans).toHaveLength(1);
		expect(t.slice(spans[0]!.start, spans[0]!.end)).toBe('==y==');
		expect(endsInsideFence('````\n```\nfoo')).toEqual({ char: '`', len: 4 });
	});
	it('``` inside a ~~~ fence does not close it, and vice versa', () => {
		expect(endsInsideFence('~~~\n```\nfoo')).toEqual({ char: '~', len: 3 });
		expect(endsInsideFence('~~~\n```\n~~~\nfoo')).toBeNull();
		expect(endsInsideFence('```\n~~~\nfoo')).toEqual({ char: '`', len: 3 });
	});
	it('a longer closing fence closes; text after the closer does not', () => {
		expect(endsInsideFence('```\nx\n`````')).toBeNull();
		expect(endsInsideFence('```\nx\n``` js')).toEqual({ char: '`', len: 3 });
	});
	it('fences are indented at most 3 spaces; indented code is not a fence', () => {
		expect(endsInsideFence('   ```\nx')).not.toBeNull();
		expect(endsInsideFence('    ```\nx')).toBeNull();
		expect(codeRanges('    ==x== indented')).toEqual([]);
	});
	it('a backtick fence line with a backtick in its info string is inline code, not a fence', () => {
		expect(endsInsideFence('``` a`b\nx')).toBeNull();
	});
});
