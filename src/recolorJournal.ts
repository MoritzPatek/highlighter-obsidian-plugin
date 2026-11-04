/**
 * Crash-safe palette recolor pass. No Obsidian imports: files are reached
 * through `RecolorIO`, so the engine can be tested with a fake vault and
 * injected crashes.
 *
 * The journal is saved before the pass starts and while it runs. After a crash
 * the pass resumes with the journal's own map and skips the notes that are done,
 * so a map is never replayed on a note it already rewrote (that would corrupt
 * swaps A<->B and chains A->B, B->C).
 */
import { recolorEdits } from './recolor';

export interface RecolorJournal {
	/** Per-device id: only the device that started a pass may resume it. */
	device: string;
	/** old -> new, upper-case #RRGGBBAA. */
	map: [string, string][];
	/** Palette the notes had when the pass started. */
	from: string[];
	/** Palette the pass brings the notes to (becomes `committed` when every note succeeded). */
	to: string[];
	/** Notes that were rewritten. Notes without matching marks need no entry (nothing to replay). */
	done: string[];
	/**
	 * Only for maps that are not safe to replay (a new color equals another old one):
	 * the note being written, with hashes of its text before and after, so a crash
	 * between "written" and "recorded" is detected on resume.
	 */
	inflight: { path: string; before: string; after: string } | null;
}

export interface RecolorIO {
	/** Paths of all notes. */
	files(): string[];
	/** Current text of a note (the editor's text for notes open in an editor). */
	read(path: string): Promise<string>;
	/** Rewrite the note with `map`; returns the number of rewritten highlights. Throws on failure. */
	apply(path: string, map: ReadonlyMap<string, string>): Promise<number>;
}

export interface PassResult {
	highlights: number;
	notes: number;
	/** Notes that could not be rewritten; they stay pending in the journal. */
	failed: string[];
}

/** FNV-1a over the UTF-16 units; enough to tell "before" from "after". */
export function hashText(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16) + ':' + text.length;
}

/** A map is replay-safe when no new color is also an old color. */
export function isReplaySafe(map: ReadonlyMap<string, string>): boolean {
	for (const v of map.values()) if (map.has(v)) return false;
	return true;
}

/** What to do with a saved journal on this device. */
export function journalAction(
	journal: RecolorJournal | null,
	device: string,
): 'none' | 'resume' | 'discard' {
	if (!journal) return 'none';
	return journal.device === device ? 'resume' : 'discard';
}

export function newJournal(
	device: string,
	map: ReadonlyMap<string, string>,
	from: readonly string[],
	to: readonly string[],
): RecolorJournal {
	return { device, map: [...map], from: [...from], to: [...to], done: [], inflight: null };
}

const BATCH = 20;

/**
 * Run (or resume) the pass described by `journal`. `save` persists the journal
 * (errors from `save` propagate: that is how a crash looks to the engine). Errors
 * from `io.apply` fail only that note.
 */
export async function runRecolorPass(
	journal: RecolorJournal,
	io: RecolorIO,
	save: (journal: RecolorJournal) => Promise<void>,
): Promise<PassResult> {
	const map = new Map(journal.map);
	const safe = isReplaySafe(map);
	const done = new Set(journal.done);
	const result: PassResult = { highlights: 0, notes: 0, failed: [] };
	let unsaved = 0;

	for (const path of io.files()) {
		if (done.has(path)) continue;
		let data: string;
		try {
			data = await io.read(path);
		} catch {
			result.failed.push(path);
			continue;
		}
		if (recolorEdits(data, map).length === 0) continue;

		// Resuming after a crash while this note was being written?
		const fly = journal.inflight;
		if (fly && fly.path === path) {
			const now = hashText(data);
			if (now !== fly.before) {
				// Already written (now === after), or edited by the user since: do not replay.
				done.add(path);
				journal.done.push(path);
				journal.inflight = null;
				await save(journal);
				continue;
			}
		}

		if (!safe) {
			journal.inflight = { path, before: hashText(data), after: '' };
			journal.inflight.after = hashText(applyToText(data, map));
			await save(journal);
		}
		let count: number;
		try {
			count = await io.apply(path, map);
		} catch {
			result.failed.push(path);
			journal.inflight = null;
			continue;
		}
		done.add(path);
		journal.done.push(path);
		journal.inflight = null;
		result.highlights += count;
		result.notes += 1;
		unsaved += 1;
		if (!safe || unsaved >= BATCH) {
			await save(journal);
			unsaved = 0;
		}
	}
	await save(journal); // final state
	return result;
}

function applyToText(text: string, map: ReadonlyMap<string, string>): string {
	const edits = recolorEdits(text, map);
	let out = '';
	let pos = 0;
	for (const e of edits) {
		out += text.slice(pos, e.from) + e.insert;
		pos = e.to;
	}
	return out + text.slice(pos);
}
