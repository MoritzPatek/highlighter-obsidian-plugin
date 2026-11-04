// Minimal Chrome DevTools Protocol client for ONE Obsidian window.
// Needs Node 22+ (global fetch and WebSocket) and Obsidian started with --remote-debugging-port.
const PORT = process.env.E2E_PORT ?? '9222';
const VAULT = process.env.E2E_VAULT ?? 'Color Highlighter Test Vault';

/** Connect to the editor page of the vault called VAULT (never any other window). */
export async function connect() {
	const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
	const target = list.find((t) => t.type === 'page' && t.url.startsWith('app://') && t.title.includes(VAULT));
	if (!target) throw new Error(`No Obsidian window with "${VAULT}" in its title on port ${PORT}`);
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.onopen = resolve;
		ws.onerror = reject;
	});
	let id = 0;
	const pending = new Map();
	const logs = [];
	ws.onmessage = (m) => {
		const d = JSON.parse(m.data);
		if (d.id && pending.has(d.id)) {
			const { resolve, reject } = pending.get(d.id);
			pending.delete(d.id);
			d.error ? reject(new Error(JSON.stringify(d.error))) : resolve(d.result);
		} else if (d.method === 'Runtime.consoleAPICalled') {
			logs.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
		}
	};
	const send = (method, params = {}) =>
		new Promise((resolve, reject) => {
			const i = ++id;
			const timer = setTimeout(() => {
				pending.delete(i);
				reject(new Error(`CDP call timed out: ${method}`));
			}, 120000);
			pending.set(i, {
				resolve: (v) => {
					clearTimeout(timer);
					resolve(v);
				},
				reject: (e) => {
					clearTimeout(timer);
					reject(e);
				},
			});
			ws.send(JSON.stringify({ id: i, method, params }));
		});
	await send('Runtime.enable');
	/** Evaluate an expression in the page and return its JSON value. */
	const ev = async (expression) => {
		const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
		if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
		return r.result.value;
	};
	return { send, ev, logs, title: target.title, close: () => ws.close() };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
