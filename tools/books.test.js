// Run: node tools/books.test.js
const assert = require('assert');
const { pageCount, clampPage } = require('../assets/js/books.js');

assert.strictEqual(pageCount(0, 5), 1);
assert.strictEqual(pageCount(5, 5), 1);
assert.strictEqual(pageCount(6, 5), 2);
assert.strictEqual(pageCount(11, 5), 3);
assert.strictEqual(clampPage(-1, 3), 0, 'no page before the first');
assert.strictEqual(clampPage(3, 3), 2, 'no page after the last');
console.log('books tests passed');
