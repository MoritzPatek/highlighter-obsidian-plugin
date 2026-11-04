import { Editor, MarkdownView, Notice, Platform, Plugin } from 'obsidian';
import { openColorPicker } from './colorPicker';
import {
	captureSelection,
	expandSelectionToTarget,
	restoreSelection,
	getSelectionContext,
	getState,
	highlightSelection,
	removeSelectionHighlight,
	touchesCode,
} from './editorOps';
import { shouldAutoShow } from './pickerLogic';
import { ColorHighlighterSettingTab } from './settingsTab';
import {
	DEFAULT_SETTINGS,
	sanitizeSettings,
	type ColorHighlighterSettings,
} from './settings';

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
		let pressed: { pointerType: string; inEditor: boolean; inWidget: boolean } | null = null;
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
					// A rendered <mark> widget (not <kbd>, <span>, ...): Obsidian selects its whole source
					// a moment after the click, so the selection may not exist yet at the first check.
					inWidget: !!target?.closest?.('.cm-html-embed')?.querySelector('mark'),
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
				const check = (attempt: number) => {
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
					else if (down.inWidget && attempt < 4) {
						this.autoTimer = window.setTimeout(() => check(attempt + 1), 100);
					}
				};
				this.autoTimer = window.setTimeout(() => check(0), 150);
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
		const ctx = getSelectionContext(editor);
		if (this.refuseInCode(touchesCode(ctx), auto)) return;
		const state = getState(ctx);
		// Nothing selected and the caret is not inside a highlight: nothing to color.
		if (!auto && ctx.from === ctx.to && !state.highlighted) {
			new Notice('Select some text to highlight.');
			return;
		}

		if (this.pickerOpen) return;
		// Show the real target (whole ==x== / <mark> / **bold** runs) before the user chooses.
		expandSelectionToTarget(editor);
		const snapshot = captureSelection(editor);
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
		// Apply to the selection the user saw when choosing, even if it moved meanwhile.
		restoreSelection(editor, snapshot);
		if (choice.type === 'remove') {
			this.removeSelectionHighlight(editor);
		} else {
			await this.highlightWithColor(editor, choice.index);
		}
	}

	private async highlightWithColor(editor: Editor, index: number) {
		const color = this.settings.colors[index];
		if (!color) return;
		// Re-read the selection at apply time: it may have changed while the picker was open.
		if (this.refuseInCode(highlightSelection(editor, color.color) === 'code', false)) return;
		this.settings.lastUsedIndex = index;
		await this.saveSettings();
	}

	private removeSelectionHighlight(editor: Editor) {
		this.refuseInCode(removeSelectionHighlight(editor) === 'code', false);
	}

	/** Code is never highlighted. Shows a notice (unless `quiet`) and returns `touched`. */
	private refuseInCode(touched: boolean, quiet: boolean): boolean {
		if (touched && !quiet) new Notice("Can't highlight inside code.");
		return touched;
	}
}
