import { describe, expect, it } from 'vitest';
import { recolorEdits, recolorMarks } from './recolor';
import { findDuplicateSlot, paletteChanges, sanitizeSettings, uniqueRgb, DEFAULT_COLORS } from './settings';

const mark = (c: string, t = 'x') => `<mark style="background: ${c};">${t}</mark>`;
const map = (...pairs: [string, string][]) => new Map(pairs);

describe('recolorMarks', () => {
	it('replaces the color of every matching mark, case-insensitively', () => {
		const t = `${mark('#FFD60A55', 'a')} and ${mark('#ffd60a55', 'b')} and ${mark('#3DDC8455', 'c')}`;
		const r = recolorMarks(t, map(['#FFD60A55', '#112233AA']));
		expect(r.count).toBe(2);
		expect(r.text).toBe(`${mark('#112233AA', 'a')} and ${mark('#112233AA', 'b')} and ${mark('#3DDC8455', 'c')}`);
	});
	it('handles several slots at once, including a swap, in one pass', () => {
		const t = `${mark('#AAAAAA55')}${mark('#BBBBBB55')}`;
		const r = recolorMarks(t, map(['#AAAAAA55', '#BBBBBB55'], ['#BBBBBB55', '#AAAAAA55']));
		expect(r.text).toBe(`${mark('#BBBBBB55')}${mark('#AAAAAA55')}`);
	});
	it('skips marks in inline code and fenced code blocks', () => {
		const m = mark('#FFD60A55');
		const t = `${m} \`${m}\`\n\n\`\`\`\n${m}\n\`\`\`\n${m}`;
		const r = recolorMarks(t, map(['#FFD60A55', '#000000AA']));
		expect(r.count).toBe(2);
		expect(r.text.split('#000000AA')).toHaveLength(3);
		expect(r.text).toContain(`\`${m}\``);
	});
	it('leaves other styles, other tags, natives and other colors untouched', () => {
		const t = `<mark>bare</mark> ==nat== <mark style="color: red;">r</mark> <span style="background: #FFD60A55;">s</span> ${mark('#ABCDEF55')}`;
		const r = recolorMarks(t, map(['#FFD60A55', '#000000AA']));
		expect(r.count).toBe(0);
		expect(r.text).toBe(t);
	});
	it('only replaces the hex inside the style attribute', () => {
		const t = `<mark style="background: #FFD60A55;">#FFD60A55 in text</mark>`;
		expect(recolorMarks(t, map(['#FFD60A55', '#000000AA'])).text).toBe(
			`<mark style="background: #000000AA;">#FFD60A55 in text</mark>`,
		);
	});
	it('accepts the background-color property and extra spaces', () => {
		const t = `<mark style="background-color:#FFD60A55">a</mark>`;
		expect(recolorMarks(t, map(['#FFD60A55', '#000000AA'])).text).toBe(
			`<mark style="background-color:#000000AA">a</mark>`,
		);
	});
	it('returns the same text when the map is empty', () => {
		const t = mark('#FFD60A55');
		expect(recolorMarks(t, new Map()).text).toBe(t);
	});
	it('edits keep offsets: same-length replacements', () => {
		const t = `a ${mark('#FFD60A55')} b`;
		const [e] = recolorEdits(t, map(['#FFD60A55', '#000000AA']));
		expect(t.slice(e!.from, e!.to)).toBe('#FFD60A55');
		expect(e!.insert.length).toBe(e!.to - e!.from);
	});
});

describe('paletteChanges / uniqueRgb / findDuplicateSlot', () => {
	it('lists only slots whose color changed', () => {
		const colors = DEFAULT_COLORS.map((c) => ({ ...c }));
		colors[1] = { name: 'Green', color: '#112233AA' };
		const committed = DEFAULT_COLORS.map((c) => c.color);
		expect([...paletteChanges(committed, colors)]).toEqual([['#3DDC8455', '#112233AA']]);
		expect(paletteChanges(committed, DEFAULT_COLORS).size).toBe(0);
	});
	it('keeps a free color and nudges a taken one to a free neighbor', () => {
		expect(uniqueRgb('#102030', ['#FFD60A55'])).toEqual({ rgb: '#102030', nudged: false });
		const r = uniqueRgb('#ffd60a', ['#FFD60A55', '#FFD60B55']);
		expect(r.nudged).toBe(true);
		expect(['#FFD60A', '#FFD60B']).not.toContain(r.rgb);
		expect(uniqueRgb('#0000FF', ['#0000FF55']).rgb).toBe('#0000FE');
	});
	it('finds the other slot that uses a color', () => {
		expect(findDuplicateSlot(DEFAULT_COLORS, 0, '#3ddc84')).toBe(1);
		expect(findDuplicateSlot(DEFAULT_COLORS, 1, '#3ddc84')).toBe(-1);
	});
});

describe('committed palette in settings', () => {
	it('defaults to the current colors for older data and keeps a valid saved value', () => {
		const s = sanitizeSettings({ colors: [{ name: 'A', color: '#112233' }] });
		expect(s.committed[0]).toBe('#11223355');
		expect(s.committed).toHaveLength(5);
		const t = sanitizeSettings({ committed: ['#AAAAAA', '#BBBBBB55', 'bad', null, '#CCCCCC99'] });
		expect(t.committed).toEqual(['#AAAAAA55', '#BBBBBB55', DEFAULT_COLORS[2]!.color, DEFAULT_COLORS[3]!.color, '#CCCCCC55']);
	});
});
