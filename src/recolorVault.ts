/**
 * Apply a palette change to every note in the vault (Obsidian glue for
 * `recolorEdits` / `recolorMarks`).
 */
import { MarkdownView, type App, type TFile } from 'obsidian';
import { recolorEdits, recolorMarks } from './recolor';

export interface RecolorResult {
	/** Highlights whose color was rewritten. */
	highlights: number;
	/** Notes that changed. */
	notes: number;
	/** Notes that could not be updated. */
	failed: number;
}

/**
 * Rewrite old -> new colors in all markdown files. Notes open in an editor are
 * edited through the editor (same text length, so selections stay put); the
 * others through `vault.process`. Natives and code are never touched.
 */
export async function recolorVault(
	app: App,
	map: ReadonlyMap<string, string>,
): Promise<RecolorResult> {
	const result: RecolorResult = { highlights: 0, notes: 0, failed: 0 };
	if (map.size === 0) return result;

	const open = new Map<string, MarkdownView>();
	app.workspace.iterateAllLeaves((leaf) => {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file && !open.has(view.file.path)) {
			open.set(view.file.path, view);
		}
	});

	for (const file of app.vault.getMarkdownFiles()) {
		try {
			const count = await recolorFile(app, file, map, open.get(file.path));
			if (count > 0) {
				result.highlights += count;
				result.notes += 1;
			}
		} catch (err) {
			console.error('Color Highlighter: could not recolor', file.path, err);
			result.failed += 1;
		}
	}
	return result;
}

async function recolorFile(
	app: App,
	file: TFile,
	map: ReadonlyMap<string, string>,
	view: MarkdownView | undefined,
): Promise<number> {
	if (view) {
		const editor = view.editor;
		const edits = recolorEdits(editor.getValue(), map);
		for (const e of edits) {
			editor.replaceRange(e.insert, editor.offsetToPos(e.from), editor.offsetToPos(e.to));
		}
		return edits.length;
	}
	// Cheap check first so untouched notes are never rewritten.
	if (recolorEdits(await app.vault.cachedRead(file), map).length === 0) return 0;
	let count = 0;
	await app.vault.process(file, (data) => {
		const r = recolorMarks(data, map);
		count = r.count;
		return r.text;
	});
	return count;
}

export function recolorSummary(r: RecolorResult): string | null {
	const parts: string[] = [];
	if (r.highlights > 0) {
		parts.push(
			`Updated ${r.highlights} highlight${r.highlights === 1 ? '' : 's'} in ${r.notes} note${r.notes === 1 ? '' : 's'}.`,
		);
	}
	if (r.failed > 0) parts.push(`${r.failed} note${r.failed === 1 ? '' : 's'} could not be updated.`);
	return parts.length ? parts.join(' ') : null;
}
