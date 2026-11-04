# Manual testing in Obsidian

The folder `test-vault/` is a ready-made Obsidian vault with sample notes and a checklist.

## 1. Build and install the plugin into the vault

```bash
npm ci
npm run test-vault
```

This builds the plugin and copies `main.js`, `manifest.json` and `styles.css` into `test-vault/.obsidian/plugins/color-highlighter/`. Run it again after every code change (and reload Obsidian: Cmd+P, "Reload app without saving").

## 2. Open the vault in Obsidian

1. Start Obsidian. In the vault switcher (bottom-left vault name, or the start screen), choose **Open folder as vault**.
2. Select the `test-vault` folder inside this repository.
3. Obsidian asks whether you trust the author of this vault. Click **Trust author and enable plugins**. The vault's `community-plugins.json` already lists Color Highlighter as enabled.
   - If you do not see that prompt, open **Settings -> Community plugins**, click **Turn on community plugins**, and switch **Color Highlighter** on.

## 3. Run the checklist

Open **Start here** and go through it. It covers highlighting, recoloring, removing, native `==highlights==`, multi-line selections, lists, tables, commands and settings. Check each item in Live Preview and in Reading view. When the picker opens by itself after a mouse selection, Backspace, Delete, Space and typing close it and work as usual in the editor; use 0 or a click to remove a highlight there. After applying, the caret lands just after the highlight and it renders at once, except at the very end of a note, where the `<mark>` source shows until you click elsewhere or press Enter. With Cmd+H, Backspace/Delete remove the highlight and Space applies the focused color.

The sample notes are meant to be changed. To get a clean copy back: `git checkout test-vault` (this restores the notes, not the plugin files).

## Palette edits rewrite notes

Editing a color in the picker or in the settings rewrites every note of the vault that uses it (see the README). The test vault is meant for that, but do not point a dev build at a real vault without a backup.

## Notes

- `test-vault/.obsidian/plugins/` is not committed; it is created by `npm run test-vault`.
- Obsidian writes its own files (workspace, settings) into `test-vault/.obsidian/`. The common ones are git-ignored.
- Unit tests (`npm test`) cover the highlight logic only. The editor integration, popup and settings tab can only be checked here.
