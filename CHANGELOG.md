# Changelog

## 0.1.1

- Fix: highlighting at the very end of a note left the highlight showing its raw `<mark ...>` source in Live Preview, because the caret had no place clear of it. Now one empty line is added at the end of the note (in the same edit, so one undo reverts both) and the caret goes there. If the note already ends with a newline the caret just moves to that line. The same applies to painting, pen, recoloring by click and tables at the end of a note; Remove needs nothing (no mark is left).

## 0.1.0

First release: five-color highlight picker, auto-show on mouse selection, in-popup color editor with vault-wide recolor, highlighter-pen semantics, plain-text-only painting.
