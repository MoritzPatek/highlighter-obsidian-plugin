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
				// "Done" must mean on disk: do not wait for the editor's debounced autosave.
				if (edits.length > 0) await view.save();
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

/** Names of up to five notes, "a, b, c and 2 more". */
function noteNames(paths: string[]): string {
	const names = paths.slice(0, 5).map((p) => p.replace(/^.*\//, '').replace(/\.md$/, ''));
	return names.join(', ') + (paths.length > 5 ? ` and ${paths.length - 5} more` : '');
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
	if (r.gaveUp.length > 0) {
		parts.push(`Couldn't update ${r.gaveUp.length} note${r.gaveUp.length === 1 ? '' : 's'}: ${noteNames(r.gaveUp)}.`);
	}
	return parts.length ? parts.join(' ') : null;
}
