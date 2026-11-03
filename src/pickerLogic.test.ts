import { describe, expect, it } from 'vitest';
import { clampIndex, computePopoverPosition, digitToIndex, moveIndex } from './pickerLogic';

describe('moveIndex', () => {
	it('wraps forward and backward', () => {
		expect(moveIndex(4, 5, 'next')).toBe(0);
		expect(moveIndex(0, 5, 'prev')).toBe(4);
		expect(moveIndex(1, 5, 'next')).toBe(2);
		expect(moveIndex(1, 5, 'prev')).toBe(0);
	});
	it('includes the remove item when count is 6', () => {
		expect(moveIndex(5, 6, 'next')).toBe(0);
		expect(moveIndex(0, 6, 'last')).toBe(5);
		expect(moveIndex(3, 6, 'first')).toBe(0);
	});
	it('is safe for an empty list', () => {
		expect(moveIndex(0, 0, 'next')).toBe(0);
	});
});

describe('digitToIndex', () => {
	it('maps 1-5 and rejects the rest', () => {
		expect(digitToIndex('1', 5)).toBe(0);
		expect(digitToIndex('5', 5)).toBe(4);
		expect(digitToIndex('6', 5)).toBe(-1);
		expect(digitToIndex('0', 5)).toBe(-1);
		expect(digitToIndex('a', 5)).toBe(-1);
		expect(digitToIndex('12', 5)).toBe(-1);
	});
});

describe('clampIndex', () => {
	it('falls back to 0 for stale values', () => {
		expect(clampIndex(3, 5)).toBe(3);
		expect(clampIndex(7, 5)).toBe(0);
		expect(clampIndex(-1, 5)).toBe(0);
		expect(clampIndex(1.5, 5)).toBe(0);
	});
});

describe('computePopoverPosition', () => {
	const base = {
		editor: { left: 0, top: 50, right: 1000, bottom: 700 },
		popup: { width: 230, height: 90 },
		viewport: { width: 1000, height: 800 },
	};
	it('sits 8px below the selection, left aligned', () => {
		const p = computePopoverPosition({ ...base, anchor: { left: 100, top: 200, bottom: 220 } });
		expect(p).toEqual({ left: 100, top: 228 });
	});
	it('flips above near the bottom', () => {
		const p = computePopoverPosition({ ...base, anchor: { left: 100, top: 740, bottom: 760 } });
		expect(p.top).toBe(740 - 8 - 90);
	});
	it('clamps horizontally with an 8px margin', () => {
		expect(computePopoverPosition({ ...base, anchor: { left: -50, top: 200, bottom: 220 } }).left).toBe(8);
		expect(computePopoverPosition({ ...base, anchor: { left: 990, top: 200, bottom: 220 } }).left).toBe(
			1000 - 230 - 8,
		);
	});
	it('never goes above the viewport when flipping on a tiny window', () => {
		const p = computePopoverPosition({
			...base,
			viewport: { width: 1000, height: 100 },
			anchor: { left: 10, top: 20, bottom: 40 },
		});
		expect(p.top).toBeGreaterThanOrEqual(8);
	});
	it('falls back to the top third of the editor, centered', () => {
		const p = computePopoverPosition({ ...base, anchor: null });
		expect(p.left).toBe(500 - 115);
		expect(p.top).toBe(50 + 650 / 3);
	});
});
