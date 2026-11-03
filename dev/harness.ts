// Dev-only harness (not shipped): mounts the real popover DOM and a mock of the
// settings rows on a page with Obsidian-like CSS variables.
// Build: node dev/build-harness.mjs   Serve: python3 -m http.server <port>   Open /dev/popover-harness.html
import { ColorPopover } from '../src/popover';
import { DEFAULT_COLORS } from '../src/settings';

const q = new URLSearchParams(location.search);
document.body.className = q.get('theme') === 'dark' ? 'theme-dark' : 'theme-light';
const view = q.get('view') ?? 'popover';
const remove = q.get('remove') === '1';
const active = Number(q.get('active') ?? '0');

if (view === 'autoshow') {
	// Simulates the mouse-select flow: select text, popover opens after ~150ms.
	document.getElementById('editor')!.hidden = false;
	const target = document.getElementById('sel')!;
	const sel = getSelection()!;
	const range = document.createRange();
	range.selectNodeContents(target);
	sel.removeAllRanges();
	sel.addRange(range);
	window.setTimeout(() => {
		const r = range.getBoundingClientRect();
		const popover = new ColorPopover({
			colors: DEFAULT_COLORS,
			lastUsedIndex: 0,
			showRemove: false,
			onChoose: (c) => console.log('chose', JSON.stringify(c)),
		});
		popover.mount(
			{ left: r.left, top: r.top, bottom: r.bottom },
			document.getElementById('editor')!.getBoundingClientRect(),
		);
	}, 150);
} else if (view === 'popover') {
	document.getElementById('editor')!.hidden = false;
	const target = document.getElementById(remove ? 'marked' : 'sel')!;
	const range = document.createRange();
	range.selectNodeContents(target);
	const r = range.getBoundingClientRect();
	const popover = new ColorPopover({
		colors: DEFAULT_COLORS,
		lastUsedIndex: 0,
		showRemove: remove,
		onChoose: (c) => console.log('chose', JSON.stringify(c)),
	});
	const ed = document.getElementById('editor')!.getBoundingClientRect();
	popover.mount({ left: r.left, top: r.top, bottom: r.bottom }, ed);
	for (let i = 0; i < active; i++) popover.move('next');
	if (q.get('last') === '1') popover.move('last');
	(window as unknown as { popover: ColorPopover }).popover = popover;
	document.addEventListener('keydown', (e) => {
		const map: Record<string, () => void> = {
			ArrowRight: () => popover.move('next'),
			ArrowLeft: () => popover.move('prev'),
			Home: () => popover.move('first'),
			End: () => popover.move('last'),
			Enter: () => popover.chooseActive(),
		};
		map[e.key]?.();
	});
} else {
	const s = document.getElementById('settings')!;
	s.hidden = false;
	const rows = document.getElementById('rows')!;
	DEFAULT_COLORS.forEach((c, i) => {
		const row = document.createElement('div');
		row.className = 'setting-item color-highlighter-setting';
		row.innerHTML = `<div class="setting-item-info"><div class="setting-item-name">Color ${i + 1}</div></div>
		<div class="setting-item-control"><span class="color-highlighter-chip" aria-hidden="true" style="background-color:${c.color}">${i + 1}</span>
		<input type="text" class="color-highlighter-name" value="${c.name}" maxlength="20" placeholder="Color ${i + 1}">
		<input type="color" value="${c.color.slice(0, 7)}"></div>`;
		rows.appendChild(row);
	});
}
