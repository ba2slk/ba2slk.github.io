// The markdown editor: CodeMirror with an Obsidian-style live preview.
// The document is always the plain markdown; live mode only changes how it looks.
// Syntax marks (**, >, #, link urls…) are hidden unless the cursor is on them.
import {
  EditorView, EditorState, Compartment, Decoration, ViewPlugin, WidgetType, keymap, placeholder,
  drawSelection, history, defaultKeymap, historyKeymap, indentUnit,
  syntaxTree, syntaxHighlighting, HighlightStyle, tags as t,
  markdown, markdownLanguage, codeLanguages,
} from '/editor/cm.js';

class ImageWidget extends WidgetType {
  constructor(src, alt) { super(); this.src = src; this.alt = alt; }
  eq(o) { return o.src === this.src && o.alt === this.alt; }
  toDOM() { return Object.assign(document.createElement('img'), { src: this.src, alt: this.alt, className: 'cm-img' }); }
}
class TextWidget extends WidgetType {
  constructor(text, cls) { super(); this.text = text; this.cls = cls; }
  eq(o) { return o.text === this.text && o.cls === this.cls; }
  toDOM() { return Object.assign(document.createElement('span'), { textContent: this.text, className: this.cls }); }
}
// Copy button on a code box's first line; copies the lines between the fences.
class CopyWidget extends WidgetType {
  constructor(text) { super(); this.text = text; }
  eq(o) { return o.text === this.text; }
  toDOM() {
    const b = window.CopyCode.button(() => this.text);
    // Keep the click from moving the cursor (which would expand the fences).
    b.addEventListener('mousedown', (e) => e.preventDefault());
    return b;
  }
  ignoreEvent() { return true; }
}

const hide = Decoration.replace({});
const mark = (cls) => Decoration.mark({ class: cls });
const line = (cls) => Decoration.line({ class: cls });
const INLINE = { StrongEmphasis: 'cm-strong', Emphasis: 'cm-em', Strikethrough: 'cm-strike', InlineCode: 'cm-icode', Link: 'cm-link' };

function build(view) {
  const { state } = view;
  const sel = state.selection.ranges;
  // Touching = the cursor or selection reaches into [from, to] (ends included, so typing next to a mark shows it).
  const touching = (from, to) => sel.some((r) => r.from <= to && r.to >= from);
  const lineTouched = (pos) => { const l = state.doc.lineAt(pos); return touching(l.from, l.to); };
  const out = [];
  const add = (from, to, deco) => { if (to >= from) out.push(deco.range(from, to)); };
  // Hide a line-start mark plus the space after it.
  const hideMark = (from, to) => add(from, state.sliceDoc(to, to + 1) === ' ' ? to + 1 : to, hide);

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter(n) {
        const name = n.name;
        const h = name.match(/^ATXHeading(\d)$/);
        if (h) { add(n.from, n.from, line('cm-h cm-h' + h[1])); return; }
        if (INLINE[name]) add(n.from, n.to, mark(INLINE[name]));
        switch (name) {
          case 'HeaderMark':
            if (n.node.parent.name.startsWith('ATX') && !lineTouched(n.from)) hideMark(n.from, n.to);
            return;
          case 'EmphasisMark': case 'StrikethroughMark': case 'CodeMark': {
            const p = n.node.parent;
            if (p.name !== 'FencedCode' && !touching(p.from, p.to)) add(n.from, n.to, hide);
            return;
          }
          case 'Link':
            if (!touching(n.from, n.to)) {
              // Keep only the label: hide `[` and everything from `](`.
              const marks = n.node.getChildren('LinkMark');
              if (marks.length >= 2) { add(n.from, marks[0].to, hide); add(marks[1].from, n.to, hide); }
            }
            return;
          case 'Image':
            if (!touching(n.from, n.to)) {
              const m = state.sliceDoc(n.from, n.to).match(/^!\[([^\]]*)\]\(([^)\s]+)/);
              if (m) add(n.from, n.to, Decoration.replace({ widget: new ImageWidget(m[2], m[1]) }));
            }
            return false;
          case 'Blockquote':
            if (n.node.parent?.name === 'Blockquote') return; // the outermost quote styles every line
            for (let p = n.from; p <= n.to; ) {
              const l = state.doc.lineAt(p);
              // Nesting depth = the `>` marks at the line start, so `> > >` looks nested like the preview.
              const depth = Math.min(3, (l.text.match(/^\s*((?:>\s?)*)/)[1].match(/>/g) || []).length);
              add(l.from, l.from, line('cm-quote' + (depth > 1 ? ' cm-quote-' + depth : '')));
              p = l.to + 1;
            }
            return;
          case 'QuoteMark':
            if (!lineTouched(n.from)) hideMark(n.from, n.to);
            return;
          case 'ListMark':
            if (!lineTouched(n.from) && /^[-*+]$/.test(state.sliceDoc(n.from, n.to))) add(n.from, n.to, Decoration.replace({ widget: new TextWidget('•', 'cm-bullet') }));
            return;
          case 'HorizontalRule':
            if (!lineTouched(n.from)) add(n.from, n.from, line('cm-hr'));
            return;
          case 'FencedCode': {
            const first = state.doc.lineAt(n.from).number, last = state.doc.lineAt(n.to).number;
            const fences = touching(n.from, n.to) ? '' : ' cm-fence-quiet';
            for (let i = first; i <= last; i++) {
              const cls = 'cm-codeblock' + (i === first ? ' cm-codeblock-first' + fences : '') + (i === last ? ' cm-codeblock-last' + fences : '');
              add(state.doc.line(i).from, state.doc.line(i).from, line(cls));
            }
            if (last > first + 1) {
              const body = state.sliceDoc(state.doc.line(first + 1).from, state.doc.line(last - 1).to);
              add(state.doc.line(first).from, state.doc.line(first).from, Decoration.widget({ widget: new CopyWidget(body), side: -1 }));
            }
            return;
          }
        }
      },
    });
  }
  return Decoration.set(out, true);
}

const livePreview = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = build(view); }
  update(u) {
    if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view);
  }
}, { decorations: (v) => v.decorations });

// Code colors follow the blog's Rouge theme (same as the hljs mapping in app.css).
const codeColors = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#6e7781', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.bool, t.null, t.typeName, t.self], color: '#cf222e' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#0a3069' },
  { tag: [t.number, t.atom, t.propertyName, t.attributeName, t.standard(t.variableName)], color: '#0550ae' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.className, t.definition(t.function(t.variableName))], color: '#8250df' },
  { tag: [t.local(t.variableName), t.special(t.variableName)], color: '#953800' },
  { tag: t.meta, color: '#6e7781' },
]);

const liveMode = [livePreview, EditorView.editorAttributes.of({ class: 'cm-live' })];

export function createEditor(parent, { onChange, keys = [], handlers = {} }) {
  const mode = new Compartment();
  let live = true;
  const extensions = () => [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    indentUnit.of('  '),
    EditorState.tabSize.of(2),
    placeholder('Write in markdown. Paste or drop images here.'),
    markdown({ base: markdownLanguage, codeLanguages, addKeymap: false }),
    syntaxHighlighting(codeColors),
    keymap.of([...keys, ...defaultKeymap, ...historyKeymap]),
    EditorView.domEventHandlers(handlers),
    EditorView.updateListener.of((u) => { if (u.docChanged) onChange(); }),
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
    mode.of(live ? liveMode : []),
  ];
  const view = new EditorView({ parent, extensions: extensions() });
  return {
    view,
    get text() { return view.state.doc.toString(); },
    // Load a new document: fresh undo history, no change event.
    load(text) {
      view.setState(EditorState.create({ doc: text, extensions: extensions() }));
    },
    get live() { return live; },
    setLive(on) { live = on; view.dispatch({ effects: mode.reconfigure(on ? liveMode : []) }); },
  };
}
