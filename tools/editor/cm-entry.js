// Entry for the bundled CodeMirror in cm.js. Rebuild after changing this file:
//   npm i esbuild codemirror @codemirror/lang-markdown @codemirror/lang-{python,javascript,json,sql,java,cpp,rust,go,html,css,yaml} @codemirror/legacy-modes
//   npx esbuild tools/editor/cm-entry.js --bundle --minify --format=esm --outfile=tools/editor/cm.js
import { LanguageDescription, StreamLanguage } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { sql } from '@codemirror/lang-sql';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { yaml } from '@codemirror/lang-yaml';
import { shell } from '@codemirror/legacy-modes/mode/shell';

export * from '@codemirror/state';
export * from '@codemirror/view';
export * from '@codemirror/language';
export * from '@codemirror/commands';
export { markdown, markdownLanguage } from '@codemirror/lang-markdown';
export { tags } from '@lezer/highlight';

// Languages highlighted inside fenced code blocks, by the name after ```.
const lang = (name, alias, support) => LanguageDescription.of({ name, alias, support });
export const codeLanguages = [
  lang('python', ['py'], python()),
  lang('javascript', ['js', 'jsx'], javascript({ jsx: true })),
  lang('typescript', ['ts', 'tsx'], javascript({ typescript: true, jsx: true })),
  lang('json', [], json()),
  lang('sql', [], sql()),
  lang('java', [], java()),
  lang('cpp', ['c', 'c++', 'h'], cpp()),
  lang('rust', ['rs'], rust()),
  lang('go', ['golang'], go()),
  lang('html', ['xml'], html()),
  lang('css', [], css()),
  lang('yaml', ['yml'], yaml()),
  lang('bash', ['sh', 'shell', 'zsh', 'console'], StreamLanguage.define(shell)),
];
