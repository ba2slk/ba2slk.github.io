// Run: node tools/toc.test.js
const assert = require('assert');
const { pickActive } = require('../assets/js/toc.js');

// tops = heading positions relative to the viewport top
assert.strictEqual(pickActive([500, 900], 120, false), 0, 'before any heading: first');
assert.strictEqual(pickActive([-300, 50, 900], 120, false), 1, 'last heading above the line');
assert.strictEqual(pickActive([-900, -400, 600], 120, true), 2, 'at page bottom: last heading');
console.log('toc tests passed');
