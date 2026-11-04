import { Editor, MarkdownView, Notice, Platform, Plugin } from 'obsidian';
import { openColorPicker } from './colorPicker';
import {
	applyHighlight,
	getHighlightState,
	removeHighlight,
	endsInsideFence,
	selectionTouchesCode,
	type TextEdit,
} from './highlight';
import { shouldAutoShow } from './pickerLogic';
import { ColorHighlighterSettingTab } from './settingsTab';
import {
	DEFAULT_SETTINGS,
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
	/** The selection starts inside a fenced code block opened above. */
	fenceOpen: boolean;
}

export default class ColorHighlighterPlugin extends Plugin {
	settings: ColorHighlighterSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'highlight-with-color',
			name: 'Pick color',
			// No default hotkey on purpose: users bind their own in Settings -> Hotkeys.
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
		this.registerAutoShow();
		this.register(() => this.closePicker?.());
	}

	onunload() {
		this.closePicker?.();
	}

	private pickerOpen = false;
	/** Closes the open picker (if any) without a choice. */
	private closePicker: (() => void) | null = null;
	private composing = false;
	private autoTimer: number | null = null;

	/** Open the picker after a mouse selection (desktop). Keyboard selections never trigger it. */
	private registerAutoShow() {
		let pressed: { pointerType: string; inEditor: boolean } | null = null;
		const cancel = () => {
			if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
			this.autoTimer = null;
		};

		this.registerDomEvent(document, 'compositionstart', () => (this.composing = true), true);
		this.registerDomEvent(document, 'compositionend', () => (this.composing = false), true);

		this.registerDomEvent(
			document,
			'pointerdown',
			(evt) => {
				cancel();
				const target = evt.target as HTMLElement | null;
				pressed = {
					pointerType: evt.pointerType,
					inEditor: !!target?.closest?.('.markdown-source-view .cm-editor'),
				};
			},
			true,
		);

		this.registerDomEvent(
			document,
			'pointerup',
			() => {
				const down = pressed;
				pressed = null;
				if (!down) return;
				cancel();
				this.autoTimer = window.setTimeout(() => {
					this.autoTimer = null;
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					const editor = view?.editor;
					const sels = editor?.listSelections() ?? [];
					const sel = sels[0];
					const go = shouldAutoShow({
						enabled: this.settings.autoShow,
						isMobile: Platform.isMobile,
						pointerType: down.pointerType,
						startedInEditor: down.inEditor,
						viewMode: view ? (view.getMode() === 'source' ? 'source' : 'preview') : null,
						selectionCount: sels.length,
						from: sel && editor ? editor.posToOffset(sel.anchor) : 0,
						to: sel && editor ? editor.posToOffset(sel.head) : 0,
						composing: this.composing,
						pickerOpen: this.pickerOpen,
					});
					if (go && editor) void this.highlightWithPicker(editor, true);
				}, 150);
			},
			true,
		);
		this.register(cancel);
	}

	async loadSettings() {
		this.settings = sanitizeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async highlightWithPicker(editor: Editor, auto = false) {
		const ctx = this.getSelectionContext(editor);
		if (this.refuseInCode(ctx, auto)) return;
		const state = getHighlightState(ctx.text, ctx.from, ctx.to);
		// Nothing selected and the caret is not inside a highlight: nothing to color.
		if (!auto && ctx.from === ctx.to && !state.highlighted) {
			new Notice('Select some text to highlight.');
			return;
		}

		if (this.pickerOpen) return;
		this.pickerOpen = true;
		let choice;
		try {
			choice = await openColorPicker(
				this.app,
				editor,
				this.settings.colors,
				this.settings.lastUsedIndex,
				state.highlighted,
				auto,
				(close) => (this.closePicker = close),
			);
		} finally {
			this.pickerOpen = false;
			this.closePicker = null;
		}
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
		if (this.refuseInCode(ctx, false)) return;
		this.applyEdit(editor, ctx, applyHighlight(ctx.text, ctx.from, ctx.to, color.color));
		this.settings.lastUsedIndex = index;
		await this.saveSettings();
	}

	private removeSelectionHighlight(editor: Editor) {
		const ctx = this.getSelectionContext(editor);
		this.applyEdit(editor, ctx, removeHighlight(ctx.text, ctx.from, ctx.to));
	}

	/** Code is never highlighted. Returns true (with a notice unless `quiet`) when the selection touches code. */
	private refuseInCode(ctx: SelectionContext, quiet: boolean): boolean {
		if (!selectionTouchesCode(ctx.text, ctx.from, ctx.to, ctx.fenceOpen)) return false;
		if (!quiet) new Notice("Can't highlight inside code.");
		return true;
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
			fenceOpen: endsInsideFence(editor.getRange({ line: 0, ch: 0 }, startPos)),
		};
	}

	private applyEdit(editor: Editor, ctx: SelectionContext, edit: TextEdit | null) {
		if (!edit) return;
		const at = (offset: number) => editor.offsetToPos(ctx.base + offset);
		editor.replaceRange(edit.insert, at(edit.from), at(edit.to));
		// Collapse to the end of the affected text so typing continues after it.
		// A non-empty highlight: put the caret after the closing tag.
		let end = edit.selTo;
		if (edit.selFrom !== edit.selTo) {
			const closing = '</mark>';
			const after = editor.getRange(at(end), at(end + closing.length));
			if (after === closing) end += closing.length;
		}
		editor.setCursor(at(end));
	}
}
