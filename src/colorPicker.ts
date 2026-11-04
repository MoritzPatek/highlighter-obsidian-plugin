/**
 * Color picker seam: the plugin only talks to `openColorPicker`.
 *
 * Shows a floating popover under the selection. Keys are handled by an
 * Obsidian Scope pushed on app.keymap, so the editor keeps focus and the
 * selection stays visible.
 */
import { App, Editor, Scope } from 'obsidian';
import { ColorPopover, type PopoverChoice } from './popover';
import { digitToIndex } from './pickerLogic';
import type { HighlightColor } from './settings';

/** What the user chose. */
export type PickerChoice = PopoverChoice;

/** The parts of the CodeMirror 6 EditorView we use (obsidian's typings do not expose `editor.cm`). */
interface CmView {
	dom: HTMLElement;
	contentDOM: HTMLElement;
	scrollDOM: HTMLElement;
	coordsAtPos(pos: number): { left: number; right: number; top: number; bottom: number } | null;
	domAtPos(pos: number): { node: Node; offset: number };
	state: { selection: { main: { from: number; to: number } } };
}

export interface PickerOptions {
	/** The palette; the color editor edits these entries in place. */
	colors: HighlightColor[];
	/** Palette restored by "Reset to defaults" in the color editor. */
	defaults: readonly HighlightColor[];
	/** Last-used color, marked with a dot. */
	lastUsedIndex: number;
	/** Color to focus first (the highlight's own color, else the last-used one). */
	focusIndex: number;
	/** Palette color of the highlight the selection is in (check badge), or -1. */
	currentIndex: number;
	/** True when the selection is already highlighted, so the picker also offers "Remove highlight". */
	isHighlighted: boolean;
	/**
	 * Opened by a mouse selection: unhandled keys close the popover and pass
	 * through to the editor instead of being swallowed.
	 */
	autoShown?: boolean;
	/** Receives a function that closes the picker (resolves null), for plugin unload. */
	onHandle?: (close: () => void) => void;
	/** A name or color of the palette changed. */
	onEdited?: () => void;
	/** A palette edit session ended: apply the palette to the notes. */
	onCommit?: () => void;
}

/** Name of the CSS custom highlight that keeps the selection visible while a popover field has focus. */
const PENDING_HIGHLIGHT = 'color-highlighter-pending';

/** CSS Custom Highlight registry (typings of our TS version lack its Map methods). */
const highlightRegistry = (): Map<string, unknown> | undefined =>
	(CSS as unknown as { highlights?: Map<string, unknown> }).highlights;

/**
 * Show the picker.
 *
 * @returns The choice, or null when the user cancelled (Esc, click outside, scroll, blur).
 */
export function openColorPicker(
	app: App,
	editor: Editor,
	o: PickerOptions,
): Promise<PickerChoice | null> {
	return new Promise((resolve) => {
		const cm = (editor as unknown as { cm?: CmView }).cm;
		const cleanups: (() => void)[] = [];
		let settled = false;
		// Opening the color editor from an auto-shown popover turns pass-through off.
		let manual = !o.autoShown;
		let scope: Scope | null = null;

		const settle = (choice: PickerChoice | null) => {
			if (settled) return;
			settled = true;
			popover.commit(); // apply a pending palette edit to the notes
			cleanups.forEach((fn) => fn());
			popover.destroy();
			resolve(choice);
			// Return focus to the editor; applying the edit happens in the caller.
			if (!cm?.contentDOM.contains(document.activeElement)) editor.focus();
		};

		o.onHandle?.(() => settle(null));

		const popover: ColorPopover = new ColorPopover({
			colors: o.colors,
			defaults: o.defaults,
			lastUsedIndex: o.lastUsedIndex,
			focusIndex: o.focusIndex,
			currentIndex: o.currentIndex,
			showRemove: o.isHighlighted,
			onChoose: (choice) => settle(choice),
			onEdited: o.onEdited,
			onCommit: o.onCommit,
			onEditorToggle: (open) => {
				swapScope(open);
				if (open) {
					manual = true;
					setPendingSelection();
				} else {
					clearPendingSelection();
					editor.focus(); // the editor lost focus to a field of the popover
				}
			},
		});

		// Keep the selection visible while a field of the popover has focus.
		const setPendingSelection = () => {
			if (!cm) return;
			try {
				const { from, to } = cm.state.selection.main;
				const a = cm.domAtPos(from);
				const b = cm.domAtPos(to);
				const range = document.createRange();
				range.setStart(a.node, a.offset);
				range.setEnd(b.node, b.offset);
				highlightRegistry()?.set(PENDING_HIGHLIGHT, new Highlight(range));
			} catch {
				/* no decoration; the selection is still there */
			}
		};
		const clearPendingSelection = () => highlightRegistry()?.delete(PENDING_HIGHLIGHT);
		cleanups.push(clearPendingSelection);

		// Anchor: selection start, bottom of the selection's last line.
		let anchor: { left: number; top: number; bottom: number } | null = null;
		if (cm) {
			try {
				const { from, to } = cm.state.selection.main;
				const start = cm.coordsAtPos(from);
				const end = cm.coordsAtPos(to);
				if (start) anchor = { left: start.left, top: start.top, bottom: (end ?? start).bottom };
			} catch {
				anchor = null;
			}
		}
		const editorRect = (cm?.dom ?? document.body).getBoundingClientRect();
		popover.mount(anchor, editorRect);

		/** Keys of the picker itself. `manual` = Cmd+H mode (swallows typing, Space/Backspace/E are picker keys). */
		const buildPickerScope = (): Scope => {
			const s = new Scope(app.scope);
			const keys: [Parameters<Scope['register']>[0], string, () => void][] = [
				[[], 'ArrowRight', () => popover.move('next')],
				[[], 'ArrowDown', () => popover.move('next')],
				[[], 'Tab', () => popover.move('next')],
				[[], 'ArrowLeft', () => popover.move('prev')],
				[[], 'ArrowUp', () => popover.move('prev')],
				[['Shift'], 'Tab', () => popover.move('prev')],
				[[], 'Home', () => popover.move('first')],
				[[], 'End', () => popover.move('last')],
				[[], 'Enter', () => popover.chooseActive()],
				[[], 'Escape', () => settle(null)],
				[['Mod'], 'h', () => settle(null)],
			];
			// '0' only exists as a key when there is a Remove item; otherwise it falls through
			// to the catch-all (auto: close and pass through; Cmd+H mode: swallowed, so it
			// cannot replace the selection).
			if (o.isHighlighted) keys.push([[], '0', () => popover.chooseRemove()]);
			if (manual) {
				// Backspace/Delete remove the highlight only in Cmd+H mode. When auto-shown they
				// fall through to the catch-all below: close and delete the selected text as usual.
				keys.push([[], ' ', () => popover.chooseActive()]);
				keys.push([[], 'Backspace', () => popover.chooseRemove()]);
				keys.push([[], 'Delete', () => popover.chooseRemove()]);
				// E opens the color editor (not a picker key in auto mode: it would close and type).
				keys.push([[], 'e', () => popover.toggleEditor(true)]);
				keys.push([[], 'E', () => popover.toggleEditor(true)]);
				keys.push([['Shift'], 'E', () => popover.toggleEditor(true)]);
			}
			for (const [mods, key, fn] of keys) {
				s.register(mods, key, () => {
					fn();
					return false; // preventDefault, stop other handlers
				});
			}
			s.register([], null, (evt) => {
				const i = digitToIndex(evt.key, o.colors.length);
				if (i >= 0) {
					popover.chooseColor(i);
					return false;
				}
				if (!manual) {
					settle(null);
					return true; // pass through untouched
				}
				// Swallow typing keys so nothing replaces the selection while the popover is open.
				return evt.key.length === 1 ? false : true;
			});
			if (!manual) {
				// Modified keys (Cmd+C, Shift+arrows, ...): close and let them through.
				s.register(null, null, () => {
					settle(null);
					return true;
				});
			} else {
				s.register(['Shift'], null, (evt) => (evt.key.length === 1 ? false : true));
			}
			return s;
		};

		/** While the color editor is open its fields own the keys: only Esc (collapse) and Cmd+H (close). */
		const buildEditScope = (): Scope => {
			const s = new Scope(app.scope);
			s.register([], 'Escape', () => {
				popover.toggleEditor(false);
				return false;
			});
			s.register(['Mod'], 'h', () => {
				settle(null);
				return false;
			});
			return s;
		};

		function swapScope(editing: boolean) {
			if (scope) app.keymap.popScope(scope);
			scope = editing ? buildEditScope() : buildPickerScope();
			app.keymap.pushScope(scope);
		}
		swapScope(false);
		cleanups.push(() => {
			if (scope) app.keymap.popScope(scope);
		});

		// Click outside closes. Presses inside the popover (including its fields) are inside.
		const onDown = (e: MouseEvent) => {
			if (!popover.contains(e.target as Node)) settle(null);
		};
		document.addEventListener('mousedown', onDown, true);
		cleanups.push(() => document.removeEventListener('mousedown', onDown, true));

		// Scrolling moves the selection away from the popover: close.
		const onScroll = (e: Event) => {
			if (!popover.contains(e.target as Node)) settle(null);
		};
		document.addEventListener('scroll', onScroll, true);
		cleanups.push(() => document.removeEventListener('scroll', onScroll, true));
		const onWheel = () => settle(null);
		cm?.scrollDOM.addEventListener('wheel', onWheel, { passive: true });
		cleanups.push(() => cm?.scrollDOM.removeEventListener('wheel', onWheel));

		// Editor blur closes (set up after a tick so opening cannot trigger it). Focus
		// moving into the popover (the color editor) is not a blur.
		const onBlur = (e: FocusEvent) => {
			if (popover.editing || popover.contains(e.relatedTarget as Node | null)) return;
			settle(null);
		};
		const timer = window.setTimeout(() => {
			if (settled || !cm) return;
			cm.contentDOM.addEventListener('blur', onBlur);
			cleanups.push(() => cm.contentDOM.removeEventListener('blur', onBlur));
		}, 0);
		cleanups.push(() => window.clearTimeout(timer));
		const onWindowBlur = () => {
			if (!popover.editing) settle(null);
		};
		window.addEventListener('blur', onWindowBlur);
		cleanups.push(() => window.removeEventListener('blur', onWindowBlur));
	});
}
