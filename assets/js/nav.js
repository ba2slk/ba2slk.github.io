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
  var touch = matchMedia('(pointer: coarse)');

  function glideTo(target, duration, done, ease) {
    var start = window.scrollY;
    var end = start + target.getBoundingClientRect().top - OFFSET;
    if (reduce.matches) { window.scrollTo(0, end); if (done) done(); return; }
    var ms = duration || scrollDuration(Math.abs(end - start));
    var t0 = null;
    // Let the user take over: any manual scroll input stops the glide.
    var stopped = false;
    var events = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    function stop() { stopped = true; }
    events.forEach(function (ev) { addEventListener(ev, stop, { passive: true, once: true }); });
    function cleanup() { events.forEach(function (ev) { removeEventListener(ev, stop); }); }
    function step(now) {
      if (stopped) { cleanup(); return; }
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, start + (end - start) * (ease || easeOutCubic)(t));
      if (t < 1) requestAnimationFrame(step);
      else { cleanup(); if (done) done(); }
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
    var greet = function () {
      book.classList.add('arrived');
      setTimeout(function () { book.classList.remove('arrived'); }, 800);
    };
    var settle = function () { history.replaceState(null, '', location.pathname + '#' + slug); };
    var go = function () {
      setTimeout(function () {
        if (touch.matches) {
          // Touch devices: the browser's own smooth scroll runs off the main thread and stays fluid.
          window.scrollTo({ top: window.scrollY + book.getBoundingClientRect().top - OFFSET, behavior: 'smooth' });
          setTimeout(greet, 350);
          setTimeout(settle, 900);
          return;
        }
        var GLIDE = 1300;
        glideTo(book, GLIDE, settle, easeGlide);
        // The glide covers ~95% of the way by 45% of its time; greet the book then
        // with its hover effect instead of waiting for the long landing to finish.
        setTimeout(greet, GLIDE * 0.45);
      }, 120);
    };
    if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
  }
})();
