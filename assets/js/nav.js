function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Soft start, quick middle (~3x average speed) and a long, gentle landing (no sudden braking).
function easeGlide(t) {
  return 1 - Math.pow(1 - Math.pow(t, 1.8), 10);
}

// Longer jumps take a little longer, but never more than 450ms.
function scrollDuration(distance) {
  return Math.min(450, Math.max(250, 250 + distance / 20));
}

// `?b=<slug>` on the Books page names the book to glide to.
function bookTarget(search) {
  var m = /[?&]b=([a-z0-9-]+)(?:&|$)/.exec(search || '');
  return m ? m[1] : null;
}

if (typeof module !== 'undefined') module.exports = { easeOutCubic: easeOutCubic, easeGlide: easeGlide, scrollDuration: scrollDuration, bookTarget: bookTarget };

if (typeof document !== 'undefined') (function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var OFFSET = 24;

  function glideTo(target, duration, done, ease) {
    var start = window.scrollY;
    var end = start + target.getBoundingClientRect().top - OFFSET;
    if (reduce.matches) { window.scrollTo(0, end); if (done) done(); return; }
    var ms = duration || scrollDuration(Math.abs(end - start));
    var t0 = null;
    function step(now) {
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, start + (end - start) * (ease || easeOutCubic)(t));
      if (t < 1) requestAnimationFrame(step);
      else if (done) done();
    }
    requestAnimationFrame(step);
  }

  // Quick smooth scroll for in-page anchors
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    var target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    glideTo(target);
    history.pushState(null, '', '#' + encodeURIComponent(id));
  });

  // Arriving at /books/?b=<slug>: start at the top, then glide down to that book.
  var slug = bookTarget(location.search);
  var book = slug && document.getElementById(slug);
  if (book) {
    // Drop ?b= now, but add the #hash only after the glide:
    // a hash present when the page finishes loading makes the browser jump there.
    history.replaceState(null, '', location.pathname);
    var go = function () {
      setTimeout(function () {
        var GLIDE = 1300;
        glideTo(book, GLIDE, function () { history.replaceState(null, '', location.pathname + '#' + slug); }, easeGlide);
        // The glide covers ~95% of the way by 45% of its time; greet the book then
        // with its hover effect instead of waiting for the long landing to finish.
        setTimeout(function () {
          book.classList.add('arrived');
          setTimeout(function () { book.classList.remove('arrived'); }, 800);
        }, GLIDE * 0.45);
      }, 120);
    };
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
  }
})();
