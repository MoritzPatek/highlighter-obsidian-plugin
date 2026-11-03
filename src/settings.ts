/**
 * Settings data model. No Obsidian imports so it can be unit tested.
 */

export interface HighlightColor {
	/** Display name, shown in the picker and in command names. */
	name: string;
	/** CSS hex color with alpha: #RRGGBBAA. */
	color: string;
}

export interface ColorHighlighterSettings {
	colors: HighlightColor[];
	/** Index into `colors` of the color used last. */
	lastUsedIndex: number;
}

/** The default palette. The designer may tweak these; keep them in this one constant. */
export const DEFAULT_COLORS: readonly HighlightColor[] = [
	{ name: 'Yellow', color: '#FFF3A3A6' },
	{ name: 'Green', color: '#BBFABBA6' },
	{ name: 'Blue', color: '#ADCCFFA6' },
	{ name: 'Pink', color: '#FFB8EBA6' },
	{ name: 'Purple', color: '#D2B3FFA6' },
];

export const DEFAULT_SETTINGS: ColorHighlighterSettings = {
	colors: DEFAULT_COLORS.map((c) => ({ ...c })),
	lastUsedIndex: 0,
};

const HEX_RE = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isValidHexColor(value: unknown): value is string {
	return typeof value === 'string' && HEX_RE.test(value);
}

/**
 * Turn whatever `loadData()` returned into valid settings. Unknown or broken
 * values fall back to the defaults; the number of colors is always the same
 * as in DEFAULT_COLORS.
 */
export function sanitizeSettings(raw: unknown): ColorHighlighterSettings {
	const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
	const rawColors = Array.isArray(data.colors) ? (data.colors as unknown[]) : [];

	const colors = DEFAULT_COLORS.map((def, i) => {
		const item = rawColors[i];
		const entry = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
		const name =
			typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name.trim() : def.name;
		const color = isValidHexColor(entry.color) ? normalizeHex(entry.color) : def.color;
		return { name, color };
	});

	const idx = data.lastUsedIndex;
	const lastUsedIndex =
		typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < colors.length ? idx : 0;

	return { colors, lastUsedIndex };
}

/** Upper-case a hex color and add full alpha when missing: #abc123 -> #ABC123FF. */
export function normalizeHex(hex: string): string {
	const up = hex.toUpperCase();
	return up.length === 7 ? up + 'FF' : up;
}

/** Split #RRGGBBAA into an opaque #RRGGBB and an alpha value from 0 to 1. */
export function splitColor(hex: string): { rgb: string; alpha: number } {
	const full = normalizeHex(hex);
	return { rgb: full.slice(0, 7), alpha: parseInt(full.slice(7, 9), 16) / 255 };
}

/** Inverse of splitColor. Alpha is clamped to 0..1. */
export function joinColor(rgb: string, alpha: number): string {
	const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
	return rgb.slice(0, 7).toUpperCase() + a.toString(16).padStart(2, '0').toUpperCase();
}

/** Index of the color equal to `color` (case-insensitive), or -1. Alpha-less hex matches only opaque. */
export function findColorIndex(colors: readonly HighlightColor[], color: string | null): number {
	if (color === null) return -1;
	const target = color.trim().toUpperCase();
	return colors.findIndex((c) => c.color.toUpperCase() === target);
}
