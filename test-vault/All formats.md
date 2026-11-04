---
title: All formats
tags: [test, markdown]
aliases:
  - Format zoo
status: draft
---

# Format zoo

This note holds one realistic paragraph for every Markdown construct. Each section is labelled so a failure points at its construct.

## Headings

# Heading level one
## Heading level two
### Heading level three
#### Heading level four
##### Heading level five
###### Heading level six

### A heading with **bold**, a [[Sample text|link]] and a #heading-tag

## Inline formatting

This sentence has **bold words**, *italic words*, ***bold italic words***, __underscore bold__ and _underscore italic_ in it.

Some ~~struck through text~~ sits next to normal text, and a **bold phrase with *nested italic* inside** follows.

A [link inside **bold text**](https://example.com/bold) and **bold with a [[Start here|wiki link]] inside** end the paragraph.

Escaped characters: 2 \* 3 = 6, a snake\_case\_name, and \[not a link\] with a \#notatag and a literal \| pipe.

Loose asterisks like 5 * 4 and snake_case_name and a_b_c stay as they are.

## Code

Inline code like `const x = 1` sits in a sentence, and `` code with a ` backtick `` too.

```js
function add(a, b) {
  // **not bold** and ==not highlighted== and [[not a link]]
  return a + b;
}
```

~~~python
def greet(name):
    return f"hello {name}"  # [link](http://x.y)
~~~

- A list item with a nested fence:

  ```bash
  echo "**still code**"
  ls -la
  ```

- A second item after the fence.

## Links and embeds

A plain wikilink [[Sample text]], an alias [[Sample text|the sample note]], a heading link [[Sample text#Single paragraph]] and an embed ![[Lists and table]] sit here.

A markdown link [Obsidian help](https://help.obsidian.md/Home), a bare URL https://obsidian.md/download and an autolink <https://example.com/auto> follow, then an image ![alt text](https://example.com/pic.png "title").

A reference-style [link text][ref] and a footnote reference[^1] and another[^note] finish the paragraph.

[ref]: https://example.com/ref
[^1]: The first footnote definition, with some **bold** text in it.
[^note]: A named footnote with a [[Sample text|link]].

## Tags and block references

A paragraph with a #tag, a #nested/tag and a #tag-with-dash in the middle of a sentence. #leading tag at the start.

A paragraph that can be linked to. ^block-id

Another referenced paragraph with **bold** text. ^second-block

## Math

Inline math $x^2 + y^2 = z^2$ sits in a sentence, and prices like $5 and $10 are not math.

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

## Comments and HTML

Visible text %%with a hidden comment%% continues here.

Inline HTML: a <b>bold tag</b>, a <kbd>Ctrl</kbd>+<kbd>C</kbd> key, a <span style="color: red">red span</span> and a line<br>break.

Special characters: 3 < 5 && 7 > 2, an & ampersand, &amp; an entity, and "quotes" with 'apostrophes'.

## Lists

- Dash item one
- Dash item two with **bold**
  - Nested dash item
    - Deeper nested item
* Star item one
* Star item two
+ Plus item one
+ Plus item two

1. First ordered item
2. Second ordered item
   1. Nested ordered item
3. Third ordered item

3) Starts at three
4) Then four

- [ ] An open task
- [x] A finished task with *italic*
- [ ] A task with a [[Sample text|link]]

## Blockquotes and callouts

> A simple blockquote with **bold** and a [link](https://example.com).
> A second line in the same quote.

> An outer quote
> > A nested quote
> > > A third level

> [!note] A note callout
> The body of the note callout, with **bold** and `code`.

> [!tip]- A foldable tip
> Hidden until opened, with a [[Sample text|link]].

> [!warning] Warning with a list
> - First warning item
> - Second warning item

## Tables

| Left | Center | Right |
|:-----|:------:|------:|
| plain | **bold** | *italic* |
| a \| pipe | `code` | [[Sample text\|link]] |
| 12 | 345 | 6789 |

## Horizontal rules

Above the rule.

---

Between rules.

***

Below the rules.

## Line structure

A line ending with two spaces for a hard break  
continues on the next line, and one with a backslash\
continues too.

Consecutive lines of one paragraph
are stored as separate lines
and joined when rendered.

A very long line that wraps in the editor because it keeps going and going: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

## Text and characters

Emoji: 🎉 party, 👍🏽 thumbs, 👨‍👩‍👧‍👦 family, 🇩🇪 flag and ❤️ heart.

Accents: café, naïve, Zürich, and combining é as é, ñ, å.

CJK: 日本語のテキストと漢字、そして한국어 문장.

RTL: مرحبا بالعالم, שלום עולם, and mixed English عربي text.

Math symbols: x ≤ y ≥ z ≠ w, α + β = γ, 5 × 3 ÷ 1, 10 < 20 > 5, a & b.

## Existing highlights

Native: a ==native highlight== in a sentence and another ==second native one== here.

Ours: a <mark style="background: #FFD60A55;">yellow mark</mark> and a <mark style="background: #3DDC8455;">green mark</mark> here.

Adjacent: <mark style="background: #FFD60A55;">first</mark><mark style="background: #3DDC8455;">second</mark><mark style="background: #4DA3FF55;">third</mark> touching.

A <mark style="background: #FFD60A55;">highlight with **bold** inside</mark> and **bold with <mark style="background: #3DDC8455;">a highlight</mark> inside** here.

A link alias [[Sample text|with <mark style="background: #FFD60A55;">mark</mark> alias]] and a ==native with **bold**== here.

## Indented code

A paragraph before the indented code block.

    indented code line one with **stars** and [[a link]]
    indented code line two

A paragraph after the indented code block.

## Final section

The last paragraph of the note ends here, with a closing sentence.
