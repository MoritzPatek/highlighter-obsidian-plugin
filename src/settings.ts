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
	/** Open the picker automatically after a mouse selection. */
	autoShow: boolean;
}

/** Alpha appended to every highlight color (33%). Not user-editable. */
export const HIGHLIGHT_ALPHA = '55';

/** Longest color name the settings UI accepts. */
export const MAX_NAME_LENGTH = 20;

/** The default palette (spec: 33% alpha so text stays readable in light and dark). */
export const DEFAULT_COLORS: readonly HighlightColor[] = [
	{ name: 'Yellow', color: '#FFD60A' + HIGHLIGHT_ALPHA },
	{ name: 'Green', color: '#3DDC84' + HIGHLIGHT_ALPHA },
	{ name: 'Blue', color: '#4DA3FF' + HIGHLIGHT_ALPHA },
	{ name: 'Pink', color: '#FF5C8A' + HIGHLIGHT_ALPHA },
	{ name: 'Purple', color: '#A67CFF' + HIGHLIGHT_ALPHA },
];

/** Defaults of version 0.1.0 (opacity 65%). Saved data with these exact colors is migrated to the new defaults. */
const LEGACY_DEFAULT_COLORS: readonly string[] = [
	'#FFF3A3A6',
	'#BBFABBA6',
	'#ADCCFFA6',
	'#FFB8EBA6',
	'#D2B3FFA6',
];

export const DEFAULT_SETTINGS: ColorHighlighterSettings = {
	colors: DEFAULT_COLORS.map((c) => ({ ...c })),
	lastUsedIndex: 0,
	autoShow: true,
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
			typeof entry.name === 'string' && entry.name.trim() !== ''
				? entry.name.trim().slice(0, MAX_NAME_LENGTH)
				: def.name;
		return { name, color: migrateColor(entry.color, i) };
	});

	const idx = data.lastUsedIndex;
	const lastUsedIndex =
		typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < colors.length ? idx : 0;

	// Older saved data has no autoShow: default ON.
	const autoShow = typeof data.autoShow === 'boolean' ? data.autoShow : true;

	return { colors, lastUsedIndex, autoShow };
}

/**
 * Saved color -> current format: opaque RGB plus the fixed alpha. Colors saved
 * by older versions with a different alpha keep their RGB; the old default
 * palette is replaced by the new one.
 */
function migrateColor(value: unknown, index: number): string {
	const def = (DEFAULT_COLORS[index] as HighlightColor).color;
	if (!isValidHexColor(value)) return def;
	const full = normalizeHex(value);
	if (full === LEGACY_DEFAULT_COLORS[index]) return def;
	return withHighlightAlpha(full);
}

/** #RRGGBB or #RRGGBBAA -> #RRGGBB + the fixed highlight alpha. */
export function withHighlightAlpha(hex: string): string {
	return hex.slice(0, 7).toUpperCase() + HIGHLIGHT_ALPHA;
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
