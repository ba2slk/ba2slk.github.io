// Run: node tools/nav.test.js
const assert = require('assert');
const { easeOutCubic, scrollDuration } = require('../assets/js/nav.js');

assert.strictEqual(easeOutCubic(0), 0);
assert.strictEqual(easeOutCubic(1), 1);
assert.ok(easeOutCubic(0.5) > 0.8, 'fast start, slow finish');
assert.strictEqual(scrollDuration(0), 250, 'no distance: 250ms');
assert.strictEqual(scrollDuration(2000), 350, 'mid jump grows with distance');
assert.strictEqual(scrollDuration(20000), 450, 'long jump: capped at 450ms');
console.log('nav tests passed');

const { bookTarget } = require('../assets/js/nav.js');
assert.strictEqual(bookTarget('?b=clean-code'), 'clean-code');
assert.strictEqual(bookTarget('?b=../x"'), null, 'only slug characters');
assert.strictEqual(bookTarget(''), null);
console.log('book target tests passed');

const { easeGlide } = require('../assets/js/nav.js');
assert.ok(Math.abs(easeGlide(0)) < 1e-9 && Math.abs(easeGlide(1) - 1) < 1e-9);
let peak = 0;
for (let i = 1; i <= 1000; i++) peak = Math.max(peak, (easeGlide(i / 1000) - easeGlide((i - 1) / 1000)) * 1000);
assert.ok(peak > 2.8 && peak < 3.2, 'quick but not abrupt (peak speed ' + peak.toFixed(2) + 'x average)');
assert.ok(easeGlide(0.05) < 0.06, 'soft start');
assert.ok(easeGlide(0.5) > 0.95 && easeGlide(0.5) < 0.98, 'most of the way by half time, then a long gentle landing');
console.log('glide easing tests passed');
