import { describe, expect, it } from 'vitest';
import {
	DEFAULT_COLORS,
	DEFAULT_SETTINGS,
	findColorIndex,
	isValidHexColor,
	joinColor,
	normalizeHex,
	sanitizeSettings,
	splitColor,
} from './settings';

describe('defaults', () => {
	it('has the five specified colors', () => {
		expect(DEFAULT_COLORS.map((c) => `${c.name} ${c.color}`)).toEqual([
			'Yellow #FFF3A3A6',
			'Green #BBFABBA6',
			'Blue #ADCCFFA6',
			'Pink #FFB8EBA6',
			'Purple #D2B3FFA6',
		]);
		expect(DEFAULT_COLORS.every((c) => isValidHexColor(c.color))).toBe(true);
	});

	it('DEFAULT_SETTINGS does not share objects with DEFAULT_COLORS', () => {
		expect(DEFAULT_SETTINGS.colors[0]).not.toBe(DEFAULT_COLORS[0]);
		expect(DEFAULT_SETTINGS.lastUsedIndex).toBe(0);
	});
});

describe('sanitizeSettings', () => {
	it('returns defaults for missing data', () => {
		expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
		expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps valid saved values', () => {
		const saved = {
			colors: DEFAULT_COLORS.map((c, i) => ({ name: `C${i}`, color: '#112233FF' })),
			lastUsedIndex: 3,
		};
		expect(sanitizeSettings(saved)).toEqual(saved);
	});

	it('repairs invalid entries individually and always yields five colors', () => {
		const out = sanitizeSettings({
			colors: [{ name: ' Mine ', color: '#abcdef' }, { name: '', color: 'red' }, 42],
			lastUsedIndex: 99,
		});
		expect(out.colors).toHaveLength(5);
		expect(out.colors[0]).toEqual({ name: 'Mine', color: '#ABCDEFFF' });
		expect(out.colors[1]).toEqual(DEFAULT_COLORS[1]);
		expect(out.colors[2]).toEqual(DEFAULT_COLORS[2]);
		expect(out.lastUsedIndex).toBe(0);
	});

	it('rejects non-integer and negative lastUsedIndex', () => {
		expect(sanitizeSettings({ lastUsedIndex: 1.5 }).lastUsedIndex).toBe(0);
		expect(sanitizeSettings({ lastUsedIndex: -1 }).lastUsedIndex).toBe(0);
		expect(sanitizeSettings({ lastUsedIndex: 4 }).lastUsedIndex).toBe(4);
	});
});

describe('color helpers', () => {
	it('validates hex colors', () => {
		expect(isValidHexColor('#FFF3A3A6')).toBe(true);
		expect(isValidHexColor('#fff3a3')).toBe(true);
		expect(isValidHexColor('#fff')).toBe(false);
		expect(isValidHexColor('yellow')).toBe(false);
		expect(isValidHexColor(5)).toBe(false);
	});

	it('normalizes hex', () => {
		expect(normalizeHex('#abcdef')).toBe('#ABCDEFFF');
		expect(normalizeHex('#abcdef12')).toBe('#ABCDEF12');
	});

	it('splits and joins color and alpha', () => {
		const { rgb, alpha } = splitColor('#FFF3A3A6');
		expect(rgb).toBe('#FFF3A3');
		expect(alpha).toBeCloseTo(0.65, 2);
		expect(joinColor(rgb, alpha)).toBe('#FFF3A3A6');
		expect(joinColor('#000000', 2)).toBe('#000000FF');
		expect(joinColor('#000000', -1)).toBe('#00000000');
	});

	it('finds a color index case-insensitively', () => {
		expect(findColorIndex(DEFAULT_COLORS, '#bbfabba6')).toBe(1);
		expect(findColorIndex(DEFAULT_COLORS, '#000000')).toBe(-1);
		expect(findColorIndex(DEFAULT_COLORS, null)).toBe(-1);
	});
});
