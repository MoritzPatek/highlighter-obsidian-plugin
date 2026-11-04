import { describe, expect, it } from 'vitest';
import { blockPrefixLength, blockStateAfter, lineRuns, paintableRuns } from './runs';

/** The plain-text runs of a single line, as strings. */
const runs = (line: string) => lineRuns(line).map(([s, e]) => line.slice(s, e));
const doc = (text: string, fence = null as never, front = 0) => paintableRuns(text, fence, front).map(([s, e]) => text.slice(s, e));

describe('block prefixes are never painted', () => {
	it.each([
		['- item', 2],
		['* item', 2],
		['+ item', 2],
		['1. item', 3],
		['3) item', 3],
		['  - nested', 4],
		['- [ ] task', 6],
		['- [x] done', 6],
		['> quote', 2],
		['> > nested', 4],
		['> - quoted list', 4],
		['## Heading', 3],
		['> [!note] Title', 10],
		['> [!tip]- Fold', 10],
		['[^1]: note', 6],
		['plain text', 0],
		['**bold** start', 0],
	])('%s', (line, len) => {
		expect(blockPrefixLength(line)).toBe(len);
	});
});

describe('inline syntax is cut out of the runs', () => {
	it('emphasis markers separate runs', () => {
		expect(runs('a **bold** b *it* c ~~del~~ d __u__ e _i_ f')).toEqual(['a ', 'bold', ' b ', 'it', ' c ', 'del', ' d ', 'u', ' e ', 'i', ' f']);
	});
	it('code spans, math, comments, escapes', () => {
		expect(runs('see `code` and $x^2$ and %%hidden%% and \\* star')).toEqual(['see ', ' and ', ' and ', ' and ', ' star']);
	});
	it('entities are left alone', () => {
		expect(runs('a &amp; b &#169; c &copy; d')).toEqual(['a ', ' b ', ' c ', ' d']);
	});
	it('footnote definitions are not painted (Reading view drops HTML there)', () => {
		expect(runs('[^1]: The footnote text')).toEqual([]);
		expect(runs('see[^1] here')).toEqual(['see', ' here']);
	});
	it('words joined by underscores are left alone as a whole', () => {
		expect(runs('see snake_case_name and a_b_c here')).toEqual(['see ', ' and ', ' here']);
		expect(runs('use __init__ and _private words')).toEqual(['use ', 'init', ' and ', 'private words']);
	});
	it('prices are not math', () => {
		expect(runs('costs $5 and $10 total')).toEqual(['costs $5 and $10 total']);
	});
	it('links, embeds, footnote refs, urls, autolinks, tags, html, block ids', () => {
		expect(runs('a [[b|c]] d ![[e]] f [g](h) i ![j](k) l[^1] m https://x.y n <https://z.w> o #tag p <b>q</b> r <kbd>s</kbd> t ^id')).toEqual([
			'a ', ' d ', ' f ', ' i ', ' l', ' m ', ' n ', ' o ', ' p ', ' r ', ' t ',
		]);
	});
	it('an existing highlight is part of the run', () => {
		const line = 'a <mark style="background: #FFD60A55;">yellow</mark> b ==nat== c';
		expect(runs(line)).toEqual([line]);
	});
	it('a hash in the middle of a word is not a tag; C# stays', () => {
		expect(runs('C# and a#b are plain')).toEqual(['C# and a#b are plain']);
	});
	it('angle brackets in prose are left unpainted', () => {
		// but a < or > is never painted: inside a mark it made Live Preview show the raw tag
		expect(runs('3 < 5 && 7 > 2')).toEqual(['3 ', ' 5 && 7 ', ' 2']);
	});
});

describe('block structure', () => {
	it('table cells are runs, pipes and the separator row are not', () => {
		expect(runs('| a | **b** | c \\| d |')).toEqual([' a ', ' ', 'b', ' ', ' c ', ' d ']);
		expect(runs('|:--|:-:|--:|')).toEqual([]);
		expect(runs('| wiki | [[a|b]] | x |')).toEqual([' wiki ', ' ', ' ', ' x ']);
	});
	it('rules and blank lines have no runs', () => {
		expect(runs('---')).toEqual([]);
		expect(runs('***')).toEqual([]);
		expect(runs('   ')).toEqual([]);
	});
	it('fenced code, math blocks and properties are skipped across lines', () => {
		const text = 'intro\n```js\n**not bold**\n```\nafter\n$$\nx^2\n$$\ntail';
		expect(doc(text)).toEqual(['intro', 'after', 'tail']);
		expect(doc('---\ntitle: x\n---\nbody', null as never, 3)).toEqual(['body']);
	});
	it('starting inside an open fence skips until it closes', () => {
		expect(doc('in code\n```\nout', { char: '`', len: 3 } as never)).toEqual(['out']);
	});
	it('a list item nested fence is code', () => {
		expect(doc('- item\n\n  ```bash\n  echo hi\n  ```\n\n- next')).toEqual(['item', 'next']);
	});
});

describe('indented code blocks are never painted', () => {
	it('4 spaces or a tab after a blank line is code', () => {
		expect(doc('para\n\n    code line\n    more code\n\nafter')).toEqual(['para', 'after']);
		expect(doc('para\n\n\tcode\n\nafter')).toEqual(['para', 'after']);
		expect(doc('    code at the very start\nplain line')).toEqual(['plain line']);
	});
	it('indented text right after a paragraph line is a continuation, not code', () => {
		expect(doc('para\n    continued')).toEqual(['para', '    continued']);
	});
	it('indented content of a list item is not code', () => {
		expect(doc('- item\n\n    second paragraph\n\nafter')).toEqual(['item', '    second paragraph', 'after']);
		expect(doc('1. one\n\n        deeper\n\nafter')).toEqual(['one', '        deeper', 'after']);
	});
	it('after the list ends the next indented block is code again', () => {
		expect(doc('- item\n\nplain\n\n    code\n')).toEqual(['item', 'plain']);
	});
});

describe('block state from the lines above', () => {
	it('a deep bullet seen without its parents is code, with the state from above it is not', () => {
		const text = '        - deep';
		expect(paintableRuns(text)).toEqual([]);
		const st = blockStateAfter(['- a', '    - b']);
		expect(paintableRuns(text, null, 0, st)).toHaveLength(1);
	});
	it('the state after a paragraph and a blank line makes the next indented line code', () => {
		const st = blockStateAfter(['A paragraph.', '']);
		expect(paintableRuns('    code', null, 0, st)).toEqual([]);
	});
	it('look through blockquote prefixes', () => {
		expect(doc('> q\n>\n>     code\n> after')).toEqual(['q', 'after'].map((x) => x));
	});
});
