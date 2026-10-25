// Copy button on every code block. Shared by the blog and the editor (preview pane + live mode).
(function () {
  function copy(btn, text) {
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    });
  }
  function button(getText) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy-btn';
    b.textContent = 'Copy';
    b.addEventListener('click', function () { copy(b, getText()); });
    return b;
  }
  // Kramdown/Rouge (and the editor preview) wrap each block in div.language-*.
  function addCopyButtons(root) {
    (root || document).querySelectorAll('.prose div[class*="language-"]').forEach(function (el) {
      var code = el.querySelector('pre code') || el.querySelector('pre');
      if (!code || el.querySelector(':scope > .copy-btn')) return;
      el.classList.add('has-copy');
      el.appendChild(button(function () { return code.textContent.replace(/\n$/, ''); }));
    });
  }
  window.CopyCode = { button: button, addCopyButtons: addCopyButtons };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { addCopyButtons(); });
  else addCopyButtons();
})();
