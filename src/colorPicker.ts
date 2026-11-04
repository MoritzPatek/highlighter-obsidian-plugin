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
	state: { selection: { main: { from: number; to: number } } };
}

/**
 * Show the picker.
 *
 * @param app           Obsidian app.
 * @param editor        The editor holding the selection (used to anchor the popover).
 * @param colors        The colors to offer, in order (5).
 * @param lastUsedIndex Color to focus first; also marked with a dot.
 * @param isHighlighted True when the selection is already highlighted, so
 *                      the picker also offers "Remove highlight".
 * @param autoShown     Opened by a mouse selection: unhandled keys close the popover and
 *                      pass through to the editor instead of being swallowed.
 * @returns The choice, or null when the user cancelled (Esc, click outside, scroll, blur).
 */
export function openColorPicker(
	app: App,
	editor: Editor,
	colors: readonly HighlightColor[],
	lastUsedIndex: number,
	isHighlighted: boolean,
	autoShown = false,
): Promise<PickerChoice | null> {
	return new Promise((resolve) => {
		const cm = (editor as unknown as { cm?: CmView }).cm;
		const cleanups: (() => void)[] = [];
		let settled = false;

		const settle = (choice: PickerChoice | null) => {
			if (settled) return;
			settled = true;
			cleanups.forEach((fn) => fn());
			popover.destroy();
			resolve(choice);
			// Return focus to the editor; applying the edit happens in the caller.
			if (!cm?.contentDOM.contains(document.activeElement)) editor.focus();
		};

		const popover = new ColorPopover({
			colors,
			lastUsedIndex,
			showRemove: isHighlighted,
			onChoose: (choice) => settle(choice),
		});

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

		// Keys
		const scope = new Scope(app.scope);
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
			[[], ' ', () => popover.chooseActive()],
			[[], '0', () => popover.chooseRemove()],
			[[], 'Escape', () => settle(null)],
			[['Mod'], 'h', () => settle(null)],
		];
		// Backspace/Delete remove the highlight only in Cmd+H mode. When auto-shown they
		// fall through to the catch-all below: close and delete the selected text as usual.
		if (!autoShown) {
			keys.push([[], 'Backspace', () => popover.chooseRemove()]);
			keys.push([[], 'Delete', () => popover.chooseRemove()]);
		}
		for (const [mods, key, fn] of keys) {
			scope.register(mods, key, () => {
				fn();
				return false; // preventDefault, stop other handlers
			});
		}
		scope.register([], null, (evt) => {
			const i = digitToIndex(evt.key, colors.length);
			if (i >= 0) {
				popover.chooseColor(i);
				return false;
			}
			if (autoShown) {
				settle(null);
				return true; // pass through untouched
			}
			// Swallow typing keys so nothing replaces the selection while the popover is open.
			return evt.key.length === 1 ? false : true;
		});
		if (autoShown) {
			// Modified keys (Cmd+C, Shift+arrows, ...): close and let them through.
			scope.register(null, null, () => {
				settle(null);
				return true;
			});
		} else {
			scope.register(['Shift'], null, (evt) => (evt.key.length === 1 ? false : true));
		}
		app.keymap.pushScope(scope);
		cleanups.push(() => app.keymap.popScope(scope));

		// Click outside closes. The popover itself prevents default on mousedown.
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

		// Editor blur closes (set up after a tick so opening cannot trigger it).
		const timer = window.setTimeout(() => {
			if (settled || !cm) return;
			cm.contentDOM.addEventListener('blur', onBlur);
			cleanups.push(() => cm.contentDOM.removeEventListener('blur', onBlur));
		}, 0);
		cleanups.push(() => window.clearTimeout(timer));
		const onBlur = () => settle(null);
		window.addEventListener('blur', onBlur);
		cleanups.push(() => window.removeEventListener('blur', onBlur));
	});
}
