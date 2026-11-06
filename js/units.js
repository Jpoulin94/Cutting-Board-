// Units: everything is stored in millimetres and shown in inches (fractions)
// or millimetres.
(function (root) {
  'use strict';
  const CB = (root.CB = root.CB || {});

  const MM_PER_IN = 25.4;

  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  // Formats inches as a fraction rounded to 1/denom: 1.5625 -> 1-9/16.
  function fraction(inches, denom = 16) {
    const neg = inches < 0;
    let n = Math.round(Math.abs(inches) * denom);
    const whole = Math.floor(n / denom);
    let num = n % denom;
    let den = denom;
    if (num) {
      const g = gcd(num, den);
      num /= g;
      den /= g;
    }
    let s;
    if (!num) s = String(whole);
    else if (!whole) s = `${num}/${den}`;
    else s = `${whole}-${num}/${den}`;
    return (neg && n ? '-' : '') + s;
  }

  // settings: { units: 'in' | 'mm', precision: 16 | 32 }
  function format(mm, settings, withUnit = true) {
    const units = (settings && settings.units) || 'in';
    if (!Number.isFinite(mm)) return '–';
    if (units === 'mm') {
      const v = Math.round(mm * 10) / 10;
      return String(v) + (withUnit ? ' mm' : '');
    }
    return fraction(mm / MM_PER_IN, (settings && settings.precision) || 16) + (withUnit ? '"' : '');
  }

  // Parses "12.5", "3/16", "1 1/2", "1-1/2", optionally with a unit suffix
  // ("mm", "in", "\"") that overrides the current units. Returns mm or NaN.
  function parseLength(text, units) {
    let s = String(text).trim().toLowerCase();
    let factor = units === 'mm' ? 1 : MM_PER_IN;
    const m = s.match(/(mm|cm|inches|inch|in|")$/);
    if (m) {
      factor = m[1] === 'mm' ? 1 : m[1] === 'cm' ? 10 : MM_PER_IN;
      s = s.slice(0, -m[1].length).trim();
    }
    if (!s) return NaN;
    let v;
    const mixed = s.match(/^(\d+(?:\.\d+)?)[\s-]+(\d+)\/(\d+)$/);
    const frac = s.match(/^(\d+)\/(\d+)$/);
    if (mixed) v = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    else if (frac) v = Number(frac[1]) / Number(frac[2]);
    else if (/^(\d+\.?\d*|\.\d+)$/.test(s)) v = Number(s);
    else return NaN;
    return Number.isFinite(v) ? v * factor : NaN;
  }

  const inch = (v) => v * MM_PER_IN;

  CB.units = { MM_PER_IN, fraction, format, parseLength, inch };
})(typeof window !== 'undefined' ? window : globalThis);
