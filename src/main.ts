import { Editor, Plugin } from 'obsidian';
import { openColorPicker } from './colorPicker';
import { applyHighlight, getHighlightState, removeHighlight, type TextEdit } from './highlight';
import { ColorHighlighterSettingTab } from './settingsTab';
import {
	DEFAULT_SETTINGS,
	findColorIndex,
	sanitizeSettings,
	type ColorHighlighterSettings,
} from './settings';

/** The text of the lines touched by the selection, and the selection inside it. */
interface SelectionContext {
	/** Document offset of the start of the first touched line. */
	base: number;
	text: string;
	from: number;
	to: number;
}

export default class ColorHighlighterPlugin extends Plugin {
	settings: ColorHighlighterSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'highlight-with-color',
			name: 'Highlight with color…',
			hotkeys: [{ modifiers: ['Mod'], key: 'h' }],
			editorCallback: (editor) => this.highlightWithPicker(editor),
		});

		// One command per color so users can bind direct hotkeys.
		// Names come from the settings at startup; renamed colors show up after a reload.
		this.settings.colors.forEach((color, index) => {
			this.addCommand({
				id: `highlight-color-${index + 1}`,
				name: `Highlight: ${color.name}`,
				editorCallback: (editor) => void this.highlightWithColor(editor, index),
			});
		});

		this.addCommand({
			id: 'remove-highlight',
			name: 'Remove highlight',
			editorCallback: (editor) => this.removeSelectionHighlight(editor),
		});

		this.addSettingTab(new ColorHighlighterSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = sanitizeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async highlightWithPicker(editor: Editor) {
		const ctx = this.getSelectionContext(editor);
		const state = getHighlightState(ctx.text, ctx.from, ctx.to);
		const current = findColorIndex(this.settings.colors, state.color);
		const initialIndex = current >= 0 ? current : this.settings.lastUsedIndex;

		const choice = await openColorPicker(
			this.app,
			this.settings.colors,
			initialIndex,
			state.highlighted,
		);
		if (!choice) return;
		if (choice.type === 'remove') {
			this.removeSelectionHighlight(editor);
		} else {
			await this.highlightWithColor(editor, choice.index);
		}
	}

	private async highlightWithColor(editor: Editor, index: number) {
		const color = this.settings.colors[index];
		if (!color) return;
		// Re-read the selection: it may have changed while the picker was open.
		const ctx = this.getSelectionContext(editor);
		this.applyEdit(editor, ctx, applyHighlight(ctx.text, ctx.from, ctx.to, color.color));
		this.settings.lastUsedIndex = index;
		await this.saveSettings();
	}

	private removeSelectionHighlight(editor: Editor) {
		const ctx = this.getSelectionContext(editor);
		this.applyEdit(editor, ctx, removeHighlight(ctx.text, ctx.from, ctx.to));
	}

	/**
	 * Only the primary selection is handled; with several cursors the others
	 * are ignored.
	 */
	private getSelectionContext(editor: Editor): SelectionContext {
		const a = editor.getCursor('from');
		const b = editor.getCursor('to');
		const startPos = { line: a.line, ch: 0 };
		const endPos = { line: b.line, ch: editor.getLine(b.line).length };
		const base = editor.posToOffset(startPos);
		return {
			base,
			text: editor.getRange(startPos, endPos),
			from: editor.posToOffset(a) - base,
			to: editor.posToOffset(b) - base,
		};
	}

	private applyEdit(editor: Editor, ctx: SelectionContext, edit: TextEdit | null) {
		if (!edit) return;
		const at = (offset: number) => editor.offsetToPos(ctx.base + offset);
		editor.replaceRange(edit.insert, at(edit.from), at(edit.to));
		editor.setSelection(at(edit.selFrom), at(edit.selTo));
	}
}
