import { describe, expect, it } from 'vitest';
import { transformMarkdownListEnter } from './markdownTransforms';

function pressEnter(value: string, caret = value.length) {
  const nextValue = `${value.slice(0, caret)}\n${value.slice(caret)}`;

  return transformMarkdownListEnter(value, nextValue, {
    start: caret,
    end: caret,
  });
}

describe('transformMarkdownListEnter', () => {
  it.each(['-', '*', '+'])('continues a %s bullet marker', (marker) => {
    const value = `${marker} First item`;

    expect(pressEnter(value)).toEqual({
      value: `${value}\n${marker} `,
      selection: { start: value.length + 3, end: value.length + 3 },
    });
  });

  it('continues numbered lists with a Markdown-managed 1 marker', () => {
    const value = '7. Existing item';

    expect(pressEnter(value)).toEqual({
      value: `${value}\n1. `,
      selection: { start: value.length + 4, end: value.length + 4 },
    });
  });

  it('preserves indentation when continuing a nested list', () => {
    const value = '   - Nested item';

    expect(pressEnter(value)).toEqual({
      value: `${value}\n   - `,
      selection: { start: value.length + 6, end: value.length + 6 },
    });
  });

  it.each(['- ', '1. '])('removes an empty %s list marker', (value) => {
    expect(pressEnter(value)).toEqual({
      value: '',
      selection: { start: 0, end: 0 },
    });
  });

  it('preserves indentation when exiting an empty nested list item', () => {
    expect(pressEnter('   1. ')).toEqual({
      value: '   ',
      selection: { start: 3, end: 3 },
    });
  });

  it('adds the next marker when splitting list-item content', () => {
    const value = '- First second';
    const caret = '- First'.length;

    expect(pressEnter(value, caret)).toEqual({
      value: '- First\n-  second',
      selection: { start: caret + 3, end: caret + 3 },
    });
  });

  it('ignores Enter outside a list', () => {
    expect(pressEnter('Plain text')).toBeNull();
  });

  it('ignores replacements of selected text', () => {
    expect(
      transformMarkdownListEnter('- item', '- \n', { start: 2, end: 6 })
    ).toBeNull();
  });
});
