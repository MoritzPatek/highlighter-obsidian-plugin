# Color Highlighter

Highlight text in Obsidian in five colors. Select text, press your hotkey for "Pick color" (we suggest **Cmd+H**, see [Hotkey](#hotkey)), pick a color with the arrow keys or the number keys 1-5, press Enter. Esc cancels.

Obsidian only has one built-in highlight color (`==text==`). This plugin adds more, and the highlights are plain HTML, so they show up in both Reading view and Live Preview.

## What it does

- Five colors: Yellow, Green, Blue, Pink, Purple. Names and colors can be changed in the settings; the opacity is fixed at 33% so text stays readable.
- Highlight a selection, or recolor an existing highlight (it never stacks highlights on top of each other).
- Converts Obsidian's native `==highlights==` when you pick a color for them.
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
- Code is never highlighted: inside inline code or code blocks you get the notice "Can't highlight inside code." Native `==` only counts as a highlight when there is no space after the opening or before the closing `==` (so `a == b` is left alone).
- A selection that cuts through bold, italic, strikethrough or code markers is widened to include the whole formatted run.
- Colors are always applied at 33% opacity so text stays readable. You can change each color and name in the plugin settings.
- Selecting part of a highlight recolors or removes the whole highlight.
- Selections that span several lines are highlighted line by line (a highlight cannot cross a paragraph break and still render). Blank lines are skipped.
- List bullets, numbers, checkboxes, quote markers and heading markers stay outside the highlight, so lists, tasks and headings keep working. In tables, each cell is highlighted on its own.
- Only the first cursor is used if you have several.
- Code is left alone: highlighting or removing inside inline code or fenced code blocks (``` or ~~~) is refused with a notice. Indented code blocks are not detected.

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
