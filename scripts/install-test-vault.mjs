// Copies the built plugin into test-vault/.obsidian/plugins/<id>/.
// Run through `npm run test-vault`, which builds first.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const target = join(root, 'test-vault', '.obsidian', 'plugins', manifest.id);

mkdirSync(target, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	const src = join(root, file);
	if (!existsSync(src)) {
		console.error(`Missing ${file}. Run "npm run build" first.`);
		process.exit(1);
	}
	copyFileSync(src, join(target, file));
}
console.log(`Installed ${manifest.name} ${manifest.version} into ${target}`);
console.log('Open the "test-vault" folder as a vault in Obsidian (see TESTING.md).');
