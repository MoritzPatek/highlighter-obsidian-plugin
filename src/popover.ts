/**
 * The color popover DOM component. No Obsidian imports: the plugin glue
 * (keys, anchoring, closing) lives in colorPicker.ts, and the dev harness
 * mounts this class directly.
 */
import type { HighlightColor } from './settings';
import { clampIndex, computePopoverPosition, moveIndex, type Move, type Rect } from './pickerLogic';

export type PopoverChoice = { type: 'color'; index: number } | { type: 'remove' };

export interface PopoverOptions {
	colors: readonly HighlightColor[];
	/** Color that is focused first and marked with a dot. */
	lastUsedIndex: number;
	/** Item focused first (defaults to the last-used color). */
	focusIndex?: number;
	/** Show the "Remove highlight" item. */
	showRemove: boolean;
	onChoose: (choice: PopoverChoice) => void;
}

const CLS = 'color-highlighter-popover';
const SVG_NS = 'http://www.w3.org/2000/svg';

export class ColorPopover {
	readonly el: HTMLDivElement;
	private readonly items: { el: HTMLButtonElement; name: string; choice: PopoverChoice }[] = [];
	private readonly caption: HTMLElement;
	private active = 0;

	constructor(private readonly opts: PopoverOptions) {
		const doc = document;
		const el = (this.el = doc.createElement('div'));
		el.className = CLS;
		el.setAttribute('role', 'dialog');
		el.setAttribute('aria-label', 'Highlight color');

		const row = doc.createElement('div');
		row.className = `${CLS}__row`;
		row.setAttribute('role', 'toolbar');
		row.setAttribute('aria-label', 'Highlight colors');

		opts.colors.forEach((c, i) => {
			const b = this.makeButton(`${c.name}, ${i + 1}`, `${c.name} (${i + 1})`);
			b.classList.add(`${CLS}__swatch`);
			b.style.backgroundColor = c.color;
			b.textContent = String(i + 1);
			if (i === opts.lastUsedIndex) b.classList.add('is-current');
			row.appendChild(b);
			this.items.push({ el: b, name: c.name, choice: { type: 'color', index: i } });
		});

		if (opts.showRemove) {
			const divider = doc.createElement('div');
			divider.className = `${CLS}__divider`;
			row.appendChild(divider);
			const b = this.makeButton('Remove highlight, 0', 'Remove highlight (0)');
			b.classList.add(`${CLS}__swatch`, 'is-remove');
			b.appendChild(this.makeCross());
			row.appendChild(b);
			this.items.push({ el: b, name: 'Remove highlight', choice: { type: 'remove' } });
		}

		const cap = doc.createElement('div');
		cap.className = `${CLS}__caption`;
		const name = (this.caption = doc.createElement('span'));
		name.className = `${CLS}__name`;
		name.setAttribute('aria-live', 'polite');
		const keys = doc.createElement('span');
		keys.className = `${CLS}__keys`;
		keys.append(this.kbd('←'), ' ', this.kbd('→'), ' choose  ', this.kbd('↵'), ' apply  ', this.kbd('esc'));
		cap.append(name, keys);

		el.append(row, cap);

		// Keep the editor selection and focus: never let a press inside take focus.
		el.addEventListener('mousedown', (e) => e.preventDefault());
		this.items.forEach((it, i) => it.el.addEventListener('click', () => this.choose(i)));

		this.setActive(clampIndex(opts.focusIndex ?? opts.lastUsedIndex, opts.colors.length));
	}

	/** Append to the document, position and show. */
	mount(
		anchor: { left: number; top: number; bottom: number } | null,
		editorRect: Rect,
		parent: HTMLElement = document.body,
	): void {
		this.el.style.visibility = 'hidden';
		parent.appendChild(this.el);
		const pos = computePopoverPosition({
			anchor,
			editor: editorRect,
			popup: { width: this.el.offsetWidth, height: this.el.offsetHeight },
			viewport: { width: window.innerWidth, height: window.innerHeight },
		});
		this.el.style.left = `${pos.left}px`;
		this.el.style.top = `${pos.top}px`;
		this.el.style.visibility = '';
	}

	destroy(): void {
		this.el.remove();
	}

	contains(node: Node | null): boolean {
		return !!node && this.el.contains(node);
	}

	move(move: Move): void {
		this.setActive(moveIndex(this.active, this.items.length, move));
	}

	/** Apply the focused item. */
	chooseActive(): void {
		this.choose(this.active);
	}

	/** Apply color number `index` (0-based). */
	chooseColor(index: number): void {
		if (index >= 0 && index < this.opts.colors.length) this.choose(index);
	}

	/** Remove the highlight; ignored when the item does not exist. */
	chooseRemove(): void {
		if (this.opts.showRemove) this.choose(this.items.length - 1);
	}

	get activeIndex(): number {
		return this.active;
	}

	private choose(i: number): void {
		const it = this.items[i];
		if (it) this.opts.onChoose(it.choice);
	}

	private setActive(i: number): void {
		this.active = i;
		this.items.forEach((it, k) => {
			it.el.classList.toggle('is-active', k === i);
			it.el.tabIndex = -1; // roving: focus is only ever shown, never moved
		});
		const it = this.items[i];
		if (it) this.caption.textContent = it.name;
	}

	private makeButton(label: string, title: string): HTMLButtonElement {
		const b = document.createElement('button');
		b.type = 'button';
		b.tabIndex = -1;
		b.setAttribute('aria-label', label);
		b.title = title;
		return b;
	}

	private kbd(text: string): HTMLElement {
		const k = document.createElement('kbd');
		k.textContent = text;
		return k;
	}

	private makeCross(): SVGElement {
		const svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		const path = document.createElementNS(SVG_NS, 'path');
		path.setAttribute('d', 'M5 5l14 14M19 5L5 19');
		svg.appendChild(path);
		return svg;
	}
}
