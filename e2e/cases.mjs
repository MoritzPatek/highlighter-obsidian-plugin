// Curated cases from test-vault/All formats.md.
//   find: the exact text to select (first occurrence, or the nth)
//   via:  'api' (editor selection API, then Cmd+H) or 'mouse' (a real drag, which auto-shows the picker)
//   color: 1..5 (the picker's number key)
//   painted: optional, the exact texts that must end up painted (in order). Omit for "whatever the plugin decides".
//   nothing: true when the plugin must refuse (no plain text in the selection)
//   trimEnd: run on the note without its trailing newline (the caret cannot go below the highlight)
//   prepare: (doc) => doc, a different note to run on (e.g. one that ends with a mark)
//   undoCheck: true: one Cmd+Z must restore the note exactly (and Cmd+Shift+Z redo it)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const vaultNote = (name) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'test-vault', name), 'utf8');
const SAMPLE = vaultNote('Sample text.md');
const LISTS = vaultNote('Lists and table.md');
// the owner's large selection: from just inside the native highlight down to the end of the next-but-one heading
const BIG_FROM = SAMPLE.indexOf('==a native highlight==') + 4;
const BIG_TO = SAMPLE.indexOf('## Multi-line paragraphs') + '## Multi-line paragraphs'.length;

export const cases = [
	// --- headings
	{ id: 'h1-word', section: 'Headings', find: 'Heading level one', color: 1 },
	{ id: 'h3-text', section: 'Headings', find: 'Heading level three', color: 2 },
	{ id: 'h-mixed-whole', section: 'Headings', find: 'A heading with **bold**, a [[Sample text|link]] and a #heading-tag', color: 3, painted: ['A heading with', 'bold', ', a', 'and a'] },
	{ id: 'h-mixed-partial', section: 'Headings', find: 'ing with **bo', color: 4 },
	// --- inline formatting
	{ id: 'bold-whole', section: 'Inline formatting', find: '**bold words**', color: 1, painted: ['bold words'] },
	{ id: 'bold-partial', section: 'Inline formatting', find: 'ld wo', color: 2, painted: ['ld wo'] },
	{ id: 'bold-across', section: 'Inline formatting', find: 'bold words**, *italic', color: 3 },
	{ id: 'italic', section: 'Inline formatting', find: '*italic words*', color: 4, painted: ['italic words'] },
	{ id: 'bold-italic', section: 'Inline formatting', find: '***bold italic words***', color: 5, painted: ['bold italic words'] },
	{ id: 'underscore-bold', section: 'Inline formatting', find: '__underscore bold__', color: 1, painted: ['underscore bold'] },
	{ id: 'underscore-italic', section: 'Inline formatting', find: '_underscore italic_', color: 2, painted: ['underscore italic'] },
	{ id: 'strike', section: 'Inline formatting', find: '~~struck through text~~', color: 3, painted: ['struck through text'] },
	{ id: 'nested-bold-italic', section: 'Inline formatting', find: '**bold phrase with *nested italic* inside**', color: 4, painted: ['bold phrase with', 'nested italic', 'inside'] },
	{ id: 'link-in-bold', section: 'Inline formatting', find: 'A [link inside **bold text**](https://example.com/bold) and **bold with a [[Start here|wiki link]] inside** end', color: 5 },
	{ id: 'escapes', section: 'Inline formatting', find: 'Escaped characters: 2 \\* 3 = 6, a snake\\_case\\_name', color: 1 },
	{ id: 'loose-markers', section: 'Inline formatting', find: 'Loose asterisks like 5 * 4 and snake_case_name and a_b_c stay', color: 2 },
	// --- code
	{ id: 'inline-code-across', section: 'Code', find: 'Inline code like `const x = 1` sits in a sentence', color: 3, painted: ['Inline code like', 'sits in a sentence'] },
	{ id: 'inline-code-only', section: 'Code', find: '`const x = 1`', color: 4, nothing: true },
	{ id: 'inline-code-partial', section: 'Code', find: 'x = 1` sits in a sen', color: 5, painted: ['sits in a sen'] },
	{ id: 'fence-inside', section: 'Code', find: '// **not bold** and ==not highlighted==', color: 1, nothing: true },
	{ id: 'fence-across-boundary', section: 'Code', find: 'Inline code like `const x = 1` sits in a sentence, and `` code with a ` backtick `` too.\n\n```js\nfunction add(a, b) {', color: 2 },
	{ id: 'tilde-fence', section: 'Code', find: 'return f"hello {name}"  # [link](http://x.y)', color: 3, nothing: true },
	{ id: 'list-fence', section: 'Code', find: 'echo "**still code**"\n  ls -la', color: 4, nothing: true },
	{ id: 'list-fence-across', section: 'Code', find: 'A list item with a nested fence:\n\n  ```bash\n  echo "**still code**"', color: 5 },
	// --- links and embeds
	{ id: 'wikilink-only', section: 'Links', find: '[[Sample text]]', color: 1, nothing: true },
	{ id: 'links-sentence', section: 'Links', find: 'A plain wikilink [[Sample text]], an alias [[Sample text|the sample note]], a heading link', color: 2, painted: ['A plain wikilink', ', an alias', ', a heading link'] },
	{ id: 'embed', section: 'Links', find: 'and an embed ![[Lists and table]] sit here', color: 3, painted: ['and an embed', 'sit here'] },
	{ id: 'md-link', section: 'Links', find: 'A markdown link [Obsidian help](https://help.obsidian.md/Home), a bare URL', color: 4, painted: ['A markdown link', ', a bare URL'] },
	{ id: 'bare-url-autolink', section: 'Links', find: 'https://obsidian.md/download and an autolink <https://example.com/auto> follow', color: 5, painted: ['and an autolink', 'follow'] },
	{ id: 'image', section: 'Links', find: 'then an image ![alt text](https://example.com/pic.png "title").', color: 1 },
	{ id: 'ref-footnote', section: 'Links', find: 'A reference-style [link text][ref] and a footnote reference[^1] and another[^note] finish', color: 2 },
	{ id: 'footnote-def', section: 'Links', find: 'The first footnote definition, with some **bold** text in it.', color: 3, nothing: true },
	// --- tags and block ids
	{ id: 'tags', section: 'Tags', find: 'A paragraph with a #tag, a #nested/tag and a #tag-with-dash in the middle', color: 4 },
	{ id: 'block-id', section: 'Tags', find: 'A paragraph that can be linked to. ^block-id', color: 5, painted: ['A paragraph that can be linked to.'] },
	// --- math
	{ id: 'inline-math', section: 'Math', find: 'Inline math $x^2 + y^2 = z^2$ sits in a sentence', color: 1, painted: ['Inline math', 'sits in a sentence'] },
	{ id: 'prices', section: 'Math', find: 'prices like $5 and $10 are not math', color: 2, painted: ['prices like $5 and $10 are not math'] },
	{ id: 'block-math-inside', section: 'Math', find: '\\int_0^1 x^2 \\, dx', color: 3, nothing: true },
	{ id: 'block-math-across', section: 'Math', find: 'are not math.\n\n$$\n\\int_0^1', color: 4 },
	// --- comments and HTML
	{ id: 'comment', section: 'Comments and HTML', find: 'Visible text %%with a hidden comment%% continues here.', color: 5, painted: ['Visible text', 'continues here.'] },
	{ id: 'html-inline', section: 'Comments and HTML', find: 'a <kbd>Ctrl</kbd>+<kbd>C</kbd> key, a <span style="color: red">red span</span> and a line<br>break', color: 1 },
	{ id: 'special-chars', section: 'Comments and HTML', find: '3 < 5 && 7 > 2, an & ampersand, &amp; an entity', color: 2, painted: ['3', '5 && 7', '2, an & ampersand,', 'an entity'] },
	// --- lists
	{ id: 'dash-items', section: 'Lists', find: 'Dash item one\n- Dash item two with **bold**', color: 3 },
	{ id: 'nested-list', section: 'Lists', find: 'Nested dash item\n    - Deeper nested item', color: 4 },
	{ id: 'star-plus', section: 'Lists', find: 'Star item two\n+ Plus item one', color: 5 },
	{ id: 'ordered', section: 'Lists', find: 'Second ordered item\n   3. Nested ordered item', color: 1 },
	{ id: 'ordered-3', section: 'Lists', find: 'Starts at three', color: 2 },
	{ id: 'tasks', section: 'Lists', find: 'An open task\n- [x] A finished task with *italic*\n- [ ] A task with a [[Sample text|link]]', color: 3 },
	// --- quotes and callouts
	{ id: 'quote', section: 'Quotes and callouts', find: 'A simple blockquote with **bold** and a [link](https://example.com).\n> A second line', color: 4 },
	{ id: 'quote-nested', section: 'Quotes and callouts', find: 'An outer quote\n> > A nested quote\n> > > A third level', color: 5 },
	{ id: 'callout-title-body', section: 'Quotes and callouts', find: 'A note callout\n> The body of the note callout, with **bold** and `code`.', color: 1 },
	{ id: 'callout-fold', section: 'Quotes and callouts', find: 'A foldable tip\n> Hidden until opened', color: 2 },
	{ id: 'callout-list', section: 'Quotes and callouts', find: 'First warning item\n> - Second warning item', color: 3 },
	// --- tables
	{ id: 'table-cell', section: 'Tables', find: 'plain', color: 4, nth: 1 },
	{ id: 'table-across-cells', section: 'Tables', find: '| plain | **bold** | *italic* |', color: 5 },
	{ id: 'table-header', section: 'Tables', find: '| Left | Center | Right |', color: 1 },
	{ id: 'table-escaped-pipe', section: 'Tables', find: '| a \\| pipe | `code` |', color: 2 },
	{ id: 'table-rows', section: 'Tables', find: '| a \\| pipe | `code` | [[Sample text\\|link]] |\n| 12 | 345 | 6789 |', color: 3 },
	{ id: 'table-whole', section: 'Tables', find: '| Left | Center | Right |\n|:-----|:------:|------:|\n| plain | **bold** | *italic* |', color: 4 },
	// --- rules
	{ id: 'rule-only', section: 'Rules', find: '---\n\nBetween rules.', color: 5 },
	{ id: 'across-rule', section: 'Rules', find: 'Above the rule.\n\n---\n\nBetween rules.', color: 1 },
	// --- line structure
	{ id: 'hard-break', section: 'Line structure', find: 'for a hard break  \ncontinues on the next line', color: 2 },
	{ id: 'consecutive-lines', section: 'Line structure', find: 'Consecutive lines of one paragraph\nare stored as separate lines\nand joined', color: 3 },
	{ id: 'long-line-middle', section: 'Line structure', find: 'consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud', color: 4 },
	// --- text and characters
	{ id: 'emoji', section: 'Characters', find: 'party, 👍🏽 thumbs, 👨‍👩‍👧‍👦 family, 🇩🇪 flag and ❤️ heart', color: 5 },
	{ id: 'accents', section: 'Characters', find: 'café, naïve, Zürich', color: 1 },
	{ id: 'cjk', section: 'Characters', find: '日本語のテキストと漢字', color: 2 },
	{ id: 'rtl', section: 'Characters', find: 'مرحبا بالعالم, שלום עולם', color: 3 },
	{ id: 'math-symbols', section: 'Characters', find: 'x ≤ y ≥ z ≠ w, α + β = γ', color: 4 },
	// --- existing highlights (pen, eraser)
	{ id: 'over-native', section: 'Existing highlights', find: 'a ==native highlight== in a sentence', color: 5 },
	{ id: 'pen-in-native', section: 'Existing highlights', find: 'tive highl', color: 1 },
	{ id: 'pen-in-mark', section: 'Existing highlights', find: 'ellow ma', color: 4, nth: 0, after: 'Ours:' },
	{ id: 'adjacent', section: 'Existing highlights', find: 'irst</mark><mark style="background: #3DDC8455;">sec', color: 2 },
	{ id: 'mark-with-bold', section: 'Existing highlights', find: 'highlight with **bold** inside</mark> and **bold with', color: 3 },
	// --- multi-line across blocks
	{ id: 'multi-heading-paragraph', section: 'Multi-line', find: 'Format zoo\n\nThis note holds one realistic paragraph', color: 4 },
	{ id: 'multi-quote-list', section: 'Multi-line', find: 'A second line in the same quote.\n\n> An outer quote\n> > A nested', color: 5 },
	{ id: 'multi-table-paragraph', section: 'Multi-line', find: '| 12 | 345 | 6789 |\n\n## Horizontal rules', color: 1 },
	{ id: 'multi-callout-paragraph', section: 'Multi-line', find: 'First warning item\n> - Second warning item\n\n## Tables', color: 2 },
	// --- real mouse drags
	{ id: 'mouse-plain', via: 'mouse', section: 'Mouse', find: 'Consecutive lines of one paragraph', color: 3 },
	{ id: 'mouse-bold', via: 'mouse', section: 'Mouse', find: 'ld words**, *ita', color: 4 },
	{ id: 'mouse-heading', via: 'mouse', section: 'Mouse', find: 'Heading level four', color: 5 },
	{ id: 'mouse-list', via: 'mouse', section: 'Mouse', find: 'Dash item one', color: 1 },
	{ id: 'mouse-quote', via: 'mouse', section: 'Mouse', find: 'A second line in the same quote.', color: 2 },
	{ id: 'mouse-callout-body', via: 'mouse', section: 'Mouse', find: 'The body of the note callout', color: 3 },
	{ id: 'mouse-emoji', via: 'mouse', section: 'Mouse', find: 'Emoji: 🎉 party', color: 4 },
	{ id: 'mouse-long-line', via: 'mouse', section: 'Mouse', find: 'because it keeps going and going', color: 5 },
	{ id: 'mouse-native', via: 'mouse', section: 'Mouse', find: 'sentence and another', color: 1, after: 'Native:' },
	{ id: 'mouse-two-lines', via: 'mouse', section: 'Mouse', find: 'are stored as separate lines', color: 2 },
	// --- end of the note (the caret has to go on a new empty line, in the same undo step)
	{ id: 'eof-sentence-newline', section: 'End of note', find: 'The last paragraph of the note ends here, with a closing sentence.', color: 1, undoCheck: true },
	{ id: 'eof-sentence-no-newline', section: 'End of note', find: 'The last paragraph of the note ends here, with a closing sentence.', color: 2, trimEnd: true, undoCheck: true },
	{ id: 'eof-last-word', section: 'End of note', find: 'closing sentence', color: 3, trimEnd: true, undoCheck: true },
	{ id: 'eof-last-word-newline', section: 'End of note', find: 'closing sentence', color: 4, undoCheck: true },
	{
		id: 'eof-recolor-last-mark',
		section: 'End of note',
		prepare: (d) => d.replace('The last paragraph of the note ends here, with a closing sentence.', 'The note ends with <mark style="background: #FFD60A55;">a yellow mark</mark>'),
		after: 'The note ends with',
		find: '<mark style="background: #FFD60A55;">a yellow mark</mark>',
		color: 5,
		trimEnd: true,
		undoCheck: true,
	},
	{
		id: 'eof-pen-last-mark',
		section: 'End of note',
		prepare: (d) => d.replace('The last paragraph of the note ends here, with a closing sentence.', 'The note ends with <mark style="background: #FFD60A55;">a yellow mark</mark>.'),
		after: 'The note ends with',
		find: 'yellow m',
		color: 1,
		undoCheck: true,
	},
	// --- large selections (owner bug: raw <mark> after highlighting a big selection)
	{ id: 'big-owner-selection', section: 'Large selections', prepare: () => SAMPLE, find: SAMPLE.slice(BIG_FROM, BIG_TO), color: 3, undoCheck: true },
	{ id: 'big-owner-selection-mouse', via: 'mouse', section: 'Large selections', prepare: () => SAMPLE, find: SAMPLE.slice(BIG_FROM, SAMPLE.indexOf('## Already colored') + 30), color: 3 },
	{ id: 'select-all-sample', section: 'Large selections', prepare: () => SAMPLE, all: true, color: 2, undoCheck: true },
	{ id: 'select-all-lists', section: 'Large selections', prepare: () => LISTS, all: true, color: 4, undoCheck: true },
	{ id: 'whole-paragraph', section: 'Large selections', find: 'A paragraph before the indented code block.', color: 1 },
	{ id: 'whole-heading', section: 'Large selections', find: 'Indented code', color: 2 },
	{ id: 'starts-inside-native', section: 'Large selections', find: 'native highlight== in a sentence and another ==second native one== here.', color: 3 },
	{ id: 'indented-code-only', section: 'Indented code', find: 'indented code line one with **stars** and [[a link]]\n    indented code line two', color: 4, nothing: true },
	{ id: 'indented-code-across', section: 'Indented code', find: 'A paragraph before the indented code block.\n\n    indented code line one', color: 5 },
];
