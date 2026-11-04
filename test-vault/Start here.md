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

## 1b. Picker on mouse selection

- [ ] Select a few words by dragging with the mouse (or double-click a word). After a moment the same popover appears under the selection, without pressing Cmd+H.
- [ ] While it is open, press Cmd+C: the popover closes and the text is copied. Typing, Space, Backspace/Delete (the selected text is deleted) and Shift+arrows also close it and work as usual.
- [ ] Select with Shift+arrows or Cmd+A: no popover appears (Cmd+H still opens it).
- [ ] Click an already colored highlight: the picker opens, with the dashed X. Pick another color: the highlight changes. A click on other inline HTML (for example a `<kbd>`) does not open it.
- [ ] After choosing a color the caret sits just after the highlight and the highlight renders at once (no raw `<mark ...>` text), also when an emoji or accented letter follows it. At the very end of the note (also when only a final `.` follows) one empty line is added for the caret, so it renders at once; a single Cmd+Z removes the highlight and that line together. Try it on the last sentence of a note with and without a trailing newline, and when recoloring the last highlight.
- [ ] Drag across part of a `**bold**` word: before you choose, the selection grows to cover the whole bold run. Dragging over part of a highlight does NOT grow the selection (pen: only what you select is painted).
- [ ] Dragging a new selection moves the popover to the new place. Clicking elsewhere closes it.
- [ ] Settings -> Color Highlighter -> "Show picker when selecting text" off: selecting with the mouse no longer opens it. Cmd+H still does.

- [ ] Select text that is only `inline code` or inside a fenced code block and press Cmd+H: the notice "Nothing to highlight here" appears and nothing changes. A selection that contains code and normal words paints only the words.
- [ ] In a line like `if (a == b && c == d)`, select `b` and highlight: both `==` stay.
- [ ] In `**bold** text`, select from inside the bold word into "text" and highlight: the `**` markers stay outside the highlights (the word and the text are painted separately); the whole note is covered by the automatic suites in `All formats.md` (see TESTING.md).

## 2. Pen: paint, split, recolor, never nest

- [ ] Click the highlighted word, pick another color in the picker (or press Cmd+H after clicking it). The color changes. Switch the note to source mode (Cmd+P, "Toggle Live Preview/Source mode"): there is only ONE `<mark ...>` around the word, not two.
- [ ] Drag over the middle of a highlighted phrase and pick another color. Only the selected part changes; the pieces on both sides keep the old color (source mode: three `<mark>`s, none nested). Picking the phrase's own color changes nothing visible and leaves one `<mark>`.
- [ ] Click a colored highlight: the picker opens with that color already focused (if it is one of the five). Pick another: the whole highlight changes.
- [ ] Select from plain text into a highlighted phrase and pick a color. Everything becomes one highlight.

## 3. Remove

- [ ] Click a highlighted word (or put the cursor in it and press Cmd+H). The popover shows an extra dashed X button ("Remove highlight"). Press 0 or click it. The text stays, the highlight is gone.
- [ ] Run "Remove highlight" from the command palette (Cmd+P) on a highlighted word. Same result.
- [ ] Run "Remove highlight" on plain text. Nothing happens, no error.

## 4. Native ==highlights==

Open [[Sample text]]. It contains ==native highlights==.

- [ ] Select a whole ==native== highlight (with the `==` or just its words), pick a color. It turns into a colored `<mark>`, no `==` left behind. Select only the middle words: those become a colored `<mark>`, the rest stays `==native==` (spaces never sit next to the `==`).
- [ ] Put the cursor inside a native highlight, with nothing selected, and pick a color. It converts too.
- [ ] "Remove highlight" with the cursor in a native highlight removes its `==` markers. With part of it selected, only that part is unwrapped (eraser).

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

## 8b. Edit colors in the picker

- [ ] Select text, press Cmd+H, click the pencil (or press E). The five colors appear as rows (color, number chip, name), the focus is in the first name field and the selection stays visible.
- [ ] Type a name: nothing is applied. Esc collapses the editor (the picker stays), a second Esc closes the picker.
- [ ] Change a color (click its round swatch). The swatches update live. Pick a color that another row already uses: the shade is adjusted and a hint appears.
- [ ] **Changing a color rewrites every note in the vault that uses it** (only our `<mark style="background: #…">`; not `==native==`, not code spans or fenced code, also not fences inside list items). Try it on a throwaway vault first.
- [ ] First highlight a few words in Yellow in two different notes. Then change Yellow to another color and press Done: both notes now show the new color, a notice says how many highlights in how many notes were updated, `==native==` highlights are unchanged, and a mark inside `inline code` is unchanged.
- [ ] "Reset to defaults" in the editor restores names and colors and recolors the highlights back.
- [ ] In an auto-shown picker (mouse selection) the pencil works too; typing in a name field does not close it.

## 9. Settings

- [ ] Settings -> Color Highlighter: change a color (drag in the picker, nothing changes in the notes until you let go; then existing highlights of that color are recolored) and a name (opacity is fixed at 33%). Highlight some text: the new color is used.
- [ ] "Reset to defaults" restores the five defaults.

## 10. Portability

- [ ] Disable the plugin in Settings -> Community plugins. The existing highlights still show their color (check rendering). That is the point of the inline style.
- [ ] Re-enable it.

## 11. Dark theme

- [ ] Switch to a dark theme (Settings -> Appearance). Highlighted text is still readable.

## Found a problem?

Note what you did, what you expected and what happened, plus the Obsidian version, and open an issue.
