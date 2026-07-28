export type TextSelection = {
  start: number;
  end: number;
};

export type MarkdownTransformation = {
  value: string;
  selection: TextSelection;
};

type LinePrefix = 'blockquote' | 'bullet-list' | 'numbered-list';

const linePrefixConfig: Record<
  LinePrefix,
  {
    pattern: RegExp;
    prefix: (lineIndex: number) => string;
  }
> = {
  blockquote: {
    pattern: /^> /,
    prefix: () => '> ',
  },
  'bullet-list': {
    pattern: /^[-*+] /,
    prefix: () => '- ',
  },
  'numbered-list': {
    pattern: /^\d+\. /,
    prefix: (lineIndex) => `${lineIndex + 1}. `,
  },
};

function replaceRange(
  value: string,
  start: number,
  end: number,
  replacement: string,
  selection: TextSelection
): MarkdownTransformation {
  return {
    value: value.slice(0, start) + replacement + value.slice(end),
    selection,
  };
}

function selectedTextHasExactMarkers(
  selectedText: string,
  opening: string,
  closing: string
) {
  if (
    !selectedText.startsWith(opening) ||
    !selectedText.endsWith(closing) ||
    selectedText.length < opening.length + closing.length
  ) {
    return false;
  }

  if (opening.length === 1 && opening === closing) {
    return (
      selectedText[opening.length] !== opening &&
      selectedText[selectedText.length - closing.length - 1] !== closing
    );
  }

  return true;
}

function selectionHasExactSurroundingMarkers(
  value: string,
  selection: TextSelection,
  opening: string,
  closing: string
) {
  const openingStart = selection.start - opening.length;

  if (
    openingStart < 0 ||
    value.slice(openingStart, selection.start) !== opening ||
    value.slice(selection.end, selection.end + closing.length) !== closing
  ) {
    return false;
  }

  if (opening.length === 1 && opening === closing) {
    return (
      value[openingStart - 1] !== opening &&
      value[selection.end + closing.length] !== closing
    );
  }

  return true;
}

export function toggleWrappedText(
  value: string,
  selection: TextSelection,
  opening: string,
  closing: string
): MarkdownTransformation {
  const selectedText = value.slice(selection.start, selection.end);

  if (selectedTextHasExactMarkers(selectedText, opening, closing)) {
    const content = selectedText.slice(opening.length, -closing.length);

    return replaceRange(value, selection.start, selection.end, content, {
      start: selection.start,
      end: selection.start + content.length,
    });
  }

  const openingStart = selection.start - opening.length;
  const hasSurroundingMarkers = selectionHasExactSurroundingMarkers(
    value,
    selection,
    opening,
    closing
  );

  if (hasSurroundingMarkers) {
    return replaceRange(
      value,
      openingStart,
      selection.end + closing.length,
      selectedText,
      {
        start: openingStart,
        end: openingStart + selectedText.length,
      }
    );
  }

  const replacement = `${opening}${selectedText}${closing}`;
  const contentStart = selection.start + opening.length;

  return replaceRange(value, selection.start, selection.end, replacement, {
    start: contentStart,
    end: contentStart + selectedText.length,
  });
}

function selectedLineRange(value: string, selection: TextSelection) {
  const start = value.lastIndexOf('\n', selection.start - 1) + 1;
  const selectionEndsAfterNewline =
    selection.end > start && value[selection.end - 1] === '\n';
  const effectiveEnd = selectionEndsAfterNewline
    ? selection.end - 1
    : selection.end;
  const nextLineBreak = value.indexOf('\n', effectiveEnd);
  const end = nextLineBreak === -1 ? value.length : nextLineBreak;

  return { start, end };
}

export function toggleLinePrefix(
  value: string,
  selection: TextSelection,
  type: LinePrefix
): MarkdownTransformation {
  const { pattern, prefix } = linePrefixConfig[type];
  const { start, end } = selectedLineRange(value, selection);
  const lines = value.slice(start, end).split('\n');
  const allPrefixed = lines.every((line) => pattern.test(line));
  const replacement = lines
    .map((line, index) => {
      const content = line.replace(pattern, '');
      return allPrefixed ? content : `${prefix(index)}${content}`;
    })
    .join('\n');

  return replaceRange(value, start, end, replacement, {
    start,
    end: start + replacement.length,
  });
}

export function insertMarkdownLink(
  value: string,
  selection: TextSelection
): MarkdownTransformation {
  const selectedText = value.slice(selection.start, selection.end);
  const url = 'https://';
  const replacement = `[${selectedText}](${url})`;
  const selectionStart = selectedText
    ? selection.start + selectedText.length + 3
    : selection.start + 1;
  const selectionLength = selectedText ? url.length : 0;

  return replaceRange(value, selection.start, selection.end, replacement, {
    start: selectionStart,
    end: selectionStart + selectionLength,
  });
}

export function isWrapped(
  value: string,
  selection: TextSelection,
  opening: string,
  closing: string
) {
  const selectedText = value.slice(selection.start, selection.end);

  if (selectedTextHasExactMarkers(selectedText, opening, closing)) {
    return true;
  }

  return selectionHasExactSurroundingMarkers(
    value,
    selection,
    opening,
    closing
  );
}

export function hasLinePrefix(
  value: string,
  selection: TextSelection,
  type: LinePrefix
) {
  const { pattern } = linePrefixConfig[type];
  const { start, end } = selectedLineRange(value, selection);
  const lines = value.slice(start, end).split('\n');

  return lines.length > 0 && lines.every((line) => pattern.test(line));
}
