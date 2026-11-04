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
	/** Failed attempts per note. After MAX_ATTEMPTS a note is given up (reported once) so it cannot block later palette changes. */
	attempts: Record<string, number>;
	/** Notes given up on; skipped from then on. */
	abandoned: string[];
}

/** Attempts per note before it is given up. */
export const MAX_ATTEMPTS = 3;

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
	/** Notes that could not be rewritten this time; they stay pending and are retried. */
	failed: string[];
	/** Notes given up on in this run (attempt cap reached); reported once, no longer pending. */
	gaveUp: string[];
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
	return { device, map: [...map], from: [...from], to: [...to], done: [], inflight: null, attempts: {}, abandoned: [] };
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
	const abandoned = new Set(journal.abandoned);
	const result: PassResult = { highlights: 0, notes: 0, failed: [], gaveUp: [] };
	const fail = (path: string) => {
		const n = (journal.attempts[path] ?? 0) + 1;
		journal.attempts[path] = n;
		if (n >= MAX_ATTEMPTS) {
			abandoned.add(path);
			journal.abandoned.push(path);
			result.gaveUp.push(path);
		} else {
			result.failed.push(path);
		}
	};
	let unsaved = 0;

	for (const path of io.files()) {
		if (done.has(path) || abandoned.has(path)) continue;
		let data: string;
		try {
			data = await io.read(path);
		} catch {
			fail(path);
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

		const before = hashText(data);
		const after = hashText(applyToText(data, map));
		if (!safe) {
			journal.inflight = { path, before, after };
			await save(journal);
		}
		let count: number;
		try {
			count = await io.apply(path, map);
		} catch {
			// `apply` can throw after the text already changed (e.g. the editor edit worked, saving failed).
			// Look at the note before deciding, or a retry under a swap/chain would apply the map twice.
			let now = '';
			try {
				now = hashText(await io.read(path));
			} catch {
				/* unknown state */
			}
			if (now === after) {
				count = recolorEdits(data, map).length; // it was applied: count it as done
			} else {
				fail(path);
				if (safe || now === before) {
					journal.inflight = null; // untouched (or replay-safe): a plain retry is fine
				} else {
					// State unknown under a replay-unsafe map: keep `inflight` so the hash guard decides
					// the retry, and stop here (the guard holds a single note).
					await save(journal);
					return result;
				}
				continue;
			}
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

/**
 * Fold new palette edits into a pending journal so they do not wait behind it.
 * Notes already done carry the journal's `to` colors, pending ones still the
 * `from` colors; one map brings both to `next`. Returns null when the two cannot
 * be told apart (a `from` color equals a different slot's `to` color) or a note
 * is mid-write; the caller then finishes the old journal first.
 */
export function composeJournal(journal: RecolorJournal, next: readonly string[]): RecolorJournal | null {
	if (journal.inflight) return null;
	const map = new Map<string, string>();
	for (let i = 0; i < next.length; i++) {
		const target = (next[i] as string).toUpperCase();
		for (const src of [journal.from[i], journal.to[i]]) {
			if (!src) continue;
			const key = src.toUpperCase();
			if (key === target) continue;
			const existing = map.get(key);
			if (existing !== undefined && existing !== target) return null;
			map.set(key, target);
		}
	}
	// A color that is a source for one slot but already the final color of another would be rewritten wrongly.
	const finals = new Set(next.map((c) => c.toUpperCase()));
	for (const key of map.keys()) if (finals.has(key)) return null;
	return {
		...journal,
		map: [...map],
		to: [...next],
		done: [],
		inflight: null,
	};
}
