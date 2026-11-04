/** A string-backed fake of the Obsidian Editor methods we use (tests only). */
import type { EditorLike, Pos } from './editorOps';

/** A string-backed fake of the Obsidian Editor methods we use. */
export class FakeEditor implements EditorLike {
	sel: { from: number; to: number };
	/** Undo history: one entry per edit (a transaction is one entry). */
	history: { doc: string; sel: { from: number; to: number } }[] = [];
	constructor(
		public doc: string,
		from: number,
		to: number,
	) {
		this.sel = { from, to };
	}
	lineCount(): number {
		return this.lines().length;
	}
	private lines() {
		return this.doc.split('\n');
	}
	offsetToPos(offset: number): Pos {
		const before = this.doc.slice(0, offset).split('\n');
		return { line: before.length - 1, ch: (before[before.length - 1] as string).length };
	}
	posToOffset(pos: Pos): number {
		const lines = this.lines();
		let o = 0;
		for (let i = 0; i < pos.line; i++) o += (lines[i] as string).length + 1;
		return o + pos.ch;
	}
	getCursor(which: 'from' | 'to' | 'head' | 'anchor' = 'head'): Pos {
		return this.offsetToPos(which === 'from' || which === 'anchor' ? this.sel.from : this.sel.to);
	}
	getLine(line: number): string {
		return this.lines()[line] ?? '';
	}
	getRange(from: Pos, to: Pos): string {
		return this.doc.slice(this.posToOffset(from), this.posToOffset(to));
	}
	private snapshot(): void {
		this.history.push({ doc: this.doc, sel: { ...this.sel } });
	}
	/** Undo the last edit (one step). */
	undo(): void {
		const h = this.history.pop();
		if (h) {
			this.doc = h.doc;
			this.sel = h.sel;
		}
	}
	transaction(tx: { changes?: { from: Pos; to?: Pos; text: string }[]; selection?: { from: Pos; to?: Pos } }): void {
		this.snapshot();
		// changes refer to the note before the transaction; apply from the end so offsets stay valid
		const ch = [...(tx.changes ?? [])].map((c) => ({ from: this.posToOffset(c.from), to: this.posToOffset(c.to ?? c.from), text: c.text }));
		ch.sort((a, b) => b.from - a.from);
		let doc = this.doc;
		for (const c of ch) doc = doc.slice(0, c.from) + c.text + doc.slice(c.to);
		this.doc = doc;
		if (tx.selection) {
			const a = this.posToOffset(tx.selection.from);
			const b = tx.selection.to ? this.posToOffset(tx.selection.to) : a;
			this.sel = { from: Math.min(a, b), to: Math.max(a, b) };
		}
	}
	replaceRange(text: string, from: Pos, to: Pos = from): void {
		this.snapshot();
		this.doc = this.doc.slice(0, this.posToOffset(from)) + text + this.doc.slice(this.posToOffset(to));
	}
	setSelection(anchor: Pos, head: Pos = anchor): void {
		const a = this.posToOffset(anchor);
		const b = this.posToOffset(head);
		this.sel = { from: Math.min(a, b), to: Math.max(a, b) };
	}
	setCursor(pos: Pos): void {
		const o = this.posToOffset(pos);
		this.sel = { from: o, to: o };
	}
}

