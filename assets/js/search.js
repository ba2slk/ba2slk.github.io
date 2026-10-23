(function () {
  var indexUrl = document.currentScript.getAttribute('data-index');
  var modal = document.getElementById('search-modal');
  var input = document.getElementById('search-input');
  var list = document.getElementById('search-results');
  var posts = null;
  var active = 0;

  function open() {
    modal.hidden = false;
    input.value = '';
    render([]);
    input.focus();
    if (!posts) {
      fetch(indexUrl).then(function (r) { return r.json(); }).then(function (data) {
        posts = data;
        search();
      }).catch(function () {
        list.innerHTML = '<li class="search-error">Couldn\'t load search.</li>';
      });
    }
  }

  function close() { modal.hidden = true; }

  function search() {
    if (!posts) return;
    var words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { render([]); return; }
    var hits = posts.filter(function (p) {
      var hay = (p.title + ' ' + p.content + ' ' + p.tags.join(' ')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
    hits.sort(function (a, b) {
      var at = words.some(function (w) { return a.title.toLowerCase().indexOf(w) !== -1; });
      var bt = words.some(function (w) { return b.title.toLowerCase().indexOf(w) !== -1; });
      return bt - at;
    });
    render(hits.slice(0, 10));
  }

  function render(hits) {
    active = 0;
    list.innerHTML = '';
    hits.forEach(function (p, i) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = p.url;
      var d = document.createElement('span');
      d.className = 'mono';
      d.textContent = p.date;
      a.appendChild(d);
      a.appendChild(document.createTextNode(p.title));
      li.appendChild(a);
      if (i === 0) li.className = 'on';
      list.appendChild(li);
    });
  }

  function move(step) {
    var items = list.children;
    if (!items.length) return;
    items[active].className = '';
    active = (active + step + items.length) % items.length;
    items[active].className = 'on';
    items[active].scrollIntoView({ block: 'nearest' });
  }

  document.getElementById('search-open').addEventListener('click', open);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  input.addEventListener('input', search);

  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      var a = list.children[active] && list.children[active].querySelector('a');
      if (a) location.href = a.href;
    }
  });
})();
