import { Editor, MarkdownView, Notice, Platform, Plugin } from 'obsidian';
import { openColorPicker } from './colorPicker';
import {
	captureSelection,
	expandSelectionToTarget,
	restoreSelection,
	getSelectionContext,
	pickerCurrentIndex,
	getState,
	highlightSelection,
	removeSelectionHighlight,
	canPaint,
} from './editorOps';
import { shouldAutoShow } from './pickerLogic';
import {
	composeJournal,
	journalAction,
	newJournal,
	runRecolorPass,
	type PassResult,
	type RecolorJournal,
} from './recolorJournal';
import { recolorSummary, vaultIO } from './recolorVault';
import { ColorHighlighterSettingTab } from './settingsTab';
import {
	DEFAULT_COLORS,
	DEFAULT_SETTINGS,
	paletteChanges,
	sanitizeSettings,
	type ColorHighlighterSettings,
} from './settings';

/** Shown when the selection has nothing a highlight can sit on. */
const NOTHING_TO_HIGHLIGHT =
	'Nothing to highlight here: code, math, links, tags and properties are left alone.';

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
				editorCallback: (editor) => void this.highlightAfterCommit(editor, index),
			});
		});

		this.addCommand({
			id: 'remove-highlight',
			name: 'Remove highlight',
			editorCallback: (editor) => this.removeSelectionHighlight(editor),
		});

		this.addSettingTab(new ColorHighlighterSettingTab(this.app, this));
		this.registerAutoShow();
		// A palette edit that was never applied to the notes (crash, quit) is applied now.
		this.app.workspace.onLayoutReady(() => void this.commitPalette());
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

	private commitChain: Promise<void> = Promise.resolve();

	/**
	 * Make the notes follow the palette: every highlight written in a slot's
	 * previous (committed) color is rewritten to its current color. Called when a
	 * palette edit ends (Done, collapse, close, Reset, settings change) and on
	 * startup, so a crash in between never leaves highlights behind. Calls run one
	 * after the other.
	 */
	commitPalette(): Promise<void> {
		this.commitChain = this.commitChain.then(() => this.doCommitPalette()).catch((err) => {
			console.error('Color Highlighter: palette commit failed', err);
		});
		return this.commitChain;
	}

	/** Per-device id (kept outside data.json, which may sync): only this device resumes its own pass. */
	private deviceId(): string {
		const key = 'color-highlighter-device';
		let id = this.app.loadLocalStorage(key) as string | null;
		if (typeof id !== 'string' || id === '') {
			id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
			this.app.saveLocalStorage(key, id);
		}
		return id;
	}

	private async doCommitPalette() {
		const device = this.deviceId();
		const total: PassResult = { highlights: 0, notes: 0, failed: [], gaveUp: [] };
		const colors = () => this.settings.colors.map((c) => c.color);
		const persist = async (j: RecolorJournal | null) => {
			this.settings.journal = j;
			await this.saveSettings();
		};
		// Edits made while a pass runs are picked up by the next round.
		for (let round = 0; round < 4; round++) {
			let journal = this.settings.journal;
			const action = journalAction(journal, device);
			if (action === 'discard') {
				// Started on another device (data.json synced): never replay it here, just adopt the palette.
				this.settings.committed = colors();
				await persist(null);
				return;
			}
			if (action === 'none') {
				const map = paletteChanges(this.settings.committed, this.settings.colors);
				if (map.size === 0) break;
				// Snapshot now: later edits must not change what this pass does or what `committed` becomes.
				journal = newJournal(device, map, this.settings.committed, colors());
				await persist(journal);
			} else if (journal && paletteChanges(journal.to, this.settings.colors).size > 0) {
				// New edits while an old pass is pending: fold them into it so they do not wait behind it.
				const composed = composeJournal(journal, colors());
				if (composed) {
					journal = composed;
					await persist(journal);
				}
			}
			if (!journal) break;
			const result = await runRecolorPass(journal, vaultIO(this.app), persist.bind(null));
			total.highlights += result.highlights;
			total.notes += result.notes;
			total.failed.push(...result.failed);
			total.gaveUp.push(...result.gaveUp);
			if (result.failed.length > 0) {
				if (paletteChanges(journal.to, this.settings.colors).size === 0) break; // retried on the next commit or startup
				// The old pass cannot be composed with the new edits and still has failing notes:
				// give those notes up (reported once) instead of letting them block the new palette.
				journal.abandoned.push(...result.failed);
				total.gaveUp.push(...result.failed);
				total.failed = total.failed.filter((p) => !result.failed.includes(p));
			}
			this.settings.committed = [...journal.to];
			await persist(null);
		}
		const msg = recolorSummary(total);
		if (msg) new Notice(msg);
	}

	/** Save while a palette is being edited (cheap, debounced by the caller's rate). */
	private saveTimer: number | null = null;
	saveSoon() {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.saveSettings();
		}, 300);
	}

	private async highlightWithPicker(editor: Editor, auto = false) {
		const ctx = getSelectionContext(editor);
		if (!canPaint(ctx)) {
			if (!auto) new Notice(NOTHING_TO_HIGHLIGHT);
			return;
		}
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
			const ctx2 = getSelectionContext(editor);
			const current = pickerCurrentIndex(ctx2, this.settings.colors);
			choice = await openColorPicker(this.app, editor, {
				colors: this.settings.colors,
				defaults: DEFAULT_COLORS,
				lastUsedIndex: this.settings.lastUsedIndex,
				focusIndex: current >= 0 ? current : this.settings.lastUsedIndex,
				currentIndex: current,
				isHighlighted: state.highlighted,
				autoShown: auto,
				onHandle: (close) => (this.closePicker = close),
				onEdited: () => this.saveSoon(),
				onCommit: () => void this.commitPalette(),
			});
		} finally {
			this.pickerOpen = false;
			this.closePicker = null;
		}
		// A palette edit made in the popover is applied to the notes before we paint.
		await this.commitPalette();
		if (!choice) return;
		// Apply to the selection the user saw when choosing, even if it moved meanwhile.
		restoreSelection(editor, snapshot);
		if (choice.type === 'remove') {
			this.removeSelectionHighlight(editor);
		} else {
			await this.highlightWithColor(editor, choice.index);
		}
	}

	/** Direct "Highlight: <color>" commands: wait for a running palette pass first, like the picker does. */
	private async highlightAfterCommit(editor: Editor, index: number) {
		await this.commitChain;
		await this.highlightWithColor(editor, index);
	}

	private async highlightWithColor(editor: Editor, index: number) {
		const color = this.settings.colors[index];
		if (!color) return;
		// Re-read the selection at apply time: it may have changed while the picker was open.
		if (highlightSelection(editor, color.color) === 'nothing') {
			new Notice(NOTHING_TO_HIGHLIGHT);
			return;
		}
		this.settings.lastUsedIndex = index;
		await this.saveSettings();
	}

	private removeSelectionHighlight(editor: Editor) {
		removeSelectionHighlight(editor);
	}

}
