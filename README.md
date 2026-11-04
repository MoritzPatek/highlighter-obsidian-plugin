# Color Highlighter

Highlight text in Obsidian in five colors. Select text, press your hotkey for "Pick color" (we suggest **Cmd+H**, see [Hotkey](#hotkey)), pick a color with the arrow keys or the number keys 1-5, press Enter. Esc cancels.

Obsidian only has one built-in highlight color (`==text==`). This plugin adds more, and the highlights are plain HTML, so they show up in both Reading view and Live Preview.

## What it does

- Five colors: Yellow, Green, Blue, Pink, Purple. Names and colors can be changed in the settings; the opacity is fixed at 33% so text stays readable.
- Works like a highlighter pen: a new color paints only the selected text. An existing highlight keeps its color outside the selection (it is split in two if you select the middle), and highlights never stack. Click a highlight, or put the cursor in it, to recolor the whole thing.
- Native `==highlights==` keep working: the part you select becomes a colored highlight, the rest stays a native one.
- Remove a highlight and keep the text.
- Remembers the last color you used.
- Works on desktop and mobile.

## Install

### Option 1: Community plugins (coming soon)

The plugin has not been published to the community list yet. When it is: open **Settings -> Community plugins -> Browse**, search for "Color Highlighter", click **Install**, then **Enable**.

### Option 2: BRAT (easiest right now)

BRAT is a free plugin that installs plugins straight from GitHub.

1. In Obsidian, open **Settings -> Community plugins**. If you see "Restricted mode", click **Turn on community plugins**.
2. Click **Browse**, search for **BRAT** (Obsidian42 - BRAT), click **Install**, then **Enable**.
3. Open **Settings -> BRAT** (at the bottom of the left list) and click **Add beta plugin**.
4. Paste `MoritzPatek/highlighter-obsidian-plugin` and click **Add plugin**.
5. Go to **Settings -> Community plugins** and switch **Color Highlighter** on.

BRAT also updates the plugin for you.

### Option 3: Manual install from the zip

1. Open the [latest release](https://github.com/MoritzPatek/highlighter-obsidian-plugin/releases/latest) and download `color-highlighter-<version>.zip` (under "Assets").
2. Unzip it. You get a folder called `color-highlighter`.
3. Find your vault's plugin folder:
   - In Obsidian, open **Settings -> Community plugins** and click the folder icon next to "Installed plugins". That opens the plugins folder.
   - Or open your vault folder and go to `.obsidian/plugins`. The `.obsidian` folder is hidden: on macOS press Cmd+Shift+. in Finder to show hidden files, on Windows enable "Hidden items" in File Explorer.
4. Move the `color-highlighter` folder into that `plugins` folder.
5. Restart Obsidian (or click the reload icon in **Settings -> Community plugins**).
6. In **Settings -> Community plugins**, switch **Color Highlighter** on.

You can also download `main.js`, `manifest.json` and `styles.css` separately from the release and put them together in a folder named `color-highlighter`.

## Usage

| Action | How |
| --- | --- |
| Highlight with a picker | Select text, run "Pick color" (your hotkey, e.g. Cmd+H), choose a color, Enter. Keys 1-5 pick instantly |
| Pick right after selecting | Select text with the mouse: the picker opens by itself (desktop only; turn it off in the settings). Any other key (including Backspace and Delete) closes it and works as usual; remove a highlight there with 0 or a click |
| Cancel | Esc |
| Change the color of a highlight | Select it (or put the cursor in it), run "Pick color", choose another color |
| Remove a highlight | "Pick color" on the highlight, then press 0 or choose "Remove highlight", or run the command "Remove highlight" |
| Highlight right away in one color | Bind a hotkey to a command such as "Highlight: Yellow" |

All commands are in the command palette (Cmd+P) under "Color Highlighter".

### Behavior details

- A highlight is stored as `<mark style="background: #FFD60A55;">text</mark>`. The color is part of the text, so it still shows if the plugin is turned off.
- With nothing selected, you get the notice "Select some text to highlight." If the cursor is inside an existing highlight, that highlight is the target.
- **What gets painted.** A highlight only ever sits on plain text, because Obsidian's Live Preview shows the content of an inline `<mark>` literally. So a selection is cut into its plain-text runs and each run is painted on its own; syntax is left alone and stays exactly as it was: list, quote, heading, task, callout and footnote prefixes, table pipes and separator rows, rules, properties (frontmatter), code (inline, fenced and 4-space indented blocks), math, comments, escapes, wikilinks and embeds, markdown links and images, footnote references, URLs, tags, inline HTML and block ids. Inside `**bold**`, `*italic*`, `~~strike~~` and in headings, table cells and callouts the highlight goes *inside* the markers (`**<mark>bold</mark>**`). Known Live Preview limit: the painted word loses its bold/italic/strikethrough styling there (Reading view is perfect). A selection with no plain text at all (only code, a link, ...) shows "Nothing to highlight here" and changes nothing.
- Native `==` only counts as a highlight when there is no space after the opening or before the closing `==` (so `a == b` is left alone).
- The picker starts on the color of the highlight you clicked (when it is one of your five colors), otherwise on the last color you used.
- Colors are always applied at 33% opacity so text stays readable. You can change each color and name in the plugin settings.
- "Remove highlight" is an eraser: with part of a highlight selected it only unwraps that part. With just the cursor in it, or after clicking it, the whole highlight goes. Touching highlights of the same color are merged.
- Selections that span several lines are highlighted line by line (a highlight cannot cross a paragraph break and still render). Blank lines are skipped.
- List bullets, numbers, checkboxes, quote markers and heading markers stay outside the highlight, so lists, tasks and headings keep working. In tables, each cell is highlighted on its own.
- Only the first cursor is used if you have several.
- After a highlight is applied the caret sits just after it, so it renders at once. When there is no room after it (the highlight ends the note, or a table), one empty line is added at the end of the note for the caret, in the same edit, so one undo removes both.
- Clicking an already colored highlight opens the picker (with auto-show on), so you can switch its color or remove it. Before you choose, a selection that cuts through bold, italic or similar formatting grows to include the whole run, so Markdown never breaks.
- **Edit colors in the picker:** click the pencil in the picker (or press `E` when you opened it with the hotkey) to change names and colors without leaving the text. Esc closes the editor first, then the picker. Two colors can never be identical (the shade is nudged), so highlights of different colors never merge.
- **Changing a palette color rewrites your notes.** When you finish editing (Done, Esc, closing the picker, Reset to defaults, or releasing a color in Settings), **every note in the vault** that contains highlights of the changed color is rewritten to the new color, and you get a notice such as "Updated 12 highlights in 4 notes." Only `<mark style="background: #…">` highlights written by this plugin are rewritten. **Skipped:** `==native==` highlights, marks of other colors or other styles, anything inside inline code, and anything inside a fenced code block (``` or ~~~, at any indent, also inside list items). Indented code blocks (4 spaces, no fence) are not detected, so marks there are rewritten. Notes that are not Markdown are not touched. Make a backup (or use Obsidian's File recovery or Sync history) if you want to be able to undo it.
- **Interrupted recolor:** the plugin keeps a journal of an unfinished recolor in its `data.json`. If Obsidian quits half way, or a note could not be written, the rest is finished the next time Obsidian starts (or you edit a color again), and a note that is already done is never rewritten twice. A note that still cannot be written after 3 attempts is given up (you get one notice naming it) so it never blocks later color changes; new color edits made while a recolor is pending are folded into it. Needs Obsidian 1.8.7 or newer. **Limit with sync:** the journal only resumes on the device that started it (a per-device id is kept in this device's local storage, not in `data.json`). On another device the journal is ignored and the palette is simply adopted, so highlights there keep whatever color the synced notes have.
- When the selection is inside a highlight with one of your five colors, that color is focused first and carries a check badge; the caption reads "Green · current".
- Code, math and links are left alone: they are never painted (see above), and Remove does not touch anything inside code.

## Hotkey

The plugin does not set a default hotkey (Obsidian's guidelines discourage it, and Cmd+H is already used by Obsidian's built-in "Toggle highlight"). To use **Cmd+H** (Ctrl+H on Windows and Linux):

1. Open **Settings -> Hotkeys**, search for "Toggle highlight" and remove its Cmd+H binding (click the x next to it).
2. Search for "Color Highlighter", click the + next to "Pick color" and press Cmd+H.

Any other key works the same way. On macOS, Cmd+H normally hides the app; while Obsidian has a command bound to it, Obsidian handles the key inside the app and the system "Hide" shortcut does not trigger in a note.

## Development

```bash
npm ci
npm run dev        # rebuild on change
npm run build      # type-check and bundle main.js
npm test           # unit tests (vitest)
npm run test-vault # build and install into test-vault/ for manual testing
```

See [TESTING.md](TESTING.md) for the manual test vault.

The highlight logic is in `src/highlight.ts` (pure functions, no Obsidian imports). The color popup is behind `openColorPicker()` in `src/colorPicker.ts` and can be replaced without touching the rest.

### Releasing

1. Run `npm version <x.y.z>`. It bumps `package.json`, runs `version-bump.mjs` (updates `manifest.json` and `versions.json`), then commits and tags. `.npmrc` sets an empty tag prefix, so the tag is `x.y.z` without `v`.
2. `git push --follow-tags`.
3. The "Release" workflow builds, tests and creates a GitHub release with `main.js`, `manifest.json`, `styles.css` and a zip for manual install.

## License

MIT
