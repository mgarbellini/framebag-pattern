/*
 * Framebag Pattern — design.js
 *
 * 02 Design as geometry (spec v1.0): from the stitch line of the traced
 * outline to the bag's pieces, their notches and the gusset. Pure functions,
 * added to FB.geom. Lengths in mm.
 *
 *   chain     a closed run of lines and arcs, measured by arc length s from
 *             its start, in the direction the outline was traced
 *   stations  where the corner notches go: the middle of a rounded corner,
 *             or a sharp corner itself; and the ends of a split line
 *   runs      the stitch line from one station to the next
 *   split     a line across the panel, between two points of the stitch
 *             line: both pieces kept (split) or only one (clip)
 *   bag       the outline the gusset goes round: the whole stitch line, or
 *             the piece a clip keeps
 *   marks     points placed on the stitch line: notches, straps and bolt
 *             holes. The photo holds them (image px), so they stay where
 *             they are on the frame when offsets or corners change
 *   gusset    one strip round the bag, from where its ends meet round to it
 *             again, with the seam allowance at both ends and both edges
 *   pieces    the side panel's pieces to print: each with its cut line,
 *             notches and corner letters
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const G = FB.geom;
  const { add, sub, mul, dot, cross, dist, norm, lerp, isNum, arcPoint, elStart, elLength, elTangent,
    outwardNormal, flatten, seamOffset, bbox, signedArea, pointLabel, middleOf } = G;

  /** Centre to centre, mm: the double notch where the gusset strip's ends meet. */
  const NOTCH_PAIR = 4;
  /** A notch is drawn at least this long (mm), so it shows with a narrow allowance. */
  const NOTCH_MIN = 3;
  /** A split line's end this close to a corner along the stitch line (mm) is at the corner. */
  const CORNER_SNAP = 0.5;
  const TAGS = ['edge', 'vertex', 'seg', 'side', 'point', 'split'];

  // ------------------------------------------------------------ chains

  function chain(els) {
    const starts = [];
    let total = 0;
    for (const e of els) { starts.push(total); total += elLength(e); }
    return { els, starts, total };
  }

  /** s brought into [0, total); a value a hair short of total is 0. */
  function wrapIn(total, s) {
    const w = ((s % total) + total) % total;
    return w > total - 1e-9 ? 0 : w;
  }

  /** The piece of a closed chain at arc length s (wrapping): its index, the point and the direction there. */
  function chainAt(els, starts, total, s) {
    s = ((s % total) + total) % total;
    let lo = 0, hi = els.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= s) lo = mid; else hi = mid - 1;
    }
    const e = els[lo], L = elLength(e);
    const f = L > 0 ? Math.min(1, Math.max(0, (s - starts[lo]) / L)) : 0;
    return { i: lo, at: e.type === 'line' ? lerp(e.p0, e.p1, f) : arcPoint(e, f), dir: elTangent(e, f) };
  }

  /** The part of piece e from fraction f0 to f1, with e's tags. */
  function subPiece(e, f0, f1) {
    const out = e.type === 'line'
      ? { type: 'line', p0: lerp(e.p0, e.p1, f0), p1: lerp(e.p0, e.p1, f1), u: e.u || norm(sub(e.p1, e.p0)) }
      : { type: 'arc', c: e.c, r: e.r, a0: e.a0 + e.sweep * f0, sweep: e.sweep * (f1 - f0) };
    for (const k of TAGS) if (e[k] != null) out[k] = e[k];
    return out;
  }

  /** The pieces of a closed chain from arc length s over length len, wrapping round. */
  function chainPart(els, starts, total, s, len) {
    const out = [];
    let i = chainAt(els, starts, total, s).i;
    let a = ((s % total) + total) % total, left = len;
    for (let guard = 0; left > 1e-9 && guard < 2 * els.length + 2; guard++) {
      const e = els[i], L = elLength(e), off = Math.max(0, a - starts[i]);
      const take = Math.min(L - off, left);
      if (take > 1e-9 && L > 0) out.push(subPiece(e, off / L, (off + take) / L));
      left -= Math.max(0, take);
      i = (i + 1) % els.length;
      a = starts[i];
    }
    return out;
  }

  const at = (c, s) => chainAt(c.els, c.starts, c.total, s);
  const part = (c, s, len) => chainPart(c.els, c.starts, c.total, s, len);
  const straight = (p0, p1) => ({ type: 'line', p0, p1, u: norm(sub(p1, p0)), split: true });

  /** Where the angle `ang` falls along arc e, as a fraction, or the nearer end. */
  function arcFraction(e, ang) {
    const dir = e.sweep >= 0 ? 1 : -1, sw = Math.abs(e.sweep);
    let rel = ((ang - e.a0) * dir) % (2 * Math.PI);
    if (rel < 0) rel += 2 * Math.PI;
    if (rel <= sw) return { f: sw > 0 ? rel / sw : 0, inside: true };
    return { f: rel - sw < 2 * Math.PI - rel ? 1 : 0, inside: false };
  }

  /** The point of the chain nearest to q: its arc length, the distance and the point. */
  function nearestOn(c, q) {
    let best = null;
    c.els.forEach((e, i) => {
      let f;
      if (e.type === 'line') {
        const v = sub(e.p1, e.p0), LL = dot(v, v);
        f = LL > 0 ? Math.min(1, Math.max(0, dot(sub(q, e.p0), v) / LL)) : 0;
      } else {
        f = arcFraction(e, Math.atan2(q[1] - e.c[1], q[0] - e.c[0])).f;
      }
      const p = e.type === 'line' ? lerp(e.p0, e.p1, f) : arcPoint(e, f);
      const dd = dist(q, p);
      if (!best || dd < best.d) best = { s: c.starts[i] + f * elLength(e), d: dd, at: p };
    });
    return best;
  }

  /**
   * How far a notch reaches: from the stitch line along the outward normal
   * to the cut line (a ray against the flattened cut line). The seam
   * allowance along an edge or round a rounded corner; further at a sharp
   * corner, where the cut line is mitred.
   */
  function reachTo(cut, p, nrm, fallback) {
    let best = Infinity;
    for (let i = 0, n = cut ? cut.length : 0; i < n; i++) {
      const a = cut[i], e = sub(cut[(i + 1) % n], a);
      const den = cross(nrm, e);
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(a, p);
      const t = cross(w, e) / den, u = cross(w, nrm) / den;
      if (t > -1e-6 && u > -1e-9 && u < 1 + 1e-9 && t < best) best = t;
    }
    return isFinite(best) ? Math.max(0, best) : fallback;
  }

  // ---------------------------------------------------------- stations

  /**
   * One station per corner of the stitch line: in the middle of its
   * rounding arc, or at the corner itself where the stitch line turns
   * sharply. Smooth points have none.
   */
  function cornerStations(d, c) {
    const out = [];
    c.els.forEach((e, i) => {
      if (e.vertex != null && e.point != null && e.point >= 0 && !d.smooth[e.point]) {
        out.push({ kind: 'corner', point: e.point, label: d.labels[e.point], s: c.starts[i] + elLength(e) / 2,
          at: arcPoint(e, 0.5), nrm: outwardNormal(elTangent(e, 0.5), d.sgn) });
      }
    });
    (d.corners || []).forEach((cn, j) => {
      if (!cn || cn.smooth || d.smooth[j] || cn.arc) return;
      const i = c.els.findIndex((e) => dist(elStart(e), cn.v) < 1e-6);
      if (i < 0) return;
      let nrm = norm(add(outwardNormal(cn.a, d.sgn), outwardNormal(cn.b, d.sgn)));
      if (!nrm[0] && !nrm[1]) nrm = outwardNormal(cn.b, d.sgn);
      out.push({ kind: 'corner', point: j, label: d.labels[j], s: c.starts[i], at: cn.v, nrm });
    });
    return out.sort((a, b) => a.s - b.s);
  }

  /** The outward direction halfway between arriving along a and leaving along b. */
  function bisector(a, b, sgn) {
    const m = norm(add(outwardNormal(a, sgn), outwardNormal(b, sgn)));
    return m[0] || m[1] ? m : outwardNormal(b, sgn);
  }

  // -------------------------------------------------------------- split

  /**
   * Where the line through P1 and P2 crosses the chain: the two crossings
   * either side of the middle of P1–P2, nearest P1 first; null when it
   * crosses fewer than twice. Each with its arc length s and point.
   */
  function splitCrossings(c, P1, P2) {
    const u = norm(sub(P2, P1));
    if (!u[0] && !u[1]) return null;
    const hits = [];
    c.els.forEach((e, i) => {
      if (e.type === 'line') {
        const v = sub(e.p1, e.p0), den = cross(u, v);
        if (Math.abs(den) < 1e-12) return;
        const w = sub(e.p0, P1);
        const lam = cross(w, v) / den, f = cross(w, u) / den;
        if (f >= -1e-9 && f <= 1 + 1e-9) hits.push({ lam, s: c.starts[i] + Math.min(1, Math.max(0, f)) * elLength(e) });
      } else {
        const w = sub(P1, e.c), b = dot(w, u), disc = b * b - (dot(w, w) - e.r * e.r);
        if (disc < 0) return;
        const sq = Math.sqrt(disc);
        for (const lam of [-b - sq, -b + sq]) {
          const X = add(P1, mul(u, lam));
          const af = arcFraction(e, Math.atan2(X[1] - e.c[1], X[0] - e.c[0]));
          if (af.inside) hits.push({ lam, s: c.starts[i] + af.f * elLength(e) });
        }
      }
    });
    hits.sort((a, b) => a.lam - b.lam);
    const h = [];
    for (const x of hits) if (!h.length || Math.abs(x.lam - h[h.length - 1].lam) > 1e-6) h.push(x);
    if (h.length < 2) return null;
    // the stretch of the line inside the outline that holds the middle of P1–P2, or the nearest
    const mid = dist(P1, P2) / 2;
    let best = null;
    for (let k = 0; k + 1 < h.length; k += 2) {
      const a = h[k], b = h[k + 1];
      const miss = mid < a.lam ? a.lam - mid : (mid > b.lam ? mid - b.lam : 0);
      if (!best || miss < best.miss) best = { a, b, miss };
    }
    const mk = (x) => ({ s: wrapIn(c.total, x.s), at: add(P1, mul(u, x.lam)) });
    return { a: mk(best.a), b: mk(best.b), u };
  }

  // -------------------------------------------------- runs and notches

  /**
   * Runs from station to station along chain c, and its notches: at each
   * station (corners when `corners` is on; the ends of a split always), and
   * between them, each run divided evenly about `spacing` apart.
   */
  function runsAndNotches(c, stations, corners, spacing, sgn) {
    const m = stations.length;
    const runs = [];
    if (!m) runs.push({ from: null, to: null, s: 0, len: c.total });
    stations.forEach((st, i) => {
      const nx = stations[(i + 1) % m];
      runs.push({ from: st, to: nx, s: st.s, len: m === 1 ? c.total : wrapIn(c.total, nx.s - st.s) });
    });
    const notches = [];
    let between = 0;
    stations.forEach((st, i) => {
      if (corners || st.kind === 'split') {
        notches.push({ kind: st.kind === 'split' ? 'split' : 'corner', s: st.s, at: st.at, nrm: st.nrm, station: st,
          corner: st.kind === 'corner' ? st.point : null, label: st.label, run: i });
      }
    });
    if (spacing > 0) {
      runs.forEach((r, i) => {
        const k = Math.max(1, Math.round(r.len / spacing));
        for (let j = 1; j < k; j++) {
          const sv = wrapIn(c.total, r.s + r.len * j / k);
          const q = at(c, sv);
          notches.push({ kind: 'between', s: sv, at: q.at, nrm: outwardNormal(q.dir, sgn), corner: null, label: '', run: i });
          between++;
        }
      });
    }
    return { runs, notches, between };
  }

  /** The run of `runs` that holds arc length s. */
  function runAt(runs, total, s) {
    for (let i = 0; i < runs.length; i++) {
      if (wrapIn(total, s - runs[i].s) < runs[i].len || runs.length === 1) return i;
    }
    return runs.length - 1;
  }

  /** Name, title, edge and middle of each run, for the canvas, the panel and the PDF. */
  function describeRuns(d, c, runs) {
    for (const r of runs) {
      const mid = at(c, r.s + r.len / 2);
      const e = c.els[mid.i];
      r.side = e && !e.split && e.side != null ? e.side : null;
      r.isSplit = !!(e && e.split);
      r.name = r.from && r.to ? r.from.label + '–' + r.to.label : '';
      const sd = r.side != null ? d.sides[r.side] : null;
      r.title = sd && sd.label ? sd.label : (r.name || (sd ? sd.title : ''));
      r.whole = !!(sd && r.from && r.to && r.from.kind === 'corner' && r.to.kind === 'corner' &&
        r.from.point === sd.start && r.to.point === sd.end);
      r.path = part(c, r.s, r.len);
      const mo = middleOf(r.path);
      r.mid = mo ? mo.at : mid.at;
      r.dir = mo ? mo.dir : mid.dir;
    }
    return runs;
  }

  // ------------------------------------------------------------ pieces

  /** A piece of the side panel: its stitch line (chain), its cut line, sizes. */
  function makePiece(d, sa, els, extra) {
    const c = chain(els);
    const pc = Object.assign({ chain: c, finFlat: flatten(els, 0.1) }, extra);
    const cut = seamOffset({ elements: els }, sa, d.sgn);
    pc.valid = cut.valid;
    if (cut.valid) {
      pc.cutPath = cut.elements;
      pc.cutFlat = flatten(cut.elements, 0.1);
      const bb = bbox(pc.cutFlat);
      pc.cutSize = [bb.w, bb.h];
      pc.cutArea = Math.abs(signedArea(pc.cutFlat));
    }
    return pc;
  }

  /** Notch lines on a piece: each from the stitch line out to the piece's cut line. */
  function notchLine(pc, sa, q, nrm, kind) {
    return { at: q, nrm, len: reachTo(pc.cutFlat, q, nrm, sa), kind };
  }

  // ------------------------------------------------------------- design

  /**
   * Everything 02 Design shows and prints, or null without a stitch line.
   * d: the derived geometry so far (finished path, corners, sides, scale);
   * p: the project; sa: the seam allowance.
   */
  function designGeometry(d, p, sa) {
    if (!d.finishedPath || !d.finishedPath.length || !d.hasScale) return null;
    const full = chain(d.finishedPath);
    if (!(full.total > 0)) return null;
    const des = p.design || {}, g = des.gusset || {}, nt = des.notches || {};
    const corners = nt.corners !== false;
    const spacing = isNum(nt.spacing) && nt.spacing > 0 ? nt.spacing : 0;
    const mm = (q) => [q[0] * d.scale, q[1] * d.scale];
    const out = { sa, full, error: '', warning: '' };
    const cst = cornerStations(d, full);

    // ---- the split line: two pieces, or one kept (a clip)
    let split = null, cr = null;
    const sp = des.split;
    if (sp && sp.p1 && sp.p2) {
      cr = splitCrossings(full, mm(sp.p1), mm(sp.p2));
      if (!cr || wrapIn(full.total, cr.b.s - cr.a.s) < 1e-6) {
        cr = null;
        out.warning = 'The split line does not cross the outline. Draw it across, from one edge to another.';
      }
    }
    if (cr) {
      // an end on a corner (within CORNER_SNAP) is that corner: its place and its letter;
      // the others are lettered after the last point, E and F on four corners
      const onCorner = (x) => cst.find((st) => Math.min(wrapIn(full.total, x.s - st.s), wrapIn(full.total, st.s - x.s)) < CORNER_SNAP) || null;
      const ca = onCorner(cr.a), cb = onCorner(cr.b);
      if (ca) { cr.a.s = ca.s; cr.a.at = ca.at; }
      if (cb) { cr.b.s = cb.s; cr.b.at = cb.at; }
      let next = d.n;
      const la = ca ? ca.label : pointLabel(next++), lb = cb ? cb.label : pointLabel(next++);
      const lenAB = wrapIn(full.total, cr.b.s - cr.a.s), lenBA = full.total - lenAB;
      // which side of the line, as drawn from p1 to p2, each piece lies on
      const midAB = at(full, cr.a.s + lenAB / 2).at;
      const abLeft = cross(cr.u, sub(midAB, mm(sp.p1))) > 0;
      const inRange = (s0, len) => (s) => { const w = wrapIn(full.total, s - s0); return w < len - 1e-9 ? w : null; };
      const pieceDef = (s0, len, first, last) => {
        const outer = part(full, s0, len);
        const els = outer.concat([straight(last.at, first.at)]);
        const fromFull = inRange(s0, len);
        const inside = cst.filter((st) => { const w = fromFull(st.s); return w != null && w > 1e-6 && w < len - 1e-6; });
        return { els, s0, len, fromFull, first, last, labels: inside.map((st) => st.label), inside };
      };
      const A = { s: cr.a.s, at: cr.a.at, label: la, point: ca ? ca.point : null };
      const B = { s: cr.b.s, at: cr.b.at, label: lb, point: cb ? cb.point : null };
      const pAB = pieceDef(cr.a.s, lenAB, A, B), pBA = pieceDef(cr.b.s, lenBA, B, A);
      pAB.side = abLeft ? 'left' : 'right';
      pBA.side = abLeft ? 'right' : 'left';
      const keep = sp.keep === 'left' || sp.keep === 'right' ? sp.keep : 'both';
      split = {
        a: A, b: B, keep, clip: keep !== 'both',
        length: dist(cr.a.at, cr.b.at),
        sides: { left: (abLeft ? pAB : pBA).labels, right: (abLeft ? pBA : pAB).labels },
        defs: keep === 'both' ? [pAB, pBA] : [pAB.side === keep ? pAB : pBA]
      };
    }

    // stations of a piece: the corners inside it, then its two corners on the split line
    const pieceStations = (def, kind) => {
      const c = chain(def.els), Lo = def.len, L = c.total;
      const sts = def.inside.map((st) => Object.assign({}, st, { s: def.fromFull(st.s) }));
      const dIn = norm(sub(def.first.at, def.last.at)); // along the split line, from its last end back to its first
      const n0 = bisector(dIn, at(c, 0).dir, d.sgn);
      const n1 = bisector(at(c, Lo - 1e-9).dir, dIn, d.sgn);
      // an end on a corner stays that corner
      const end = (x, sv, nrm) => ({ kind: x.point != null ? 'corner' : kind, point: x.point != null ? x.point : -1, label: x.label, s: sv, at: x.at, nrm });
      sts.push(end(def.first, 0, n0), end(def.last, Math.min(Lo, L), n1));
      return sts.sort((a, b) => a.s - b.s);
    };

    // ---- the bag: what the gusset goes round
    let bag;
    if (split && split.clip) {
      const def = split.defs[0];
      const pc = makePiece(d, sa, def.els, { fromFull: def.fromFull, side: def.side });
      bag = { chain: pc.chain, stations: pieceStations(def, 'clip'), fromFull: def.fromFull, piece: pc };
    } else {
      const sts = cst.slice();
      if (split) {
        for (const x of [split.a, split.b]) {
          if (x.point != null) continue; // on a corner: that corner's station already
          const q = at(full, x.s);
          sts.push({ kind: 'split', point: -1, label: x.label, s: x.s, at: x.at, nrm: outwardNormal(q.dir, d.sgn) });
        }
        sts.sort((a, b) => a.s - b.s);
      }
      bag = { chain: full, stations: sts, fromFull: (s) => s, piece: null };
    }
    const bc = bag.chain, total = bc.total;
    const rn = runsAndNotches(bc, bag.stations, corners, spacing, d.sgn);
    const runs = describeRuns(d, bc, rn.runs);
    const notches = rn.notches;
    const onBag = (q) => { const nr = nearestOn(full, mm(q)); return nr ? bag.fromFull(nr.s) : null; };

    // ---- marks placed on the stitch line
    const marks = [];
    let markNotches = 0;
    (des.marks || []).forEach((mk, index) => {
      const s = mk && mk.at ? onBag(mk.at) : null;
      const m = { index, kind: mk.kind, s, hidden: s == null };
      if (s != null) {
        const q = at(bc, s);
        m.at = q.at;
        m.nrm = outwardNormal(q.dir, d.sgn);
        m.dir = q.dir;
        m.run = runAt(runs, total, s);
        if (mk.kind === 'notch') {
          notches.push({ kind: 'mark', s, at: q.at, nrm: m.nrm, corner: null, label: '', run: m.run, mark: index });
          markNotches++;
        } else if (mk.kind === 'strap') {
          m.width = isNum(mk.width) && mk.width > 0 ? mk.width : 25;
        } else if (mk.kind === 'bolts') {
          const count = Math.max(1, Math.min(3, Math.round(mk.count || 2)));
          const gap = isNum(mk.spacing) && mk.spacing > 0 ? mk.spacing : 64;
          m.count = count;
          m.spacing = gap;
          m.holes = [];
          for (let j = 0; j < count; j++) {
            const sh = wrapIn(total, s + (j - (count - 1) / 2) * gap);
            const qh = at(bc, sh);
            m.holes.push({ s: sh, at: qh.at, nrm: outwardNormal(qh.dir, d.sgn) });
          }
        }
      }
      marks.push(m);
    });
    notches.sort((a, b) => a.s - b.s);

    // ---- where the strip's ends meet: a corner, or anywhere on the line
    let join = null;
    {
      let st = null, s = null;
      if (Array.isArray(g.join)) {
        s = onBag(g.join);
        // on a station (within half a millimetre): that station
        if (s != null) st = bag.stations.find((x) => Math.min(wrapIn(total, s - x.s), wrapIn(total, x.s - s)) < 0.5) || null;
      } else if (isNum(g.join)) {
        st = bag.stations.find((x) => x.kind === 'corner' && x.point === g.join) || null;
      }
      if (s == null && !st) st = bag.stations[0] || null;
      if (st) s = st.s;
      if (s == null) s = 0;
      const q = at(bc, s);
      join = { s, at: q.at, nrm: st ? st.nrm : outwardNormal(q.dir, d.sgn), station: st, point: st && st.kind === 'corner' ? st.point : null,
        label: st ? st.label : '', free: !st, run: runAt(runs, total, s) };
      // two notches NOTCH_PAIR apart along the stitch line, each square to it
      join.pairS = [s - NOTCH_PAIR / 2, s + NOTCH_PAIR / 2].map((x) => wrapIn(total, x));
      for (const nn of notches) nn.join = !!st && nn.station === st;
    }

    // ---- the gusset: one strip round the bag, from the join round to it again
    const width = isNum(g.width) && g.width > 0 ? g.width : 0;
    const tOf = (s) => sa + wrapIn(total, s - join.s);
    const gm = notches.map((nn) => ({ t: tOf(nn.s), kind: nn.kind, corner: nn.corner, label: nn.label }));
    if (join.station && notches.some((nn) => nn.join)) gm.push({ t: sa + total, kind: join.station.kind === 'split' ? 'split' : 'corner', corner: join.point, label: join.label, end: true });
    gm.sort((a, b) => a.t - b.t);
    const mounts = [];
    for (const m of marks) {
      if (m.hidden) continue;
      if (m.kind === 'strap') mounts.push({ kind: 'strap', mark: m.index, t: tOf(m.s), width: m.width });
      if (m.kind === 'bolts') m.holes.forEach((h, j) => mounts.push({ kind: 'bolt', mark: m.index, hole: j, t: tOf(h.s) }));
    }
    mounts.sort((a, b) => a.t - b.t);
    // each run's stretch of the strip; the run holding a join between corners is in two
    const parts = [];
    runs.forEach((r, i) => {
      const t0 = tOf(r.s), t1 = t0 + r.len, end = sa + total;
      if (t1 <= end + 1e-6) parts.push({ run: i, t0, t1: Math.min(t1, end) });
      else parts.push({ run: i, t0, t1: end }, { run: i, t0: sa, t1: sa + (t1 - end) });
    });
    parts.sort((a, b) => a.t0 - b.t0);
    const gusset = { strip: true, width, cutWidth: width + 2 * sa, len: total, cutLen: total + 2 * sa, marks: gm, mounts, parts };

    // ---- the side panel's pieces
    const pieces = [];
    const finishPiece = (pc, list, pairOn) => {
      pc.notches = list.filter((nn) => !nn.join).map((nn) => notchLine(pc, sa, nn.at, nn.nrm, nn.kind));
      if (pairOn) for (const x of pairOn) { const q = at(pc.chain, x); pc.notches.push(notchLine(pc, sa, q.at, outwardNormal(q.dir, d.sgn), 'join')); }
      pc.letters = pc.stations.map((st) => ({ text: st.label, base: st.at, inward: mul(st.nrm, -1), kind: st.kind }));
      pieces.push(pc);
    };
    if (!split) {
      const pc = { chain: full, finFlat: d.finishedFlat, cutPath: d.cutPath, cutFlat: d.cutFlat, cutSize: d.cutSize, cutArea: d.cutArea,
        valid: true, whole: true, stations: bag.stations, runs, fromFull: (s) => s };
      finishPiece(pc, notches, join.pairS);
    } else if (split.clip) {
      const pc = bag.piece;
      pc.stations = bag.stations;
      pc.runs = runs;
      finishPiece(pc, notches, join.pairS);
    } else {
      split.defs.forEach((def, k) => {
        const pc = makePiece(d, sa, def.els, { fromFull: def.fromFull, side: def.side, part: k + 1 });
        pc.stations = pieceStations(def, 'split');
        const prn = runsAndNotches(pc.chain, pc.stations, corners, spacing, d.sgn);
        pc.runs = describeRuns(d, pc.chain, prn.runs);
        // marks and the join, from the whole stitch line onto this piece
        const list = prn.notches.slice();
        for (const nn of notches) {
          if (nn.kind !== 'mark') continue;
          const s = def.fromFull(nn.s);
          if (s == null) continue;
          const q = at(pc.chain, s);
          list.push({ kind: 'mark', s, at: q.at, nrm: outwardNormal(q.dir, d.sgn) });
        }
        let pairOn = null;
        const js = def.fromFull(join.s);
        if (js != null) {
          pairOn = [js - NOTCH_PAIR / 2, js + NOTCH_PAIR / 2].map((x) => wrapIn(pc.chain.total, x));
          if (join.station) for (const nn of list) if (nn.station && nn.station.label === join.station.label) nn.join = true;
        }
        finishPiece(pc, list, pairOn);
      });
    }
    pieces.forEach((pc, k) => {
      pc.name = pieces.length > 1 ? 'part ' + (k + 1) + ' of ' + pieces.length : '';
      if (!pc.valid) out.error = 'The seam allowance does not fit along the split line. Move the line away from the corners, or reduce the seam allowance.';
    });

    // the double notch on the bag (canvas, tests): positions, each square to the stitch line
    const bagCut = split && split.clip ? bag.piece.cutFlat : d.cutFlat;
    join.pair = join.pairS.map((x) => { const q = at(bc, x), nrm = outwardNormal(q.dir, d.sgn); return { at: q.at, nrm, len: reachTo(bagCut, q.at, nrm, sa) }; });
    for (const nn of notches) nn.len = reachTo(bagCut, nn.at, nn.nrm, sa);
    for (const st of bag.stations) st.len = reachTo(bagCut, st.at, st.nrm, sa);

    if (split) delete split.defs;
    return Object.assign(out, {
      total,
      corners: cst,          // the corners of the whole stitch line, split or not
      stations: bag.stations,
      runs,
      notches,
      counts: {
        corners: notches.filter((nn) => nn.kind === 'corner').length,
        split: notches.filter((nn) => nn.kind === 'split').length,
        between: rn.between,
        marks: markNotches
      },
      marks,
      join,
      gusset,
      split,
      pieces,
      fromFull: bag.fromFull,
      clip: !!(split && split.clip)
    });
  }

  /** Arc length on the stitch line of the bag, and the point there, nearest to q (mm). */
  function nearestOnBag(ds, q) {
    const nr = nearestOn(ds.full, q);
    if (!nr) return null;
    const s = ds.fromFull(nr.s);
    if (s == null) return null;
    return { s, d: nr.d, at: nr.at };
  }

  /** The point on the bag's stitch line at arc length s, and the direction there. */
  function bagAt(ds, s) {
    return ds.clip ? at(ds.pieces[0].chain, s) : at(ds.full, s);
  }

  Object.assign(G, {
    NOTCH_PAIR, NOTCH_MIN,
    chainAt, chainPart, nearestOn, reachTo, splitCrossings, designGeometry, nearestOnBag, bagAt, wrapIn
  });
})(typeof window !== 'undefined' ? window : globalThis);
