// Index of the heading to highlight: the last one above `line`,
// or the last heading once the page is scrolled to the bottom.
function pickActive(tops, line, atBottom) {
  if (atBottom) return tops.length - 1;
  var active = 0;
  for (var i = 0; i < tops.length; i++) {
    if (tops[i] <= line) active = i;
  }
  return active;
}

if (typeof module !== 'undefined') module.exports = { pickActive: pickActive };

if (typeof document !== 'undefined') (function () {
  var toc = document.getElementById('toc');
  var heads = document.querySelectorAll('.prose h2[id], .prose h3[id]');
  if (!toc) return;
  if (!heads.length) { toc.remove(); return; }

  var title = document.createElement('div');
  title.className = 'toc-title';
  title.textContent = 'CONTENTS';
  toc.appendChild(title);

  var links = [];
  heads.forEach(function (h) {
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    if (h.tagName === 'H3') a.className = 'sub';
    toc.appendChild(a);
    links.push(a);
  });

  var current = null;
  var ticking = false;

  function update() {
    ticking = false;
    var tops = Array.prototype.map.call(heads, function (h) { return h.getBoundingClientRect().top; });
    var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    var next = links[pickActive(tops, 120, atBottom)];
    if (next === current) return;
    if (current) current.classList.remove('on');
    current = next;
    current.classList.add('on');
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
