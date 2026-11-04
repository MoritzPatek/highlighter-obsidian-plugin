/**
 * Obsidian side of the palette recolor: the vault as a `RecolorIO` for the
 * crash-safe pass in recolorJournal.ts.
 */
import { MarkdownView, type App } from 'obsidian';
import { recolorEdits, recolorMarks } from './recolor';
import type { PassResult, RecolorIO } from './recolorJournal';

/**
 * The vault's notes. A note open in an editor is read and edited through the
 * editor (same text length, so selections stay put); the others through
 * `vault.process`. Natives and code are never touched.
 */
export function vaultIO(app: App): RecolorIO {
	const openView = (path: string): MarkdownView | undefined => {
		let found: MarkdownView | undefined;
		app.workspace.iterateAllLeaves((leaf) => {
			const v = leaf.view;
			if (!found && v instanceof MarkdownView && v.file?.path === path) found = v;
		});
		return found;
	};
	const fileOf = (path: string) => {
		const f = app.vault.getFileByPath(path);
		if (!f) throw new Error(`Note not found: ${path}`);
		return f;
	};
	return {
		files: () => app.vault.getMarkdownFiles().map((f) => f.path),
		read: async (path) => {
			const view = openView(path);
			return view ? view.editor.getValue() : app.vault.read(fileOf(path));
		},
		apply: async (path, map) => {
			const view = openView(path);
			if (view) {
				const editor = view.editor;
				const edits = recolorEdits(editor.getValue(), map);
				for (const e of edits) {
					editor.replaceRange(e.insert, editor.offsetToPos(e.from), editor.offsetToPos(e.to));
				}
				return edits.length;
			}
			let count = 0;
			await app.vault.process(fileOf(path), (data) => {
				const r = recolorMarks(data, map);
				count = r.count;
				return r.text;
			});
			return count;
		},
	};
}

export function recolorSummary(r: PassResult): string | null {
	const parts: string[] = [];
	if (r.highlights > 0) {
		parts.push(
			`Updated ${r.highlights} highlight${r.highlights === 1 ? '' : 's'} in ${r.notes} note${r.notes === 1 ? '' : 's'}.`,
		);
	}
	if (r.failed.length > 0) {
		parts.push(
			`${r.failed.length} note${r.failed.length === 1 ? '' : 's'} could not be updated; the plugin will retry.`,
		);
	}
	return parts.length ? parts.join(' ') : null;
}
