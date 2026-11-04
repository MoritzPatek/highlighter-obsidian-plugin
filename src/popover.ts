/**
 * The color popover DOM component. No Obsidian imports: the plugin glue
 * (keys, anchoring, closing) lives in colorPicker.ts, and the dev harness
 * mounts this class directly.
 */
import { MAX_NAME_LENGTH, findDuplicateSlot, splitColor, uniqueRgb, withHighlightAlpha, type HighlightColor } from './settings';
import { clampIndex, computePopoverPosition, moveIndex, type Move, type Rect } from './pickerLogic';

export type PopoverChoice = { type: 'color'; index: number } | { type: 'remove' };

export interface PopoverOptions {
	/** The palette. The entries are edited in place by the color editor. */
	colors: HighlightColor[];
	/** Palette to restore with "Reset to defaults". */
	defaults?: readonly HighlightColor[];
	/** Last-used color, marked with a dot (hidden while a current color is shown). */
	lastUsedIndex: number;
	/** Item focused first (defaults to the last-used color). */
	focusIndex?: number;
	/** The palette color of the highlight the selection is in, or -1/undefined. Gets a check badge. */
	currentIndex?: number;
	/** Show the "Remove highlight" item. */
	showRemove: boolean;
	onChoose: (choice: PopoverChoice) => void;
	/** The color editor opened or closed. */
	onEditorToggle?: (open: boolean) => void;
	/** A name or color changed (save soon). */
	onEdited?: () => void;
	/** An edit session ended (Done, Esc, Reset, popover closed): apply the palette to the notes. */
	onCommit?: () => void;
}

const CLS = 'color-highlighter-popover';
const SVG_NS = 'http://www.w3.org/2000/svg';

export class ColorPopover {
	readonly el: HTMLDivElement;
	private readonly items: { el: HTMLButtonElement; choice: PopoverChoice }[] = [];
	private readonly caption: HTMLElement;
	private readonly captionRow: HTMLElement;
	private readonly editorEl: HTMLElement;
	private readonly editBtn: HTMLButtonElement;
	private readonly current: number;
	private active = 0;
	private isEditing = false;
	private dirty = false;
	private anchor: { left: number; top: number; bottom: number } | null = null;
	private editorRect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };

	constructor(private readonly opts: PopoverOptions) {
		const doc = document;
		this.current = opts.currentIndex ?? -1;
		const el = (this.el = doc.createElement('div'));
		el.className = CLS;
		el.setAttribute('role', 'dialog');
		el.setAttribute('aria-label', 'Highlight color');

		const row = doc.createElement('div');
		row.className = `${CLS}__row`;
		row.setAttribute('role', 'toolbar');
		row.setAttribute('aria-label', 'Highlight colors');

		opts.colors.forEach((_c, i) => {
			const b = this.makeButton('', '');
			b.classList.add(`${CLS}__swatch`);
			b.textContent = String(i + 1);
			if (i === this.current) {
				b.classList.add('is-set');
				b.appendChild(this.makeCheck());
			} else if (this.current < 0 && i === opts.lastUsedIndex) {
				b.classList.add('is-current');
			}
			row.appendChild(b);
			this.items.push({ el: b, choice: { type: 'color', index: i } });
		});

		if (opts.showRemove) {
			const divider = doc.createElement('div');
			divider.className = `${CLS}__divider`;
			row.appendChild(divider);
			const b = this.makeButton('Remove highlight, 0', 'Remove highlight (0)');
			b.classList.add(`${CLS}__swatch`, 'is-remove');
			b.appendChild(this.makeCross());
			row.appendChild(b);
			this.items.push({ el: b, choice: { type: 'remove' } });
		}

		const cap = (this.captionRow = doc.createElement('div'));
		cap.className = `${CLS}__caption`;
		const name = (this.caption = doc.createElement('span'));
		name.className = `${CLS}__name`;
		name.setAttribute('aria-live', 'polite');
		const keys = doc.createElement('span');
		keys.className = `${CLS}__keys`;
		keys.append(this.kbd('←'), ' ', this.kbd('→'), ' choose  ', this.kbd('↵'), ' apply  ', this.kbd('esc'));
		const edit = (this.editBtn = this.makeButton('Edit colors (E)', 'Edit colors (E)'));
		edit.classList.add(`${CLS}__edit`);
		edit.setAttribute('aria-expanded', 'false');
		edit.appendChild(this.makePencil());
		cap.append(name, keys, edit);

		const editor = (this.editorEl = doc.createElement('div'));
		editor.className = `${CLS}__editor`;
		editor.hidden = true;
		editor.setAttribute('role', 'group');
		editor.setAttribute('aria-label', 'Edit colors');

		el.append(row, cap, editor);

		// Keep the editor selection and focus: never let a press inside take focus,
		// except on the editor's own fields (they must be focusable).
		el.addEventListener('mousedown', (e) => {
			if (!(e.target as HTMLElement).closest('input')) e.preventDefault();
		});
		this.items.forEach((it, i) => it.el.addEventListener('click', () => this.choose(i)));
		edit.addEventListener('click', () => this.toggleEditor());

		this.syncSwatches();
		this.setActive(clampIndex(opts.focusIndex ?? opts.lastUsedIndex, opts.colors.length));
	}

	/** Append to the document, position and show. */
	mount(
		anchor: { left: number; top: number; bottom: number } | null,
		editorRect: Rect,
		parent: HTMLElement = document.body,
	): void {
		this.anchor = anchor;
		this.editorRect = editorRect;
		this.el.style.visibility = 'hidden';
		parent.appendChild(this.el);
		this.reposition();
		this.el.style.visibility = '';
	}

	/** Place the popover again (after it grew or shrank): below the selection, flipped above if needed. */
	reposition(): void {
		const pos = computePopoverPosition({
			anchor: this.anchor,
			editor: this.editorRect,
			popup: { width: this.el.offsetWidth, height: this.el.offsetHeight },
			viewport: { width: window.innerWidth, height: window.innerHeight },
		});
		this.el.style.left = `${pos.left}px`;
		this.el.style.top = `${pos.top}px`;
	}

	destroy(): void {
		this.el.remove();
	}

	contains(node: Node | null): boolean {
		return !!node && this.el.contains(node);
	}

	get editing(): boolean {
		return this.isEditing;
	}

	/** Whether the palette was edited since the last commit. */
	get hasUncommittedEdits(): boolean {
		return this.dirty;
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

	/** Open or close the color editor in place. */
	toggleEditor(force?: boolean): void {
		const open = force ?? !this.isEditing;
		if (open === this.isEditing) return;
		this.isEditing = open;
		this.el.classList.toggle('is-editing', open);
		this.editorEl.hidden = !open;
		this.captionRow.hidden = open;
		this.editBtn.setAttribute('aria-expanded', String(open));
		if (open) {
			this.buildEditor();
		} else {
			const active = document.activeElement;
			if (active instanceof HTMLElement && this.el.contains(active)) active.blur();
		}
		this.reposition();
		if (open) this.editorEl.querySelector<HTMLInputElement>('input[type="text"]')?.focus({ preventScroll: true });
		this.opts.onEditorToggle?.(open);
		if (!open) this.commit();
	}

	/** End an edit session: apply the palette to the notes if anything changed. */
	commit(): void {
		if (!this.dirty) return;
		this.dirty = false;
		this.opts.onCommit?.();
	}

	private choose(i: number): void {
		const it = this.items[i];
		if (it) this.opts.onChoose(it.choice);
	}

	private colorName(i: number): string {
		return this.opts.colors[i]?.name ?? `Color ${i + 1}`;
	}

	private setActive(i: number): void {
		this.active = i;
		this.items.forEach((it, k) => {
			it.el.classList.toggle('is-active', k === i);
			it.el.tabIndex = -1; // roving: focus is only ever shown, never moved
		});
		const it = this.items[i];
		if (!it) return;
		this.caption.textContent =
			it.choice.type === 'remove'
				? 'Remove highlight'
				: this.colorName(i) + (i === this.current ? ' · current' : '');
	}

	/** Refresh swatch colors, labels and the caption from the (possibly edited) palette. */
	private syncSwatches(): void {
		this.opts.colors.forEach((c, i) => {
			const b = this.items[i]?.el;
			if (!b) return;
			b.style.backgroundColor = c.color;
			const label = `${c.name}, ${i + 1}${i === this.current ? ', current' : ''}`;
			b.setAttribute('aria-label', label);
			b.title = `${c.name} (${i + 1})`;
		});
		this.setActive(this.active);
	}

	private buildEditor(): void {
		const doc = document;
		const ed = this.editorEl;
		ed.textContent = '';
		const colors = this.opts.colors;

		const hint = doc.createElement('div');
		hint.className = `${CLS}__hint`;
		hint.setAttribute('role', 'status');

		colors.forEach((c, i) => {
			const row = doc.createElement('div');
			row.className = `${CLS}__erow`;

			const picker = doc.createElement('input');
			picker.type = 'color';
			picker.value = splitColor(c.color).rgb.toLowerCase();
			picker.setAttribute('aria-label', `Color ${i + 1}`);

			const chip = doc.createElement('span');
			chip.className = `${CLS}__chip`;
			chip.setAttribute('aria-hidden', 'true');
			chip.textContent = String(i + 1);
			chip.style.backgroundColor = c.color;

			const text = doc.createElement('input');
			text.type = 'text';
			text.value = c.name;
			text.maxLength = MAX_NAME_LENGTH;
			text.placeholder = `Color ${i + 1}`;
			text.setAttribute('aria-label', `Name for color ${i + 1}`);

			picker.addEventListener('input', () => {
				// Two slots must never share a color: that would merge their highlights for good.
				const dup = findDuplicateSlot(colors, i, picker.value);
				const { rgb, nudged } = uniqueRgb(picker.value, colors.filter((_x, k) => k !== i).map((x) => x.color));
				if (nudged) picker.value = rgb.toLowerCase();
				hint.textContent = nudged ? `Same as ${this.colorName(dup)}: shade adjusted slightly.` : '';
				c.color = withHighlightAlpha(rgb);
				chip.style.backgroundColor = c.color;
				this.edited();
			});
			text.addEventListener('input', () => {
				c.name = text.value.trim() || `Color ${i + 1}`;
				this.edited();
			});
			text.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					e.stopPropagation();
					this.toggleEditor(false);
				}
			});

			row.append(picker, chip, text);
			ed.appendChild(row);
		});

		ed.appendChild(hint);

		const foot = doc.createElement('div');
		foot.className = `${CLS}__efoot`;
		const reset = this.makeButton('Reset to defaults', '');
		reset.classList.add(`${CLS}__link`);
		reset.textContent = 'Reset to defaults';
		reset.addEventListener('click', () => {
			const defs = this.opts.defaults;
			if (!defs) return;
			colors.forEach((c, i) => {
				const d = defs[i];
				if (d) {
					c.name = d.name;
					c.color = d.color;
				}
			});
			this.edited();
			this.buildEditor();
			this.editorEl.querySelector<HTMLInputElement>('input[type="text"]')?.focus({ preventScroll: true });
			this.commit();
		});
		const done = this.makeButton('Done', '');
		done.classList.add(`${CLS}__done`);
		done.textContent = 'Done';
		done.addEventListener('click', () => this.toggleEditor(false));
		foot.append(reset, done);
		ed.appendChild(foot);
	}

	private edited(): void {
		this.dirty = true;
		this.syncSwatches();
		this.opts.onEdited?.();
	}

	private makeButton(label: string, title: string): HTMLButtonElement {
		const b = document.createElement('button');
		b.type = 'button';
		b.tabIndex = -1;
		if (label) b.setAttribute('aria-label', label);
		if (title) b.title = title;
		return b;
	}

	private kbd(text: string): HTMLElement {
		const k = document.createElement('kbd');
		k.textContent = text;
		return k;
	}

	private svg(d: string, extra?: (svg: SVGElement) => void): SVGElement {
		const svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		const path = document.createElementNS(SVG_NS, 'path');
		path.setAttribute('d', d);
		svg.appendChild(path);
		extra?.(svg);
		return svg;
	}

	private makeCross(): SVGElement {
		return this.svg('M5 5l14 14M19 5L5 19');
	}

	private makePencil(): SVGElement {
		return this.svg('M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4');
	}

	/** Filled circle with a check mark: "this is the highlight's current color". */
	private makeCheck(): SVGElement {
		const svg = document.createElementNS(SVG_NS, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		svg.classList.add('ck');
		const c = document.createElementNS(SVG_NS, 'circle');
		c.setAttribute('cx', '12');
		c.setAttribute('cy', '12');
		c.setAttribute('r', '11');
		const p = document.createElementNS(SVG_NS, 'path');
		p.setAttribute('d', 'M7 12.5l3.2 3.2L17 9');
		svg.append(c, p);
		return svg;
	}
}
