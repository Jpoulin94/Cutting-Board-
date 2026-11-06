const test = require('node:test');
const assert = require('node:assert/strict');
const { units } = require('./load');

test('formats inches as fractions', () => {
  const s = { units: 'in', precision: 16 };
  assert.equal(units.format(25.4 * 1.5625, s), '1-9/16"');
  assert.equal(units.format(25.4 * 0.125, s), '1/8"');
  assert.equal(units.format(25.4 * 19.75, s), '19-3/4"');
  assert.equal(units.format(25.4 * 2, s), '2"');
  assert.equal(units.format(25.4 * (1 / 32), { units: 'in', precision: 32 }), '1/32"');
});

test('formats millimetres', () => {
  assert.equal(units.format(3.175, { units: 'mm' }), '3.2 mm');
  assert.equal(units.format(38.1, { units: 'mm' }, false), '38.1');
});

test('parses lengths with fractions and unit suffixes', () => {
  assert.ok(Math.abs(units.parseLength('1-1/2', 'in') - 38.1) < 1e-9);
  assert.ok(Math.abs(units.parseLength('1 1/2', 'in') - 38.1) < 1e-9);
  assert.equal(units.parseLength('1/8', 'in'), 3.175);
  assert.equal(units.parseLength('12', 'mm'), 12);
  assert.equal(units.parseLength('2"', 'mm'), 50.8);
  assert.equal(units.parseLength('10mm', 'in'), 10);
  assert.ok(Number.isNaN(units.parseLength('abc', 'in')));
  assert.ok(Number.isNaN(units.parseLength('', 'in')));
});
