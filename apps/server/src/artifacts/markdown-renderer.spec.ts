import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown-renderer';

test('renders headings, paragraphs, inline code, bold and italic', () => {
  const html = renderMarkdown('# Title\n\nSome **bold** and *italic* text with `inline`.');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>inline<\/code>/);
});

test('escapes raw HTML to prevent XSS', () => {
  const html = renderMarkdown('Hello <script>alert(1)</script> world');
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('blocks javascript: URLs in links', () => {
  const html = renderMarkdown('[bad](javascript:alert(1)) and [good](https://example.com)');
  assert.equal(html.includes('javascript:'), false);
  assert.match(html, /href="https:\/\/example\.com"/);
});

test('blocks javascript: URLs in images', () => {
  const html = renderMarkdown('![alt](javascript:alert(1)) ![ok](https://example.com/a.png)');
  assert.equal(html.includes('javascript:'), false);
  assert.match(html, /src="https:\/\/example\.com\/a\.png"/);
});

test('renders nested unordered lists without infinite loops', () => {
  const md = '- a\n- b\n  - b1\n  - b2\n- c';
  const html = renderMarkdown(md);
  assert.match(html, /<ul>.*<li>a<\/li>.*<li>b.*<\/li>.*<li>c<\/li>.*<\/ul>/);
  assert.match(html, /<li>b<ul><li>b1<\/li><li>b2<\/li><\/ul><\/li>/);
});

test('renders ordered lists', () => {
  const html = renderMarkdown('1. one\n2. two\n3. three');
  assert.match(html, /<ol><li>one<\/li><li>two<\/li><li>three<\/li><\/ol>/);
});

test('renders GFM tables', () => {
  const md = '| A | B |\n| - | - |\n| 1 | 2 |';
  const html = renderMarkdown(md);
  assert.match(html, /<table><thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table>/);
});

test('renders fenced code blocks with language', () => {
  const html = renderMarkdown('```ts\nconst x = 1;\n```');
  assert.match(html, /<pre class="language-ts"><code>const x = 1;<\/code><\/pre>/);
});

test('renders blockquotes and horizontal rules', () => {
  const html = renderMarkdown('> quoted\n\n---');
  assert.match(html, /<blockquote>.*<\/blockquote>/);
  assert.match(html, /<hr \/>/);
});

test('renders links with target=_blank and rel=noopener by default', () => {
  const html = renderMarkdown('[hi](https://example.com)');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
