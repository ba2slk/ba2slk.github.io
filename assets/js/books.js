var PAGE_SIZE = 5;

function pageCount(n, size) {
  return Math.max(1, Math.ceil(n / size));
}

function clampPage(page, count) {
  return Math.min(count - 1, Math.max(0, page));
}

if (typeof module !== 'undefined') module.exports = { pageCount: pageCount, clampPage: clampPage };

if (typeof document !== 'undefined') document.querySelectorAll('.book').forEach(function (book) {
  var items = book.querySelectorAll('.chapters li');
  var pager = book.querySelector('.notes-pager');
  var count = pageCount(items.length, PAGE_SIZE);
  var page = 0;

  function show(p) {
    page = clampPage(p, count);
    items.forEach(function (li) { li.hidden = Number(li.dataset.page) !== page; });
    if (!pager) return;
    pager.querySelector('.pager-status').textContent = (page + 1) + ' / ' + count;
    pager.querySelector('[data-dir="-1"]').disabled = page === 0;
    pager.querySelector('[data-dir="1"]').disabled = page === count - 1;
  }

  // Lock the list to the first page's height so the pager doesn't jump on shorter pages.
  function lockHeight() {
    var list = book.querySelector('.chapters');
    if (!pager || !list) return;
    list.style.minHeight = '';
    show(0);
    list.style.minHeight = list.getBoundingClientRect().height + 'px';
  }

  if (pager) pager.addEventListener('click', function (e) {
    var btn = e.target.closest('.pager-btn');
    if (btn) show(page + Number(btn.dataset.dir));
  });
  lockHeight();
  if (typeof ResizeObserver !== 'undefined' && pager) {
    var w = book.clientWidth;
    new ResizeObserver(function () { if (book.clientWidth !== w) { w = book.clientWidth; var p = page; lockHeight(); show(p); } }).observe(book);
  }
});
