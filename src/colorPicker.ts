/**
 * Color picker seam.
 *
 * The plugin only talks to `openColorPicker`. The temporary implementation
 * below is a SuggestModal; the real popup (designed separately) replaces the
 * body of this function, or the file, without touching main.ts.
 */
import { App, SuggestModal } from 'obsidian';
import type { HighlightColor } from './settings';

/** What the user chose. */
export type PickerChoice =
	| { type: 'color'; index: number }
	| { type: 'remove' };

/**
 * Show the picker.
 *
 * @param app           Obsidian app.
 * @param colors        The colors to offer, in order (5 by default).
 * @param initialIndex  Index of the color to preselect (current or last used).
 * @param isHighlighted True when the selection is already highlighted, so
 *                      the picker should also offer "Remove highlight".
 * @returns The choice, or null when the user cancelled (Esc, click outside).
 */
export function openColorPicker(
	app: App,
	colors: readonly HighlightColor[],
	initialIndex: number,
	isHighlighted: boolean,
): Promise<PickerChoice | null> {
	return new Promise((resolve) => {
		new SuggestColorModal(app, colors, initialIndex, isHighlighted, resolve).open();
	});
}

interface Item {
	label: string;
	choice: PickerChoice;
	color?: string;
}

/** Subset of SuggestModal internals used to preselect an item; absent in some versions. */
interface HasChooser {
	chooser?: { setSelectedItem?: (index: number, evt?: unknown) => void };
}

class SuggestColorModal extends SuggestModal<Item> {
	private readonly items: Item[];
	private readonly initialIndex: number;
	private settled = false;

	constructor(
		app: App,
		colors: readonly HighlightColor[],
		initialIndex: number,
		isHighlighted: boolean,
		private readonly done: (choice: PickerChoice | null) => void,
	) {
		super(app);
		this.initialIndex = initialIndex;
		this.items = colors.map((c, index) => ({
			label: c.name,
			color: c.color,
			choice: { type: 'color', index },
		}));
		if (isHighlighted) {
			this.items.push({ label: 'Remove highlight', choice: { type: 'remove' } });
		}
		this.setPlaceholder('Choose a highlight color');
		this.setInstructions([
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to highlight' },
			{ command: 'esc', purpose: 'to cancel' },
		]);
	}

	onOpen(): void {
		super.onOpen();
		// Best effort: move the selection to the initial color.
		const chooser = (this as unknown as HasChooser).chooser;
		window.setTimeout(() => chooser?.setSelectedItem?.(this.initialIndex), 0);
	}

	getSuggestions(query: string): Item[] {
		const q = query.trim().toLowerCase();
		return this.items.filter((item) => item.label.toLowerCase().includes(q));
	}

	renderSuggestion(item: Item, el: HTMLElement): void {
		el.addClass('color-highlighter-suggestion');
		if (item.color) {
			const swatch = el.createSpan({ cls: 'color-highlighter-swatch' });
			swatch.style.setProperty('--color-highlighter-swatch', item.color);
		}
		el.createSpan({ text: item.label });
	}

	onChooseSuggestion(item: Item): void {
		this.settle(item.choice);
	}

	onClose(): void {
		super.onClose();
		// Obsidian closes the modal before calling onChooseSuggestion, so wait a tick.
		window.setTimeout(() => this.settle(null), 0);
	}

	private settle(choice: PickerChoice | null): void {
		if (this.settled) return;
		this.settled = true;
		this.done(choice);
	}
}
