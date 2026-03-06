import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface MessageContentProps {
  content: string;
}

export function MessageContent({ content }: MessageContentProps) {
  const rules = useMemo(
    () => ({
      // No custom rules needed for now; the style sheet handles all theming
    }),
    [],
  );

  return (
    <Markdown style={markdownStyles} rules={rules}>
      {content}
    </Markdown>
  );
}

const monoFont = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  web: 'ui-monospace, Menlo, Monaco, "Cascadia Mono", monospace',
  default: 'monospace',
});

const serifFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  web: 'Georgia, "Times New Roman", serif',
  default: 'serif',
});

const markdownStyles = StyleSheet.create({
  body: {
    color: '#d6d3d1', // stone-300
    fontSize: 14,
    lineHeight: 20,
  },
  paragraph: {
    marginTop: 4,
    marginBottom: 4,
    color: '#d6d3d1',
  },
  // Headings - serif font
  heading1: {
    color: '#e7e5e4', // stone-200
    fontFamily: serifFont,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
  },
  heading2: {
    color: '#e7e5e4',
    fontFamily: serifFont,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  heading3: {
    color: '#e7e5e4',
    fontFamily: serifFont,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  heading4: {
    color: '#e7e5e4',
    fontFamily: serifFont,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  heading5: {
    color: '#e7e5e4',
    fontFamily: serifFont,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  heading6: {
    color: '#e7e5e4',
    fontFamily: serifFont,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 2,
  },
  // Links - gold
  link: {
    color: '#eab308', // yellow-500 / gold
    textDecorationLine: 'underline',
  },
  // Strong / bold
  strong: {
    color: '#e7e5e4', // stone-200
    fontWeight: '700',
  },
  em: {
    color: '#d6d3d1',
    fontStyle: 'italic',
  },
  // Inline code - gold on dark background
  code_inline: {
    color: '#facc15', // yellow-400 / gold
    backgroundColor: '#292524', // stone-800
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    fontFamily: monoFont,
    fontSize: 13,
  },
  // Code blocks - monospace
  code_block: {
    color: '#d6d3d1',
    backgroundColor: '#1c1917', // stone-900
    borderRadius: 8,
    padding: 12,
    fontFamily: monoFont,
    fontSize: 13,
    lineHeight: 18,
    marginVertical: 8,
  },
  fence: {
    color: '#d6d3d1',
    backgroundColor: '#1c1917',
    borderRadius: 8,
    padding: 12,
    fontFamily: monoFont,
    fontSize: 13,
    lineHeight: 18,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#44403c', // stone-700
  },
  // Blockquote
  blockquote: {
    backgroundColor: '#292524',
    borderLeftWidth: 3,
    borderLeftColor: '#78716c', // stone-500
    paddingLeft: 12,
    paddingVertical: 4,
    marginVertical: 4,
  },
  // Lists
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  bullet_list_icon: {
    color: '#a8a29e', // stone-400
    marginRight: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  ordered_list_icon: {
    color: '#a8a29e',
    marginRight: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  // Table
  table: {
    borderWidth: 1,
    borderColor: '#44403c',
    borderRadius: 4,
    marginVertical: 8,
  },
  thead: {
    backgroundColor: '#292524',
  },
  th: {
    color: '#e7e5e4',
    fontWeight: '600',
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#44403c',
  },
  td: {
    color: '#d6d3d1',
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#292524',
  },
  tr: {
    borderBottomWidth: 1,
    borderColor: '#292524',
  },
  // Horizontal rule
  hr: {
    backgroundColor: '#44403c',
    height: 1,
    marginVertical: 12,
  },
  // Image
  image: {
    borderRadius: 8,
    marginVertical: 8,
  },
});
