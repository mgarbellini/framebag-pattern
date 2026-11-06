/*
 * Framebag Pattern — geometry.js
 *
 * Pure geometry, no DOM access: the same file runs in the browser and in the
 * tests. Points are [x, y] arrays. Units are whatever the caller passes; the
 * app passes millimetres (y grows downwards, like image pixels).
 *
 * Pipeline (spec §4 and §6):
 *   points (corners and smooth points) --> traced pieces (lines and arcs)
 *   --offsets per edge--> finished pieces --rounded corners--> finished path
 *   = stitch line --seam allowance--> cut path
 *
 * Words used here: a segment runs from one traced point to the next; an
 * edge (a "side" in the code) runs from one corner to the next and may hold
 * several segments joined at smooth points. Offsets, lengths and labels
 * belong to edges; the straight/curved choice belongs to segments.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};

  const EPS = 1e-9;
  const DEG = Math.PI / 180;

  // ---------------------------------------------------------------- vectors

  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = (a) => Math.hypot(a[0], a[1]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const perp = (a) => [-a[1], a[0]];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const norm = (a) => {
    const l = Math.hypot(a[0], a[1]);
    return l > EPS ? [a[0] / l, a[1] / l] : [0, 0];
  };
  const rotate = (a, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
  };
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  // ------------------------------------------------------------- formatting

  /** One decimal by default, typographic minus unless another is given. */
  function fmt(v, dec, minus) {
    if (dec === undefined) dec = 1;
    if (!isNum(v)) return '—';
    const tiny = 0.5 * Math.pow(10, -dec);
    let s = (Math.abs(v) < tiny ? 0 : v).toFixed(dec);
    if (s.charAt(0) === '-') s = (minus === undefined ? '−' : minus) + s.slice(1);
    return s;
  }

  /**
   * Parse a number typed by a person: accepts "2,5", "−3" (typographic minus)
   * and "+4". Returns null when the text is empty or not a number.
   */
  function parseNum(text) {
    const s = String(text == null ? '' : text).trim().replace(/−/g, '-').replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
  }

  /** A, B, … Z, AA, AB, … */
  function pointLabel(i) {
    let s = '';
    let k = i + 1;
    while (k > 0) {
      const m = (k - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      k = Math.floor((k - 1) / 26);
    }
    return s;
  }

  // ------------------------------------------------------- polygon basics

  function signedArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function bbox(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }

  function bboxMany(polys) {
    const all = [];
    for (const pl of polys) for (const p of pl) all.push(p);
    return bbox(all);
  }

  /** Intersection of the infinite lines p + t·u and q + s·v, or null if parallel. */
  function lineIntersect(p, u, q, v) {
    const den = cross(u, v);
    if (Math.abs(den) < 1e-12) return null;
    const t = cross(sub(q, p), v) / den;
    return add(p, mul(u, t));
  }

  function orient(a, b, c) { return cross(sub(b, a), sub(c, a)); }

  function onSegment(a, b, p) {
    return Math.min(a[0], b[0]) - EPS <= p[0] && p[0] <= Math.max(a[0], b[0]) + EPS &&
           Math.min(a[1], b[1]) - EPS <= p[1] && p[1] <= Math.max(a[1], b[1]) + EPS;
  }

  /** True if the closed segments p1p2 and p3p4 share at least one point. */
  function segmentsIntersect(p1, p2, p3, p4) {
    const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2);
    const d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
    if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
        ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
    if (Math.abs(d1) <= EPS && onSegment(p3, p4, p1)) return true;
    if (Math.abs(d2) <= EPS && onSegment(p3, p4, p2)) return true;
    if (Math.abs(d3) <= EPS && onSegment(p1, p2, p3)) return true;
    if (Math.abs(d4) <= EPS && onSegment(p1, p2, p4)) return true;
    return false;
  }

  /** Pairs [i, j] of non-adjacent edges of a closed polygon that touch or cross. */
  function selfIntersections(pts) {
    const n = pts.length, out = [];
    if (n < 4) return out;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        if (segmentsIntersect(a, b, pts[j], pts[(j + 1) % n])) out.push([i, j]);
      }
    }
    return out;
  }

  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > p[1]) !== (yj > p[1])) &&
          (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /** Distance from p to the segment ab, and the parameter t of the closest point. */
  function pointSegment(p, a, b) {
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    let t = l2 > EPS ? dot(sub(p, a), ab) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const c = add(a, mul(ab, t));
    return { d: dist(p, c), t, point: c };
  }

  /**
   * Outward unit normal of an edge with unit direction u, for a polygon whose
   * signed area has sign sgn. Works for either y direction.
   */
  function outwardNormal(u, sgn) { return [sgn * u[1], -sgn * u[0]]; }

  // ---------------------------------------------------------- edge shapes
  //
  // An edge, and every piece of the finished outline and the cut line, is a
  //   line  { type: 'line', p0, p1, u }        u: unit direction p0 → p1
  //   arc   { type: 'arc', c, r, a0, sweep }   from c + r·(cos a0, sin a0),
  //                                            turning by the signed sweep
  // In the offset, rounding and seam functions below, the closed chain they
  // work on is a list of pieces; `edge` on an output piece is the index of
  // the input piece it came from and `vertex` the index of the joint where
  // input piece `vertex` starts (its rounding arc).

  const TWO_PI = 2 * Math.PI;
  const angleOf = (v) => Math.atan2(v[1], v[0]);
  const arcAt = (c, r, ang) => [c[0] + r * Math.cos(ang), c[1] + r * Math.sin(ang)];
  const dirOf = (e) => (e.sweep >= 0 ? 1 : -1);

  /** Signed sweep from angle a0 to a1 travelling in direction dir (+1 / −1); never zero. */
  function sweepFrom(a0, a1, dir) {
    let d = (a1 - a0) % TWO_PI;
    if (dir > 0) { if (d <= 0) d += TWO_PI; } else if (d >= 0) d -= TWO_PI;
    return d;
  }

  function arcPoint(e, f) { return arcAt(e.c, e.r, e.a0 + e.sweep * f); }
  function elStart(e) { return e.type === 'line' ? e.p0 : arcPoint(e, 0); }
  function elEnd(e) { return e.type === 'line' ? e.p1 : arcPoint(e, 1); }
  function elLength(e) { return e.type === 'line' ? dist(e.p0, e.p1) : e.r * Math.abs(e.sweep); }
  function lineDir(e) { return e.u || norm(sub(e.p1, e.p0)); }

  /** Unit direction of travel at fraction f along the piece. */
  function elTangent(e, f) {
    if (e.type === 'line') return lineDir(e);
    const ang = e.a0 + e.sweep * f, s = dirOf(e);
    return [-s * Math.sin(ang), s * Math.cos(ang)];
  }

  function line(p0, p1, extra) {
    return Object.assign({ type: 'line', p0, p1, u: norm(sub(p1, p0)) }, extra || {});
  }

  /** Circle through three points, or null when they lie (nearly) on one line. */
  function circleThrough(a, m, b) {
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    const size = Math.max(dist(a, b), dist(a, m), dist(m, b));
    if (!(size > 0) || Math.abs(d) < 1e-12 * size * size) return null;
    const a2 = dot(a, a), m2 = dot(m, m), b2 = dot(b, b);
    const c = [
      (a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d,
      (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d
    ];
    return { c, r: dist(c, a) };
  }

  /**
   * The piece from a to b: the arc through a, m and b, or the straight line
   * when there is no m or m lies within `flat` of the line.
   */
  function edgeEntity(a, b, m, flat) {
    if (m) {
      const chord = dist(a, b);
      const sag = chord > EPS ? Math.abs(cross(sub(b, a), sub(m, a))) / chord : 0;
      if (chord > EPS && sag > (flat == null ? 0.01 : flat)) {
        const cc = circleThrough(a, m, b);
        if (cc) {
          const dir = cross(sub(m, a), sub(b, a)) > 0 ? 1 : -1;
          const a0 = angleOf(sub(a, cc.c));
          return { type: 'arc', c: cc.c, r: cc.r, a0, sweep: sweepFrom(a0, angleOf(sub(b, cc.c)), dir) };
        }
      }
    }
    return line(a, b);
  }

  /** Points along a piece, both ends included; arcs within tol of the true curve. */
  function elPoints(e, tol) {
    if (e.type === 'line') return [e.p0, e.p1];
    const maxStep = e.r > tol ? 2 * Math.acos(1 - tol / e.r) : Math.PI / 2;
    const nseg = Math.max(1, Math.ceil(Math.abs(e.sweep) / maxStep));
    const out = [];
    for (let i = 0; i <= nseg; i++) out.push(arcPoint(e, i / nseg));
    return out;
  }

  /** Polyline through a list of pieces; closed paths do not repeat the first point. */
  function flatten(elements, tol, open) {
    if (!tol) tol = 0.1;
    const out = [];
    const push = (p) => {
      const last = out[out.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - p[1]) > 1e-6) out.push(p);
    };
    for (const e of elements) for (const p of elPoints(e, tol)) push(p);
    if (!open && out.length > 1) {
      const f = out[0], l = out[out.length - 1];
      if (Math.abs(f[0] - l[0]) < 1e-6 && Math.abs(f[1] - l[1]) < 1e-6) out.pop();
    }
    return out;
  }

  function pathLength(elements) {
    let total = 0;
    for (const e of elements) total += elLength(e);
    return total;
  }

  /** The point half way along a chain of pieces, the direction there and the length. */
  function middleOf(elements) {
    const total = pathLength(elements);
    let run = 0;
    for (const e of elements) {
      const L = elLength(e);
      if (L > 0 && run + L >= total / 2 - 1e-12) {
        const f = Math.min(1, Math.max(0, (total / 2 - run) / L));
        return { at: e.type === 'line' ? lerp(e.p0, e.p1, f) : arcPoint(e, f), dir: elTangent(e, f), length: total };
      }
      run += L;
    }
    return null;
  }

  // ----------------------------------------- §4.3 corners and smooth points
  //
  // Every traced point is a corner or smooth. A segment is straight unless
  // one of its ends is smooth and it is not marked straight. At a smooth
  // point the outline keeps one direction: that of a straight neighbouring
  // segment if there is one, otherwise the direction of the circle through
  // the point and its two neighbours. A curved segment with one smooth end
  // is the circular arc that leaves (or reaches) that end in its direction;
  // with two smooth ends it is a biarc, two arcs that meet tangentially. The
  // outline passes through every point, and since every piece is a line or
  // an arc, offsets, rounded corners and the seam allowance stay exact and
  // smooth where the traced outline is smooth.

  function reverseEl(e) {
    if (e.type === 'line') return line(e.p1, e.p0);
    return { type: 'arc', c: e.c, r: e.r, a0: e.a0 + e.sweep, sweep: -e.sweep };
  }

  /**
   * Direction at b of the circle through a, b and c, travelling a → b → c.
   * Each chord is weighted by the length of the other one; collinear points
   * give their common direction.
   */
  function circleTangent(a, b, c) {
    const u = sub(b, a), v = sub(c, b);
    const lu = len(u), lv = len(v);
    if (lu < EPS) return norm(v);
    if (lv < EPS) return mul(u, 1 / lu);
    const t = add(mul(u, lv / lu), mul(v, lu / lv));
    const lt = len(t);
    return lt > 1e-9 * (lu + lv) ? mul(t, 1 / lt) : mul(u, 1 / lu);
  }

  /** The arc that leaves p0 in direction t0 and ends at p1; a line when it bends less than `flat`. */
  function arcLeaving(p0, t0, p1, flat) {
    const dv = sub(p1, p0), L2 = dot(dv, dv), L = Math.sqrt(L2);
    if (L < EPS) return line(p0, p1);
    const h = cross(t0, dv); // distance of p1 from the line through p0 along t0
    const half = Math.atan2(Math.abs(h), dot(t0, dv)); // half the turn of the arc
    // a line only where it is indistinguishable: within `flat` of the arc and
    // leaving within 0.006° of t0, so a smooth joint stays smooth
    if (Math.abs(h) <= 1e-12 * L || ((L / 2) * Math.tan(half / 2) <= flat && half <= 1e-4)) return line(p0, p1);
    const rs = L2 / (2 * h); // signed radius, + when the centre is on the left
    const c = add(p0, mul(perp(t0), rs));
    const a0 = angleOf(sub(p0, c));
    return { type: 'arc', c, r: Math.abs(rs), a0, sweep: sweepFrom(a0, angleOf(sub(p1, c)), rs > 0 ? 1 : -1) };
  }

  /** The arc from p0 that reaches p1 travelling in direction t1. */
  function arcArriving(p0, p1, t1, flat) {
    return reverseEl(arcLeaving(p1, mul(t1, -1), p0, flat));
  }

  /**
   * Two arcs from p0, leaving in direction t0, to p1, arriving in direction
   * t1, meeting tangentially (a biarc). The joint is chosen with equal
   * tangent lengths; if that has no solution (parallel directions pointing
   * away from each other) the joint is the middle of the chord, which is
   * tangential in exactly that case.
   */
  function biarc(p0, t0, p1, t1, flat) {
    const V = sub(p1, p0), L2 = dot(V, V);
    if (L2 < EPS * EPS) return [line(p0, p1)];
    const vt = dot(V, add(t0, t1));
    const den = 2 * (1 - dot(t0, t1));
    const q = vt + Math.sqrt(Math.max(0, vt * vt + den * L2));
    const alpha = q > 1e-12 * Math.sqrt(L2) ? L2 / q : NaN;
    const j = isFinite(alpha)
      ? lerp(add(p0, mul(t0, alpha)), sub(p1, mul(t1, alpha)), 0.5)
      : lerp(p0, p1, 0.5);
    return [arcLeaving(p0, t0, j, flat), arcArriving(j, p1, t1, flat)];
  }

  /**
   * The traced outline as pieces. pts: points in working units; smoothIn:
   * stored smooth flag per point; straightIn: stored straight flag per
   * segment (segment i runs from point i to point i + 1). Returns
   *   flag     smooth flags that can apply (the ends of an open outline are corners)
   *   smooth   smooth points in effect: a smooth point between two straight
   *            segments is a corner
   *   curved   per segment
   *   tangent  per point, the direction at a smooth point (null at corners)
   *   segs     pieces of each segment (one, or two for a biarc)
   *   pieces   all pieces in order; each knows its segment (`seg`) and
   *            whether it starts at a traced point (`first`)
   */
  function outlinePieces(pts, smoothIn, straightIn, closed, flat) {
    const n = pts.length;
    const segCount = closed ? n : Math.max(0, n - 1);
    const prevSeg = (i) => (i - 1 + n) % n;
    const interior = (i) => (closed ? n >= 3 : i > 0 && i < n - 1);
    const flag = pts.map((_, i) => !!smoothIn[i] && interior(i));
    const curved = [];
    for (let j = 0; j < segCount; j++) curved.push((flag[j] || flag[(j + 1) % n]) && !straightIn[j]);
    const smooth = flag.map((f, i) => f && (curved[prevSeg(i)] || curved[i]));
    const tangent = pts.map((q, i) => {
      if (!smooth[i]) return null;
      const a = pts[prevSeg(i)], c = pts[(i + 1) % n];
      if (!curved[prevSeg(i)]) return norm(sub(q, a));
      if (!curved[i]) return norm(sub(c, q));
      return circleTangent(a, q, c);
    });
    const segs = [], pieces = [];
    for (let j = 0; j < segCount; j++) {
      const j1 = (j + 1) % n;
      const a = pts[j], b = pts[j1];
      const ta = curved[j] && smooth[j] ? tangent[j] : null;
      const tb = curved[j] && smooth[j1] ? tangent[j1] : null;
      let list;
      if (ta && tb) list = biarc(a, ta, b, tb, flat);
      else if (ta) list = [arcLeaving(a, ta, b, flat)];
      else if (tb) list = [arcArriving(a, b, tb, flat)];
      else list = [line(a, b)];
      list.forEach((e, k) => {
        e.seg = j;
        e.first = k === 0;
        pieces.push(e);
      });
      segs.push(list);
    }
    return { flag, smooth, curved, tangent, segs, pieces };
  }

  /**
   * Edges from corner to corner. Returns { sides: [{ start, end, segs }],
   * segSide } where segSide[i] is the edge holding segment i. The ends of
   * an open outline count as corners; a closed outline without corners is
   * one edge starting and ending at its first point.
   */
  function outlineSides(n, closed, smooth) {
    const segCount = closed ? n : Math.max(0, n - 1);
    const sides = [], segSide = [];
    if (!segCount) return { sides, segSide };
    let starts = [];
    for (let i = 0; i < n; i++) {
      if (!smooth[i] || (!closed && (i === 0 || i === n - 1))) starts.push(i);
    }
    if (!starts.length) starts = [0];
    const count = closed ? starts.length : starts.length - 1;
    for (let k = 0; k < count; k++) {
      const a = starts[k], b = starts[(k + 1) % starts.length];
      const list = [];
      let i = a;
      do {
        list.push(i);
        segSide[i] = k;
        i = (i + 1) % n;
      } while (i !== b);
      sides.push({ start: a, end: b, segs: list });
    }
    return { sides, segSide };
  }

  // ------------------------------------------------------- intersections

  function lineCircle(p, u, c, r) {
    const f = sub(p, c), b = dot(f, u), q = dot(f, f) - r * r;
    let disc = b * b - q;
    if (disc < 0) {
      if (disc < -1e-9 * Math.max(1, r * r)) return [];
      disc = 0;
    }
    const s = Math.sqrt(disc);
    return [add(p, mul(u, -b - s)), add(p, mul(u, -b + s))];
  }

  function circleCircle(c1, r1, c2, r2) {
    const dv = sub(c2, c1), dd = len(dv);
    if (dd < 1e-12) return [];
    const tol = 1e-9 * Math.max(1, r1 + r2);
    if (dd > r1 + r2 + tol || dd < Math.abs(r1 - r2) - tol) return [];
    const a = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const m = add(c1, mul(dv, a / dd));
    const pr = [-dv[1] / dd, dv[0] / dd];
    return [add(m, mul(pr, h)), sub(m, mul(pr, h))];
  }

  /** Where two pieces meet when extended to full lines and circles, nearest to `near` first. */
  function intersectFull(e1, e2, near) {
    let pts;
    if (e1.type === 'line' && e2.type === 'line') {
      const X = lineIntersect(e1.p0, lineDir(e1), e2.p0, lineDir(e2));
      pts = X ? [X] : [];
    } else if (e1.type === 'line') {
      pts = lineCircle(e1.p0, lineDir(e1), e2.c, e2.r);
    } else if (e2.type === 'line') {
      pts = lineCircle(e2.p0, lineDir(e2), e1.c, e1.r);
    } else {
      pts = circleCircle(e1.c, e1.r, e2.c, e2.r);
    }
    return pts.sort((p, q) => dist(p, near) - dist(q, near));
  }

  /** Pairs of different edges whose pieces touch or cross. tags[i]: edge of segment i. */
  function crossingEdges(pts, tags) {
    const n = pts.length, out = new Set();
    if (n < 4) return [];
    const bb = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      bb.push([Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (tags[i] === tags[j]) continue;
        const A = bb[i], B = bb[j];
        if (A[1] < B[0] || B[1] < A[0] || A[3] < B[2] || B[3] < A[2]) continue;
        if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) out.add(Math.min(tags[i], tags[j]) + ',' + Math.max(tags[i], tags[j]));
      }
    }
    return Array.from(out).map((k) => k.split(',').map(Number));
  }

  /** A closed chain of pieces as one polyline, each segment tagged with its edge. */
  function taggedPolyline(edges, tol) {
    const pts = [], tags = [];
    edges.forEach((e, i) => {
      const ep = elPoints(e, tol);
      for (let k = 0; k < ep.length - 1; k++) {
        const last = pts[pts.length - 1];
        if (last && dist(last, ep[k]) < 1e-6) { tags[tags.length - 1] = i; continue; }
        pts.push(ep[k]);
        tags.push(i);
      }
    });
    return { pts, tags };
  }

  // -------------------------------------------- §6.2 per-edge offsets

  /** A piece moved outward by d: lines shift, arcs stay concentric. */
  function offsetElement(e, d, sgn) {
    if (e.type === 'line') {
      const u = lineDir(e);
      const n = outwardNormal(u, sgn);
      return Object.assign({}, e, { p0: add(e.p0, mul(n, d)), p1: add(e.p1, mul(n, d)), u });
    }
    return Object.assign({}, e, { r: e.r + sgn * dirOf(e) * d });
  }

  /**
   * Move every edge by its own offset and join neighbours where the moved
   * edges intersect. Neighbours meeting almost in line (< 1°, such as the
   * pieces at a smooth point) are joined at the average of their moved ends
   * instead, which with equal offsets lies on both. Where the moved pieces at
   * a corner miss each other, a straight one keeps its moved end and the
   * other piece follows; an arc rebuilt that way keeps its direction at a
   * smooth end. Returns { vertices, edges }.
   */
  function offsetEdges(ents, offsets, sgn) {
    const n = ents.length;
    const moved = ents.map((e, i) => offsetElement(e, offsets[i], sgn));
    const gone = (e) => e.type === 'arc' && e.r <= 1e-9;
    const minSin = Math.sin(DEG);
    const V = [], soft = [];
    for (let j = 0; j < n; j++) {
      const k = (j - 1 + n) % n;
      const P = elStart(ents[j]);
      const tIn = elTangent(ents[k], 1), tOut = elTangent(ents[j], 0);
      const E = add(P, mul(add(mul(outwardNormal(tIn, sgn), offsets[k]), mul(outwardNormal(tOut, sgn), offsets[j])), 0.5));
      const sharp = Math.abs(cross(tIn, tOut)) > minSin;
      let X = null;
      if (sharp && !gone(moved[k]) && !gone(moved[j])) {
        const cand = intersectFull(moved[k], moved[j], E);
        if (cand.length) X = cand[0];
        else if (moved[k].type === 'line') X = moved[k].p1;
        else if (moved[j].type === 'line') X = moved[j].p0;
      }
      soft.push(!sharp);
      V.push(X || E);
    }
    const edges = moved.map((e, i) => {
      const i1 = (i + 1) % n;
      const a = V[i], b = V[i1];
      if (e.type === 'line') return line(a, b, { edge: i });
      if (gone(e)) return { type: 'arc', c: e.c, r: e.r, a0: e.a0, sweep: e.sweep, edge: i, collapsed: true };
      const tol = 1e-7 * Math.max(1, e.r);
      const onA = Math.abs(dist(a, e.c) - e.r) < tol, onB = Math.abs(dist(b, e.c) - e.r) < tol;
      const along = (q) => { const u = norm(sub(q, e.c)), s = dirOf(e); return [-s * u[1], s * u[0]]; };
      let arc, sw;
      if (onB && !onA && soft[i1]) {
        arc = arcArriving(a, b, along(b), 1e-6);
      } else if (onA && !onB && soft[i]) {
        arc = arcLeaving(a, along(a), b, 1e-6);
      } else {
        // the arc through both new ends that follows the moved circle
        const s0 = angleOf(sub(a, e.c));
        sw = sweepFrom(s0, angleOf(sub(b, e.c)), dirOf(e));
        arc = edgeEntity(a, b, arcAt(e.c, e.r, s0 + sw / 2), 1e-6);
      }
      arc.edge = i;
      arc.ref = { sweep: sw != null ? sw : (arc.type === 'arc' ? arc.sweep : 0), orig: ents[i].sweep };
      return arc;
    });
    return { vertices: V, edges };
  }

  /** Spec §6.2 step 4 for edges of any shape. Returns { valid, badEdges }. */
  function validateEdges(orig, fin, sgn) {
    const n = orig.length;
    const bad = new Set();
    for (let i = 0; i < n; i++) {
      const o = orig[i], f = fin[i];
      if (f.collapsed) { bad.add(i); continue; }
      const chord = sub(elEnd(f), elStart(f));
      const u = norm(sub(elEnd(o), elStart(o)));
      // shrunk to (almost) nothing, or turned round; short pieces of a curve may stay short
      if (elLength(f) < 1 && elLength(f) < 0.5 * elLength(o)) bad.add(i);
      if (f.type === 'line' && dot(chord, u) <= 0) bad.add(i);
      if (f.ref && Math.abs(f.ref.sweep) > Math.abs(f.ref.orig) + Math.PI / 2) bad.add(i);
    }
    const t = taggedPolyline(fin, 0.5);
    const area = signedArea(t.pts);
    if ((area >= 0 ? 1 : -1) !== sgn || Math.abs(area) < 1) for (let i = 0; i < n; i++) bad.add(i);
    for (const pair of crossingEdges(t.pts, t.tags)) { bad.add(pair[0]); bad.add(pair[1]); }
    return { valid: bad.size === 0, badEdges: Array.from(bad).sort((a, b) => a - b) };
  }

  function polygonEdges(pts) {
    return pts.map((p, i) => line(p, pts[(i + 1) % pts.length], { edge: i }));
  }

  /** Straight-edged version, kept for the tests and simple callers. */
  function offsetPolygon(pts, offsets, sgn) { return offsetEdges(polygonEdges(pts), offsets, sgn).vertices; }
  function validateOffset(orig, res, sgn) { return validateEdges(polygonEdges(orig), polygonEdges(res), sgn); }

  // -------------------------------------------------- §6.3 fillets

  /** Length used up along piece e between point T on it and e's end (atEnd) or start. */
  function usedAlong(e, T, atEnd) {
    if (e.type === 'line') {
      const u = lineDir(e);
      return atEnd ? dot(sub(e.p1, T), u) : dot(sub(T, e.p0), u);
    }
    const sw = Math.abs(e.sweep), s = dirOf(e), aT = angleOf(sub(T, e.c));
    let d = atEnd ? s * (e.a0 + e.sweep - aT) : s * (aT - e.a0);
    d = ((d % TWO_PI) + TWO_PI) % TWO_PI;
    // off the arc: just past the corner counts as negative, beyond the far end as too long
    if (d > sw + 1e-9 && TWO_PI - d < d - sw) d -= TWO_PI;
    return d * e.r;
  }

  /**
   * The rounding circle of radius r at the corner where piece `inc` ends and
   * piece `out` starts, for a corner turning left (turn = 1) or right (−1).
   * Its centre is r away from both pieces on the inside of the turn.
   */
  function solveFillet(inc, out, r, turn) {
    const inside = (e) => {
      if (e.type === 'line') {
        const u = lineDir(e);
        const nrm = mul(perp(u), turn * r);
        return { type: 'line', p0: add(e.p0, nrm), p1: add(e.p1, nrm), u };
      }
      // the inside of the turn faces away from the arc's centre when −turn·dir = 1
      return { type: 'arc', c: e.c, r: e.r - turn * dirOf(e) * r, a0: e.a0, sweep: e.sweep };
    };
    const A = inside(inc), B = inside(out);
    if ((A.type === 'arc' && A.r <= 1e-9) || (B.type === 'arc' && B.r <= 1e-9)) return null;
    const cand = intersectFull(A, B, elEnd(inc));
    if (!cand.length) return null;
    const C = cand[0];
    const foot = (e) => (e.type === 'line'
      ? add(e.p0, mul(lineDir(e), dot(sub(C, e.p0), lineDir(e))))
      : add(e.c, mul(norm(sub(C, e.c)), e.r)));
    const T1 = foot(inc), T2 = foot(out);
    const useIn = usedAlong(inc, T1, true), useOut = usedAlong(out, T2, false);
    if (useIn < -1e-7 || useOut < -1e-7) return null;
    return { c: C, T1, T2, useIn: Math.max(0, useIn), useOut: Math.max(0, useOut) };
  }

  /**
   * Round the corners of a closed chain of edges (lines or arcs). radii[j]
   * belongs to the corner where edge j starts. Returns { corners, elements,
   * edgeLengths }; elements is the closed path of pieces.
   */
  function filletEdges(fin, radii, sgn) {
    const n = fin.length;
    const tIn = [], tOut = [], phi = [], turn = [], r = [], usable = [];
    for (let j = 0; j < n; j++) {
      const a = elTangent(fin[(j - 1 + n) % n], 1), b = elTangent(fin[j], 0);
      const c = cross(a, b);
      const ph = Math.atan2(Math.abs(c), dot(a, b)); // turning angle, 0..π
      const tr = Math.abs(c) > 1e-9 ? (c > 0 ? 1 : -1) : 0;
      const rj = Math.max(0, isNum(radii[j]) ? radii[j] : 0);
      tIn.push(a); tOut.push(b); phi.push(ph); turn.push(tr); r.push(rj);
      usable.push(rj > 0 && tr !== 0 && (Math.PI - ph) > 1e-3);
    }
    const solve = (j, rad) => solveFillet(fin[(j - 1 + n) % n], fin[j], rad, turn[j]);
    const useOut = (j, rad) => { if (!usable[j] || !(rad > 0)) return 0; const s = solve(j, rad); return s ? s.useOut : Infinity; };
    const useIn = (j, rad) => { if (!usable[j] || !(rad > 0)) return 0; const s = solve(j, rad); return s ? s.useIn : Infinity; };

    // Fit check: the rounding at both ends of an edge must fit on it. Each
    // edge gives a factor scaling both radii proportionally; a corner takes
    // the stricter factor of its two edges.
    const L = [], f = [];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n;
      L.push(elLength(fin[k]));
      const fits = (x) => useOut(k, x * r[k]) + useIn(k1, x * r[k1]) <= L[k] + 1e-9;
      if (fits(1)) { f.push(1); continue; }
      let lo = 0, hi = 1;
      for (let it = 0; it < 50; it++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      f.push(lo);
    }

    const corners = [];
    for (let j = 0; j < n; j++) {
      const s = Math.min(f[(j - 1 + n) % n], f[j]);
      const re = r[j] * s;
      const v = elStart(fin[j]);
      let T1 = v, T2 = v, arc = null;
      const sol = usable[j] && re > 1e-7 ? solve(j, re) : null;
      if (sol) {
        const a0 = angleOf(sub(sol.T1, sol.c));
        const sw = sweepFrom(a0, angleOf(sub(sol.T2, sol.c)), turn[j]);
        if (Math.abs(sw) <= Math.PI + 1e-6) {
          T1 = sol.T1;
          T2 = sol.T2;
          arc = { c: sol.c, r: re, a0, sweep: sw };
        }
      }
      corners.push({
        v, T1, T2, a: tIn[j], b: tOut[j], turn: turn[j], phi: phi[j],
        convex: turn[j] === sgn,
        rRequested: r[j],
        rEffective: usable[j] ? re : r[j],
        clamped: usable[j] && s < 0.999,
        arc
      });
    }

    const elements = [];
    for (let k = 0; k < n; k++) {
      const ck = corners[k], cn = corners[(k + 1) % n];
      if (ck.arc) elements.push({ type: 'arc', c: ck.arc.c, r: ck.arc.r, a0: ck.arc.a0, sweep: ck.arc.sweep, vertex: k });
      const a = ck.T2, b = cn.T1, e = fin[k];
      if (dist(a, b) < 1e-9) continue; // used up by the rounding at both ends
      if (e.type === 'line') {
        elements.push({ type: 'line', p0: a, p1: b, u: lineDir(e), edge: k });
      } else {
        const a0 = angleOf(sub(a, e.c));
        elements.push({ type: 'arc', c: e.c, r: e.r, a0, sweep: sweepFrom(a0, angleOf(sub(b, e.c)), dirOf(e)), edge: k });
      }
    }
    return { corners, elements, edgeLengths: L };
  }

  /** Straight-edged version, kept for the tests and simple callers. */
  function fillet(V, radii, sgn) { return filletEdges(polygonEdges(V), radii, sgn); }

  // -------------------------------------------- §6.4 seam allowance

  /**
   * Offset a rounded path outward by s, piece by piece. Lines shift, arcs
   * stay concentric (r ± s); rounding arcs that vanish leave a sharp corner.
   * Where shifted neighbours no longer meet they are extended or trimmed to
   * their intersection; outer corners whose mitre would reach further than
   * 4·s, and joins with no usable intersection, are bevelled. Pieces that
   * meet tangentially stay joined without any of this.
   * Returns { elements, valid, badCorners, badEdges }: rounding arcs (by
   * vertex) and pieces (by edge) that the seam allowance turns round.
   */
  function seamOffset(fil, s, sgn) {
    const out = { elements: [], valid: true, badCorners: [], badEdges: [] };
    if (!(s > 0)) {
      out.elements = fil.elements.map((e) => Object.assign({}, e));
      return out;
    }
    const badV = new Set(), badE = new Set();
    const flag = (e) => {
      if (e.vertex != null) badV.add(e.vertex);
      else if (e.edge != null) badE.add(e.edge);
    };

    const list = [];
    for (const e of fil.elements) {
      const o = offsetElement(e, s, sgn);
      if (o.type === 'arc') {
        if (o.r <= 1e-6) {
          if (e.vertex == null) flag(e); // a curve too tight; a rounding arc just becomes a sharp corner
          continue;
        }
        o.sa = o.a0;
        o.ea = o.a0 + o.sweep;
        o.dir = dirOf(o);
        o.sweep0 = Math.abs(o.sweep);
      }
      o.src = e;
      list.push(o);
    }
    const m = list.length;
    const startOf = (o) => (o.type === 'line' ? o.p0 : arcAt(o.c, o.r, o.sa));
    const endOf = (o) => (o.type === 'line' ? o.p1 : arcAt(o.c, o.r, o.ea));
    const tanOf = (o, atEnd) => {
      if (o.type === 'line') return o.u;
      const ang = atEnd ? o.ea : o.sa;
      return [-o.dir * Math.sin(ang), o.dir * Math.cos(ang)];
    };
    const minSin = Math.sin(DEG);
    const bevels = new Array(m).fill(null);
    for (let i = 0; i < m; i++) {
      const A = list[i], B = list[(i + 1) % m];
      const pA = endOf(A), pB = startOf(B);
      if (dist(pA, pB) < 1e-6) continue;
      const J = lerp(elEnd(A.src), elStart(B.src), 0.5);
      const c = cross(tanOf(A, true), tanOf(B, false));
      let X = null;
      if (Math.abs(c) > minSin) {
        const cand = intersectFull(A, B, J);
        if (cand.length) X = cand[0];
      }
      const convex = c * sgn > 0;
      if (X && dist(X, J) <= (convex ? 4 * s : 50 * s + 50)) {
        if (A.type === 'line') A.p1 = X; else A.ea = angleOf(sub(X, A.c));
        if (B.type === 'line') B.p0 = X; else B.sa = angleOf(sub(X, B.c));
      } else {
        const v = B.src.vertex != null ? B.src.vertex : B.src.edge;
        bevels[i] = { type: 'line', p0: pA, p1: pB, u: norm(sub(pB, pA)), bevel: true, vertex: v };
      }
    }
    for (let i = 0; i < m; i++) {
      const o = list[i];
      let el = null;
      if (o.type === 'line') {
        if (dot(sub(o.p1, o.p0), o.u) < -1e-6) flag(o.src);
        el = { type: 'line', p0: o.p0, p1: o.p1, u: o.u };
      } else {
        const sw = sweepFrom(o.sa, o.ea, o.dir);
        const closedUp = dist(arcAt(o.c, o.r, o.sa), arcAt(o.c, o.r, o.ea)) < 1e-6;
        if (!(closedUp && Math.abs(sw) > Math.PI)) {
          if (Math.abs(sw) > o.sweep0 + Math.PI / 2) flag(o.src);
          el = { type: 'arc', c: o.c, r: o.r, a0: o.sa, sweep: sw };
        }
      }
      if (el) {
        if (o.src.edge != null) el.edge = o.src.edge;
        if (o.src.vertex != null) el.vertex = o.src.vertex;
        out.elements.push(el);
      }
      if (bevels[i]) out.elements.push(bevels[i]);
    }
    const sorted = (set) => Array.from(set).sort((a, b) => a - b);
    out.badCorners = sorted(badV);
    out.badEdges = sorted(badE);
    out.valid = !out.badCorners.length && !out.badEdges.length;
    return out;
  }

  // --------------------------------------------------------- whole project

  function edgeName(labels, i) {
    return labels[i] + '–' + labels[(i + 1) % labels.length];
  }

  // Lengths in messages: in the unit chosen in the app (units.js), else mm.
  const lenText = (v) => (FB.units ? FB.units.len(v) : fmt(v) + ' mm');
  const fineText = (v) => (FB.units ? FB.units.fine(v, 2) : fmt(v, 2) + ' mm');

  function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  const uniq = (a) => Array.from(new Set(a)).sort((x, y) => x - y);

  /**
   * Everything the UI and the PDF need, derived from the saved project.
   * Lengths are in mm when the scale is set, otherwise in image px.
   *
   * Per point:   labels, tracedPx, traced, smooth, smoothFlag, corners
   * Per segment: curved, tracedLens, finishedLens, edgeFlatPx, offsets,
   *              overrides; badEdges lists segments
   * Per edge:    sides [{ start, end, segs, name, label, title, curved,
   *              tracedLen, finishedLen, offset, override, flatPx }], segSide
   *              (name: the corner letters "A–D"; label: the name given to
   *              the edge, such as "Top tube", or ''; title: label or name)
   */
  function computeDerived(p) {
    const outline = p.outline || {};
    const pts = outline.points || [];
    const n = pts.length;
    const d = {
      n,
      closed: !!outline.closed && n >= 3,
      labels: pts.map((_, i) => pointLabel(i)),
      tracedPx: pts.map((q) => [q.x, q.y]),
      hasScaleLine: false,
      hasScale: false,
      scale: null,
      unit: 'px',
      errors: [],
      warnings: [],
      scaleWarnings: [],
      badEdges: [],
      badCorners: [],
      geometryOk: false,
      ok: false,
      blocker: ''
    };

    const sc = p.scale;
    if (sc && sc.p1 && sc.p2) {
      d.hasScaleLine = true;
      d.scaleLinePx = dist(sc.p1, sc.p2);
      if (isNum(sc.lengthMm) && sc.lengthMm > 0 && d.scaleLinePx > 1e-6) {
        d.hasScale = true;
        d.scale = sc.lengthMm / d.scaleLinePx; // mm per image px
        d.unit = 'mm';
      }
    }

    const k = d.hasScale ? d.scale : 1;
    const toPx = (q) => [q[0] / k, q[1] / k];
    d.traced = d.tracedPx.map((q) => [q[0] * k, q[1] * k]);
    d.edgeCount = d.closed ? n : Math.max(0, n - 1);

    // traced outline in working units (mm, or px without a scale)
    const straight = outline.edgeStraight || [];
    const ol = outlinePieces(d.traced, pts.map((q) => q.smooth === true), pts.map((_, i) => straight[i] === true), d.closed, 0.01);
    d.smoothFlag = ol.flag;
    d.smooth = ol.smooth;
    d.curved = ol.curved;
    d.tracedPieces = ol.pieces;
    d.tracedLens = ol.segs.map(pathLength);
    d.tracedFlat = d.edgeCount ? flatten(ol.pieces, 0.1, !d.closed) : d.traced.slice();
    d.tracedPathPx = d.tracedFlat.map(toPx);
    d.edgeFlatPx = ol.segs.map((list) => flatten(list, 0.1, true).map(toPx));

    // edges from corner to corner, each with one offset
    const sd = outlineSides(n, d.closed, d.smooth);
    const uniform = isNum(outline.uniformOffset) ? outline.uniformOffset : 0;
    const eo = outline.edgeOffsets || [];
    const en = outline.edgeNames || [];
    d.segSide = sd.segSide;
    d.sides = sd.sides.map((s) => {
      let v = null;
      for (const i of s.segs) if (isNum(eo[i])) { v = eo[i]; break; }
      // like the offset, an edge's name is the first one set on its segments
      let label = '';
      for (const i of s.segs) if (typeof en[i] === 'string' && en[i].trim()) { label = en[i].trim(); break; }
      const name = d.labels[s.start] + '–' + d.labels[s.end];
      const flat = [];
      for (const i of s.segs) {
        for (const q of d.edgeFlatPx[i]) {
          const l = flat[flat.length - 1];
          if (!l || Math.abs(l[0] - q[0]) > 1e-6 || Math.abs(l[1] - q[1]) > 1e-6) flat.push(q);
        }
      }
      return {
        start: s.start,
        end: s.end,
        segs: s.segs,
        name,
        label,
        title: label || name,
        curved: s.segs.some((i) => d.curved[i]),
        tracedLen: s.segs.reduce((t, i) => t + d.tracedLens[i], 0),
        finishedLen: null,
        override: v != null,
        offset: v != null ? v : uniform,
        flatPx: flat
      };
    });
    d.overrides = [];
    d.offsets = [];
    for (let i = 0; i < d.edgeCount; i++) {
      const s = d.sides[d.segSide[i]];
      d.overrides.push(s.override);
      d.offsets.push(s.offset);
    }

    if (d.hasScale && n >= 2) {
      if (d.scale > 1) {
        d.scaleWarnings.push('Low photo resolution: 1 px ≈ ' + fineText(d.scale) + '. Precision may be limited.');
      }
      const bb = bbox(d.traced);
      if (sc.lengthMm < 0.1 * Math.max(bb.w, bb.h)) {
        d.scaleWarnings.push('The reference is short compared to the outline, so clicking errors are magnified.');
      }
    }

    // ---- validity of the traced outline itself
    let tracedValid = false;
    if (d.closed) {
      d.sgn = signedArea(d.tracedFlat) >= 0 ? 1 : -1;
      const minEdge = d.hasScale ? 0.1 : 0.5;
      const short = [];
      for (let i = 0; i < n; i++) if (dist(d.traced[i], d.traced[(i + 1) % n]) < minEdge) short.push(i);
      const tp = taggedPolyline(ol.pieces, 0.5);
      const crossings = crossingEdges(tp.pts, tp.tags.map((t) => ol.pieces[t].seg));
      if (short.length) {
        d.badEdges = short;
        d.errors.push({ section: 'outline', text: 'Points ' + joinNames(short.map((i) => edgeName(d.labels, i).replace('–', ' and '))) + ' are on top of each other. Delete one of them.' });
      } else if (crossings.length) {
        const bad = new Set();
        crossings.forEach((c) => { bad.add(c[0]); bad.add(c[1]); });
        d.badEdges = uniq(Array.from(bad));
        d.errors.push({ section: 'outline', text: 'The outline crosses itself (' + joinNames(d.badEdges.map((i) => edgeName(d.labels, i))) + '). Move the points so the edges don’t cross.' });
      } else if (Math.abs(signedArea(d.tracedFlat)) < 1e-6) {
        d.errors.push({ section: 'outline', text: 'All points lie on one straight line.' });
      } else {
        tracedValid = true;
      }
    }

    // ---- inside angle at each corner, between the directions arriving and leaving
    d.angles = pts.map(() => null);
    for (let i = 0; i < n; i++) {
      const before = d.closed ? (i - 1 + n) % n : i - 1;
      if (d.smooth[i] || before < 0 || (!d.closed && i >= n - 1)) continue;
      const inc = ol.segs[before], out = ol.segs[i];
      if (!inc || !out) continue;
      const tIn = elTangent(inc[inc.length - 1], 1), tOut = elTangent(out[0], 0);
      if (!len(tIn) || !len(tOut)) continue;
      const turn = Math.atan2(cross(tIn, tOut), dot(tIn, tOut)) / DEG;
      d.angles[i] = d.closed ? 180 - d.sgn * turn : 180 - Math.abs(turn);
    }

    // ---- finished outline and cut line (need mm)
    if (tracedValid && d.hasScale) {
      const P = ol.pieces;
      // the traced point where piece kk starts, or −1 for the joint inside a biarc
      const pointOf = (kk) => (P[kk] && P[kk].first ? P[kk].seg : -1);
      const fe = offsetEdges(P, P.map((e) => d.offsets[e.seg]), d.sgn);
      const val = validateEdges(P, fe.edges, d.sgn);
      d.finishedPieces = fe.edges;
      d.finishedLens = ol.segs.map(() => 0);
      fe.edges.forEach((e, kk) => { d.finishedLens[P[kk].seg] += elLength(e); });
      d.sides.forEach((s) => { s.finishedLen = s.segs.reduce((t, i) => t + d.finishedLens[i], 0); });
      if (!val.valid) {
        d.badEdges = uniq(val.badEdges.map((kk) => P[kk].seg));
        const names = uniq(d.badEdges.map((i) => d.segSide[i])).map((s) => d.sides[s].title);
        d.errors.push({ section: 'offset', text: 'The offsets collapse ' + joinNames(names) + ' or make the outline cross itself. Reduce the offsets.' });
      } else {
        const radii = P.map((e, kk) => {
          const j = pointOf(kk);
          if (j < 0 || d.smooth[j]) return 0;
          return isNum(pts[j].radius) ? Math.max(0, pts[j].radius) : 0;
        });
        const fil = filletEdges(fe.edges, radii, d.sgn);
        d.corners = [];
        fil.corners.forEach((c, kk) => {
          const j = pointOf(kk);
          if (j < 0) return;
          d.corners[j] = Object.assign({}, c, { smooth: d.smooth[j] });
          if (c.clamped) {
            d.warnings.push({ section: 'corner', vertex: j, text: 'Radius at ' + d.labels[j] + ' reduced to ' + lenText(c.rEffective) + ' to fit.' });
          }
        });
        fil.elements.forEach((el) => {
          if (el.edge != null) {
            el.seg = P[el.edge].seg;
            el.side = d.segSide[el.seg];
          }
          if (el.vertex != null) el.point = pointOf(el.vertex);
        });
        d.finishedPath = fil.elements;
        d.finishedFlat = flatten(fil.elements, 0.1);
        d.perimeter = pathLength(fil.elements);
        const fb = bbox(d.finishedFlat);
        d.finishedSize = [fb.w, fb.h];
        const s = isNum(p.seamAllowance) ? Math.max(0, p.seamAllowance) : 0;
        const cut = seamOffset(fil, s, d.sgn);
        if (!cut.valid) {
          d.badCorners = uniq(cut.badCorners.map(pointOf).filter((j) => j >= 0));
          d.badEdges = uniq(cut.badEdges.map((kk) => P[kk].seg));
          const parts = [];
          if (d.badCorners.length) parts.push((d.badCorners.length > 1 ? 'corners ' : 'corner ') + joinNames(d.badCorners.map((j) => d.labels[j])));
          if (d.badEdges.length) parts.push((d.badEdges.length > 1 ? 'edges ' : 'edge ') + joinNames(d.badEdges.map((i) => edgeName(d.labels, i))));
          d.errors.push({ section: 'seam', text: 'The seam allowance is too large for ' + parts.join(' and ') + '.' });
        } else {
          d.cutPath = cut.elements;
          d.cutFlat = flatten(cut.elements, 0.1);
          const bb = bbox(d.cutFlat);
          d.cutSize = [bb.w, bb.h];
          d.cutArea = Math.abs(signedArea(d.cutFlat));
          d.geometryOk = true;
          d.design = FB.geom.designGeometry ? FB.geom.designGeometry(d, p, s) : null;
          if (d.design && d.design.error) d.errors.push({ section: 'seam', text: d.design.error });
          if (d.design && d.design.warning) d.warnings.push({ section: 'design', text: d.design.warning });
        }
      }
    }

    // ---- what still blocks the export (first reason wins)
    if (!p.image) d.blocker = 'Load a photo to start.';
    else if (!d.hasScale) d.blocker = 'Set the scale to export.';
    else if (n === 0) d.blocker = 'Trace the outline to export.';
    else if (!d.closed) d.blocker = 'Close the outline to export.';
    else if (!d.geometryOk || (d.design && d.design.error)) d.blocker = 'Fix the errors in the panel to export.';
    d.ok = !d.blocker;
    return d;
  }

  /** The finished pieces of edge `side`, in order along the stitch line between its corners. */
  function sideElements(d, side) {
    if (!d.finishedPath || !d.sides[side]) return [];
    const N = d.tracedPieces.length;
    const first = d.tracedPieces.findIndex((e) => e.first && e.seg === d.sides[side].segs[0]);
    return d.finishedPath
      .filter((e) => e.side === side)
      .sort((a, b) => ((a.edge - first + N) % N) - ((b.edge - first + N) % N));
  }

  // ------------------------------------------------- v0.7 the pattern label

  /**
   * Where a w × h block, upright in the coordinates of poly, fits inside the
   * closed polygon poly with `clear` all round: the free spot furthest from
   * the outline, searched on a grid and then refined. null if it fits nowhere.
   */
  function placeBlock(poly, w, h, clear) {
    if (!poly || poly.length < 3) return null;
    const bb = bbox(poly);
    const hw = w / 2 + clear, hh = h / 2 + clear;
    if (bb.w < 2 * hw || bb.h < 2 * hh) return null;
    const segs = segmentsOf([poly]);
    const fits = (c) => {
      const x0 = c[0] - hw, x1 = c[0] + hw, y0 = c[1] - hh, y1 = c[1] + hh;
      if (!pointInPolygon([x0, y0], poly) || !pointInPolygon([x1, y0], poly) ||
          !pointInPolygon([x1, y1], poly) || !pointInPolygon([x0, y1], poly)) return false;
      for (const s of segs) if (segHitsRect(s, x0, y0, x1, y1)) return false;
      return true;
    };
    const room = (c) => {
      let m = Infinity;
      for (const s of segs) m = Math.min(m, pointSegment(c, [s[0], s[1]], [s[2], s[3]]).d);
      return m;
    };
    let best = null;
    const search = (x0, y0, x1, y1, st) => {
      for (let y = y0; y <= y1 + 1e-9; y += st) {
        for (let x = x0; x <= x1 + 1e-9; x += st) {
          const c = [x, y];
          if (!fits(c)) continue;
          const r = room(c);
          if (!best || r > best.room) best = { at: c, room: r };
        }
      }
    };
    const coarse = Math.max(2, Math.min(bb.w, bb.h) / 40);
    search(bb.minX + hw, bb.minY + hh, bb.maxX - hw, bb.maxY - hh, coarse);
    if (best) {
      const c = best.at;
      search(c[0] - coarse, c[1] - coarse, c[0] + coarse, c[1] + coarse, coarse / 5);
    }
    return best ? best.at : null;
  }

  // ------------------------------------------------------- §7.1 page grid

  const PAGE = { portrait: [210, 297], landscape: [297, 210] };

  /**
   * Paper sizes, portrait, in mm (spec v0.7 C). Metric: the A series; imperial:
   * US Letter, Legal and Tabloid, and the Arch sizes copy shops print on.
   */
  const PAPERS = [
    { id: 'A4', name: 'A4', w: 210, h: 297, system: 'metric' },
    { id: 'A3', name: 'A3', w: 297, h: 420, system: 'metric' },
    { id: 'A2', name: 'A2', w: 420, h: 594, system: 'metric' },
    { id: 'A1', name: 'A1', w: 594, h: 841, system: 'metric' },
    { id: 'A0', name: 'A0', w: 841, h: 1189, system: 'metric' },
    { id: 'Letter', name: 'Letter', w: 215.9, h: 279.4, system: 'imperial' },
    { id: 'Legal', name: 'Legal', w: 215.9, h: 355.6, system: 'imperial' },
    { id: 'Tabloid', name: 'Tabloid', w: 279.4, h: 431.8, system: 'imperial' },
    { id: 'ArchC', name: 'Arch C', w: 457.2, h: 609.6, system: 'imperial' },
    { id: 'ArchD', name: 'Arch D', w: 609.6, h: 914.4, system: 'imperial' },
    { id: 'ArchE', name: 'Arch E', w: 914.4, h: 1219.2, system: 'imperial' }
  ];

  /** The paper with this id, or A4. */
  function paperById(id) {
    for (const p of PAPERS) if (p.id === id) return p;
    return PAPERS[0];
  }

  /** Sheets larger than A3 and Tabloid, printed at a copy shop or on a plotter. */
  const isLargePaper = (p) => Math.min(p.w, p.h) > 300;

  function segmentsOf(polys) {
    const segs = [];
    for (const pl of polys) {
      for (let i = 0, n = pl.length; i < n; i++) {
        const a = pl[i], b = pl[(i + 1) % n];
        segs.push([a[0], a[1], b[0], b[1],
          Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
      }
    }
    return segs;
  }

  function segHitsRect(s, x0, y0, x1, y1) {
    if (s[5] < x0 || s[4] > x1 || s[7] < y0 || s[6] > y1) return false;
    const inR = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    if (inR(s[0], s[1]) || inR(s[2], s[3])) return true;
    const p = [s[0], s[1]], q = [s[2], s[3]];
    return segmentsIntersect(p, q, [x0, y0], [x1, y0]) || segmentsIntersect(p, q, [x1, y0], [x1, y1]) ||
           segmentsIntersect(p, q, [x1, y1], [x0, y1]) || segmentsIntersect(p, q, [x0, y1], [x0, y0]);
  }

  /**
   * Tile grid for one rotation and page orientation. A tile is kept when the
   * pattern reaches into its own part of the grid (the area no neighbour on
   * the right or below overlaps), so every part of the piece is printed once
   * and no page holds only a sliver that its neighbour already shows.
   */
  function gridFor(bb, segs, cutPolys, size, margin, overlap, pad) {
    const cw = size[0] - 2 * margin, ch = size[1] - 2 * margin;
    const sx = cw - overlap, sy = ch - overlap;
    if (sx < 10 || sy < 10) return null;
    const W = bb.w + 2 * pad, H = bb.h + 2 * pad;
    const cols = Math.max(1, Math.ceil((W - overlap) / sx - 1e-9));
    const rows = Math.max(1, Math.ceil((H - overlap) / sy - 1e-9));
    const gx0 = bb.minX - pad - (cols * sx + overlap - W) / 2;
    const gy0 = bb.minY - pad - (rows * sy + overlap - H) / 2;
    const tiles = [];
    let count = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x0 = gx0 + col * sx, y0 = gy0 + row * sy;
        const x1 = x0 + (col < cols - 1 ? sx : cw), y1 = y0 + (row < rows - 1 ? sy : ch);
        let inc = false;
        for (let i = 0; i < segs.length && !inc; i++) if (segHitsRect(segs[i], x0, y0, x1, y1)) inc = true;
        if (!inc && cutPolys) for (const cp of cutPolys) if (pointInPolygon([(x0 + x1) / 2, (y0 + y1) / 2], cp)) inc = true;
        tiles.push({ col, row, x0, y0, included: inc });
        if (inc) count++;
      }
    }
    return { pageW: size[0], pageH: size[1], cw, ch, sx, sy, cols, rows, gx0, gy0, margin, overlap, pad, tiles, count };
  }

  /**
   * Choose rotation (0–179° in 1° steps) and orientation with the fewest
   * pages; ties keep the smallest angle, then portrait (spec §7.1).
   * polys: closed polylines that will be printed; cutPoly: the cut line, or
   * a list of them for a panel in pieces.
   * opts.paper: [width, height] of the portrait sheet in mm (A4 if missing).
   */
  function planLayout(polys, cutPoly, opts) {
    const margin = opts.margin, overlap = opts.overlap;
    const pad = opts.pad == null ? 5 : opts.pad;
    const paper = opts.paper || PAGE.portrait;
    const sizes = { portrait: [paper[0], paper[1]], landscape: [paper[1], paper[0]] };
    const angles = [];
    if (opts.optimise) for (let a = 0; a < 180; a++) angles.push(a);
    else angles.push(0);
    const orients = opts.optimise ? ['portrait', 'landscape'] : ['portrait'];
    const cps = !cutPoly || !cutPoly.length ? [] : (Array.isArray(cutPoly[0][0]) ? cutPoly : [cutPoly]);
    let best = null;
    for (const deg of angles) {
      const rad = deg * DEG;
      const rp = polys.map((pl) => pl.map((q) => rotate(q, rad)));
      const rc = cps.map((cp) => cp.map((q) => rotate(q, rad)));
      const segs = segmentsOf(rp);
      const bb = bboxMany(rp);
      for (const o of orients) {
        const g = gridFor(bb, segs, rc, sizes[o], margin, overlap, pad);
        if (!g) continue;
        if (!best || g.count < best.count) {
          g.angle = deg;
          g.orientation = o;
          best = g;
        }
      }
    }
    return best;
  }

  FB.fmt = fmt;
  FB.parseNum = parseNum;
  FB.geom = {
    EPS, DEG,
    add, sub, mul, dot, cross, len, dist, perp, lerp, norm, rotate, isNum,
    fmt, parseNum, pointLabel, edgeName, joinNames,
    signedArea, bbox, bboxMany, lineIntersect, segmentsIntersect, selfIntersections,
    pointInPolygon, pointSegment, outwardNormal,
    offsetPolygon, validateOffset, fillet, seamOffset, arcPoint, flatten, pathLength, middleOf,
    sweepFrom, circleThrough, edgeEntity, elPoints, elStart, elEnd, elLength, elTangent,
    intersectFull, offsetEdges, validateEdges, filletEdges, crossingEdges,
    reverseEl, circleTangent, arcLeaving, arcArriving, biarc, outlinePieces, outlineSides,
    computeDerived, sideElements, planLayout, gridFor, segmentsOf, segHitsRect, PAGE,
    PAPERS, paperById, isLargePaper, placeBlock,
    // 02 Design (chains, marks, the split line, the gusset) is added by design.js
  };
})(typeof window !== 'undefined' ? window : globalThis);
