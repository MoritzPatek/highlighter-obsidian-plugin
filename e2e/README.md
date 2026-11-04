# End-to-end suite (real Obsidian)

Drives the plugin in a running Obsidian over the Chrome DevTools Protocol and checks, for about 70 cases taken from `test-vault/All formats.md`, that highlighting never damages Markdown.

## Run

1. Install the plugin into a test vault (`npm run test-vault`, then open `test-vault` in Obsidian) or use any throwaway vault that has the plugin enabled and the hotkey Cmd+H bound to "Color Highlighter: Pick color". **The suite writes and deletes the note `All formats.md` in that vault; never point it at a real vault.**
2. Start Obsidian with the debug port: `/Applications/Obsidian.app/Contents/MacOS/Obsidian --remote-debugging-port=9222`
3. `npm run e2e` (or `node e2e/run.mjs <case-id> ...` for a few cases, `--keep` to leave the note in the vault).

Environment: `E2E_VAULT` (part of the window title, default "Color Highlighter Test Vault"), `E2E_PORT` (default 9222). The runner only attaches to the editor page whose title contains `E2E_VAULT`.

## What each case does

1. Reset the note, scroll to the text, move the caret away.
2. Select the text through the editor API (then Cmd+H) or with a real mouse drag (auto-show).
3. Press the colour's number key in the picker.
4. Source checks (`invariants.mjs`, shared with `src/formats.test.ts`): visible text unchanged, no Markdown syntax token added or removed, properties/code/math lines byte-identical, no new highlight over a link, tag, code, math, comment, HTML, URL, prefix or marker.
5. Live Preview check with the caret away: no literal `<mark` or `==` in the rendered text, the rendered text is identical to before, constructs (tables, callouts, math, images, links, code, lists, headings, tags) are still rendered as such, the painted text sits in a `mark` with the right background.
6. The same in Reading view.
7. A screenshot of every failing stage goes to `e2e/shots/` (gitignored).

The result is written to `e2e/report.md`; the exit code is 1 when a case fails.
