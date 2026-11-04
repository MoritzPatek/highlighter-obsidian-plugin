import { describe, expect, it } from 'vitest';
import { recolorMarks } from './recolor';
import {
	MAX_ATTEMPTS,
	composeJournal,
	hashText,
	isReplaySafe,
	journalAction,
	newJournal,
	runRecolorPass,
	type RecolorIO,
	type RecolorJournal,
} from './recolorJournal';

const mk = (c: string, t = 'x') => `<mark style="background: ${c};">${t}</mark>`;
const A = '#AAAAAA55';
const B = '#BBBBBB55';
const C = '#CCCCCC55';

class Crash extends Error {}

/** A fake vault; `failOn` makes some notes fail to write. */
function makeVault(files: Record<string, string>, failOn: string[] = []) {
	const disk = { ...files };
	const io: RecolorIO = {
		files: () => Object.keys(disk),
		read: async (p) => disk[p] as string,
		apply: async (p, map) => {
			if (failOn.includes(p)) throw new Error('disk full');
			const r = recolorMarks(disk[p] as string, map);
			disk[p] = r.text;
			return r.count;
		},
	};
	return { disk, io };
}

/** Run a pass that crashes in the n-th journal save, then resume it from the last saved journal. */
async function crashAndResume(
	files: Record<string, string>,
	map: Map<string, string>,
	crashAt: number,
): Promise<Record<string, string>> {
	const { disk, io } = makeVault(files);
	let persisted: RecolorJournal = newJournal('dev', map, [], []);
	let saves = 0;
	const save = async (j: RecolorJournal) => {
		saves++;
		if (saves === crashAt) throw new Crash('boom');
		persisted = structuredClone(j);
	};
	await save(persisted).catch(() => undefined); // the initial save, as the plugin does
	saves = 0;
	try {
		await runRecolorPass(persisted, io, save);
	} catch (e) {
		if (!(e instanceof Crash)) throw e;
	}
	// "restart": resume from what was persisted, never from memory
	const resumed = structuredClone(persisted);
	const res = await runRecolorPass(resumed, io, async () => undefined);
	expect(res.failed).toEqual([]);
	return disk;
}

function names(n: number) {
	return Array.from({ length: n }, (_, i) => `n${i}.md`);
}

describe('recolor pass: crash anywhere, resume, correct result', () => {
	// Every note has marks of both colors in a different mix, so a replay would be visible.
	const mixed = (n: number) => {
		const files: Record<string, string> = {};
		names(n).forEach((p, i) => {
			files[p] = [mk(A, `a${i}`), mk(B, `b${i}`), i % 3 === 0 ? mk(C, `c${i}`) : ''].join(' ');
		});
		return files;
	};

	it('swap A<->B', async () => {
		const map = new Map([[A, B], [B, A]]);
		const files = mixed(7);
		const expected = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, recolorMarks(t, map).text]));
		for (let crashAt = 1; crashAt <= 20; crashAt++) {
			expect(await crashAndResume(files, map, crashAt), `crash at save ${crashAt}`).toEqual(expected);
		}
	});

	it('chain A->B, B->C', async () => {
		const map = new Map([[A, B], [B, C]]);
		const files = mixed(7);
		const expected = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, recolorMarks(t, map).text]));
		for (let crashAt = 1; crashAt <= 20; crashAt++) {
			expect(await crashAndResume(files, map, crashAt), `crash at save ${crashAt}`).toEqual(expected);
		}
		// sanity: an A-only note ends B, never C
		const only = await crashAndResume({ 'x.md': mk(A) }, map, 1);
		expect(only['x.md']).toBe(mk(B));
	});

	it('a replay-safe map (A->B) resumes correctly with batched saves', async () => {
		const map = new Map([[A, B]]);
		expect(isReplaySafe(map)).toBe(true);
		const files = mixed(55);
		const expected = Object.fromEntries(Object.entries(files).map(([p, t]) => [p, recolorMarks(t, map).text]));
		for (const crashAt of [1, 2, 3, 4]) {
			expect(await crashAndResume(files, map, crashAt)).toEqual(expected);
		}
	});

	it('classifies replay safety', () => {
		expect(isReplaySafe(new Map([[A, B], [B, A]]))).toBe(false);
		expect(isReplaySafe(new Map([[A, B], [B, C]]))).toBe(false);
		expect(isReplaySafe(new Map([[A, B], [C, '#DDDDDD55']]))).toBe(true);
	});
});

describe('recolor pass: failures, devices, hashing', () => {
	it('keeps failed notes pending and retries only them', async () => {
		const map = new Map([[A, B]]);
		const files = { 'ok.md': mk(A), 'bad.md': mk(A), 'also.md': mk(A) };
		const { disk, io } = makeVault(files, ['bad.md']);
		const j = newJournal('dev', map, [A], [B]);
		const r1 = await runRecolorPass(j, io, async () => undefined);
		expect(r1.failed).toEqual(['bad.md']);
		expect(j.done.sort()).toEqual(['also.md', 'ok.md']);
		expect(disk['bad.md']).toBe(mk(A));
		// the retry (the disk problem is gone) touches only the pending note
		const { io: io2 } = makeVault(files);
		const applied: string[] = [];
		const r2 = await runRecolorPass(j, { ...io, apply: async (p, m) => { applied.push(p); disk[p] = recolorMarks(disk[p] as string, m).text; return 1; }, files: io2.files }, async () => undefined);
		expect(applied).toEqual(['bad.md']);
		expect(r2.failed).toEqual([]);
		expect(disk).toEqual({ 'ok.md': mk(B), 'bad.md': mk(B), 'also.md': mk(B) });
	});

	it('only the device that started a pass resumes it', () => {
		const j = newJournal('dev-1', new Map([[A, B]]), [A], [B]);
		expect(journalAction(j, 'dev-1')).toBe('resume');
		expect(journalAction(j, 'dev-2')).toBe('discard');
		expect(journalAction(null, 'dev-1')).toBe('none');
	});

	it('hashText differs for different texts', () => {
		expect(hashText('a')).not.toBe(hashText('b'));
		expect(hashText('same')).toBe(hashText('same'));
	});

	it('works from the journal snapshot: later palette edits do not change the pass', async () => {
		const map = new Map([[A, B]]);
		const { disk, io } = makeVault({ 'n.md': mk(A) });
		const j = newJournal('dev', map, [A], [B]);
		// ... the live palette changes to C meanwhile; the journal still brings notes to B
		await runRecolorPass(j, io, async () => undefined);
		expect(disk['n.md']).toBe(mk(B));
		expect(j.to).toEqual([B]);
	});
});

describe('retry cap: a permanently failing note cannot block later changes', () => {
	it('gives a note up after MAX_ATTEMPTS, reports it once, and the pass can complete', async () => {
		const map = new Map([[A, B]]);
		const files = { 'ok.md': mk(A), 'bad.md': mk(A) };
		const { disk, io } = makeVault(files, ['bad.md']);
		const j = newJournal('dev', map, [A], [B]);
		const results = [];
		for (let run = 0; run < MAX_ATTEMPTS + 1; run++) results.push(await runRecolorPass(j, io, async () => undefined));
		expect(MAX_ATTEMPTS).toBe(3);
		expect(results[0]!.failed).toEqual(['bad.md']);
		expect(results[1]!.failed).toEqual(['bad.md']);
		expect(results[2]!.failed).toEqual([]);
		expect(results[2]!.gaveUp).toEqual(['bad.md']); // reported exactly once
		expect(results[3]!.gaveUp).toEqual([]);
		expect(results[3]!.failed).toEqual([]);
		expect(j.abandoned).toEqual(['bad.md']);
		expect(j.attempts['bad.md']).toBe(3);
		expect(disk).toEqual({ 'ok.md': mk(B), 'bad.md': mk(A) });
	});
	it('a note that succeeds on a retry is not given up', async () => {
		const map = new Map([[A, B]]);
		const { disk, io } = makeVault({ 'flaky.md': mk(A) }, ['flaky.md']);
		const j = newJournal('dev', map, [A], [B]);
		await runRecolorPass(j, io, async () => undefined);
		const { io: good } = makeVault({ 'flaky.md': mk(A) });
		const r = await runRecolorPass(j, { ...io, apply: async (p, m) => { disk[p] = recolorMarks(disk[p] as string, m).text; return good ? 1 : 0; } }, async () => undefined);
		expect(r.gaveUp).toEqual([]);
		expect(disk['flaky.md']).toBe(mk(B));
	});
});

describe('composeJournal: new edits do not wait behind a pending pass', () => {
	it('brings done notes (to-colors) and pending notes (from-colors) to the newest palette', async () => {
		const map = new Map([[A, B]]);
		const files = { 'done.md': mk(A), 'pending.md': mk(A), 'other.md': mk('#999999AA') };
		const { disk, io } = makeVault(files, ['pending.md']);
		const j = newJournal('dev', map, [A], [B]);
		await runRecolorPass(j, io, async () => undefined); // done.md -> B, pending.md fails
		expect(disk['done.md']).toBe(mk(B));
		const composed = composeJournal(j, [C]) as RecolorJournal;
		expect(composed).not.toBeNull();
		expect(composed.done).toEqual([]);
		expect(composed.from).toEqual([A]);
		expect(composed.to).toEqual([C]);
		expect(Object.fromEntries(composed.map)).toEqual({ [A]: C, [B]: C });
		const { io: io2 } = makeVault({});
		const run = await runRecolorPass(composed, { ...io2, files: io.files, read: io.read, apply: async (p, m) => { const r = recolorMarks(disk[p] as string, m); disk[p] = r.text; return r.count; } }, async () => undefined);
		expect(run.failed).toEqual([]);
		expect(disk).toEqual({ 'done.md': mk(C), 'pending.md': mk(C), 'other.md': mk('#999999AA') });
	});
	it('keeps the attempt counters and abandoned notes', () => {
		const j = newJournal('dev', new Map([[A, B]]), [A], [B]);
		j.attempts['x.md'] = 2;
		j.abandoned.push('dead.md');
		const c = composeJournal(j, [C]) as RecolorJournal;
		expect(c.attempts).toEqual({ 'x.md': 2 });
		expect(c.abandoned).toEqual(['dead.md']);
	});
	it('refuses to compose when colors cannot be told apart, or a note is mid-write', () => {
		// from A, to B (slot 1); slot 2 goes from B to A: B is both a done-color and a from-color
		const swap = newJournal('dev', new Map([[A, B], [B, A]]), [A, B], [B, A]);
		expect(composeJournal(swap, [C, '#DDDDDD55'])).toBeNull();
		const mid = newJournal('dev', new Map([[A, B]]), [A], [B]);
		mid.inflight = { path: 'n.md', before: 'x', after: 'y' };
		expect(composeJournal(mid, [C])).toBeNull();
	});
	it('an unchanged slot keeps its journal target', () => {
		const j = newJournal('dev', new Map([[A, B]]), [A], [B]);
		const c = composeJournal(j, [B]) as RecolorJournal;
		expect(Object.fromEntries(c.map)).toEqual({ [A]: B });
	});
});

describe('apply that throws after the text changed', () => {
	/** A vault whose apply writes and then throws (the editor edit worked, the save failed). */
	function throwingVault(files: Record<string, string>, throwOn: string[]) {
		const { disk, io } = makeVault(files);
		const real = io.apply;
		let thrown = 0;
		return {
			disk,
			get thrown() {
				return thrown;
			},
			io: {
				...io,
				apply: async (p: string, m: ReadonlyMap<string, string>) => {
					const n = await real(p, m);
					if (throwOn.includes(p) && thrown++ < 1) throw new Error('save failed');
					return n;
				},
			} as RecolorIO,
		};
	}

	it('a swap A<->B is applied exactly once: the note is marked done, not replayed', async () => {
		const map = new Map([[A, B], [B, A]]);
		const files = { 'x.md': `${mk(A, 'a')} ${mk(B, 'b')}`, 'y.md': mk(A, 'y') };
		const v = throwingVault(files, ['x.md']);
		const j = newJournal('dev', map, [A, B], [B, A]);
		const r1 = await runRecolorPass(j, v.io, async () => undefined);
		expect(r1.failed).toEqual([]);
		expect(j.done.sort()).toEqual(['x.md', 'y.md']);
		expect(v.disk['x.md']).toBe(`${mk(B, 'a')} ${mk(A, 'b')}`);
		// another run changes nothing
		await runRecolorPass(j, v.io, async () => undefined);
		expect(v.disk).toEqual({ 'x.md': `${mk(B, 'a')} ${mk(A, 'b')}`, 'y.md': mk(B, 'y') });
	});

	it('a chain A->B, B->C ends with A->B and B->C exactly once', async () => {
		const map = new Map([[A, B], [B, C]]);
		const v = throwingVault({ 'x.md': `${mk(A, 'a')} ${mk(B, 'b')}` }, ['x.md']);
		const j = newJournal('dev', map, [A, B], [B, C]);
		await runRecolorPass(j, v.io, async () => undefined);
		await runRecolorPass(j, v.io, async () => undefined);
		expect(v.disk['x.md']).toBe(`${mk(B, 'a')} ${mk(C, 'b')}`);
	});

	it('when the state is unknown under a swap, inflight stays set and the retry is guarded', async () => {
		const map = new Map([[A, B], [B, A]]);
		const text = `${mk(A, 'a')} ${mk(B, 'b')}`;
		const disk: Record<string, string> = { 'x.md': text, 'z.md': mk(A, 'z') };
		let first = true;
		const io: RecolorIO = {
			files: () => ['x.md', 'z.md'],
			read: async (p) => disk[p] as string,
			apply: async (p, m) => {
				if (p === 'x.md' && first) {
					first = false;
					disk[p] = 'someone else edited this note'; // neither before nor after
					throw new Error('boom');
				}
				const r = recolorMarks(disk[p] as string, m);
				disk[p] = r.text;
				return r.count;
			},
		};
		const j = newJournal('dev', map, [A, B], [B, A]);
		const r1 = await runRecolorPass(j, io, async () => undefined);
		expect(r1.failed).toEqual(['x.md']);
		expect(j.inflight?.path).toBe('x.md'); // kept for the guard
		expect(disk['z.md']).toBe(mk(A, 'z')); // the pass stopped before z
		// the retry: the note changed since (neither hash matches) -> guarded: never replayed
		const r2 = await runRecolorPass(j, io, async () => undefined);
		expect(r2.failed).toEqual([]);
		expect(disk['x.md']).toBe('someone else edited this note');
		expect(disk['z.md']).toBe(mk(B, 'z'));
		expect(j.inflight).toBeNull();
	});
});
