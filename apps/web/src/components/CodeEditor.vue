<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { tags } from '@lezer/highlight';

const props = defineProps<{
  modelValue: string;
  language?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const host = ref<HTMLDivElement | null>(null);
const view = ref<EditorView | null>(null);
const languageCompartment = new Compartment();

const vsCodeTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      color: '#d4d4d4',
      backgroundColor: '#1e1e1e',
    },
    '.cm-scroller': {
      fontFamily: 'Consolas, "Cascadia Code", "JetBrains Mono", "SFMono-Regular", Menlo, monospace',
      fontSize: '12px',
      lineHeight: '1.55',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: '#aeafad',
      padding: '12px 0',
    },
    '.cm-line': {
      padding: '0 12px',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#aeafad',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#264f78',
    },
    '.cm-gutters': {
      backgroundColor: '#1e1e1e',
      color: '#858585',
      border: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 10px 0 14px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#2a2d2e',
      color: '#c6c6c6',
    },
    '.cm-activeLine': {
      backgroundColor: '#2a2d2e66',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: '#3c3c3c',
      color: '#cccccc',
      border: '1px solid #555555',
    },
    '.cm-tooltip': {
      backgroundColor: '#252526',
      border: '1px solid #454545',
      color: '#cccccc',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#04395e',
      color: '#ffffff',
    },
    '.cm-panels': {
      backgroundColor: '#252526',
      color: '#cccccc',
    },
    '.cm-searchMatch': {
      backgroundColor: '#613214',
      outline: '1px solid #9e6a03',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#9e6a03',
    },
    '.cm-selectionMatch': {
      backgroundColor: '#3a3d41',
    },
  },
  { dark: true },
);

const vsCodeHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: '#569cd6' },
  { tag: [tags.controlKeyword, tags.moduleKeyword], color: '#c586c0' },
  { tag: [tags.string, tags.special(tags.string)], color: '#ce9178' },
  { tag: [tags.number, tags.integer, tags.float], color: '#b5cea8' },
  { tag: tags.bool, color: '#569cd6' },
  { tag: tags.null, color: '#569cd6' },
  { tag: tags.regexp, color: '#d16969' },
  { tag: tags.escape, color: '#d7ba7d' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#dcdcaa' },
  { tag: [tags.variableName, tags.propertyName, tags.attributeName], color: '#9cdcfe' },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: '#9cdcfe' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#4ec9b0' },
  { tag: [tags.tagName, tags.standard(tags.tagName)], color: '#569cd6' },
  { tag: [tags.operator, tags.punctuation, tags.separator, tags.bracket], color: '#d4d4d4' },
  { tag: tags.invalid, color: '#f44747', textDecoration: 'underline' },
  { tag: tags.heading, color: '#569cd6', fontWeight: 'bold' },
  { tag: tags.link, color: '#4fc1ff', textDecoration: 'underline' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
]);

function languageExtension(language?: string) {
  if (language === 'json') return json();
  if (language === 'javascript') return javascript();
  if (language === 'typescript') return javascript({ typescript: true });
  return [];
}

function createState(doc: string, language?: string) {
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      vsCodeTheme,
      syntaxHighlighting(vsCodeHighlight),
      languageCompartment.of(languageExtension(language)),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) emit('update:modelValue', update.state.doc.toString());
      }),
    ],
  });
}

onMounted(() => {
  if (!host.value) return;
  view.value = new EditorView({
    state: createState(props.modelValue, props.language),
    parent: host.value,
  });
});

onBeforeUnmount(() => {
  view.value?.destroy();
  view.value = null;
});

watch(
  () => props.modelValue,
  (value) => {
    const current = view.value;
    if (!current) return;
    const text = current.state.doc.toString();
    if (text === value) return;
    current.dispatch({
      changes: { from: 0, to: text.length, insert: value },
    });
  },
);

watch(
  () => props.language,
  (language) => {
    view.value?.dispatch({
      effects: languageCompartment.reconfigure(languageExtension(language)),
    });
  },
);
</script>

<template>
  <div ref="host" class="h-full w-full overflow-hidden" />
</template>
