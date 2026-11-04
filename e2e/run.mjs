#!/usr/bin/env node
// Real-Obsidian end-to-end suite for Color Highlighter. See e2e/README.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep } from './cdp.mjs';
import { cases } from './cases.mjs';
import { paintedRanges, strip, violations } from './invariants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(here, '..', 'test-vault', 'All formats.md'), 'utf8');
const FILE = 'All formats.md';
const SHOTS = join(here, 'shots');
mkdirSync(SHOTS, { recursive: true });
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const rangeArg = process.argv.find((a) => a.startsWith('--range='));
const append = process.argv.includes('--append');
const keepNote = process.argv.includes('--keep');

// ---------------------------------------------------------------- page side
const PAGE_JS = `(() => {
  const E = (window.__e2e = {});
  const ed = () => app.workspace.activeEditor.editor;
  const leafRoot = () => document.querySelector('.workspace-leaf.mod-active');
  E.reset = (text) => { const e = ed(); e.setValue(text); e.setCursor({ line: 0, ch: 0 }); };
  E.pos = (o) => ed().offsetToPos(o);
  E.select = (from, to) => { const e = ed(); e.setSelection(e.offsetToPos(from), e.offsetToPos(to)); E.scrollRegion(from); e.focus(); };
  E.scrollTo = (from) => E.scrollRegion(from);
  E.getScroll = () => ed().cm.scrollDOM.scrollTop;
  E.setScroll = (y) => { ed().cm.scrollDOM.scrollTop = y; };
  E.sel = () => { const e = ed(); const a = e.posToOffset(e.getCursor('from')), b = e.posToOffset(e.getCursor('to')); return { from: a, to: b, text: e.getRange(e.offsetToPos(a), e.offsetToPos(b)) }; };
  E.doc = () => ed().getValue();
  E.cursor = () => ed().posToOffset(ed().getCursor('head'));
  // Put the caret on a blank line away from the region (so nothing is revealed), keep the region in view.
  // A table cell that was edited keeps its own editor (showing raw source) until focus really leaves it.
  E.leaveTable = () => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); ed().focus(); };
  E.away = (from, to) => {
    const e = ed(); const lines = e.getValue().split('\\n');
    const fl = e.offsetToPos(from).line, tl = e.offsetToPos(to).line;
    let target = -1;
    for (let d = 2; d < 12 && target < 0; d++) {
      if (tl + d < lines.length && lines[tl + d].trim() === '' ) target = tl + d;
      else if (fl - d >= 0 && lines[fl - d].trim() === '') target = fl - d;
    }
    if (target < 0) target = Math.min(lines.length - 1, tl + 3);
    e.setCursor({ line: target, ch: 0 });
    E.scrollRegion(from);
    E.awayLine = target;
  };
  E.awayPoint = () => { const e = ed(); const c = ed().cm.coordsAtPos(e.posToOffset({ line: E.awayLine, ch: 0 })); return c ? { x: c.left + 40, y: (c.top + c.bottom) / 2 } : null; };
  // The same viewport every time (Live Preview only renders what is in view).
  E.scrollRegion = (offset) => { const cm = ed().cm; const b = cm.lineBlockAt(offset); cm.scrollDOM.scrollTop = Math.max(0, b.top - 140); };
  // Reading view renders long notes lazily: scroll through the note top to bottom and collect every block it renders.
  E.collectReading = async () => {
    const root = () => leafRoot().querySelector('.markdown-reading-view > .markdown-preview-view');
    let last = -1, same = 0;
    for (let i = 0; i < 40 && same < 3; i++) { await new Promise((r) => setTimeout(r, 250)); const n = root() ? root().querySelectorAll('.markdown-preview-section > *').length : 0; same = n > 0 && n === last ? same + 1 : 0; last = n; }
    const seen = new Map();
    // the scroll height grows as sections render, so look at it again on every step
    for (let y = 0, k = 0; y <= root().scrollHeight + 400 && k < 70; y += 320, k++) {
      root().scrollTop = y; await new Promise((r) => setTimeout(r, 260));
      for (const b of E.metrics('reading', true)) if (!seen.has(b.text)) seen.set(b.text, b);
    }
    root().scrollTop = 0;
    return [...seen.values()];
  };
  E.coords = (offset) => { const cm = ed().cm; const c = cm.coordsAtPos(offset); return c ? { x: c.left, y: (c.top + c.bottom) / 2 } : null; };
  E.popup = () => !!document.querySelector('.color-highlighter-popover');
  E.notices = () => [...document.querySelectorAll('.notice')].map((n) => n.textContent);
  E.norm = (s) => s.replace(/\\s+/g, ' ').trim();
  E.decode = (s) => new DOMParser().parseFromString(s, 'text/html').body.textContent;
  E.rgba = (el) => getComputedStyle(el).backgroundColor;
  const count = (root, sel) => [...root.querySelectorAll(sel)].filter((e) => !e.closest('.markdown-embed, .internal-embed')).length;
  // Every rendered block (a Live Preview line or widget, a Reading view section child), with what it contains.
  E.metrics = (mode, visibleOnly = false) => {
    const scroller = mode === 'lp' ? ed().cm.scrollDOM : leafRoot().querySelector('.markdown-reading-view > .markdown-preview-view');
    const blocks = mode === 'lp' ? [...ed().cm.contentDOM.children] : [...scroller.querySelectorAll('.markdown-preview-section > *')];
    if (visibleOnly) { const w = scroller.getBoundingClientRect(); return E.measure(blocks.filter((b) => { const r = b.getBoundingClientRect(); return r.bottom > w.top - 300 && r.top < w.bottom + 300; }), mode); }
    return E.measure(blocks, mode);
  };
  E.measure = (blocks, mode) => {
    const sels = mode === 'lp'
      ? { table: 'table', callout: '.callout', math: '.math, mjx-container', image: 'img:not([aria-hidden])', checkbox: 'input[type=checkbox]', headers: '.HyperMD-header', listLines: '.HyperMD-list-line', tags: '.cm-hashtag', inlineCode: '.cm-inline-code', internalLinks: '.cm-hmd-internal-link, a.internal-link', codeLines: '.HyperMD-codeblock' }
      : { table: 'table', callout: '.callout', math: 'mjx-container', image: 'img', checkbox: 'input[type=checkbox]', headers: 'h1,h2,h3,h4,h5,h6', li: 'li', tags: 'a.tag', inlineCode: ':not(pre) > code', pre: 'pre', internalLinks: 'a.internal-link', externalLinks: 'a.external-link', hr: 'hr', blockquote: 'blockquote', footnoteRefs: '.footnote-link, sup.footnote-ref' };
    const out = [];
    for (const b of blocks) {
      if (b.closest('.markdown-embed, .internal-embed')) continue;
      if (mode === 'lp' && b.getBoundingClientRect().height === 0) continue;
      // Embedded notes render their own content inline: leave that out, measure what is ours.
      const n = b.cloneNode(true);
      n.querySelectorAll('.markdown-embed, .internal-embed').forEach((x) => x.remove());
      const counts = {};
      for (const [k, sel] of Object.entries(sels)) counts[k] = n.querySelectorAll(sel).length + (n.matches(sel) ? 1 : 0);
      const text = E.norm(n.textContent || '');
      n.querySelectorAll('pre, code, .cm-inline-code, .HyperMD-codeblock').forEach((x) => x.remove());
      const outside = n.textContent || '';
      const live = [...b.querySelectorAll('mark')].filter((m) => !m.closest('.markdown-embed, .internal-embed'));
      out.push({ text, counts, marks: live.map((m) => ({ text: E.norm(m.textContent), bg: E.rgba(m) })), literalMark: (outside.match(/<mark/g) || []).length, equals: (outside.match(/==/g) || []).length });
    }
    return out;
  };
  E.setMode = async (mode, file) => {
    const leaf = app.workspace.getLeaf(false);
    const view = leaf.view; if (view.save) await view.save();
    await leaf.setViewState({ type: 'markdown', state: mode === 'reading' ? { file, mode: 'preview' } : { file, mode: 'source', source: false }, active: true });
  };
  E.colors = () => app.plugins.plugins['color-highlighter'].settings.colors.map((c) => c.color);
  E.openFile = async (file) => { const f = app.vault.getAbstractFileByPath(file); const leaf = app.workspace.getLeaf(false); await leaf.openFile(f); await E.setMode('lp', file); };
  return true;
})()`;

// ---------------------------------------------------------------- helpers
const c = await connect();
const log = (...a) => console.log(...a);
const key = async (k, code, vk, modifiers = 0) => {
	await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
	await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
};
const shot = async (name) => {
	const r = await c.send('Page.captureScreenshot', { format: 'png' });
	const file = join(SHOTS, `${name}.png`);
	writeFileSync(file, Buffer.from(r.data, 'base64'));
	return `shots/${name}.png`;
};
const toRgba = (hex) => {
	const n = (i) => parseInt(hex.slice(i, i + 2), 16);
	return [n(1), n(3), n(5), +(n(7) / 255).toFixed(3)];
};
const sameColor = (css, hex) => {
	const m = /rgba?\(([^)]+)\)/.exec(css);
	if (!m) return false;
	const p = m[1].split(',').map((x) => parseFloat(x));
	const [r, g, b, a] = toRgba(hex);
	return Math.abs(p[0] - r) < 2 && Math.abs(p[1] - g) < 2 && Math.abs(p[2] - b) < 2 && Math.abs((p[3] ?? 1) - a) < 0.03;
};
const findRange = (spec, doc) => {
	let from = 0;
	if (spec.after) from = doc.indexOf(spec.after);
	let idx = from;
	for (let n = 0; n <= (spec.nth ?? 0); n++) {
		idx = doc.indexOf(spec.find, n === 0 ? from : idx + 1);
		if (idx < 0) throw new Error(`find text not in fixture: ${JSON.stringify(spec.find)}`);
	}
	return [idx, idx + spec.find.length];
};

async function dragSelect(from, to) {
	await c.ev(`__e2e.scrollTo(${from}, ${to})`);
	await sleep(250);
	const a = await c.ev(`__e2e.coords(${from})`);
	const b = await c.ev(`__e2e.coords(${to})`);
	if (!a || !b) throw new Error('no screen coordinates for the selection');
	const ev = (type, p, buttons) => c.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons, clickCount: 1 });
	await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + 1, y: a.y });
	await ev('mousePressed', { x: a.x + 1, y: a.y }, 1);
	for (let i = 1; i <= 14; i++) {
		await ev('mouseMoved', { x: a.x + 1 + ((b.x - a.x - 1) * i) / 14, y: a.y + ((b.y - a.y) * i) / 14 }, 1);
		await sleep(12);
	}
	await ev('mouseReleased', b, 0);
}

/** Texts of the marks of `color` that `after` has and `before` does not. */
function newMarks(before, after, color) {
	const had = paintedRanges(before, color).map((p) => p.text);
	const out = [];
	for (const p of paintedRanges(after, color)) {
		const i = had.indexOf(p.text);
		if (i >= 0) had.splice(i, 1);
		else out.push(p.text);
	}
	return out;
}

/** One block out of many: what Reading view rendered for the excerpt as a whole. */
function aggregate(blocks) {
	const counts = {};
	for (const b of blocks) for (const [k, v] of Object.entries(b.counts)) counts[k] = (counts[k] ?? 0) + v;
	return [{ text: blocks.map((b) => b.text).join(' '), counts, marks: blocks.flatMap((b) => b.marks), literalMark: blocks.reduce((n, b) => n + b.literalMark, 0), equals: blocks.reduce((n, b) => n + b.equals, 0) }];
}

function renderChecks(label, baseBlocks, afterBlocks, painted, color, already = []) {
	const f = [];
	const key = (b) => b.text;
	const wanted = painted.map((t) => c.decodeNorm(t));
	// marks the note already had are fine as they are (their rendered text, not the source)
	const allowed = [...wanted, ...already.map((t) => c.decodeNorm(t)), ...baseBlocks.flatMap((b) => b.marks.map((m) => m.text))];
	const oursIn = (b) => b.marks.filter((m) => sameColor(m.bg, color));
	let found = 0;
	for (const b of afterBlocks) {
		const base = baseBlocks.find((x) => key(x) === key(b));
		// (the note has one mark inside a link alias on purpose; it shows raw in the baseline too)
		if (b.literalMark > (base ? base.literalMark : 0)) f.push(`${label}: literal "<mark" text is visible in "${b.text.slice(0, 50)}"`);
		if (b.equals > (base ? base.equals : 0)) f.push(`${label}: literal "==" text appeared in "${b.text.slice(0, 50)}"`);
		const ours = oursIn(b);
		if (ours.length === 0) continue;
		found += ours.length;
		if (!base) {
			f.push(`${label}: the visible text of the highlighted block changed: "${b.text.slice(0, 70)}"`);
			continue;
		}
		for (const k of Object.keys(base.counts)) {
			if (b.counts[k] !== base.counts[k]) f.push(`${label}: in "${b.text.slice(0, 40)}": ${k} count ${base.counts[k]} -> ${b.counts[k]}`);
		}
		for (const m of ours) if (!allowed.includes(m.text)) f.push(`${label}: a mark shows ${JSON.stringify(m.text)} which is not painted text`);
	}
	const rendered = afterBlocks.map((b) => b.text).join(' ');
	for (const t of wanted) {
		const mine = afterBlocks.some((b) => oursIn(b).some((m) => m.text === t));
		if (!mine && rendered.includes(t)) f.push(`${label}: painted text ${JSON.stringify(t)} is not inside a mark with the right background`);
	}
	if (wanted.length > 0 && found === 0) f.push(`${label}: no mark with the right background is rendered`);
	return f;
}

// ---------------------------------------------------------------- run
// Reading view only renders while Obsidian believes it is in the foreground
await c.send('Page.bringToFront');
await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });
log('setup: writing the note');
await c.ev(`(async()=>{ await app.vault.adapter.write(${JSON.stringify(FILE)}, ${JSON.stringify(FIXTURE)}); })()`);
await sleep(400);
log('setup: page helpers');
await c.ev(PAGE_JS);
log('setup: opening');
await c.ev(`__e2e.openFile(${JSON.stringify(FILE)})`);
await sleep(1200);
const colors = await c.ev('__e2e.colors()');
c.decodeNorm = (t) => {
	const el = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
	return el.replace(/\s+/g, ' ').trim();
};


// Reading baseline: every block of the untouched note
await c.ev(`__e2e.reset(${JSON.stringify(FIXTURE)})`);
await sleep(500);
await c.ev(`__e2e.setMode('reading', ${JSON.stringify(FILE)})`);
await sleep(1500);
let readBase = await c.ev('__e2e.collectReading()');
// the very first Reading render after a reload of Obsidian can come up almost empty: try again
for (let attempt = 0; attempt < 3 && readBase.length < 30; attempt++) {
	await c.ev(`__e2e.setMode('lp', ${JSON.stringify(FILE)})`);
	await sleep(1500);
	await c.ev(`__e2e.setMode('reading', ${JSON.stringify(FILE)})`);
	await sleep(3000);
	readBase = await c.ev('__e2e.collectReading()');
}
await c.ev(`__e2e.setMode('lp', ${JSON.stringify(FILE)})`);
await sleep(1000);
if (readBase.length < 30) throw new Error(`Reading view did not render the note (only ${readBase.length} blocks); reload Obsidian (Cmd+R) and run again`);
log(`Reading baseline: ${readBase.length} blocks`);

const results = [];
let selected = cases.filter((k) => only.length === 0 || only.includes(k.id));
if (rangeArg) {
	const [a, b] = rangeArg.slice(8).split('-').map(Number);
	selected = selected.slice(a, b);
}
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);
for (const k of selected) {
	const t0 = Date.now();
	const res = { id: k.id, section: k.section, via: k.via ?? 'api', color: k.color, source: [], lp: [], reading: [], note: '', shots: [] };
	try {
		await withTimeout((async () => {
		const colorHex = colors[k.color - 1];
		await c.ev(`__e2e.reset(${JSON.stringify(FIXTURE)})`);
		await sleep(400);
		// Obsidian renumbers ordered lists on setValue, so the baseline is the editor's text, not the file.
		const baseDoc = await c.ev('__e2e.doc()');
		const [from, to] = findRange(k, baseDoc);
		await c.ev(`__e2e.away(${from}, ${to})`);
		await sleep(900);
		const scrollY = await c.ev('__e2e.getScroll()');
		const lpBase = await c.ev(`__e2e.metrics('lp')`);
		// select
		if (k.via === 'mouse') {
			await dragSelect(from, to);
			await sleep(700);
		} else {
			await c.ev(`__e2e.select(${from}, ${to})`);
			await sleep(250);
			await key('h', 'KeyH', 72, 4); // Cmd+H
			await sleep(600);
		}
		const sel = await c.ev('__e2e.sel()');
		res.note = `selected ${JSON.stringify(sel.text.length > 60 ? sel.text.slice(0, 57) + '...' : sel.text)}`;
		const popup = await c.ev('__e2e.popup()');
		if (popup) {
			await key(String(k.color), `Digit${k.color}`, 48 + k.color);
			await sleep(700);
		}
		const after = await c.ev('__e2e.doc()');
		// ---- source checks
		if (k.nothing) {
			if (after !== baseDoc) res.source.push('expected nothing to be painted, but the note changed');
			if (popup) res.source.push('the picker opened for a selection with nothing to paint');
		} else {
			if (!popup) res.source.push('the picker did not open');
			for (const v of violations(baseDoc, after, colorHex)) res.source.push(v);
			const paintedNow = newMarks(baseDoc, after, colorHex);
			if (k.painted && k.via !== 'mouse') {
				const got = paintedNow.map((t) => t.trim());
				if (JSON.stringify(got) !== JSON.stringify(k.painted)) res.source.push(`painted ${JSON.stringify(got)} but expected ${JSON.stringify(k.painted)}`);
			}
			if (paintedNow.length === 0 && after !== baseDoc) res.source.push('the note changed but nothing was painted in the chosen color');
		}
		if (res.source.length) {
			const b = baseDoc.split('\n');
			const a = after.split('\n');
			const changed = b.map((l, i) => (l !== a[i] ? `line ${i + 1}: ${JSON.stringify(l.slice(0, 70))} -> ${JSON.stringify((a[i] ?? '').slice(0, 110))}` : null)).filter(Boolean).slice(0, 4);
			res.source.push(`changed lines: ${changed.join(' | ')}`);
			res.shots.push(await shot(`${k.id}-source`));
		}
		// ---- Live Preview (caret away)
		if (!k.nothing) {
			res.ran = true;
			const painted = newMarks(baseDoc, after, colorHex);
			const already = paintedRanges(baseDoc, colorHex).map((p) => p.text);
			await c.ev(`__e2e.away(${from}, ${to})`);
			await c.ev('__e2e.leaveTable()');
			{
				// a real click on a blank line, like a user clicking away from a table cell
				const pt = await c.ev('__e2e.awayPoint()');
				if (pt) {
					await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 });
					await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount: 1 });
					await sleep(400);
				}
			}
			await c.ev(`__e2e.setScroll(${scrollY})`);
			await sleep(Number(process.env.E2E_LP_WAIT ?? 1100));
			const lp = await c.ev(`__e2e.metrics('lp')`);
			res.lp = renderChecks('Live Preview', lpBase, lp, painted, colorHex, already);
			if (res.lp.length) res.shots.push(await shot(`${k.id}-lp`));
			// ---- Reading view
			await sleep(500);
			await c.ev(`__e2e.setMode('reading', ${JSON.stringify(FILE)})`);
			await sleep(1500);
			const rd = await c.ev('__e2e.collectReading()');
			res.reading = renderChecks('Reading view', readBase, rd, painted, colorHex, already);
			if (res.reading.length) res.shots.push(await shot(`${k.id}-reading`));
			await c.ev(`__e2e.setMode('lp', ${JSON.stringify(FILE)})`);
			await sleep(700);
		}
		})(), 120000, `case ${k.id}`);
	} catch (err) {
		res.source.push(`runner error: ${err.message}`);
		try { res.shots.push(await shot(`${k.id}-error`)); } catch { /* ignore */ }
	}
	res.ms = Date.now() - t0;
	results.push(res);
	const bad = res.source.length + res.lp.length + res.reading.length;
	log(`${bad ? 'FAIL' : 'ok  '} ${k.id.padEnd(26)} ${res.via.padEnd(5)} ${(res.ms / 1000).toFixed(0)}s ${res.note}`);
	for (const m of [...res.source, ...res.lp, ...res.reading]) log(`       - ${m}`);
	// leave the window clean for the next case
	try { await key('Escape', 'Escape', 27); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- cleanup and report
await c.ev(`__e2e.reset(${JSON.stringify(FIXTURE)})`);
if (!keepNote) {
	await c.ev(`(async()=>{ const f=app.vault.getAbstractFileByPath(${JSON.stringify(FILE)}); const l=app.workspace.getLeaf(false); await l.openFile(app.vault.getFileByPath('Sample text.md') ?? app.vault.getMarkdownFiles()[0]); if(f) await app.vault.delete(f);  })()`);
}
const resultsFile = join(here, 'results.json');
if (append) {
	try {
		const prev = JSON.parse(readFileSync(resultsFile, 'utf8'));
		const ids = new Set(results.map((r) => r.id));
		results.unshift(...prev.filter((r) => !ids.has(r.id)));
	} catch { /* first chunk */ }
}
writeFileSync(resultsFile, JSON.stringify(results, null, 1));
const mark = (l) => (l.length ? 'FAIL' : 'pass');
const stage = (r, list, ran) => (list.length ? 'FAIL' : ran ? 'pass' : '-');
const rows = results.map((r) => {
	const ran = !r.note.includes('nothing') && r.source.length === 0 || r.lp.length + r.reading.length > 0 || r.ran;
	return `| ${r.id} | ${r.section} | ${r.via} | ${mark(r.source)} | ${stage(r, r.lp, r.ran)} | ${stage(r, r.reading, r.ran)} | ${[...r.source, ...r.lp, ...r.reading].join('; ').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 300)} | ${r.shots.join(' ')} |`;
});
const failed = results.filter((r) => r.source.length + r.lp.length + r.reading.length > 0);
const report = `# End-to-end report\n\nRun: ${new Date().toISOString()} against "${c.title}"\n\n**${results.length - failed.length} of ${results.length} cases pass.**\n\n| Case | Section | Selected via | Source | Live Preview | Reading view | Problems | Screenshots |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
writeFileSync(join(here, 'report.md'), report);
log(`\n${results.length - failed.length}/${results.length} pass. Report: e2e/report.md`);
c.close();
process.exit(failed.length ? 1 : 0);
