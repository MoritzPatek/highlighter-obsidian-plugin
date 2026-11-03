# Color Highlighter

Highlight text in Obsidian in five colors. Select text, press **Cmd+H** (Ctrl+H on Windows and Linux), pick a color with the arrow keys, press Enter. Esc cancels.

Obsidian only has one built-in highlight color (`==text==`). This plugin adds more, and the highlights are plain HTML, so they show up in both Reading view and Live Preview.

![Color Highlighter demo](docs/demo.gif)

<!-- TODO: record a short GIF of select -> Cmd+H -> pick color and save it as docs/demo.gif -->

## What it does

- Five colors: Yellow, Green, Blue, Pink, Purple. Names, colors and opacity can be changed in the settings.
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
| Highlight with a picker | Select text, press Cmd+H (Ctrl+H), choose a color, Enter |
| Cancel | Esc |
| Change the color of a highlight | Select it (or put the cursor in it), press Cmd+H, choose another color |
| Remove a highlight | Cmd+H on the highlight, choose "Remove highlight", or run the command "Remove highlight" |
| Highlight right away in one color | Bind a hotkey to a command such as "Highlight: Yellow" |

All commands are in the command palette (Cmd+P) under "Color Highlighter".

### Behavior details

- A highlight is stored as `<mark style="background: #FFF3A3A6;">text</mark>`. The color is part of the text, so it still shows if the plugin is turned off.
- With nothing selected, an empty highlight is inserted and the cursor is placed inside it, so you can type highlighted text. If the cursor is inside an existing highlight, that highlight is recolored.
- Selecting part of a highlight recolors or removes the whole highlight.
- Selections that span several lines are highlighted line by line (a highlight cannot cross a paragraph break and still render). Blank lines are skipped.
- List bullets, numbers, checkboxes, quote markers and heading markers stay outside the highlight, so lists, tasks and headings keep working. In tables, each cell is highlighted on its own.
- Only the first cursor is used if you have several.
- Code blocks are not treated specially: don't highlight inside them.

## Hotkey: Cmd+H conflicts

The plugin suggests **Cmd+H** (Ctrl+H on Windows and Linux) because it is easy to reach. That key may already be used:

- **Obsidian or another plugin may use it.** If Obsidian shows a hotkey conflict, open **Settings -> Hotkeys**, search for "Color Highlighter", and click the pencil/plus icon next to "Highlight with color..." to set your own key. You can also clear a conflicting command there.
- **macOS: Cmd+H normally hides the app.** When Obsidian has a command bound to Cmd+H, Obsidian handles the key inside the app and the system "Hide" shortcut does not trigger while you work in a note. If you want "Hide" back, bind the plugin to a different key.

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

1. Update `version` in `package.json`, then run `npm version <x.y.z>` (this updates `manifest.json` and `versions.json`; tags have no `v` prefix).
2. `git push origin main --follow-tags`.
3. The "Release" workflow builds, tests and creates a GitHub release with `main.js`, `manifest.json`, `styles.css` and a zip for manual install.

## License

MIT
