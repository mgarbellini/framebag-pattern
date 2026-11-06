/*
 * Framebag Pattern — tests for geometry.js, design.js, units.js, the file
 * format and the cut list's fabric areas.
 * Open tests/geometry.html in the browser to run them.
 */
(function (root) {
  'use strict';

  const G = root.FB.geom;
  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  function near(actual, expected, tol, what) {
    if (!(Math.abs(actual - expected) <= tol)) {
      throw new Error((what ? what + ': ' : '') + 'expected ' + expected + ' ± ' + tol + ', got ' + actual);
    }
  }
  function ok(cond, what) { if (!cond) throw new Error(what || 'assertion failed'); }

  /** Distance from p to the infinite line through a and b. */
  function lineDist(p, a, b) {
    return Math.abs(G.cross(G.sub(b, a), G.sub(p, a))) / G.dist(a, b);
  }

  const square = (s) => [[0, 0], [s, 0], [s, s], [0, s]];
  const reversed = (pts) => pts.slice().reverse();

  // Triangle with sides AB = 600, BC = 500, CA = 450 (acceptance criterion 1).
  const cx = (600 * 600 + 450 * 450 - 500 * 500) / (2 * 600);
  const TRI = [[0, 0], [600, 0], [cx, Math.sqrt(450 * 450 - cx * cx)]];

  function sgnOf(pts) { return G.signedArea(pts) >= 0 ? 1 : -1; }

  // ------------------------------------------------------------- basics

  test('signed area follows winding', () => {
    near(G.signedArea(square(100)), 10000, 1e-9);
    near(G.signedArea(reversed(square(100))), -10000, 1e-9);
  });

  test('point labels run A…Z, AA…', () => {
    ok(G.pointLabel(0) === 'A' && G.pointLabel(25) === 'Z' && G.pointLabel(26) === 'AA' && G.pointLabel(27) === 'AB');
  });

  test('self-intersection detected on a bow tie', () => {
    ok(G.selfIntersections([[0, 0], [100, 100], [100, 0], [0, 100]]).length > 0);
    ok(G.selfIntersections(square(100)).length === 0);
  });

  // ------------------------------------------------------------ offsets

  test('uniform +10 mm offset grows a square to 120 mm (both windings)', () => {
    for (const sq of [square(100), reversed(square(100))]) {
      const off = G.offsetPolygon(sq, [10, 10, 10, 10], sgnOf(sq));
      const bb = G.bbox(off);
      near(bb.w, 120, 1e-9, 'width');
      near(bb.h, 120, 1e-9, 'height');
      ok(G.validateOffset(sq, off, sgnOf(sq)).valid, 'valid');
    }
  });

  test('negative offset shrinks, positive grows', () => {
    const s = sgnOf(TRI);
    const a0 = Math.abs(G.signedArea(TRI));
    ok(Math.abs(G.signedArea(G.offsetPolygon(TRI, [-5, -5, -5], s))) < a0, 'shrinks');
    ok(Math.abs(G.signedArea(G.offsetPolygon(TRI, [5, 5, 5], s))) > a0, 'grows');
  });

  test('per-edge offset of −5 mm moves only that edge, by exactly 5 mm (criterion 4)', () => {
    for (const tri of [TRI, reversed(TRI)]) {
      const s = sgnOf(tri);
      // edge 1 runs from point 1 to point 2
      const off = G.offsetPolygon(tri, [0, -5, 0], s);
      ok(G.validateOffset(tri, off, s).valid, 'valid');
      // vertex 0 is untouched; vertices 1 and 2 slide along their other edges
      near(G.dist(off[0], tri[0]), 0, 1e-9, 'vertex 0 unchanged');
      near(lineDist(off[1], tri[0], tri[1]), 0, 1e-9, 'vertex 1 stays on edge 0');
      near(lineDist(off[2], tri[2], tri[0]), 0, 1e-9, 'vertex 2 stays on edge 2');
      near(lineDist(off[1], tri[1], tri[2]), 5, 1e-9, 'edge 1 moved 5 mm (vertex 1)');
      near(lineDist(off[2], tri[1], tri[2]), 5, 1e-9, 'edge 1 moved 5 mm (vertex 2)');
      ok(Math.abs(G.signedArea(off)) < Math.abs(G.signedArea(tri)), 'moved inward');
    }
  });

  test('offsets that collapse the outline are rejected', () => {
    const s = sgnOf(TRI);
    const off = G.offsetPolygon(TRI, [-200, -200, -200], s);
    ok(!G.validateOffset(TRI, off, s).valid);
  });

  // ------------------------------------------------------------ fillets

  test('rounded square: perimeter = 4·(100 − 2r) + 2πr', () => {
    const sq = square(100);
    const fil = G.fillet(sq, [10, 10, 10, 10], sgnOf(sq));
    near(G.pathLength(fil.elements), 320 + 2 * Math.PI * 10, 1e-9);
  });

  test('fillet arcs are tangent and continuous', () => {
    const fil = G.fillet(TRI, [20, 25, 15], sgnOf(TRI));
    const els = fil.elements;
    for (let i = 0; i < els.length; i++) {
      const e = els[i], nx = els[(i + 1) % els.length];
      const end = e.type === 'line' ? e.p1 : G.arcPoint(e, 1);
      const start = nx.type === 'line' ? nx.p0 : G.arcPoint(nx, 0);
      near(G.dist(end, start), 0, 1e-9, 'gap after element ' + i);
    }
    // arc radius equals distance from centre to both tangent points
    for (const c of fil.corners) {
      near(G.dist(c.arc.c, c.T1), c.arc.r, 1e-9);
      near(G.dist(c.arc.c, c.T2), c.arc.r, 1e-9);
      // centre lies inside the triangle for convex corners
      ok(G.pointInPolygon(c.arc.c, TRI), 'centre inside');
    }
  });

  test('a radius that does not fit is reduced and flagged', () => {
    const sq = square(100);
    const fil = G.fillet(sq, [80, 80, 80, 80], sgnOf(sq));
    for (const c of fil.corners) {
      near(c.rEffective, 50, 1e-6, 'effective radius');
      ok(c.clamped, 'clamped');
    }
  });

  // ------------------------------------------------------ seam allowance

  test('seam allowance on a sharp square is mitred: 120 mm square', () => {
    for (const sq of [square(100), reversed(square(100))]) {
      const s = sgnOf(sq);
      const cut = G.seamOffset(G.fillet(sq, [0, 0, 0, 0], s), 10, s);
      ok(cut.valid);
      near(G.pathLength(cut.elements), 480, 1e-9, 'perimeter');
      near(Math.abs(G.signedArea(G.flatten(cut.elements))), 14400, 1e-6, 'area');
    }
  });

  test('seam allowance on a rounded square uses concentric arcs r + s', () => {
    const sq = square(100), s = sgnOf(sq);
    const cut = G.seamOffset(G.fillet(sq, [10, 10, 10, 10], s), 10, s);
    near(G.pathLength(cut.elements), 320 + 2 * Math.PI * 20, 1e-9);
    cut.elements.filter((e) => e.type === 'arc').forEach((e) => near(e.r, 20, 1e-9));
  });

  // L shape: corner D (index 3) is concave.
  const L = [[0, 0], [200, 0], [200, 100], [100, 100], [100, 200], [0, 200]];

  test('concave sharp corner is trimmed to the intersection', () => {
    const s = sgnOf(L);
    const cut = G.seamOffset(G.fillet(L, [0, 0, 0, 0, 0, 0], s), 10, s);
    ok(cut.valid);
    // outer L from (-10,-10) to (210,210) with the notch corner at (110,110)
    near(Math.abs(G.signedArea(G.flatten(cut.elements))), 220 * 120 + 120 * 100, 1e-6);
  });

  test('concave rounded corner with r > s shrinks to r − s', () => {
    const s = sgnOf(L);
    const fil = G.fillet(L, [0, 0, 0, 30, 0, 0], s);
    ok(!fil.corners[3].convex, 'corner D is concave');
    const cut = G.seamOffset(fil, 10, s);
    const arcs = cut.elements.filter((e) => e.type === 'arc');
    ok(arcs.length === 1, 'one arc');
    near(arcs[0].r, 20, 1e-9);
  });

  test('concave rounded corner with r ≤ s becomes sharp', () => {
    const s = sgnOf(L);
    const cut = G.seamOffset(G.fillet(L, [0, 0, 0, 5, 0, 0], s), 10, s);
    ok(cut.valid);
    ok(cut.elements.filter((e) => e.type === 'arc').length === 0, 'no arc left');
  });

  test('very acute corner is bevelled instead of mitred (mitre > 4·s)', () => {
    const a = 20 * G.DEG;
    const tri = [[0, 0], [300, 0], [300 * Math.cos(a), 300 * Math.sin(a)]];
    const s = sgnOf(tri);
    const cut = G.seamOffset(G.fillet(tri, [0, 0, 0], s), 10, s);
    ok(cut.valid);
    ok(cut.elements.some((e) => e.bevel && e.vertex === 0), 'bevel at the 20° corner');
    ok(!cut.elements.some((e) => e.bevel && e.vertex !== 0), 'other corners mitred');
  });

  test('arcs are flattened within 0.1 mm', () => {
    const e = { type: 'arc', c: [0, 0], r: 200, a0: 0, sweep: Math.PI / 2 };
    const pts = G.flatten([e], 0.1);
    for (let i = 0; i + 1 < pts.length; i++) {
      const mid = G.lerp(pts[i], pts[i + 1], 0.5);
      ok(200 - G.len(mid) <= 0.1 + 1e-9, 'chord deviation ' + (200 - G.len(mid)));
    }
  });

  // -------------------------------------------------------- whole project

  function project(lengthMm) {
    // 2 image px per mm: the 1000 px reference is 500 mm long.
    return {
      image: { width: 2000, height: 1500 },
      scale: { p1: [100, 100], p2: [1100, 100], lengthMm: lengthMm },
      outline: {
        closed: true,
        points: TRI.map((q, i) => ({ x: 200 + q[0] * 2, y: 1300 - q[1] * 2, radius: [20, 25, 15][i] })),
        uniformOffset: -3,
        edgeOffsets: [null, -5, null]
      },
      seamAllowance: 10
    };
  }

  test('traced lengths match the true triangle (criterion 1)', () => {
    const d = G.computeDerived(project(500));
    ok(d.hasScale && d.closed, 'scaled and closed');
    near(d.scale, 0.5, 1e-12, 'mm per px');
    near(d.tracedLens[0], 600, 1e-6, 'A–B');
    near(d.tracedLens[1], 500, 1e-6, 'B–C');
    near(d.tracedLens[2], 450, 1e-6, 'C–A');
    ok(d.ok, 'ready to export: ' + d.blocker);
  });

  test('re-calibrating scales all lengths, points stay put (criterion 6)', () => {
    const p = project(500);
    const before = JSON.stringify(p.outline.points);
    const d1 = G.computeDerived(p);
    p.scale.lengthMm = 1000;
    const d2 = G.computeDerived(p);
    ok(JSON.stringify(p.outline.points) === before, 'points unchanged');
    for (let i = 0; i < 3; i++) near(d2.tracedLens[i], 2 * d1.tracedLens[i], 1e-6);
  });

  test('without a scale everything stays in px and export is blocked', () => {
    const p = project(500);
    p.scale.lengthMm = null;
    const d = G.computeDerived(p);
    ok(d.unit === 'px' && !d.ok && !d.finishedFlat);
  });

  test('finished and cut lines nest inside each other', () => {
    const d = G.computeDerived(project(500));
    d.finishedFlat.forEach((q) => ok(G.pointInPolygon(q, d.cutFlat), 'finished inside cut'));
    ok(d.perimeter > 0 && d.cutArea > 0);
  });

  test('inside angles: 90° in a square, 270° at a concave corner, 180° in all for a triangle', () => {
    const proj = (pts, closed) => ({ outline: { closed: closed !== false, points: pts.map((q) => ({ x: q[0], y: q[1], radius: 0 })) } });
    for (const sq of [square(100), reversed(square(100))]) {
      G.computeDerived(proj(sq)).angles.forEach((a) => near(a, 90, 1e-9, 'square'));
    }
    const dl = G.computeDerived(proj(L));
    near(dl.angles[3], 270, 1e-9, 'concave corner D');
    near(dl.angles.reduce((s, a) => s + a, 0), 720, 1e-9, 'six corners of the L');
    near(G.computeDerived(proj(TRI)).angles.reduce((s, a) => s + a, 0), 180, 1e-9, 'triangle');
    const open = G.computeDerived(proj([[0, 0], [100, 0], [100, 100]], false));
    ok(open.angles[0] === null && open.angles[2] === null, 'the ends of an open outline have none');
    near(open.angles[1], 90, 1e-9, 'open corner');
  });

  // ---------------------------------------------------------------- layout

  test('a small piece fits on one portrait page at 0°', () => {
    const sq = square(100);
    const lay = G.planLayout([sq], sq, { margin: 10, overlap: 15, optimise: true });
    ok(lay.count === 1 && lay.angle === 0 && lay.orientation === 'portrait');
  });

  test('optimising never needs more pages than 0° portrait', () => {
    const rect = [[0, 0], [420, 0], [420, 160], [0, 160]].map((q) => G.rotate(q, 30 * G.DEG));
    const opt = G.planLayout([rect], rect, { margin: 10, overlap: 15, optimise: true });
    const plain = G.planLayout([rect], rect, { margin: 10, overlap: 15, optimise: false });
    ok(opt.count <= plain.count, opt.count + ' vs ' + plain.count);
    ok(opt.count < plain.count, 'rotation helps here');
  });

  test('kept pages cover every point of the piece', () => {
    const d = G.computeDerived(project(500));
    const lay = G.planLayout([d.cutFlat, d.finishedFlat, d.traced], d.cutFlat, { margin: 10, overlap: 15, optimise: true });
    const rad = lay.angle * G.DEG;
    d.cutFlat.map((q) => G.rotate(q, rad)).forEach((q) => {
      const covered = lay.tiles.some((t) => t.included &&
        q[0] >= t.x0 && q[0] <= t.x0 + lay.cw && q[1] >= t.y0 && q[1] <= t.y0 + lay.ch);
      ok(covered, 'point not covered');
    });
  });

  // ------------------------------------------------------------ curved edges

  function continuous(els, what) {
    for (let i = 0; i < els.length; i++) {
      const e = els[i], nx = els[(i + 1) % els.length];
      near(G.dist(G.elEnd(e), G.elStart(nx)), 0, 1e-6, (what || '') + ' gap after piece ' + i);
    }
  }

  test('three points give the arc through them', () => {
    const a = [0, 0], b = [200, 0], m = [100, 50];
    const e = G.edgeEntity(a, b, m);
    ok(e.type === 'arc', 'arc');
    near(G.dist(G.elStart(e), a), 0, 1e-9, 'starts at a');
    near(G.dist(G.elEnd(e), b), 0, 1e-9, 'ends at b');
    near(e.r, 125, 1e-9, 'radius from chord 200 and height 50');
    near(G.dist(e.c, m), e.r, 1e-9, 'handle on the circle');
    const dir = e.sweep >= 0 ? 1 : -1;
    const along = G.sweepFrom(e.a0, Math.atan2(m[1] - e.c[1], m[0] - e.c[0]), dir);
    ok(Math.abs(along) < Math.abs(e.sweep), 'handle within the arc');
    ok(G.edgeEntity(a, b, [100, 0]).type === 'line', 'handle on the chord keeps it straight');
  });

  // Half disc: straight edge A→B, curved edge B→A through the top.
  const HA = [-100, 0], HB = [100, 0], HM = [0, 100];
  const halfDisc = () => {
    const ents = [G.edgeEntity(HA, HB, null), G.edgeEntity(HB, HA, HM)];
    return { ents, sgn: G.signedArea(G.flatten(ents, 0.1)) >= 0 ? 1 : -1 };
  };

  test('a curved edge offsets to a concentric arc (bulging out)', () => {
    const h = halfDisc();
    const fe = G.offsetEdges(h.ents, [10, 10], h.sgn);
    const arc = fe.edges[1];
    ok(arc.type === 'arc', 'still an arc');
    near(arc.r, 110, 1e-6, 'radius grows by the offset');
    near(G.len(arc.c), 0, 1e-6, 'same centre');
    const x = Math.sqrt(110 * 110 - 10 * 10);
    near(Math.abs(fe.vertices[0][0]), x, 1e-6, 'corner where the moved line meets the circle');
    near(fe.vertices[0][1] * (fe.vertices[1][1] < 0 ? 1 : -1), -10 * (fe.vertices[1][1] < 0 ? 1 : -1), 1e-6);
    ok(G.validateEdges(h.ents, fe.edges, h.sgn).valid, 'valid');
  });

  test('a curved edge bulging inward offsets the other way', () => {
    // rectangle whose top edge dips inward through (100, 80): radius 260, centre (100, 340)
    const P = [[0, 0], [200, 0], [200, 100], [0, 100]];
    const ents = P.map((q, i) => G.edgeEntity(q, P[(i + 1) % 4], i === 2 ? [100, 80] : null));
    const sgn = G.signedArea(G.flatten(ents, 0.1)) >= 0 ? 1 : -1;
    near(ents[2].r, 260, 1e-9, 'traced radius');
    const fe = G.offsetEdges(ents, [10, 10, 10, 10], sgn);
    near(fe.edges[2].r, 250, 1e-6, 'moving outward brings it closer to its centre');
    near(G.dist(fe.edges[2].c, [100, 340]), 0, 1e-6, 'same centre');
  });

  test('rounding between a straight and a curved edge touches both', () => {
    const h = halfDisc();
    const fil = G.filletEdges(h.ents, [20, 20], h.sgn);
    for (const c of fil.corners) {
      ok(c.arc, 'rounded');
      near(Math.abs(c.arc.c[1]), 20, 1e-6, '20 mm from the straight edge');
      near(G.len(c.arc.c), 80, 1e-6, 'inside the half circle, 100 − 20 from its centre');
      near(G.dist(c.arc.c, c.T1), 20, 1e-9);
      near(G.dist(c.arc.c, c.T2), 20, 1e-9);
      ok(!c.clamped, 'fits');
    }
    continuous(fil.elements, 'finished');
  });

  test('a radius too big for a curved corner is reduced and stays continuous', () => {
    const h = halfDisc();
    const fil = G.filletEdges(h.ents, [90, 90], h.sgn);
    for (const c of fil.corners) {
      ok(c.clamped, 'clamped');
      ok(c.rEffective <= 50 + 1e-6 && c.rEffective > 45, 'about 50: ' + c.rEffective);
    }
    continuous(fil.elements, 'finished');
  });

  test('seam allowance on a curved edge stays concentric', () => {
    const h = halfDisc();
    for (const radii of [[20, 20], [0, 0]]) {
      const fil = G.filletEdges(h.ents, radii, h.sgn);
      const cut = G.seamOffset(fil, 10, h.sgn);
      ok(cut.valid, 'valid');
      continuous(cut.elements, 'cut');
      const edgeArc = cut.elements.filter((e) => e.type === 'arc' && e.edge === 1);
      ok(edgeArc.length === 1, 'one arc for the curved edge');
      near(edgeArc[0].r, 110, 1e-6, 'r + s');
      cut.elements.filter((e) => e.type === 'arc' && e.vertex != null).forEach((e) => near(e.r, 30, 1e-6, 'rounding r + s'));
      G.flatten(fil.elements, 0.1).forEach((q) => ok(G.pointInPolygon(q, G.flatten(cut.elements, 0.1)), 'stitch line inside cut line'));
    }
  });

  // ----------------------------------------------------------- smooth points

  const deg = (a) => a * G.DEG;
  const onCircle = (c, R) => (a) => [c[0] + R * Math.cos(deg(a)), c[1] + R * Math.sin(deg(a))];
  const angleBetween = (t1, t2) => Math.atan2(Math.abs(G.cross(t1, t2)), G.dot(t1, t2)) / G.DEG;

  /** Gap and change of direction (degrees) at every joint of a chain of pieces. */
  function joints(els, closed) {
    const out = [];
    for (let i = 0; i < (closed ? els.length : els.length - 1); i++) {
      const e = els[i], nx = els[(i + 1) % els.length];
      out.push({ gap: G.dist(G.elEnd(e), G.elStart(nx)), ang: angleBetween(G.elTangent(e, 1), G.elTangent(nx, 0)), at: G.elEnd(e) });
    }
    return out;
  }

  test('the direction of the circle through three points', () => {
    const c = [30, -20], at = onCircle(c, 150);
    const cases = [[0, 40, 150, 1], [10, 15, 200, 1], [0, 170, 175, 1], [300, 250, 100, -1]];
    for (const [a, b, e, s] of cases) {
      const t = G.circleTangent(at(a), at(b), at(e));
      near(G.dot(t, G.norm(G.sub(at(b), c))), 0, 1e-9, 'along the circle');
      near(G.dot(t, [-Math.sin(deg(b)), Math.cos(deg(b))]), s, 1e-9, 'in the direction of travel');
    }
    const t = G.circleTangent([0, 0], [10, 0], [30, 0]);
    near(t[0], 1, 1e-12, 'points in a line give their direction');
  });

  test('arcs leave and reach a point in a given direction', () => {
    const p0 = [0, 0], p1 = [100, 40], t = G.norm([1, -0.2]);
    const e = G.arcLeaving(p0, t, p1, 0.01);
    ok(e.type === 'arc', 'arc');
    near(G.dist(G.elStart(e), p0), 0, 1e-9, 'start');
    near(G.dist(G.elEnd(e), p1), 0, 1e-9, 'end');
    near(G.dot(G.elTangent(e, 0), t), 1, 1e-12, 'leaves along t');
    const f = G.arcArriving(p1, p0, t, 0.01);
    near(G.dist(G.elStart(f), p1), 0, 1e-9, 'start');
    near(G.dist(G.elEnd(f), p0), 0, 1e-9, 'end');
    near(G.dot(G.elTangent(f, 1), t), 1, 1e-12, 'arrives along t');
    ok(G.arcLeaving(p0, [1, 0], [100, 0], 0.01).type === 'line', 'straight ahead stays a line');
  });

  test('a biarc meets both directions and is smooth at its joint', () => {
    const cases = [
      [[0, 0], G.norm([1, 1]), [200, 0], G.norm([1, -1])],   // C shape
      [[0, 0], G.norm([1, 1]), [200, 0], G.norm([1, 1])],    // S shape
      [[0, 0], [0, 1], [100, 0], [0, 1]],                    // parallel: joint in the middle
      [[0, 0], G.norm([1, 0.1]), [300, 50], G.norm([1, 0.3])]
    ];
    for (const [p0, t0, p1, t1] of cases) {
      const pcs = G.biarc(p0, t0, p1, t1, 0.01);
      const a = pcs[0], b = pcs[1];
      near(G.dist(G.elStart(a), p0), 0, 1e-9, 'start');
      near(G.dist(G.elEnd(b), p1), 0, 1e-9, 'end');
      near(G.dist(G.elEnd(a), G.elStart(b)), 0, 1e-9, 'joint');
      near(G.dot(G.elTangent(a, 0), t0), 1, 1e-9, 'leaves along t0');
      near(G.dot(G.elTangent(b, 1), t1), 1, 1e-9, 'arrives along t1');
      near(angleBetween(G.elTangent(a, 1), G.elTangent(b, 0)), 0, 1e-6, 'no kink at the joint');
    }
  });

  test('a biarc between two points of one circle follows the circle', () => {
    const c = [10, 20], R = 300, at = onCircle(c, R);
    const tan = (a) => [-Math.sin(deg(a)), Math.cos(deg(a))];
    for (const [a, b] of [[10, 70], [-20, 100], [0, 5]]) {
      G.biarc(at(a), tan(a), at(b), tan(b), 0.01).forEach((e) => {
        ok(e.type === 'arc', 'arc');
        near(e.r, R, 1e-6, 'radius');
        near(G.dist(e.c, c), 0, 1e-6, 'centre');
      });
    }
  });

  test('a smooth point between two corners gives the arc through all three', () => {
    const A = [0, 0], B = [100, 30], C = [200, 0];
    const ol = G.outlinePieces([A, B, C, [100, -100]], [false, true, false, false], [], true, 0.01);
    const circ = G.circleThrough(A, B, C);
    ok(ol.segs[0].length === 1 && ol.segs[1].length === 1, 'one arc on each side of B');
    [ol.segs[0][0], ol.segs[1][0]].forEach((e) => {
      ok(e.type === 'arc', 'arc');
      near(e.r, circ.r, 1e-9, 'radius');
      near(G.dist(e.c, circ.c), 0, 1e-9, 'centre');
    });
    ok(ol.segs[2][0].type === 'line' && ol.segs[3][0].type === 'line', 'the other segments stay straight');
  });

  test('points of one circle, all smooth, trace that circle', () => {
    const c = [500, 400], R = 250, at = onCircle(c, R);
    const pts = [0, 50, 95, 170, 230, 300].map(at);
    const ol = G.outlinePieces(pts, pts.map(() => true), [], true, 0.01);
    ol.pieces.forEach((e) => {
      ok(e.type === 'arc', 'arc');
      near(e.r, R, 1e-6, 'radius');
      near(G.dist(e.c, c), 0, 1e-6, 'centre');
    });
    near(G.pathLength(ol.pieces), 2 * Math.PI * R, 1e-6, 'circumference');
    const sd = G.outlineSides(pts.length, true, ol.smooth);
    ok(sd.sides.length === 1 && sd.sides[0].segs.length === 6, 'one edge without corners');
  });

  test('next to a straight segment a smooth point keeps its direction', () => {
    const A = [0, 0], B = [200, 0], C = [350, 80];
    const ol = G.outlinePieces([A, B, C, [100, 200]], [false, true, false, false], [true, false, false, false], true, 0.01);
    ok(ol.segs[0][0].type === 'line', 'A–B stays straight');
    near(G.dot(ol.tangent[1], [1, 0]), 1, 1e-12, 'direction of A–B');
    const e = ol.segs[1][0];
    ok(e.type === 'arc', 'B–C curves');
    near(G.dot(G.elTangent(e, 0), [1, 0]), 1, 1e-12, 'leaves B along A–B');
    near(G.dist(G.elEnd(e), C), 0, 1e-9, 'reaches C');
  });

  test('a smooth point between two straight segments is a corner', () => {
    const ol = G.outlinePieces([[0, 0], [200, 0], [350, 80], [100, 200]], [false, true, false, false], [true, true, false, false], true, 0.01);
    ok(ol.flag[1] && !ol.smooth[1], 'corner in effect');
    ok(ol.pieces.every((e) => e.type === 'line'), 'all straight');
  });

  test('the ends of an open outline are corners', () => {
    const ol = G.outlinePieces([[0, 0], [100, 50], [200, 0]], [true, true, true], [], false, 0.01);
    ok(!ol.smooth[0] && ol.smooth[1] && !ol.smooth[2], 'ends are corners');
    ok(ol.segs.length === 2, 'two segments');
    const sd = G.outlineSides(3, false, ol.smooth);
    ok(sd.sides.length === 1 && sd.sides[0].start === 0 && sd.sides[0].end === 2, 'one edge from end to end');
  });

  // A frame-like outline in mm (y up), traced at 2 px per mm: [x, y, radius, smooth]
  const FRAME = [
    [0, 0, 15],             // A bottom bracket
    [300, 40, 0, true],     // B on the bowed down tube
    [560, 200, 20],         // C head tube, bottom
    [560, 300, 20],         // D head tube, top
    [380, 330, 0, true],    // E on the curved top tube
    [180, 340, 0, true],    // F on the curved top tube
    [20, 320, 15]           // G seat cluster
  ];

  function frameProject(points, opts) {
    opts = opts || {};
    return {
      image: { width: 2000, height: 1500 },
      scale: { p1: [100, 100], p2: [1100, 100], lengthMm: 500 },
      outline: {
        closed: true,
        points: points.map((q) => ({ x: 200 + q[0] * 2, y: 1300 - q[1] * 2, radius: q[2] || 0, smooth: !!q[3] })),
        uniformOffset: opts.uniform || 0,
        edgeOffsets: opts.edgeOffsets || points.map(() => null),
        edgeStraight: opts.straight || points.map(() => false)
      },
      seamAllowance: opts.seam == null ? 10 : opts.seam
    };
  }

  test('smooth points keep the traced, finished and cut lines free of kinks', () => {
    const d = G.computeDerived(frameProject(FRAME, { uniform: -3 }));
    ok(d.ok, d.blocker + ' ' + JSON.stringify(d.errors));
    ok(d.smooth[1] && d.smooth[4] && d.smooth[5] && !d.smooth[0] && !d.smooth[2], 'smooth points');
    const tj = joints(d.tracedPieces, true);
    tj.forEach((j) => near(j.gap, 0, 1e-9, 'traced gap'));
    const kinks = tj.filter((j) => j.ang > 0.01);
    ok(kinks.length === 4, 'the traced outline turns sharply at its 4 corners only, not ' + kinks.length);
    // every corner is rounded, so the stitch and cut lines have no kink at all
    [['finished', d.finishedPath], ['cut', d.cutPath]].forEach((pair) => {
      joints(pair[1], true).forEach((j) => {
        near(j.gap, 0, 1e-6, pair[0] + ' gap');
        ok(j.ang < 0.01, pair[0] + ' line kinks by ' + j.ang.toFixed(3) + '° at ' + j.at.map((v) => v.toFixed(1)).join(', '));
      });
    });
  });

  test('edges run from corner to corner and share one offset', () => {
    const p = frameProject(FRAME, { uniform: -3 });
    p.outline.edgeOffsets[4] = 5; // stored on the middle segment of the top tube
    const d = G.computeDerived(p);
    ok(d.sides.map((s) => s.name).join(' ') === 'A–C C–D D–G G–A', d.sides.map((s) => s.name).join(' '));
    const top = d.sides[d.segSide[4]];
    ok(top.name === 'D–G' && top.override && top.offset === 5, 'top tube has its own offset');
    top.segs.forEach((i) => ok(d.offsets[i] === 5, 'segment ' + i + ' uses it'));
    ok(d.offsets[0] === -3 && d.offsets[1] === -3, 'the down tube keeps the uniform offset');
    near(top.tracedLen, d.tracedLens[3] + d.tracedLens[4] + d.tracedLens[5], 1e-9, 'edge length is the sum of its segments');
    ok(d.ok, d.blocker);
  });

  test('an offset moves a curved edge by exactly its amount', () => {
    const d = G.computeDerived(frameProject(FRAME, { edgeOffsets: [null, null, null, 4, null, null, null] }));
    ok(d.ok, d.blocker);
    const side = d.segSide[3];
    let arcs = 0;
    d.finishedPieces.forEach((f, kk) => {
      const o = d.tracedPieces[kk];
      if (d.segSide[o.seg] !== side || o.type !== 'arc') return;
      arcs++;
      near(G.dist(f.c, o.c), 0, 1e-6, 'same centre');
      near(Math.abs(f.r - o.r), 4, 1e-6, 'radius changed by 4');
    });
    ok(arcs >= 3, 'the top tube is made of arcs');
    ok(!d.cutPath.some((e) => e.bevel), 'the seam allowance needs no bevel');
  });

  test('a curved edge is measured along the curve and exports', () => {
    const d = G.computeDerived(frameProject(FRAME));
    const dt = d.sides[0];
    ok(dt.name === 'A–C' && dt.curved, 'curved down tube');
    const poly = Math.hypot(300, 40) + Math.hypot(260, 160);
    ok(dt.tracedLen > poly && dt.tracedLen < poly + 20, 'a little longer than the polyline through its points: ' + dt.tracedLen);
    ok(d.ok, d.blocker);
    ok(d.finishedPath.some((el) => el.type === 'arc' && el.side === 0), 'the stitch line keeps the curve');
    const mid = G.middleOf(G.sideElements(d, 0));
    ok(mid && mid.length > 0, 'label position');
  });

  test('a tight curve at a corner stays smooth at its smooth end after offsets', () => {
    // found by random testing: at corner F the moved straight edge misses the
    // shrunken arc F–G (r 13.7 − 7 mm), and G is smooth
    const P = [[1524.91, 826.22, 1, 0], [1631.9, 883.54, 28, 1], [1359.12, 1170.56, 14, 0], [1017.76, 1258.88, 17, 0],
      [437.19, 1138.13, 27, 0], [593.4, 451.94, 0, 0], [641.21, 441.12, 0, 1], [692.66, 229.16, 0, 1],
      [804.13, 258.82, 2, 0], [1172.2, 317.63, 0, 0], [1622.37, 444.27, 0, 1], [1538.65, 607.61, 21, 1]];
    const d = G.computeDerived({
      image: { width: 2000, height: 1600 },
      scale: { p1: [0, 0], p2: [1000, 0], lengthMm: 500 },
      outline: {
        closed: true,
        points: P.map((q) => ({ x: q[0], y: q[1], radius: q[2], smooth: !!q[3] })),
        uniformOffset: 4,
        edgeOffsets: [null, null, null, null, null, 7, null, null, null, null, -6, null],
        edgeStraight: [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0].map(Boolean)
      },
      seamAllowance: 0
    });
    ok(d.ok, d.blocker);
    const sharp = d.corners.filter((c) => c && !c.smooth && !c.arc).map((c) => c.v);
    joints(d.finishedPath, true).forEach((j) => {
      if (!sharp.some((v) => G.dist(v, j.at) < 1e-6)) ok(j.ang < 0.01, 'kink of ' + j.ang.toFixed(3) + '° away from the corners');
    });
  });

  test('a smooth point that makes the outline cross itself is reported', () => {
    // wide rectangle; a smooth point above the top edge pulls the bottom edge through it
    const d = G.computeDerived(frameProject([[0, 0], [200, 160, 0, true], [400, 0], [400, 100], [0, 100]]));
    ok(!d.ok && d.errors.some((m) => /crosses itself/.test(m.text)), JSON.stringify(d.errors));
    ok(d.badEdges.indexOf(0) >= 0 || d.badEdges.indexOf(1) >= 0, 'the curve is highlighted');
  });

  if (root.FB.project && root.FB.state) {
    test('a curve handle from v0.2 becomes a smooth point with the same shape', () => {
      const raw = {
        format: 'framebag-pattern',
        version: 1,
        scale: { p1: [100, 100], p2: [1100, 100], lengthMm: 500 },
        outline: {
          closed: true,
          points: [{ x: 200, y: 1300, radius: 10 }, { x: 1400, y: 1300, radius: 10 }, { x: 800, y: 500, radius: 10 }],
          uniformOffset: -2,
          edgeOffsets: [4, 3, null],
          edgeCurves: [[800, 1400], null, null]
        },
        seamAllowance: 10
      };
      const P = root.FB.project;
      const p = P.normalize(raw);
      ok(p.version === 2, 'current format');
      ok(p.outline.points.length === 4, 'one point added');
      const m = p.outline.points[1];
      ok(m.smooth && m.x === 800 && m.y === 1400, 'the handle is now smooth point B');
      ok(!p.outline.points[0].smooth && !p.outline.points[2].smooth, 'the others stay corners');
      ok(p.outline.edgeOffsets.join() === '4,4,3,', 'offsets follow their edges: ' + p.outline.edgeOffsets.join());
      ok(!('edgeCurves' in p.outline), 'no handles left');
      const d = G.computeDerived(p);
      const circ = G.circleThrough([100, 650], [400, 700], [700, 650]);
      d.tracedPieces.filter((e) => e.seg < 2).forEach((e) => {
        near(e.r, circ.r, 1e-6, 'radius');
        near(G.dist(e.c, circ.c), 0, 1e-6, 'centre');
      });
      near(d.sides[0].tracedLen, G.elLength(G.edgeEntity([100, 650], [700, 650], [400, 700])), 1e-6, 'same length as before');
      const again = P.normalize(JSON.parse(P.serialize(p)));
      ok(JSON.stringify(again.outline) === JSON.stringify(p.outline), 'saved and opened unchanged');
    });
  }

  // ------------------------------------------------------- v0.7 units

  const U = root.FB.units;
  if (U) {
    test('inches are shown in sixteenths, as on a tape measure', () => {
      U.using('imperial', () => {
        const IN = 25.4;
        const cases = [[3 / 8 * IN, '3/8'], [24.625 * IN, '24 5/8'], [-1.5 * IN, '−1 1/2'], [20 * IN, '20'],
          [10, '3/8'], [0.5, '0'], [1 / 16 * IN, '1/16'], [15 / 16 * IN, '15/16']];
        for (const c of cases) ok(U.num(c[0]) === c[1], c[0] + ' mm → "' + U.num(c[0]) + '", expected "' + c[1] + '"');
        ok(U.len(3 / 8 * IN) === '3/8 in', U.len(3 / 8 * IN));
        ok(U.num(-1.5 * IN, 1, '-') === '-1 1/2', 'ASCII minus for the PDF');
      });
      U.using('metric', () => {
        ok(U.num(412.54) === '412.5' && U.len(412.54) === '412.5 mm', U.len(412.54));
        ok(U.area(132000) === '0.132 m²', U.area(132000));
      });
    });

    test('lengths are read in the chosen unit, or in the unit typed with them', () => {
      U.using('imperial', () => {
        const cases = [['1 1/2', 38.1], ['1-1/2', 38.1], ['3/8', 9.525], ['24.625', 625.475], ['-3/16', -4.7625],
          ['2"', 50.8], ['2 in', 50.8], ['12 mm', 12], ['1,5 cm', 15], ['−1/2', -12.7]];
        for (const c of cases) near(U.parse(c[0]), c[1], 1e-9, '"' + c[0] + '"');
        ok(U.parse('abc') === null && U.parse('') === null && U.parse('1/0') === null, 'not lengths');
      });
      U.using('metric', () => {
        const cases = [['2,5', 2.5], ['−3', -3], ['1.5 in', 38.1], ['1 1/2 in', 38.1], ['1.5 cm', 15], ['0.5 m', 500]];
        for (const c of cases) near(U.parse(c[0]), c[1], 1e-9, '"' + c[0] + '"');
        ok(U.parse('3/8') === null, 'fractions only for inches');
      });
    });

    test('values typed in either unit round-trip through the display', () => {
      U.using('imperial', () => {
        for (let s = 1; s < 64; s++) {
          const mm = s / 16 * 25.4;
          near(U.parse(U.num(mm)), mm, 1e-9, s + '/16 in');
        }
      });
      U.using('metric', () => { near(U.parse(U.num(12.34)), 12.3, 1e-9); });
    });

    test('new projects start at round values in the chosen unit', () => {
      const S = root.FB.state;
      if (!S) return;
      const imp = U.using('imperial', () => S.defaultProject());
      near(imp.seamAllowance, 9.525, 1e-9, '3/8 in');
      ok(imp.print.paper === 'Letter' && U.using('imperial', () => U.num(imp.print.overlapMm)) === '5/8', 'Letter, 5/8 in');
      const met = U.using('metric', () => S.defaultProject());
      ok(met.seamAllowance === 10 && met.print.paper === 'A4' && met.print.overlapMm === 15, 'A4, 10 and 15 mm');
    });
  }

  // ---------------------------------------------------------- v0.7 paper

  test('paper sizes: a large sheet holds the whole piece, A4 needs several', () => {
    const rect = [[0, 0], [600, 0], [600, 450], [0, 450]];
    const on = (id) => {
      const pp = G.paperById(id);
      return G.planLayout([rect], rect, { paper: [pp.w, pp.h], margin: 10, overlap: 15, optimise: true });
    };
    const a1 = on('A1');
    ok(a1.count === 1 && a1.orientation === 'landscape' && a1.pageW === 841, 'one A1 landscape: ' + a1.count);
    ok(on('A0').count === 1 && on('ArchD').count === 1, 'A0 and Arch D');
    ok(on('A4').count > on('A3').count && on('A3').count >= on('A2').count, 'more pages on smaller paper');
    ok(on('Letter').pageW === 215.9 || on('Letter').pageW === 279.4, 'Letter size');
    ok(G.paperById('nonsense').id === 'A4', 'unknown paper → A4');
    ok(G.isLargePaper(G.paperById('A2')) && !G.isLargePaper(G.paperById('A3')) && !G.isLargePaper(G.paperById('Tabloid')), 'large sheets');
  });

  // ---------------------------------------------- v0.7 edge names and label

  // A front triangle with a head tube, in image px (y down), front to the right:
  // bottom bracket, top of the seat tube, top and bottom of the head tube.
  const FRONT4 = [[500, 900], [430, 380], [1050, 330], [1080, 480]];
  const frameOf = (pts, names) => ({
    outline: { closed: true, points: pts.map((q) => ({ x: q[0], y: q[1], radius: 0 })), edgeNames: names || [] }
  });

  test('an edge is named after the first name set on its segments', () => {
    const p = frameOf(FRONT4, [null, 'Top tube', null, '  Down tube ']);
    p.outline.points[2].smooth = true; // B–C–D become one edge: the top tube runs into the head tube
    const d = G.computeDerived(p);
    ok(d.sides.length === 3, 'three edges');
    const tt = d.sides[d.segSide[1]];
    ok(tt.label === 'Top tube' && tt.title === 'Top tube' && tt.name === 'B–D', JSON.stringify([tt.label, tt.name]));
    ok(d.sides[d.segSide[3]].label === 'Down tube', 'trimmed');
    ok(d.sides[d.segSide[0]].label === '' && d.sides[d.segSide[0]].title === 'A–B', 'unnamed edges keep their letters');
  });

  test('the pattern label is placed inside the piece, clear of its outline', () => {
    const tri = [[0, 0], [600, 0], [300, 450]];
    const at = G.placeBlock(tri, 80, 30, 6);
    ok(at, 'fits');
    const x0 = at[0] - 46, x1 = at[0] + 46, y0 = at[1] - 21, y1 = at[1] + 21;
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach((q) => ok(G.pointInPolygon(q, tri), 'corner inside'));
    G.segmentsOf([tri]).forEach((s) => ok(!G.segHitsRect(s, x0, y0, x1, y1), 'no line through it'));
    ok(G.placeBlock(tri, 500, 300, 6) === null, 'too big: nowhere');
  });

  if (root.FB.project && root.FB.state) {
    test('names, label and paper are saved and opened; older files print on A4', () => {
      const P = root.FB.project;
      const raw = {
        format: 'framebag-pattern',
        version: 2,
        outline: { closed: true, points: FRONT4.map((q) => ({ x: q[0], y: q[1] })), edgeNames: ['Seat tube', 42, '', ' Head tube '] },
        print: { paper: 'ArchD', showLabel: false },
        label: { piece: 'Left panel', side: 'nondrive', note: 'Zip at the top' }
      };
      const p = P.normalize(raw);
      ok(p.outline.edgeNames.join('|') === 'Seat tube|||Head tube', p.outline.edgeNames.join('|'));
      ok(p.print.paper === 'ArchD' && p.print.showLabel === false, 'print');
      ok(JSON.stringify(p.label) === JSON.stringify({ piece: 'Left panel', side: 'nondrive', note: 'Zip at the top' }), JSON.stringify(p.label));
      const again = P.normalize(JSON.parse(P.serialize(p)));
      ok(JSON.stringify(again.outline) === JSON.stringify(p.outline) && JSON.stringify(again.label) === JSON.stringify(p.label), 'round trip');
      ok(P.normalize(Object.assign({}, raw, { label: { side: 'left' } })).label.side === '', 'unknown side');
      ok(P.normalize(Object.assign({}, raw, { label: { front: 'right' } })).label.side === 'drive', 'front right in the photo: drive side');
      const old = P.normalize({ format: 'framebag-pattern', version: 2, print: { marginMm: 10 } });
      ok(old.print.paper === 'A4' && old.label.piece === 'Side panel' && old.label.side === '', 'v0.6 file');
    });
  }

  // ------------------------------------------------ v1.0 notches and gusset

  // a 100 mm square at 1 px per mm (A 100,100  B 200,100  C 200,200  D 100,200), with design settings
  const SQ = square(100).map((q) => [q[0] + 100, q[1] + 100]);
  function designProject(pts, o) {
    o = o || {};
    return {
      image: { width: 1000, height: 1000 },
      scale: { p1: [0, 0], p2: [1000, 0], lengthMm: 1000 },
      outline: { closed: true, points: pts.map((q) => ({ x: q[0], y: q[1], radius: o.r || 0 })), uniformOffset: 0, edgeOffsets: [] },
      seamAllowance: o.sa == null ? 10 : o.sa,
      design: {
        gusset: { width: 60, join: o.join == null ? null : o.join },
        notches: { corners: o.corners !== false, spacing: o.spacing || null },
        marks: o.marks || [],
        split: o.split || null
      }
    };
  }
  const sOf = (ds, label) => ds.stations.find((st) => st.label === label).s;
  const fromTo = (ds, s0, s) => (((s - s0) % ds.total) + ds.total) % ds.total;

  test('corner notches sit in the middle of each rounding; the runs add up to the stitch line', () => {
    const d = G.computeDerived(designProject(SQ, { r: 10 }));
    const ds = d.design;
    ok(ds && ds.stations.length === 4, 'four corners');
    near(d.perimeter, 4 * 80 + 2 * Math.PI * 10, 1e-6, 'perimeter');
    near(ds.total, d.perimeter, 1e-9, 'total');
    ds.runs.forEach((r) => near(r.len, d.perimeter / 4, 1e-6, 'equal runs'));
    const a = ds.stations.find((st) => st.point === 0);
    near(G.dist(a.at, [110 - 10 / Math.SQRT2, 110 - 10 / Math.SQRT2]), 0, 1e-6, 'half way round corner A');
    near(G.dot(a.nrm, G.norm([-1, -1])), 1, 1e-9, 'pointing out');
    ds.runs.forEach((r) => near(G.pathLength(r.path), r.len, 1e-6, 'run path'));
  });

  test('sharp corners: notches at the corners; between them evenly, about the spacing apart', () => {
    const d = G.computeDerived(designProject(SQ, { spacing: 30 }));
    const ds = d.design;
    ds.stations.forEach((st) => near(G.dist(st.at, SQ[st.point]), 0, 1e-9, 'at the corner'));
    ok(ds.counts.corners === 4 && ds.counts.between === 8, JSON.stringify(ds.counts));
    const first = ds.notches.filter((nn) => nn.run === 0).map((nn) => nn.s).sort((x, y) => x - y);
    near(first[1] - first[0], 100 / 3, 1e-6, 'a third of the edge');
    const none = G.computeDerived(designProject(SQ, { corners: false })).design;
    ok(none.notches.length === 0 && none.counts.corners === 0, 'notches off');
  });

  test('the gusset: one strip, the stitch line plus the seam allowance at both ends, from the join round to it', () => {
    const d = G.computeDerived(designProject(SQ, { r: 10, join: 2 }));
    const gs = d.design.gusset;
    near(gs.cutLen, d.perimeter + 20, 1e-9, 'cut length');
    near(gs.cutWidth, 80, 1e-9, 'cut width');
    ok(gs.marks.map((mk) => mk.corner).join() === '2,3,0,1,2', gs.marks.map((mk) => mk.corner).join());
    near(gs.marks[0].t, 10, 1e-9, 'first notch one seam allowance in');
    near(gs.marks[gs.marks.length - 1].t, 10 + d.perimeter, 1e-9, 'last one at the other end');
    const joins = d.design.notches.filter((nn) => nn.join);
    ok(joins.length === 1 && joins[0].corner === 2 && d.design.join.point === 2, 'double notch at C');
    ok(G.computeDerived(designProject(SQ, { join: 9 })).design.join.point === 0, 'no such corner: the first');
    near(gs.parts.reduce((t, x) => t + x.t1 - x.t0, 0), d.perimeter, 1e-6, 'its parts add up');
  });

  test('the gusset matches the side panel: mark to mark is notch to notch along the stitch line', () => {
    // a sharp square: each two notches in a row lie on one straight edge
    const ds = G.computeDerived(designProject(SQ, { spacing: 30, join: 1 })).design, gs = ds.gusset;
    const seq = ds.notches.slice().sort((a, b) => fromTo(ds, ds.join.s, a.s) - fromTo(ds, ds.join.s, b.s));
    ok(gs.marks.length === seq.length + 1, 'a mark for each notch, and the join again at the far end');
    seq.push(seq[0]);
    for (let i = 0; i + 1 < seq.length; i++) {
      near(gs.marks[i + 1].t - gs.marks[i].t, G.dist(seq[i].at, seq[i + 1].at), 1e-6, 'gap ' + i);
    }
  });

  test('a notch reaches the cut line: the allowance on an edge, the mitre at a sharp corner', () => {
    const ds = G.computeDerived(designProject(SQ, { spacing: 30 })).design;
    ds.notches.filter((nn) => nn.corner == null).forEach((nn) => near(nn.len, 10, 1e-6, 'between'));
    ds.notches.filter((nn) => nn.corner != null).forEach((nn) => near(nn.len, 10 * Math.SQRT2, 1e-6, 'square corner'));
    const round = G.computeDerived(designProject(SQ, { r: 10 })).design;
    round.notches.forEach((nn) => near(nn.len, 10, 0.01, 'rounded corner'));
    ds.pieces[0].notches.forEach((nl) => ok(nl.len >= 10 - 1e-6, 'printed across the allowance'));
  });

  test('the double notch: two notches 4 mm apart along the stitch line, each across the allowance', () => {
    const ds = G.computeDerived(designProject(SQ, { join: 1 })).design;
    const pr = ds.join.pair;
    ok(pr.length === 2, 'two');
    const B = SQ[1];
    pr.forEach((q) => {
      near(G.dist(q.at, B), G.NOTCH_PAIR / 2, 1e-9, '2 mm from the corner');
      near(q.len, 10, 1e-6, 'across the allowance');
      near(Math.abs(G.dot(q.nrm, G.norm(G.sub(q.at, B)))), 0, 1e-9, 'square to its edge');
    });
    const lines = ds.pieces[0].notches;
    ok(lines.length === 3 + 2, 'three single notches and the pair on the side panel: ' + lines.length);
  });

  test('the ends can meet anywhere on the line; near a corner they meet at the corner', () => {
    const ds = G.computeDerived(designProject(SQ, { join: [150, 100] })).design;
    ok(ds.join.free && ds.join.point == null, 'between A and B');
    near(fromTo(ds, sOf(ds, 'A'), ds.join.s), 50, 1e-9, 'half way along A–B');
    const gs = ds.gusset;
    ok(gs.marks.length === 4, 'four corners, no end marks: ' + gs.marks.length);
    near(gs.marks[0].t, 10 + 50, 1e-9, 'B, 50 mm from the join');
    near(gs.marks[3].t, 10 + 350, 1e-9, 'A, 50 mm before the far end');
    near(gs.parts.reduce((t, x) => t + x.t1 - x.t0, 0), 400, 1e-6, 'A–B in two parts, all adding up');
    ok(ds.pieces[0].notches.length === 6, 'four corners and the pair');
    const snap = G.computeDerived(designProject(SQ, { join: [100.3, 100] })).design;
    ok(snap.join.point === 0 && !snap.join.free, 'a third of a millimetre from A: at A');
  });

  test('marks on the stitch line: a notch, a strap and bolt holes, on the side panel and the gusset', () => {
    const ds = G.computeDerived(designProject(SQ, { marks: [
      { kind: 'strap', at: [150, 98], width: 25 },          // half way along A–B, a little off the line
      { kind: 'bolts', at: [200, 150], count: 2, spacing: 64 },
      { kind: 'notch', at: [100, 150] }
    ] })).design;
    const [strap, bolts, notch] = ds.marks;
    near(fromTo(ds, sOf(ds, 'A'), strap.s), 50, 1e-9, 'strap half way along A–B');
    near(fromTo(ds, sOf(ds, 'B'), bolts.holes[0].s), 18, 1e-9, 'first hole');
    near(fromTo(ds, sOf(ds, 'B'), bolts.holes[1].s), 82, 1e-9, 'second hole, 64 mm on');
    ok(ds.counts.marks === 1 && ds.notches.some((nn) => nn.kind === 'mark'), 'the notch is a notch');
    near(G.dist(notch.at, [100, 150]), 0, 1e-9, 'on D–A');
    const m = ds.gusset.mounts;
    ok(m.length === 3 && m[0].kind === 'strap' && m[1].kind === 'bolt', JSON.stringify(m.map((x) => x.kind)));
    near(m[0].t, 10 + 50, 1e-9, 'strap from the left end');
    near(m[2].t - m[1].t, 64, 1e-9, 'holes 64 apart on the strip');
    ok(ds.pieces[0].notches.length === 3 + 2 + 1, 'the side panel: three corners, the double notch at A and the notch');
  });

  test('a split line: two pieces, each with its own seam allowance; the gusset unchanged', () => {
    const split = { p1: [50, 140], p2: [250, 140], keep: 'both' };
    const d = G.computeDerived(designProject(SQ, { split }));
    const ds = d.design;
    ok(ds.split && !ds.clip && ds.pieces.length === 2, 'two pieces');
    near(ds.split.length, 100, 1e-9, 'across the square');
    ok(ds.split.sides.left.concat(ds.split.sides.right).sort().join() === 'A,B,C,D', 'corners on its two sides');
    near(ds.total, 400, 1e-9, 'the gusset goes all round');
    const sizes = ds.pieces.map((pc) => pc.cutSize.map((v) => Math.round(v)).join('x')).sort();
    ok(sizes.join() === '120x60,120x80', sizes.join());
    near(ds.pieces.reduce((t, pc) => t + pc.chain.total, 0), 400 + 200, 1e-6, 'both outlines, the split line twice');
    ok(ds.stations.map((st) => st.label).sort().join() === 'A,B,C,D,E,F', 'E and F where the line meets the outline');
    ok(ds.counts.split === 2, 'notched there on the gusset');
    ds.pieces.forEach((pc) => ok(pc.letters.filter((l) => l.text === 'E' || l.text === 'F').length === 2, 'each piece has E and F'));
    ok(d.ok, d.blocker);
  });

  test('a clip keeps one piece: the gusset goes round it, along the clip line too', () => {
    const top = G.computeDerived(designProject(SQ, { split: { p1: [50, 140], p2: [250, 140], keep: 'right' }, spacing: 30,
      marks: [{ kind: 'notch', at: [150, 200] }, { kind: 'strap', at: [150, 100], width: 25 }] })).design;
    const kept = top.split.sides.right.join();
    ok(top.clip && top.pieces.length === 1, 'one piece');
    const sz = top.pieces[0].cutSize.map((v) => Math.round(v)).join('x');
    ok(kept === 'A,B' ? sz === '120x60' : sz === '120x80', kept + ' ' + sz);
    near(top.total, kept === 'A,B' ? 280 : 320, 1e-6, 'its outline, clip line included');
    near(top.gusset.cutLen, top.total + 20, 1e-9, 'strip');
    ok(top.marks[0].hidden, 'a mark on the part clipped off is left out');
    ok(top.marks[1].hidden === (kept !== 'A,B'), 'a mark on the kept part stays');
    ok(top.stations.filter((st) => st.kind === 'clip').length === 2, 'two new corners');
    ok(top.runs.some((r) => r.isSplit), 'a run along the clip line');
  });

  test('a split line from a corner: that end is the corner, not a new point on top of it', () => {
    // from B (200,100) to the middle of D–A (100,150), and on
    const both = G.computeDerived(designProject(SQ, { split: { p1: [200, 100], p2: [100, 150], keep: 'both' } })).design;
    ok(both.split.a.label === 'B' && both.split.a.point === 1 && both.split.b.label === 'E', both.split.a.label + both.split.b.label);
    ok(both.stations.map((st) => st.label).sort().join() === 'A,B,C,D,E', 'B once: ' + both.stations.map((st) => st.label).join());
    both.pieces.forEach((pc) => ok(pc.letters.filter((l) => l.text === 'B').length === 1, 'B once in each piece'));
    ok(both.runs.every((r) => r.len > 1e-6), 'no empty run');
    const tri = both.split.sides.left.indexOf('A') >= 0 ? 'left' : 'right';
    const clip = G.computeDerived(designProject(SQ, { split: { p1: [200, 100], p2: [100, 150], keep: tri } })).design;
    ok(clip.stations.map((st) => st.label + ':' + st.kind).sort().join() === 'A:corner,B:corner,E:clip', clip.stations.map((st) => st.label + ':' + st.kind).join());
    near(clip.total, 100 + 50 + Math.hypot(100, 50), 1e-6, 'A–B, B–E along the line, E–A');
    const corner = G.computeDerived(designProject(SQ, { split: { p1: [200, 100], p2: [100, 150], keep: tri }, join: 1 })).design;
    ok(corner.join.point === 1 && corner.join.label === 'B', 'the strip can meet at that corner');
  });

  if (root.FB.pdf && root.FB.units) {
    test('the cut list adds up the fabric: two side panels and the gusset strip, seam allowance included', () => {
      const A = root.FB.pdf.cutAreas, U = root.FB.units;
      // a 100 mm square with sharp corners and a 10 mm seam allowance: each side panel is cut 120 × 120
      const a = A(G.computeDerived(designProject(SQ)));
      ok(a.panel.length === 1, 'one side panel');
      near(a.panel[0], 120 * 120, 1e-6, 'side panel');
      near(a.strip, (400 + 20) * (60 + 20), 1e-6, 'gusset strip');
      near(a.total, 2 * 14400 + 33600, 1e-6, 'total');
      // split in two: each part with its own seam allowance along the split line
      const b = A(G.computeDerived(designProject(SQ, { split: { p1: [50, 140], p2: [250, 140], keep: 'both' } })));
      ok(b.panel.length === 2, 'two parts');
      near(b.panel[0] + b.panel[1], 120 * 60 + 120 * 80, 1e-6, 'parts');
      near(b.total, 2 * (7200 + 9600) + 33600, 1e-6, 'total, split');
      U.using('metric', () => ok(U.area(62400) === '0.062 m²' && U.areaNum(62400) === '0.062', U.area(62400)));
      U.using('imperial', () => ok(U.area(232257.6) === '2.50 ft²' && U.areaUnit() === 'ft²', U.area(232257.6)));
    });
  }

  test('a split line that misses the outline is left out, with a message', () => {
    const d = G.computeDerived(designProject(SQ, { split: { p1: [300, 0], p2: [400, 0], keep: 'both' } }));
    ok(!d.design.split && d.design.pieces.length === 1 && d.design.warning, 'no split');
  });

  test('notches only at corners of a curved frame, none at its smooth points', () => {
    const d = G.computeDerived(frameProject(FRAME));
    ok(d.ok && d.design, d.blocker);
    ok(d.design.stations.map((st) => d.labels[st.point]).join() === 'A,C,D,G', d.design.stations.map((st) => d.labels[st.point]).join());
    near(d.design.runs.reduce((t, r) => t + r.len, 0), d.perimeter, 1e-6, 'runs add up');
    d.design.runs.forEach((r) => ok(d.sides[r.side].start === r.from.point, 'run on its edge'));
  });

  if (root.FB.project && root.FB.state) {
    test('the design is saved and opened; older files get the defaults', () => {
      const P = root.FB.project;
      const raw = Object.assign({ format: 'framebag-pattern', version: 2 }, designProject(SQ, {
        spacing: 120, join: [150, 100],
        marks: [{ kind: 'strap', at: [150, 100], width: 25 }, { kind: 'bolts', at: [200, 150], count: 9, spacing: 64 }, { kind: 'x', at: [1, 1] }, { kind: 'notch' }],
        split: { p1: [50, 140], p2: [250, 140], keep: 'right' }
      }));
      raw.image = null;
      const p = P.normalize(raw);
      ok(p.design.gusset.join.join() === '150,100' && p.design.notches.spacing === 120, JSON.stringify(p.design));
      ok(p.design.marks.length === 2 && p.design.marks[1].count === 3, 'unknown and broken marks dropped, counts kept in range');
      ok(p.design.split.keep === 'right', 'split');
      ok(JSON.stringify(P.normalize(JSON.parse(P.serialize(p))).design) === JSON.stringify(p.design), 'round trip');
      raw.design = { gusset: { width: -4, pieces: 'edges', join: 7 }, notches: { corners: 'no', spacing: 0 }, split: { p1: [1, 1], p2: [1, 1] } };
      const q = P.normalize(raw);
      ok(q.design.gusset.width > 0 && q.design.gusset.join === null && q.design.gusset.pieces === undefined &&
        q.design.notches.corners === true && q.design.notches.spacing === null && q.design.split === null, JSON.stringify(q.design));
      const old = P.normalize({ format: 'framebag-pattern', version: 2 });
      ok(old.design.marks.length === 0 && old.design.split === null && old.design.notches.corners === true, 'v0.7 file');
    });
  }

  // ----------------------------------------------------------------- runner

  function run() {
    const results = tests.map((t) => {
      try {
        t.fn();
        return { name: t.name, pass: true };
      } catch (e) {
        return { name: t.name, pass: false, error: e.message };
      }
    });
    return { results, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length };
  }

  root.FBTests = { run };
})(typeof window !== 'undefined' ? window : globalThis);
