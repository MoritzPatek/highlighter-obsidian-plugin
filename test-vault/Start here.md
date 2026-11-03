# Color Highlighter test checklist

Work through this list top to bottom. Tick each box when it behaves as described. Do it once in **Live Preview** and once in **Reading view** (switch with Cmd+E, or Ctrl+E on Windows and Linux) for everything that says "check rendering".

Other notes in this vault to practice on: [[Sample text]], [[Lists and table]].

## 0. Setup

- [ ] Settings -> Community plugins shows "Color Highlighter" and it is switched on.
- [ ] Settings -> Hotkeys, search "Color Highlighter": you see "Pick color", five "Highlight: <color>" commands and "Remove highlight".
- [ ] "Pick color" is bound to Cmd+H (Ctrl+H on Windows and Linux). This vault ships a `hotkeys.json` that also unbinds Obsidian's "Toggle highlight". In your own vault, do both yourself: Settings -> Hotkeys, remove Cmd+H from "Toggle highlight", then add Cmd+H to "Color Highlighter: Pick color" (see the README).

## 1. Basic highlight

Select the word **banana** in this line: I would like a banana today.

- [ ] Press Cmd+H. A small popover with 5 numbered color swatches appears under the selection, the selection stays visible.
- [ ] Arrow keys / Tab move the focus ring (wraps around), Enter or Space applies it, keys 1-5 apply instantly. Clicking a swatch works too.
- [ ] The word is highlighted in that color (check rendering).
- [ ] Esc, a click outside or scrolling closes the popover and changes nothing (try it on another word).
- [ ] The next time you press Cmd+H, the color you used last is pre-focused (marked with a dot).

## 2. Recolor, never nest

- [ ] Select the highlighted word again, press Cmd+H, pick another color. The color changes. Switch the note to source mode (Cmd+P, "Toggle Live Preview/Source mode"): there is only ONE `<mark ...>` around the word, not two.
- [ ] Select only part of a highlighted phrase and pick a color. The whole phrase takes the new color.
- [ ] Select from plain text into a highlighted phrase and pick a color. Everything becomes one highlight.

## 3. Remove

- [ ] Select a highlighted word and press Cmd+H. The popover shows an extra dashed X button ("Remove highlight"). Press 0 or click it. The text stays, the highlight is gone.
- [ ] Run "Remove highlight" from the command palette (Cmd+P) on a highlighted word. Same result.
- [ ] Run "Remove highlight" on plain text. Nothing happens, no error.

## 4. Native ==highlights==

Open [[Sample text]]. It contains ==native highlights==.

- [ ] Select a ==native== highlight (with or without the `==`), pick a color. It turns into a colored `<mark>`, no `==` left behind.
- [ ] Put the cursor inside a native highlight, with nothing selected, and pick a color. It converts too.
- [ ] "Remove highlight" on a native highlight removes the `==` markers.

## 5. Empty selection

- [ ] Click in an empty spot (no selection), press Cmd+H. No popover; the notice "Select some text to highlight." appears.
- [ ] Put the cursor inside an already highlighted word (no selection), press Cmd+H, pick a color. The whole highlight changes.

## 6. Multi-line selections

Open [[Sample text]] and select several lines across paragraphs.

- [ ] Choose a color. Every line is highlighted (check rendering), blank lines are not.
- [ ] In source mode there is one `<mark>` per line, none spanning a paragraph break.
- [ ] Select the whole multi-line highlight again and choose another color: all lines change.

## 7. Lists and tables

Open [[Lists and table]].

- [ ] Select two or three list items (start at the beginning of the first line) and highlight. The bullets and numbers are still shown, only the text is colored.
- [ ] Do the same on the task list: checkboxes still work.
- [ ] Select the whole table and highlight. The table still renders as a table, each cell's text is colored.
- [ ] Select one cell's text and highlight. Only that cell changes.

## 8. Direct commands and hotkeys

- [ ] Command palette: run "Highlight: Green" on selected text. It highlights immediately, no list.
- [ ] Bind a hotkey to "Highlight: Pink" in Settings -> Hotkeys and use it.

## 9. Settings

- [ ] Settings -> Color Highlighter: change a color and a name (opacity is fixed at 33%). Highlight some text: the new color is used.
- [ ] "Reset to defaults" restores the five defaults.

## 10. Portability

- [ ] Disable the plugin in Settings -> Community plugins. The existing highlights still show their color (check rendering). That is the point of the inline style.
- [ ] Re-enable it.

## 11. Dark theme

- [ ] Switch to a dark theme (Settings -> Appearance). Highlighted text is still readable.

## Found a problem?

Note what you did, what you expected and what happened, plus the Obsidian version, and open an issue.
