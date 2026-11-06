/*
 * Framebag Pattern — units.js
 *
 * Millimetres or inches (spec v0.7 B). Everything is stored in mm, so the
 * choice never changes the project: this module only shows and reads lengths.
 *
 *   metric    one decimal, "412.5 mm"
 *   imperial  inches in sixteenths, as on a tape measure: "16 1/4 in"
 *
 * Inches can be typed as "16 1/4", "16-1/4", "16.25" or "1/4". A length typed
 * with its unit ("12 mm", "1.5 cm", "2 in", 2") is read in that unit in either
 * system. The choice is remembered by the browser, like the display toggles.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const KEY = 'framebag-pattern.units';
  const IN = 25.4;          // mm per inch
  const DIV = 16;           // inches are shown to the nearest 1/16
  const FACTOR = { mm: 1, cm: 10, m: 1000, in: IN };

  let system = 'metric';
  try {
    const v = root.localStorage && root.localStorage.getItem(KEY);
    if (v === 'metric' || v === 'imperial') system = v;
  } catch (e) { /* metric */ }

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const imperial = () => system === 'imperial';
  const unit = () => (imperial() ? 'in' : 'mm');

  function decimal(v, dec, minus) {
    if (FB.fmt) return FB.fmt(v, dec, minus);
    return isNum(v) ? v.toFixed(dec) : '—';
  }

  /** mm as inches to the nearest 1/16: "16 1/4", "3/8", "−1 1/2", "0". */
  function fraction(mm, minus) {
    if (!isNum(mm)) return '—';
    const n = Math.round(Math.abs(mm) / IN * DIV);
    if (!n) return '0';
    const whole = Math.floor(n / DIV);
    let num = n % DIV, den = DIV;
    while (num && num % 2 === 0) { num /= 2; den /= 2; }
    const sign = mm < 0 ? (minus === undefined ? '−' : minus) : '';
    if (!num) return sign + whole;
    return sign + (whole ? whole + ' ' : '') + num + '/' + den;
  }

  /** A length in the current unit, without the unit: for fields and tables. */
  function num(mm, dec, minus) {
    if (!isNum(mm)) return '—';
    return imperial() ? fraction(mm, minus) : decimal(mm, dec == null ? 1 : dec, minus);
  }

  /** A length with its unit: "412.5 mm", "16 1/4 in". */
  function len(mm, dec, minus) {
    if (!isNum(mm)) return '—';
    return num(mm, dec, minus) + ' ' + unit();
  }

  /** A small length with decimals, such as the photo's resolution: "0.50 mm", "0.020 in". */
  function fine(mm, dec) {
    if (dec == null) dec = 3;
    return imperial() ? decimal(mm / IN, dec + 1) + ' in' : decimal(mm, dec) + ' mm';
  }

  /** An area without its unit, for tables: m² to three decimals, or ft² to two. */
  function areaNum(mm2) {
    if (!isNum(mm2)) return '—';
    return imperial() ? decimal(mm2 / (IN * IN * 144), 2) : decimal(mm2 / 1e6, 3);
  }

  const areaUnit = () => (imperial() ? 'ft²' : 'm²');

  /** An area with its unit: "0.241 m²", "2.60 ft²". */
  function area(mm2) {
    if (!isNum(mm2)) return '—';
    return areaNum(mm2) + ' ' + areaUnit();
  }

  function parseDecimal(s) {
    s = s.replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
  }

  /** "16 1/4", "16-1/4", "−1 1/2", "1/4" or "16.25", in inches. */
  function parseInches(s) {
    const d = parseDecimal(s);
    if (d != null) return d;
    const m = /^([-+])?\s*(?:(\d+)\s*(?:-|\s)\s*)?(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (!m) return null;
    const den = parseInt(m[4], 10);
    if (!den) return null;
    const v = (m[2] ? parseInt(m[2], 10) : 0) + parseInt(m[3], 10) / den;
    return m[1] === '-' ? -v : v;
  }

  /**
   * A length typed by a person, in mm, or null. Accepts a decimal comma, the
   * typographic minus, fractions of an inch, and an explicit unit.
   */
  function parse(text) {
    let s = String(text == null ? '' : text).trim().toLowerCase()
      .replace(/[−–]/g, '-').replace(/[″”“]/g, '"').replace(/''/g, '"');
    if (!s) return null;
    let u = null;
    const m = /^(.*?)\s*(mm|cm|m|inches|inch|in|")$/.exec(s);
    if (m && m[1]) {
      s = m[1].trim();
      u = m[2] === '"' || m[2].charAt(0) === 'i' ? 'in' : m[2];
    }
    if (!u) u = unit();
    const v = u === 'in' ? parseInches(s) : parseDecimal(s);
    return v == null ? null : v * FACTOR[u];
  }

  /** The arrow-key step of a field, in mm: the field's own step, or 1/16 in (Shift: 1/2 in). */
  function step(mmStep, big) {
    return imperial() ? IN / DIV * (big ? 8 : 1) : mmStep * (big ? 10 : 1);
  }

  /** A value rounded to what the unit shows: 0.01 mm, or 1/16 in. */
  function snap(mm) {
    return imperial() ? Math.round(mm / IN * DIV) * IN / DIV : Math.round(mm * 100) / 100;
  }

  /** Round starting values for a new project in the chosen unit. */
  function defaults() {
    return imperial()
      ? { seamAllowance: 3 / 8 * IN, marginMm: 3 / 8 * IN, overlapMm: 5 / 8 * IN, paper: 'Letter', gussetWidth: 2.5 * IN, strapWidth: IN }
      : { seamAllowance: 10, marginMm: 10, overlapMm: 15, paper: 'A4', gussetWidth: 60, strapWidth: 25 };
  }

  function set(s) {
    if ((s !== 'metric' && s !== 'imperial') || s === system) return;
    system = s;
    try { root.localStorage.setItem(KEY, s); } catch (e) { /* this visit only */ }
    if (FB.bus) FB.bus.emit('units', s);
  }

  /** Run fn with another unit system, without remembering it (tests). */
  function using(s, fn) {
    const old = system;
    system = s;
    try { return fn(); } finally { system = old; }
  }

  FB.units = {
    IN,
    system: () => system,
    imperial,
    unit,
    num,
    len,
    fine,
    area,
    areaNum,
    areaUnit,
    fraction,
    parse,
    step,
    snap,
    defaults,
    set,
    using
  };
})(typeof window !== 'undefined' ? window : globalThis);
