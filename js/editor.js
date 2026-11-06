/*
 * Framebag Pattern — editor.js
 *
 * The canvas: photo, outlines, points, the tools (Select, Trace, Guide,
 * Scale, Measure, Level, Split), zoom/pan, the crosshair cursor, the
 * magnifier loupe and the right-click menu; and the two steps (spec v1.0):
 * 01 Trace edits the outline; 02 Design leaves it as traced and shows the
 * side panel's pieces with their notches, places notches, straps and bolt
 * holes on the stitch line and slides them along it, moves the join, and
 * draws the split line.
 *
 * Points are corners (squares) or smooth (circles). Clicking the outline
 * selects the segment under the pointer; the panel and the highlight show
 * the edge it belongs to, from corner to corner.
 *
 * Three coordinate systems (spec §3.1):
 *   image px  — what is stored (points, scale line)
 *   mm        — derived via the scale (finished outline, cut line)
 *   screen px — display only: screen = image · z + t
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const G = FB.geom;
  const fmt = FB.fmt;
  const PF = FB.platform;   // ⌘ on a Mac, Ctrl elsewhere (spec v0.7 A)
  const units = FB.units;   // mm or inches (spec v0.7 B)
  const K = PF.keys;

  const TOOL_NAMES = { select: 'Select', trace: 'Trace', scale: 'Scale', measure: 'Measure', guide: 'Guide', level: 'Level', split: 'Split' };
  const MARK_NAMES = { notch: 'notch', strap: 'strap', bolts: 'bolt holes' };
  const SNAP = 10;       // screen px
  const SNAP_NAMES = { endpoint: 'end point', intersection: 'intersection', perpendicular: 'perpendicular', guide: 'on guide', stitch: 'on the stitch line', corner: 'corner' };
  const HIT_POINT = 8;   // screen px
  const HIT_EDGE = 6;
  const ZMIN = 0.1, ZMAX = 32;
  const LOUPE = 140;

  // DOM
  let stage, svg, photoEl, drawLayer, cursorLayer, loupe, loupeCtx, emptyEl, popEl, popInput, menuEl;

  // view and interaction state (never saved in the project)
  const view = { z: 1, tx: 0, ty: 0, w: 0, h: 0 };
  let tool = 'trace';
  let sel = { point: null, edge: null };
  let hover = { point: null, edge: null, scaleEnd: null, measureEnd: null };
  let drag = null;
  let measure = null;
  const pointer = { x: 0, y: 0, inside: false };
  let spaceHeld = false;
  let loupeAlways = false;
  let loupeFlash = null;
  let derived = null;
  let photoImg = null;
  let currentImage = null;
  let rafId = 0;
  let hintMsg = null;
  let hintTimer = 0;

  const display = { photo: true, traced: true, finished: true, cut: true, labels: true, lengths: true, angles: true, guides: true, scale: true, snap: true };
  let shiftHeld = false;
  let freeHeld = false;      // ⌘ (Ctrl on Windows and Linux) held: place without snapping
  let prevTool = 'trace';    // where leaving the Scale tool goes back to
  // 01 Trace or 02 Design (spec v1.0). Design shows the stitch and cut lines
  // with the notches and edits nothing on the outline: Select and Measure only.
  let mode = 'trace';
  let traceTool = 'trace';   // the tool to come back to in 01 Trace
  let runFlat = [];          // the stitch line of each run, flattened (mm), for hits and highlights
  const DESIGN_TOOLS = ['select', 'measure', 'split'];
  // what is selected in 02 Design: an edge's run (with the spot clicked on it, arc
  // length s), a mark, the join, or the split line
  let dsel = null;           // { kind: 'run', run, s } | { kind: 'mark', index } | { kind: 'join' } | { kind: 'split' }
  const guidesOn = () => display.guides && mode === 'trace';
  let selGuide = null;       // index of the selected guide
  let snapNow = null;        // { pos, kind }: the active snap, marked on the canvas
  let levelPts = [];         // axle points picked so far (Level photo)
  const DISPLAY_KEY = 'framebag-pattern.display';

  // ---------------------------------------------------------- coordinates

  const toImg = (sx, sy) => [(sx - view.tx) / view.z, (sy - view.ty) / view.z];
  const toScr = (p) => [p[0] * view.z + view.tx, p[1] * view.z + view.ty];
  const mmToImg = (q) => [q[0] / derived.scale, q[1] / derived.scale];
  const imgToMm = (q) => [q[0] * derived.scale, q[1] * derived.scale];
  const design = () => (derived && derived.design) || null;
  const mmToScr = (q) => toScr(mmToImg(q));

  function local(e) {
    const r = svg.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  const project = () => FB.state.get();

  // ---------------------------------------------------------------- init

  function init() {
    stage = document.getElementById('stage');
    svg = document.getElementById('canvas');
    photoEl = document.getElementById('photo');
    drawLayer = document.getElementById('layer-draw');
    cursorLayer = document.getElementById('layer-cursor');
    loupe = document.getElementById('loupe');
    loupeCtx = loupe.getContext('2d');
    emptyEl = document.getElementById('empty');
    popEl = document.getElementById('scale-pop');
    popInput = document.getElementById('scale-pop-input');
    menuEl = document.getElementById('ctx-menu');

    try {
      const saved = JSON.parse(localStorage.getItem(DISPLAY_KEY) || 'null');
      if (saved) {
        Object.keys(display).forEach((k) => { if (typeof saved[k] === 'boolean') display[k] = saved[k]; });
        if (typeof saved.loupeAlways === 'boolean') loupeAlways = saved.loupeAlways;
      }
    } catch (e) { /* defaults */ }

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onCancelPointer);
    svg.addEventListener('pointerenter', (e) => { const p = local(e); pointer.x = p[0]; pointer.y = p[1]; pointer.inside = true; requestRender(); });
    svg.addEventListener('pointerleave', () => { pointer.inside = false; hover = blankHover(); if (!drag) snapNow = null; requestRender(); });
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', onContextMenu);
    // any press outside the menu closes it (capture: before the canvas sees it)
    document.addEventListener('pointerdown', (e) => {
      if (!menuEl.hidden && !menuEl.contains(e.target)) hideMenu();
    }, true);
    root.addEventListener('blur', hideMenu);

    popInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitPop(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hidePop(); }
    });
    popInput.addEventListener('input', () => popInput.classList.remove('err'));
    document.getElementById('scale-pop-set').addEventListener('click', commitPop);

    // ⌥ (Alt) while placing a point makes it smooth: show it as soon as it is pressed
    const altKey = (e) => {
      if (e.key !== 'Alt') return;
      // on Windows and Linux a lone Alt would open the browser's menu: not while working on the canvas
      if (!PF.isMac && (drag || pointer.inside)) e.preventDefault();
      if (drag && drag.kind === 'place' && drag.alt !== (e.type === 'keydown')) {
        drag.alt = e.type === 'keydown';
        requestRender();
      }
    };
    root.addEventListener('keydown', altKey);
    root.addEventListener('keyup', altKey);

    // ⌘ (Ctrl) places freely: release a snap as soon as it is pressed, not only on the next move
    const freeKey = (e) => {
      if (e.key !== PF.MOD_KEY || freeHeld === (e.type === 'keydown')) return;
      freeHeld = e.type === 'keydown';
      if (drag && drag.kind === 'point' && drag.moved && drag.raw) applyPointDrag(drag);
      else if (drag && drag.kind === 'place') drag.pos = placePos(drag);
      else if (!drag && pointer.inside) snapNow = hoverSnap(pointer.x, pointer.y);
      requestRender();
    };
    root.addEventListener('keydown', freeKey);
    root.addEventListener('keyup', freeKey);
    root.addEventListener('blur', () => { freeHeld = false; });

    // Shift squares the corner being formed: apply it as soon as it is pressed or let go
    const shiftKey = (e) => {
      if (e.key !== 'Shift' || shiftHeld === (e.type === 'keydown')) return;
      setShift(e.type === 'keydown');
    };
    root.addEventListener('keydown', shiftKey);
    root.addEventListener('keyup', shiftKey);
    root.addEventListener('blur', () => setShift(false));

    stage.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      stage.classList.add('dropping');
    });
    stage.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !stage.contains(e.relatedTarget)) stage.classList.remove('dropping');
    });
    stage.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      stage.classList.remove('dropping');
      const f = e.dataTransfer.files[0];
      if (f && FB.app) FB.app.openDroppedFile(f);
    });

    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      const first = view.w === 0;
      view.w = r.width;
      view.h = r.height;
      if (first && project().image) fit();
      requestRender();
    });
    ro.observe(stage);
    setTool('trace');
  }

  function hasFiles(e) {
    const t = e.dataTransfer && e.dataTransfer.types;
    return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0;
  }

  const blankHover = () => ({ point: null, edge: null, scaleEnd: null, measureEnd: null, design: null });

  /** The edge (corner to corner) holding segment i, or null. */
  const sideOf = (i) => (derived && i != null && i < derived.edgeCount ? derived.segSide[i] : null);

  // -------------------------------------------------------------- hit tests

  function hitPoint(sx, sy) {
    const pts = project().outline.points;
    let best = null, bd = HIT_POINT;
    for (let i = 0; i < pts.length; i++) {
      const s = toScr([pts[i].x, pts[i].y]);
      const d = Math.hypot(s[0] - sx, s[1] - sy);
      if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }

  /** Nearest edge within reach, following curved edges; pos is the nearest point on it (image px). */
  function hitEdge(sx, sy) {
    const d = derived;
    if (!d || !d.edgeFlatPx) return null;
    let best = null;
    for (let i = 0; i < d.edgeCount; i++) {
      const pl = d.edgeFlatPx[i];
      for (let k = 0; k + 1 < pl.length; k++) {
        const r = G.pointSegment([sx, sy], toScr(pl[k]), toScr(pl[k + 1]));
        if (r.d <= HIT_EDGE && (!best || r.d < best.d)) best = { edge: i, d: r.d, pos: G.lerp(pl[k], pl[k + 1], r.t) };
      }
    }
    return best;
  }

  function hitScaleLine(sx, sy) {
    const sc = project().scale;
    if (!sc || (!display.scale && tool !== 'scale')) return false;
    return G.pointSegment([sx, sy], toScr(sc.p1), toScr(sc.p2)).d <= HIT_EDGE;
  }

  function hitEnd(line, sx, sy) {
    if (!line) return null;
    const a = toScr(line.p1), b = toScr(line.p2);
    const da = Math.hypot(a[0] - sx, a[1] - sy), db = Math.hypot(b[0] - sx, b[1] - sy);
    if (Math.min(da, db) > HIT_POINT) return null;
    return da <= db ? 'p1' : 'p2';
  }

  /**
   * 02 Design: the run whose stitch line passes within reach, and the spot on
   * it nearest the pointer (arc length s), or null.
   */
  function hitRun(sx, sy) {
    const D = design();
    if (!D) return null;
    let best = null, bd = HIT_EDGE + 2;
    runFlat.forEach((pl, k) => {
      for (let i = 0; i + 1 < pl.length; i++) {
        const r = G.pointSegment([sx, sy], mmToScr(pl[i]), mmToScr(pl[i + 1]));
        if (r.d <= bd) { bd = r.d; best = k; }
      }
    });
    if (best == null) return null;
    const r = D.runs[best];
    // the spot: on the frame, the nearest point of the stitch line; along a clip line, its middle
    const nb = r.isSplit ? null : G.nearestOnBag(D, imgToMm(toImg(sx, sy)));
    return { kind: 'run', run: best, s: nb ? nb.s : G.wrapIn(D.total, r.s + r.len / 2) };
  }

  /** Screen px per mm. */
  const pxPerMm = () => view.z / derived.scale;

  /** How far a strap's band reaches out from the stitch line, mm: across the tube. */
  const strapOut = () => Math.max(design().sa, 3) + 14 / pxPerMm();

  /**
   * 02 Design: what is under the pointer, in this order: the ends of the
   * selected split line, a mark (the last placed on top), the join, the
   * split line, a run.
   */
  function hitDesign(sx, sy) {
    const D = design();
    if (!D) return null;
    const near = (q, r) => { const P = mmToScr(q); return Math.hypot(P[0] - sx, P[1] - sy) <= r; };
    if (D.split && dsel && dsel.kind === 'split') {
      if (near(D.split.a.at, HIT_POINT)) return { kind: 'split-end', which: 'a' };
      if (near(D.split.b.at, HIT_POINT)) return { kind: 'split-end', which: 'b' };
    }
    const k = pxPerMm();
    for (let i = D.marks.length - 1; i >= 0; i--) {
      const m = D.marks[i];
      if (m.hidden) continue;
      if (m.kind === 'bolts') {
        if (m.holes.some((h) => near(h.at, HIT_POINT))) return { kind: 'mark', index: m.index };
      } else if (m.kind === 'strap') {
        const v = G.sub(imgToMm(toImg(sx, sy)), m.at);
        const along = Math.abs(G.dot(v, m.dir)) * k, out = G.dot(v, m.nrm) * k;
        if (along <= m.width / 2 * k + 3 && out >= -HIT_POINT && out <= strapOut() * k + 3) return { kind: 'mark', index: m.index };
      } else if (near(m.at, HIT_POINT)) {
        return { kind: 'mark', index: m.index };
      }
    }
    if (near(D.join.at, HIT_POINT)) return { kind: 'join' };
    if (D.split && !D.clip && G.pointSegment([sx, sy], mmToScr(D.split.a.at), mmToScr(D.split.b.at)).d <= HIT_EDGE) return { kind: 'split' };
    const r = hitRun(sx, sy);
    if (r && D.clip && D.runs[r.run].isSplit) return { kind: 'split', run: r.run };
    return r;
  }

  // ------------------------------------------------- 02 Design: on the line

  /**
   * Where the line through p along u (image px) crosses the stitch line, as
   * image px points: the whole stitch line, before any split.
   */
  function stitchCrossings(p, u) {
    const D = design();
    if (!D) return [];
    const fin = derived.finishedFlat, P = imgToMm(p), out = [];
    for (let i = 0, n = fin.length; i < n; i++) {
      const a = fin[i], b = fin[(i + 1) % n];
      const X = G.lineIntersect(P, u, a, G.sub(b, a));
      if (X && G.pointSegment(X, a, b).d < 1e-6) out.push(mmToImg(X));
    }
    return out;
  }

  /** The corner (station) of the stitch line within snapping reach of the pointer, other than at `not`. */
  function cornerNear(sx, sy, not) {
    const D = design();
    if (!D) return null;
    let best = null, bd = SNAP;
    // the traced outline's corners, wherever a split line is now
    for (const st of D.corners) {
      const q = mmToImg(st.at);
      if (not && G.dist(q, not) < 1e-6) continue;
      const P = toScr(q), dd = Math.hypot(P[0] - sx, P[1] - sy);
      if (dd <= bd) { bd = dd; best = { pos: q, kind: 'corner', label: st.label }; }
    }
    return best;
  }

  /**
   * The Split tool's end. Snaps, within reach: to a corner (□), else onto the
   * stitch line (○). With Shift, as with the other tools, the line from the
   * first end is horizontal or vertical and only snaps where it crosses the
   * stitch line (×). ⌘ or the Snap toggle places freely. Sets snapNow.
   */
  function splitSnap(sx, sy, from) {
    snapNow = null;
    const q = toImg(sx, sy);
    const snapping = display.snap && !freeHeld && design();
    if (from && shiftHeld) {
      const dv = G.sub(q, from), u = Math.abs(dv[0]) >= Math.abs(dv[1]) ? [1, 0] : [0, 1];
      const onLine = G.add(from, G.mul(u, G.dot(dv, u)));
      if (snapping) {
        let best = null, bd = SNAP;
        for (const X of stitchCrossings(from, u)) {
          if (G.dist(X, from) < 1e-6) continue;
          const P = toScr(X), dd = Math.hypot(P[0] - sx, P[1] - sy);
          if (dd <= bd) { bd = dd; best = X; }
        }
        if (best) { snapNow = { pos: best, kind: 'intersection' }; return best; }
      }
      return onLine;
    }
    if (!snapping) return q;
    const c = cornerNear(sx, sy, from);
    if (c) { snapNow = c; return c.pos; }
    const nr = G.nearestOn(design().full, imgToMm(q));
    if (nr) {
      const P = mmToScr(nr.at);
      if (Math.hypot(P[0] - sx, P[1] - sy) <= SNAP) {
        snapNow = { pos: mmToImg(nr.at), kind: 'stitch' };
        return snapNow.pos;
      }
    }
    return q;
  }

  /**
   * Dragging an end of the split line: it stays on the stitch line. It snaps
   * to a corner (□); with Shift it goes where the horizontal or vertical
   * line through the other end crosses the stitch line, the crossing nearest
   * the pointer (×). Sets snapNow.
   */
  function splitEndAt(sx, sy, fixed) {
    snapNow = null;
    const D = design();
    const q = toImg(sx, sy);
    if (shiftHeld) {
      const dv = G.sub(q, fixed), u = Math.abs(dv[0]) >= Math.abs(dv[1]) ? [1, 0] : [0, 1];
      let best = null, bd = Infinity;
      for (const X of stitchCrossings(fixed, u)) {
        if (G.dist(X, fixed) < 1e-6) continue;
        const dd = G.dist(X, q);
        if (dd < bd) { bd = dd; best = X; }
      }
      if (best) { snapNow = { pos: best, kind: 'intersection' }; return best; }
    }
    if (display.snap && !freeHeld) {
      const c = cornerNear(sx, sy, fixed);
      if (c) { snapNow = c; return c.pos; }
    }
    const nr = G.nearestOn(D.full, imgToMm(q));
    return nr ? mmToImg(nr.at) : null;
  }

  function designDown(s) {
    const h = hitDesign(s[0], s[1]);
    if (!h) { setDesignSelection(null); return; }
    const start = { moved: false, sx: s[0], sy: s[1] };
    if (h.kind === 'split-end') {
      const D = design();
      const other = h.which === 'a' ? D.split.b.at : D.split.a.at;
      drag = Object.assign({ kind: 'split-end', which: h.which, fixed: mmToImg(other), keep: D.split.keep }, start);
    } else if (h.kind === 'mark') {
      setDesignSelection({ kind: 'mark', index: h.index });
      drag = Object.assign({ kind: 'mark', index: h.index }, start);
    } else if (h.kind === 'join') {
      setDesignSelection({ kind: 'join' });
      drag = Object.assign({ kind: 'join' }, start);
    } else if (h.kind === 'split') {
      setDesignSelection({ kind: 'split' });
    } else {
      setDesignSelection({ kind: 'run', run: h.run, s: h.s });
    }
  }

  /** Where the join goes for a spot on the stitch line: a corner's point index near a corner, else the spot. */
  function joinValue(D, sMm, sx, sy) {
    const st = D.stations.find((x) => { const P = mmToScr(x.at); return Math.hypot(P[0] - sx, P[1] - sy) <= SNAP; });
    if (st) return st.kind === 'corner' ? st.point : mmToImg(st.at);
    return mmToImg(G.bagAt(D, sMm).at);
  }

  /** Marks and the join slide along the stitch line; an end of the split line along the outline. */
  function designDrag(dr, s, ip) {
    const D = design();
    if (!D) return;
    if (dr.kind === 'split-end') {
      const q = splitEndAt(s[0], s[1], dr.fixed);
      if (!q) return;
      const line = dr.which === 'a' ? { p1: q, p2: dr.fixed } : { p1: dr.fixed, p2: q };
      if (G.dist(line.p1, line.p2) < 1e-3) return;
      FB.state.update((pp) => { pp.design.split = { p1: line.p1, p2: line.p2, keep: dr.keep }; }, { history: false, reason: 'drag' });
      return;
    }
    const nb = G.nearestOnBag(D, imgToMm(ip));
    if (!nb) return;
    if (dr.kind === 'mark') {
      const q = mmToImg(G.bagAt(D, nb.s).at), k = dr.index;
      FB.state.update((pp) => { if (pp.design.marks[k]) pp.design.marks[k].at = q; }, { history: false, reason: 'drag' });
    } else {
      const v = joinValue(D, nb.s, s[0], s[1]);
      FB.state.update((pp) => { pp.design.gusset.join = v; }, { history: false, reason: 'drag' });
    }
  }

  /** The spot where a mark is added: the one clicked on the selected run. */
  function addSpot() {
    const D = design();
    if (!D || !dsel || dsel.kind !== 'run' || !D.runs[dsel.run] || D.runs[dsel.run].isSplit) return null;
    return dsel.s;
  }

  /** Add a notch, a strap or bolt holes at the spot clicked on the stitch line. */
  function addMark(kind) {
    const D = design();
    const sMm = addSpot();
    if (sMm == null) return false;
    const at = mmToImg(G.bagAt(D, sMm).at);
    const mk = kind === 'strap' ? { kind, at, width: project().design.strapWidth || 25 }
      : kind === 'bolts' ? { kind, at, count: 2, spacing: 64 } : { kind: 'notch', at };
    FB.state.update((pp) => { pp.design.marks = (pp.design.marks || []).concat([mk]); });
    setDesignSelection({ kind: 'mark', index: project().design.marks.length - 1 });
    return true;
  }

  /** The strip's ends meet at the spot clicked on the stitch line. */
  function joinHere() {
    const D = design();
    const sMm = addSpot();
    if (sMm == null) return false;
    const P = mmToScr(G.bagAt(D, sMm).at);
    const v = joinValue(D, sMm, P[0], P[1]);
    FB.state.update((pp) => { pp.design.gusset.join = v; });
    setDesignSelection({ kind: 'join' });
    return true;
  }

  function deleteDesignSelected() {
    if (!dsel) return false;
    if (dsel.kind === 'mark') {
      const k = dsel.index;
      if (!project().design.marks[k]) return false;
      FB.state.update((pp) => { pp.design.marks.splice(k, 1); });
      setDesignSelection(null);
      return true;
    }
    if (dsel.kind === 'split' && project().design.split) {
      FB.state.update((pp) => { pp.design.split = null; });
      setDesignSelection(null);
      return true;
    }
    return false;
  }

  /** Arrow keys: the selected mark or the join along the stitch line, mm. */
  function nudgeDesign(amount) {
    const D = design();
    if (!D || !dsel) return false;
    let s0 = null;
    if (dsel.kind === 'mark' && D.marks[dsel.index] && !D.marks[dsel.index].hidden) s0 = D.marks[dsel.index].s;
    else if (dsel.kind === 'join') s0 = D.join.s;
    if (s0 == null) return false;
    const q = mmToImg(G.bagAt(D, G.wrapIn(D.total, s0 + amount)).at);
    if (dsel.kind === 'mark') {
      const k = dsel.index;
      FB.state.update((pp) => { pp.design.marks[k].at = q; }, { merge: 'nudge-mark-' + k });
    } else {
      FB.state.update((pp) => { pp.design.gusset.join = q; }, { merge: 'nudge-join' });
    }
    return true;
  }

  /** Move the selected mark (or the join) to `dist` mm from the start of its run. */
  function setMarkFrom(dist) {
    const D = design();
    if (!D || !dsel) return false;
    const m = dsel.kind === 'mark' ? D.marks[dsel.index] : null;
    const run = dsel.kind === 'join' ? D.runs[D.join.run] : (m && !m.hidden ? D.runs[m.run] : null);
    if (!run) return false;
    const q = mmToImg(G.bagAt(D, G.wrapIn(D.total, run.s + Math.max(0, Math.min(run.len, dist)))).at);
    if (dsel.kind === 'mark') {
      const k = dsel.index;
      FB.state.update((pp) => { pp.design.marks[k].at = q; });
    } else {
      FB.state.update((pp) => { pp.design.gusset.join = q; });
    }
    return true;
  }

  /** Right-click in 02 Design: add on the line, or delete a mark or the split line. */
  function designMenu(s) {
    const h = hitDesign(s[0], s[1]);
    if (!h || h.kind === 'join') { hideMenu(); return; }
    if (h.kind === 'mark') {
      setDesignSelection({ kind: 'mark', index: h.index });
      const m = project().design.marks[h.index];
      showMenu(s, [{ label: 'Delete ' + MARK_NAMES[m.kind], key: 'Delete', run: deleteDesignSelected }]);
      return;
    }
    if (h.kind === 'split' || h.kind === 'split-end') {
      setDesignSelection({ kind: 'split' });
      showMenu(s, [{ label: 'Delete split line', key: 'Delete', run: deleteDesignSelected }]);
      return;
    }
    setDesignSelection({ kind: 'run', run: h.run, s: h.s });
    showMenu(s, [
      { label: 'Add notch here', run: () => addMark('notch') },
      { label: 'Add strap here', run: () => addMark('strap') },
      { label: 'Add bolt holes here', run: () => addMark('bolts') },
      { label: 'Ends meet here', run: joinHere }
    ]);
  }

  function setDesignSelection(x) {
    if (JSON.stringify(x) === JSON.stringify(dsel)) return;
    dsel = x;
    FB.bus.emit('selection', sel);
    requestRender();
  }

  function computeHover(sx, sy) {
    hover = blankHover();
    const p = project();
    if (!p.image || spaceHeld) return;
    if (mode === 'design') {
      if (tool === 'select') {
        hover.design = hitDesign(sx, sy);
      } else if (tool === 'measure') {
        hover.measureEnd = hitEnd(measure, sx, sy);
      }
      return;
    }
    if (tool === 'select' || tool === 'trace') {
      hover.point = hitPoint(sx, sy);
      if (hover.point == null) hover.edge = hitEdge(sx, sy);
    } else if (tool === 'scale') {
      hover.scaleEnd = hitEnd(p.scale, sx, sy);
    } else if (tool === 'measure') {
      hover.measureEnd = hitEnd(measure, sx, sy);
    }
  }

  // ---------------------------------------------------------- pointer input

  function onDown(e) {
    const p = project();
    const act = document.activeElement;
    if (act && act !== document.body && act.blur) act.blur();
    if (!popEl.hidden) hidePop();
    const s = local(e);
    pointer.x = s[0];
    pointer.y = s[1];
    pointer.inside = true;

    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      drag = { kind: 'pan', sx: s[0], sy: s[1], tx0: view.tx, ty0: view.ty };
      stage.classList.add('panning-active');
      return;
    }
    // Ctrl+click is a right-click on a Mac: leave it to the context menu.
    // On Windows and Linux Ctrl is the key that places freely.
    if (e.button !== 0 || (PF.isMac && e.ctrlKey) || !p.image) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    shiftHeld = e.shiftKey;
    freeHeld = PF.mod(e);
    const ip = toImg(s[0], s[1]);
    const pts = p.outline.points;
    const n = pts.length;

    if (mode === 'design' && tool === 'select') {
      // the outline stays as traced; marks, the join and the split line's ends move along it
      designDown(s);
      requestRender();
      return;
    }
    if (mode === 'design' && tool === 'split') {
      if (!design()) { flashHint('Finish 01 Trace first: close the outline and set the scale.'); return; }
      const p1 = splitSnap(s[0], s[1], null);
      drag = { kind: 'split-new', p1, p2: p1 };
      requestRender();
      return;
    }
    if (tool === 'select' || tool === 'trace') {
      const hp = hitPoint(s[0], s[1]);
      if (tool === 'trace' && hp === 0 && !p.outline.closed && n >= 3) {
        drag = { kind: 'close' };
      } else if (hp != null) {
        setSelection(hp, null);
        drag = { kind: 'point', index: hp, offset: [ip[0] - pts[hp].x, ip[1] - pts[hp].y], moved: false, sx: s[0], sy: s[1] };
      } else {
        const he = hitEdge(s[0], s[1]);
        if (tool === 'select') {
          const hg = he ? null : hitGuide(s[0], s[1]);
          setSelection(null, he ? he.edge : null);
          if (hg != null) {
            selGuide = hg;
            const g = guides()[hg];
            drag = { kind: 'guide-move', index: hg, start: ip, orig: { p1: g.p1.slice(), p2: g.p2.slice() }, moved: false, sx: s[0], sy: s[1] };
          }
        } else if (he) {
          drag = { kind: 'place', insertAt: he.edge + 1, startPos: he.pos, startImg: ip, raw: ip, fromEdge: true, alt: e.altKey };
          drag.pos = placePos(drag);
        } else if (!p.outline.closed) {
          drag = { kind: 'place', insertAt: n, raw: ip, fromEdge: false, alt: e.altKey };
          drag.pos = placePos(drag);
        } else {
          setSelection(null, null);
          flashHint('The outline is closed. Click an edge to add a point there.');
        }
      }
    } else if (tool === 'scale') {
      const end = hitEnd(p.scale, s[0], s[1]);
      if (end) {
        const q = p.scale[end];
        drag = { kind: 'scale-end', which: end, offset: [ip[0] - q[0], ip[1] - q[1]], moved: false };
      } else {
        drag = { kind: 'scale-new', p1: ip, p2: ip };
      }
    } else if (tool === 'measure') {
      const end = hitEnd(measure, s[0], s[1]);
      if (end) {
        const q = measure[end];
        drag = { kind: 'measure-end', which: end, offset: [ip[0] - q[0], ip[1] - q[1]] };
      } else {
        const sn = findSnap(s[0], s[1], { outline: true });
        const p1 = sn ? sn.pos : ip;
        measure = { p1, p2: p1 };
        drag = { kind: 'measure-new' };
      }
    } else if (tool === 'guide') {
      const sn = findSnap(s[0], s[1], { outline: true });
      const p1 = sn ? sn.pos : ip;
      drag = { kind: 'guide-new', p1, p2: p1 };
    } else if (tool === 'level') {
      drag = { kind: 'level-place', pos: ip };
    }
    requestRender();
  }

  function onMove(e) {
    const s = local(e);
    pointer.x = s[0];
    pointer.y = s[1];
    pointer.inside = true;
    shiftHeld = e.shiftKey;
    freeHeld = PF.mod(e);
    snapNow = null;
    const ip = toImg(s[0], s[1]);
    if (drag) {
      switch (drag.kind) {
        case 'pan':
          view.tx = drag.tx0 + (s[0] - drag.sx);
          view.ty = drag.ty0 + (s[1] - drag.sy);
          break;
        case 'point': {
          if (!drag.moved) {
            if (Math.hypot(s[0] - drag.sx, s[1] - drag.sy) < 1) break;
            FB.state.checkpoint();
            drag.moved = true;
          }
          drag.raw = ip;
          applyPointDrag(drag);
          break;
        }
        case 'place':
          drag.raw = ip;
          drag.alt = e.altKey;
          drag.pos = placePos(drag);
          break;
        case 'scale-new':
          drag.p2 = ip;
          break;
        case 'scale-end': {
          if (!drag.moved) {
            FB.state.checkpoint();
            drag.moved = true;
          }
          const which = drag.which, np = G.sub(ip, drag.offset);
          FB.state.update((pp) => { pp.scale[which] = np; }, { history: false, reason: 'drag' });
          break;
        }
        case 'measure-new': {
          snapNow = findSnap(s[0], s[1], { outline: true, from: measure.p1 });
          measure.p2 = snapNow ? snapNow.pos : ip;
          break;
        }
        case 'measure-end': {
          const q = G.sub(ip, drag.offset), other = measure[drag.which === 'p1' ? 'p2' : 'p1'];
          snapNow = findSnap.apply(null, toScr(q).concat([{ outline: true, from: other }]));
          measure[drag.which] = snapNow ? snapNow.pos : q;
          break;
        }
        case 'guide-new':
          if (shiftHeld) {
            // horizontal or vertical; snaps only where that line crosses guides or the outline
            const dv = G.sub(ip, drag.p1), L = { p: drag.p1, u: Math.abs(dv[0]) >= Math.abs(dv[1]) ? [1, 0] : [0, 1] };
            snapNow = findSnap(s[0], s[1], { line: L, from: drag.p1 });
            drag.p2 = snapNow ? snapNow.pos : G.add(L.p, G.mul(L.u, G.dot(dv, L.u)));
          } else {
            snapNow = findSnap(s[0], s[1], { outline: true, from: drag.p1 });
            drag.p2 = snapNow ? snapNow.pos : ip;
          }
          break;
        case 'guide-move': {
          if (!drag.moved) {
            if (Math.hypot(s[0] - drag.sx, s[1] - drag.sy) < 1) break;
            FB.state.checkpoint();
            drag.moved = true;
          }
          // parallel to itself: only along its normal; snaps through points and intersections
          const o = drag.orig, nrm = G.norm(G.perp(G.sub(o.p2, o.p1)));
          const off0 = G.dot(G.sub(ip, drag.start), nrm);
          snapNow = guideMoveSnap(o, nrm, off0, drag.index);
          const off = snapNow ? snapNow.off : off0;
          const gi = drag.index;
          FB.state.update((pp) => { pp.guides[gi] = { p1: G.add(o.p1, G.mul(nrm, off)), p2: G.add(o.p2, G.mul(nrm, off)) }; }, { history: false, reason: 'drag' });
          break;
        }
        case 'level-place':
          drag.pos = ip;
          break;
        case 'split-new':
          drag.p2 = splitSnap(s[0], s[1], drag.p1);
          break;
        case 'mark':
        case 'join':
        case 'split-end':
          if (!drag.moved) {
            if (Math.hypot(s[0] - drag.sx, s[1] - drag.sy) < 2) break;
            FB.state.checkpoint();
            drag.moved = true;
          }
          designDrag(drag, s, ip);
          break;
        default:
          break;
      }
    } else {
      computeHover(s[0], s[1]);
      snapNow = hoverSnap(s[0], s[1]);
    }
    requestRender();
  }

  function onUp(e) {
    try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
    stage.classList.remove('panning-active');
    if (!drag) return;
    const d = drag;
    drag = null;
    const p = project();
    switch (d.kind) {
      case 'place':
        d.alt = e.altKey;
        shiftHeld = e.shiftKey;
        d.pos = placePos(d);
        commitPlace(d);
        break;
      case 'close': {
        const s = local(e);
        if (hitPoint(s[0], s[1]) === 0) closeOutline();
        break;
      }
      case 'scale-new': {
        const a = toScr(d.p1), b = toScr(d.p2);
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= 5) {
          const prev = p.scale && p.scale.lengthMm ? p.scale.lengthMm : null;
          FB.state.update((pp) => { pp.scale = { p1: d.p1, p2: d.p2, lengthMm: prev }; });
          showPop(prev);
        }
        break;
      }
      case 'measure-new': {
        const a = toScr(measure.p1), b = toScr(measure.p2);
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) measure = null;
        break;
      }
      case 'guide-new': {
        const a = toScr(d.p1), b = toScr(d.p2);
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= 5) {
          FB.state.update((pp) => { pp.guides = (pp.guides || []).concat([{ p1: d.p1.slice(), p2: d.p2.slice() }]); });
        }
        break;
      }
      case 'split-new': {
        const a = toScr(d.p1), b = toScr(d.p2);
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= 5) {
          FB.state.update((pp) => { pp.design.split = { p1: d.p1.slice(), p2: d.p2.slice(), keep: 'both' }; });
          setTool('select');
          setDesignSelection(design() && design().split ? { kind: 'split' } : null);
          if (!design() || !design().split) flashHint('The split line must cross the outline: draw it from one edge to another.');
        }
        break;
      }
      case 'level-place':
        levelPts.push(d.pos);
        if (levelPts.length === 2) {
          const a = levelPts[0], b = levelPts[1];
          levelPts = [];
          setTool(prevTool || 'trace');
          if (FB.app) FB.app.levelPhoto(a, b);
        }
        break;
      default:
        break;
    }
    const s = local(e);
    computeHover(s[0], s[1]);
    snapNow = hoverSnap(s[0], s[1]);
    requestRender();
  }

  const REVERTS = ['point', 'scale-end', 'guide-move', 'mark', 'join', 'split-end'];

  function onCancelPointer() {
    if (drag && REVERTS.indexOf(drag.kind) >= 0 && drag.moved) FB.state.revert();
    drag = null;
    stage.classList.remove('panning-active');
    requestRender();
  }

  /**
   * Notches turned on a mouse wheel (positive: away from you), or 0 for a
   * trackpad. Read deltaMode before the deltas: Firefox then reports mouse
   * wheels in lines (mode 1) and trackpads in pixels (mode 0). Chrome and
   * Edge report both in pixels; there a mouse wheel moves in steps of 120
   * (wheelDeltaY), which a trackpad does not: macOS trackpads report
   * wheelDeltaY = −3 × deltaY, Windows touchpads small, uneven steps.
   */
  function wheelNotches(e) {
    const mode = e.deltaMode;
    if (mode === 1) return -e.deltaY / 3;
    if (mode === 2) return -e.deltaY;
    if (PF.isFirefox) return 0;
    const w = e.wheelDeltaY;
    if (typeof w !== 'number' || !w || e.deltaX || w % 120 !== 0 || w === -3 * e.deltaY) return 0;
    return w / 120;
  }

  function onWheel(e) {
    e.preventDefault();
    hideMenu();
    const mode = e.deltaMode;
    const notches = wheelNotches(e);
    const dx = e.deltaX, dy = e.deltaY;
    const s = local(e);
    if (notches) {
      // mouse wheel, with or without a modifier: zoom at the cursor
      zoomAt(s[0], s[1], Math.pow(1.2, notches));
    } else if (e.ctrlKey || e.metaKey) {
      // trackpad pinch arrives as ctrl + wheel; ⌘ + scroll zooms too
      const k = mode === 0 ? 0.01 : (mode === 1 ? 0.06 : 0.2);
      zoomAt(s[0], s[1], Math.exp(-dy * k));
    } else {
      // two-finger scroll on the trackpad: pan
      view.tx -= dx;
      view.ty -= dy;
      requestRender();
    }
  }

  // ------------------------------------------------------ right-click menu

  function onContextMenu(e) {
    e.preventDefault();
    if (drag || !project().image) return;
    const s = local(e);
    if (mode === 'design') { designMenu(s); return; }
    const p = project();
    const hp = hitPoint(s[0], s[1]);
    if (hp != null) {
      setSelection(hp, null);
      const label = derived.labels[hp];
      const items = [];
      if (canSmooth(hp)) {
        items.push(derived.smooth[hp]
          ? { label: 'Make ' + label + ' a corner', run: () => setSmooth(hp, false) }
          : { label: 'Make ' + label + ' smooth', run: () => setSmooth(hp, true) });
      }
      items.push({ label: 'Delete point ' + label, key: 'Delete', run: () => deletePoint(hp) });
      showMenu(s, items);
      return;
    }
    const he = hitEdge(s[0], s[1]);
    if (he) {
      const name = G.edgeName(derived.labels, he.edge);
      const pos = he.pos;
      setSelection(null, he.edge);
      showMenu(s, [
        { label: 'Add point on ' + name, run: () => commitPlace({ insertAt: he.edge + 1, pos, fromEdge: true }) },
        derived.curved[he.edge]
          ? { label: 'Make ' + name + ' straight', run: () => makeStraight(he.edge) }
          : { label: 'Make ' + name + ' curved', run: () => makeCurved(he.edge) }
      ]);
      return;
    }
    const hg = hitGuide(s[0], s[1]);
    if (hg != null) {
      setSelection(null, null);
      selGuide = hg;
      requestRender();
      showMenu(s, [{ label: 'Delete guide', key: 'Delete', run: () => { selGuide = hg; deleteSelected(); } }]);
      return;
    }
    if (hitScaleLine(s[0], s[1])) {
      showMenu(s, [{ label: 'Reset scale', run: resetScale }]);
      return;
    }
    hideMenu();
  }

  function showMenu(at, items) {
    menuEl.textContent = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctx-item';
      b.setAttribute('role', 'menuitem');
      const label = document.createElement('span');
      label.textContent = it.label;
      b.appendChild(label);
      if (it.key) {
        const k = document.createElement('kbd');
        k.textContent = it.key;
        b.appendChild(k);
      }
      b.addEventListener('click', () => {
        hideMenu();
        it.run();
      });
      menuEl.appendChild(b);
    }
    menuEl.hidden = false;
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    let x = at[0] + 2, y = at[1] + 2;
    if (x + w > view.w - 4) x = at[0] - w - 2;
    if (y + h > view.h - 4) y = at[1] - h - 2;
    menuEl.style.transform = 'translate(' + Math.round(Math.max(4, x)) + 'px,' + Math.round(Math.max(4, y)) + 'px)';
  }

  function hideMenu() {
    if (menuEl && !menuEl.hidden) menuEl.hidden = true;
  }

  // ------------------------------------------------------------- editing

  // ----------------------------------------------------- Shift: square corners
  //
  // Placing a new last point: the new line runs in 90° steps from the line
  // before it (horizontal or vertical for the first line). Dragging a point,
  // or inserting one, between two neighbours: the corner at the point becomes
  // 90°, so it slides on the circle whose diameter joins the neighbours. Not
  // where the corner to square is a smooth point. All in image px.

  const ptAt = (i) => { const q = project().outline.points[i]; return q ? [q.x, q.y] : null; };
  const smoothFlag = (i) => { const q = project().outline.points[i]; return !!(q && q.smooth); };

  /** p moved onto the line from b in 90° steps from the line a → b (or the photo's axes). */
  function squareFrom(p, b, a) {
    const u = a && G.dist(a, b) > 1e-9 ? G.norm(G.sub(b, a)) : [1, 0];
    const v = G.perp(u), dv = G.sub(p, b);
    const axis = Math.abs(G.dot(dv, u)) >= Math.abs(G.dot(dv, v)) ? u : v;
    return G.add(b, G.mul(axis, G.dot(dv, axis)));
  }

  /** p moved onto the circle with diameter a–c, where the corner a–p–c is 90°. */
  function squareBetween(p, a, c) {
    const m = G.lerp(a, c, 0.5), r = G.dist(a, c) / 2, v = G.sub(p, m), l = G.len(v);
    return l > 1e-9 && r > 1e-9 ? G.add(m, G.mul(v, r / l)) : p;
  }

  /** Direction in which the open outline arrives at its last point (image px), or null. */
  function incomingDir() {
    const n = project().outline.points.length;
    if (!derived || n < 2) return null;
    const ps = derived.tracedPieces.filter((e) => e.seg === n - 2);
    const t = ps.length ? G.elTangent(ps[ps.length - 1], 1) : G.norm(G.sub(ptAt(n - 1), ptAt(n - 2)));
    return t[0] || t[1] ? t : null;
  }

  /** Shift's line for a new last point: square to (or along) the arriving direction, or horizontal/vertical. */
  function squareLine(p) {
    const n = project().outline.points.length;
    if (n === 0 || (n >= 2 && smoothFlag(n - 1))) return null;
    const b = ptAt(n - 1), u = (n >= 2 && incomingDir()) || [1, 0];
    const v = G.perp(u), dv = G.sub(p, b);
    return { p: b, u: Math.abs(G.dot(dv, u)) >= Math.abs(G.dot(dv, v)) ? u : v };
  }

  /** Where a new last point at raw goes, and the snap used: with Shift on its line, else snapped. */
  function appendPos(raw) {
    const n = project().outline.points.length;
    if (shiftHeld) {
      const L = squareLine(raw);
      if (!L) return { pos: raw, snap: null };
      const sn = snapAt(raw, { line: L, from: L.p });
      return { pos: sn ? sn.pos : G.add(L.p, G.mul(L.u, G.dot(G.sub(raw, L.p), L.u))), snap: sn };
    }
    const ref = n >= 2 && !smoothFlag(n - 1) ? incomingDir() : null;
    const sn = snapAt(raw, { from: n ? ptAt(n - 1) : null, refs: ref ? [ref] : null });
    return { pos: sn ? sn.pos : raw, snap: sn };
  }

  const snapAppend = (p) => appendPos(p).pos;

  /** Point i (existing) dragged to p. */
  function snapExisting(p, i) {
    const pp = project(), n = pp.outline.points.length;
    if (!shiftHeld || n < 2) return p;
    const closed = pp.outline.closed && n >= 3;
    if (closed || (i > 0 && i < n - 1)) {
      if (smoothFlag(i)) return p;
      return squareBetween(p, ptAt((i - 1 + n) % n), ptAt((i + 1) % n));
    }
    // an end of an open outline: square the corner at its neighbour
    const b = i === 0 ? 1 : n - 2, a = i === 0 ? 2 : n - 3;
    if (a >= 0 && a < n && smoothFlag(b)) return p;
    return squareFrom(p, ptAt(b), a >= 0 && a < n ? ptAt(a) : null);
  }

  /** Where a point being placed goes: snapped, or squared with Shift. */
  function placePos(dr) {
    const raw = dr.fromEdge ? G.add(dr.startPos, G.sub(dr.raw, dr.startImg)) : dr.raw;
    if (!dr.fromEdge) {
      const r = appendPos(raw);
      snapNow = r.snap;
      return r.pos;
    }
    const n = project().outline.points.length;
    const smooth = dr.alt || (derived && derived.curved[dr.insertAt - 1]);
    if (shiftHeld) {
      snapNow = null;
      return smooth ? raw : squareBetween(raw, ptAt(dr.insertAt - 1), ptAt(dr.insertAt % n));
    }
    snapNow = snapAt(raw, {});
    return snapNow ? snapNow.pos : raw;
  }

  function applyPointDrag(dr) {
    const i = dr.index, n = project().outline.points.length, raw = G.sub(dr.raw, dr.offset);
    const prev = project().outline.closed || i > 0 ? ptAt((i - 1 + n) % n) : null;
    snapNow = shiftHeld ? null : snapAt(raw, { from: prev, skip: i });
    const q = snapNow ? snapNow.pos : snapExisting(raw, i);
    FB.state.update((pp) => { pp.outline.points[i].x = q[0]; pp.outline.points[i].y = q[1]; }, { history: false, reason: 'drag' });
  }

  function setShift(down) {
    shiftHeld = down;
    if (drag && drag.kind === 'point' && drag.moved && drag.raw) applyPointDrag(drag);
    else if (drag && drag.kind === 'place') drag.pos = placePos(drag);
    else if (drag && drag.kind === 'split-new') drag.p2 = splitSnap(pointer.x, pointer.y, drag.p1);
    else if (drag && drag.kind === 'split-end' && drag.moved) designDrag(drag, [pointer.x, pointer.y], toImg(pointer.x, pointer.y));
    requestRender();
  }

  // ------------------------------------------------- guides and snapping
  //
  // Guides are infinite construction lines through two points (image px),
  // saved with the project. Snapping (spec v0.5 B), within SNAP screen px,
  // lower rank first, then nearest: 1 end point, 2 intersection,
  // 3 perpendicular from `from`, 4 on a guide. Hidden guides do not snap;
  // ⌘ or the Snap toggle turns it off.

  const guides = () => project().guides || [];

  /** Foot of the perpendicular from q on the line a–b; null outside the segment when bounded. */
  function foot(q, a, b, bounded) {
    const ab = G.sub(b, a), l2 = G.dot(ab, ab);
    if (l2 < 1e-12) return null;
    const t = G.dot(G.sub(q, a), ab) / l2;
    return bounded && (t < 0 || t > 1) ? null : G.add(a, G.mul(ab, t));
  }

  /**
   * The snap for screen position (sx, sy), or null. opts.from: where the line
   * being drawn starts (perpendicular snaps); opts.outline: also snap to the
   * outline's points; opts.skip: the point being dragged (its segments are ignored).
   */
  function findSnap(sx, sy, opts) {
    if (!display.snap || freeHeld || !derived) return null;
    opts = opts || {};
    const d = derived, S = [sx, sy], found = [], F = opts.from || null;
    const consider = (q, rank, kind) => {
      if (!q || !isFinite(q[0]) || !isFinite(q[1])) return;
      if (F && G.dist(q, F) < 1e-6) return; // never onto the start itself
      const dd = G.dist(toScr(q), S);
      if (dd <= SNAP) found.push([rank, dd, q, kind]);
    };
    const gl = guidesOn() ? guides().filter((_, i) => i !== opts.skipGuide) : [];
    const near = (i) => opts.skip != null && (i === opts.skip || (i + 1) % d.n === opts.skip);
    const segs = [], straight = [];
    d.edgeFlatPx.forEach((pl, i) => {
      if (near(i)) return;
      for (let k = 0; k + 1 < pl.length; k++) segs.push([pl[k], pl[k + 1]]);
      if (!d.curved[i] && pl.length >= 2) straight.push([pl[0], pl[pl.length - 1]]);
    });
    // where the line p + t·u crosses the guides and the outline
    const crossings = (p, u, rank, kind) => {
      gl.forEach((g) => consider(G.lineIntersect(p, u, g.p1, G.sub(g.p2, g.p1)), rank, kind));
      for (const sg of segs) {
        const X = G.lineIntersect(p, u, sg[0], G.sub(sg[1], sg[0]));
        if (X && G.pointSegment(X, sg[0], sg[1]).d < 1e-4) consider(X, rank, kind);
      }
    };
    const pick = () => {
      if (!found.length) return null;
      found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return { pos: found[0][2], kind: found[0][3] };
    };
    if (opts.line) { // Shift: only where its line crosses guides or the outline
      crossings(opts.line.p, opts.line.u, 2, 'intersection');
      return pick();
    }
    if (opts.outline) d.tracedPx.forEach((q, i) => { if (i !== opts.skip) consider(q, 1, 'endpoint'); });
    gl.forEach((g, i) => {
      const u = G.sub(g.p2, g.p1);
      for (let j = i + 1; j < gl.length; j++) consider(G.lineIntersect(g.p1, u, gl[j].p1, G.sub(gl[j].p2, gl[j].p1)), 2, 'intersection');
      for (const sg of segs) {
        const X = G.lineIntersect(g.p1, u, sg[0], G.sub(sg[1], sg[0]));
        if (X && G.pointSegment(X, sg[0], sg[1]).d < 1e-4) consider(X, 2, 'intersection');
      }
    });
    const P = toImg(sx, sy);
    if (F) {
      // square lines through the start: to the given directions, and to guides and straight edges through it
      const refs = (opts.refs || []).slice();
      gl.forEach((g) => { const f = foot(F, g.p1, g.p2, false); if (f && G.dist(f, F) < 1e-6) refs.push(G.sub(g.p2, g.p1)); });
      straight.forEach((e) => { if (G.pointSegment(F, e[0], e[1]).d < 1e-6) refs.push(G.sub(e[1], e[0])); });
      refs.forEach((r) => {
        const nrm = G.norm(G.perp(r));
        if (!nrm[0] && !nrm[1]) return;
        crossings(F, nrm, 2, 'perpendicular');
        consider(G.add(F, G.mul(nrm, G.dot(G.sub(P, F), nrm))), 3, 'perpendicular');
      });
      gl.forEach((g) => consider(foot(F, g.p1, g.p2, false), 3, 'perpendicular'));
      straight.forEach((e) => consider(foot(F, e[0], e[1], true), 3, 'perpendicular'));
    }
    if (!opts.noGuide) gl.forEach((g) => consider(foot(P, g.p1, g.p2, false), 4, 'guide'));
    return pick();
  }

  const snapAt = (q, opts) => { const P = toScr(q); return findSnap(P[0], P[1], opts); };

  /**
   * A guide moving parallel (offset off along nrm from its original o) snaps
   * when it passes within SNAP screen px of an outline point or of an
   * intersection of other guides (with each other or with the outline),
   * anywhere along its length.
   */
  function guideMoveSnap(o, nrm, off, skip) {
    if (!display.snap || freeHeld || !derived) return null;
    const cands = derived.tracedPx.map((q) => [q, 'endpoint']);
    const gl = guidesOn() ? guides().filter((_, i) => i !== skip) : [];
    const segs = [];
    derived.edgeFlatPx.forEach((pl) => { for (let k = 0; k + 1 < pl.length; k++) segs.push([pl[k], pl[k + 1]]); });
    gl.forEach((g, i) => {
      const u = G.sub(g.p2, g.p1);
      for (let j = i + 1; j < gl.length; j++) {
        const X = G.lineIntersect(g.p1, u, gl[j].p1, G.sub(gl[j].p2, gl[j].p1));
        if (X) cands.push([X, 'intersection']);
      }
      for (const sg of segs) {
        const X = G.lineIntersect(g.p1, u, sg[0], G.sub(sg[1], sg[0]));
        if (X && G.pointSegment(X, sg[0], sg[1]).d < 1e-4) cands.push([X, 'intersection']);
      }
    });
    let best = null;
    for (const c of cands) {
      const oq = G.dot(G.sub(c[0], o.p1), nrm), dd = Math.abs(oq - off) * view.z;
      if (dd <= SNAP && (!best || dd < best.dd)) best = { pos: c[0], kind: c[1], off: oq, dd };
    }
    return best;
  }

  /** The snap shown while only hovering, before pressing. */
  function hoverSnap(sx, sy) {
    const p = project();
    if (!p.image || spaceHeld) return null;
    if (tool === 'guide' || tool === 'measure') return findSnap(sx, sy, { outline: true });
    if (tool === 'split' && mode === 'design') { splitSnap(sx, sy, null); return snapNow; }
    if (tool === 'trace' && !p.outline.closed && hover.point == null && !hover.edge) return appendPos(toImg(sx, sy)).snap;
    return null;
  }

  /** A guide on screen, long enough to cross the whole canvas. */
  function guideSegment(g) {
    const a = toScr(g.p1), u = G.norm(G.sub(toScr(g.p2), a));
    if (!u[0] && !u[1]) return null;
    const L = G.len(a) + view.w + view.h + 100;
    return [G.sub(a, G.mul(u, L)), G.add(a, G.mul(u, L))];
  }

  function hitGuide(sx, sy) {
    if (!guidesOn()) return null;
    let best = null, bd = HIT_EDGE;
    guides().forEach((g, i) => {
      const a = toScr(g.p1), u = G.norm(G.sub(toScr(g.p2), a));
      if (!u[0] && !u[1]) return;
      const dd = Math.abs(G.cross(u, G.sub([sx, sy], a)));
      if (dd <= bd) { bd = dd; best = i; }
    });
    return best;
  }

  function drawGuides() {
    let s = '';
    if (guidesOn()) {
      guides().forEach((g, i) => {
        const seg = guideSegment(g);
        if (seg) s += '<path class="ln-guide' + (i === selGuide ? ' sel' : '') + '" d="' + pathD(seg) + '"/>';
      });
    }
    if (drag && drag.kind === 'guide-new' && G.dist(drag.p1, drag.p2) > 1e-9) {
      s += '<path class="ln-guide new" d="' + pathD(guideSegment(drag)) + '"/>';
    }
    return s;
  }

  /** The one active snap: □ end point or corner, × intersection, ⊥ perpendicular, ⧗ on a guide, ○ on the stitch line. */
  function drawSnap() {
    if (!snapNow) return '';
    const P = toScr(snapNow.pos), x = r1(P[0]), y = r1(P[1]), r = 5;
    const k = snapNow.kind;
    let dd;
    if (k === 'endpoint') dd = 'M' + (x - r) + ' ' + (y - r) + 'H' + (x + r) + 'V' + (y + r) + 'H' + (x - r) + 'Z';
    else if (k === 'corner') dd = 'M' + (x - 6) + ' ' + (y - 6) + 'H' + (x + 6) + 'V' + (y + 6) + 'H' + (x - 6) + 'Z';
    else if (k === 'intersection') dd = 'M' + (x - r) + ' ' + (y - r) + 'L' + (x + r) + ' ' + (y + r) + 'M' + (x + r) + ' ' + (y - r) + 'L' + (x - r) + ' ' + (y + r);
    else if (k === 'perpendicular') dd = 'M' + (x - r) + ' ' + (y + r) + 'H' + (x + r) + 'M' + x + ' ' + (y + r) + 'V' + (y - r);
    else if (k === 'stitch') dd = 'M' + (x - r) + ' ' + y + 'A' + r + ' ' + r + ' 0 1 0 ' + (x + r) + ' ' + y + 'A' + r + ' ' + r + ' 0 1 0 ' + (x - r) + ' ' + y;
    else dd = 'M' + (x - r) + ' ' + (y - r) + 'H' + (x + r) + 'L' + (x - r) + ' ' + (y + r) + 'H' + (x + r) + 'Z';
    return '<path class="snap-h" d="' + dd + '"/><path class="snap" d="' + dd + '"/>';
  }

  /** Scale on, or back to the tool used before it. */
  function toggleScale() {
    if (tool === 'scale') {
      hidePop();
      setTool(prevTool || 'trace');
    } else {
      setTool('scale');
    }
  }

  // ------------------------------------------------------------ level photo

  function startLevel() {
    if (!project().image) return false;
    setTool('level');
    levelPts = [];
    requestRender();
    return true;
  }

  /** The axle picked first, the line to the second and its tilt in degrees. */
  function drawLevel() {
    if (tool !== 'level') return '';
    const placing = drag && drag.kind === 'level-place' ? drag.pos : null;
    const a = levelPts[0], b = placing || (pointer.inside ? toImg(pointer.x, pointer.y) : null);
    let s = '';
    if (a && b) {
      const A = toScr(a), B = toScr(b);
      s += stroke(pathD([A, B]), 'ln-rubber', 3);
      let th = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      if (th > 90) th -= 180;
      else if (th <= -90) th += 180;
      s += text((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 10, fmt(Math.abs(th)) + '°', 'mid live');
    }
    for (const q of levelPts.concat(placing ? [placing] : [])) {
      const P = toScr(q);
      s += '<circle class="pt-h" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="7"/><circle class="pt" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="7"/>';
    }
    return s;
  }

  // ------------------------------------------------------------ inside angles

  /** Angle at b between the lines to a and c, in degrees: inside the outline (sgn ±1) or the smaller one (sgn 0). */
  function cornerAngle(a, b, c, sgn) {
    const u = G.sub(b, a), v = G.sub(c, b);
    if (!G.len(u) || !G.len(v)) return null;
    const turn = Math.atan2(G.cross(u, v), G.dot(u, v)) / G.DEG;
    return sgn ? 180 - sgn * turn : 180 - Math.abs(turn);
  }

  /** The angle at b written inside the corner a–b–c (image px in, SVG out). */
  function angleText(a, b, c, value, sgn, live) {
    if (value == null) return '';
    const ua = G.norm(G.sub(a, b)), uc = G.norm(G.sub(c, b));
    let dir;
    if (sgn) {
      const na = G.outwardNormal(G.mul(ua, -1), sgn), nc = G.outwardNormal(uc, sgn);
      dir = G.norm(G.add(na, nc));
      dir = dir[0] || dir[1] ? G.mul(dir, -1) : G.mul(na, -1);
    } else {
      dir = G.norm(G.add(ua, uc));
      if (!dir[0] && !dir[1]) dir = G.perp(uc);
    }
    const P = toScr(b);
    return text(P[0] + dir[0] * 20, P[1] + dir[1] * 20 + 4, fmt(value) + '°', 'mid ang' + (live ? ' live' : ''));
  }

  /**
   * The gusset's join corner is stored as a point index: keep it on the same
   * corner when a point is inserted at index i (dir +1) or deleted (dir −1);
   * deleting the corner itself moves the join back to the first corner.
   */
  function shiftJoin(pp, i, dir) {
    const g = pp.design && pp.design.gusset;
    if (!g || typeof g.join !== 'number') return;   // a spot between corners stays where it is
    if (dir > 0 && g.join >= i) g.join += 1;
    else if (dir < 0 && g.join === i) g.join = null;
    else if (dir < 0 && g.join > i) g.join -= 1;
  }

  /** Make sure the per-segment lists are as long as the point list. */
  function padEdges(pp) {
    const n = pp.outline.points.length;
    if (!pp.outline.edgeStraight) pp.outline.edgeStraight = [];
    if (!pp.outline.edgeNames) pp.outline.edgeNames = [];
    while (pp.outline.edgeOffsets.length < n) pp.outline.edgeOffsets.push(null);
    while (pp.outline.edgeStraight.length < n) pp.outline.edgeStraight.push(false);
    while (pp.outline.edgeNames.length < n) pp.outline.edgeNames.push(null);
  }

  /**
   * Add a point. On an edge it splits that segment, and both halves keep its
   * offset. The new point is smooth when ⌥ (Alt) is held (d.alt) or when it
   * lands on a curve, so the curve stays smooth; a smooth point needs curves
   * on both sides, so its two segments are not kept straight.
   */
  function commitPlace(d) {
    const pos = d.pos;
    const at = d.insertAt;
    const onCurve = !!(d.fromEdge && derived && derived.curved[at - 1]);
    const smooth = !!d.alt || onCurve;
    FB.state.update((pp) => {
      padEdges(pp);
      const pts = pp.outline.points, eo = pp.outline.edgeOffsets, es = pp.outline.edgeStraight, en = pp.outline.edgeNames;
      const q = { x: pos[0], y: pos[1], radius: 0, smooth };
      shiftJoin(pp, at, +1);
      if (d.fromEdge && at > 0) {
        // both halves keep the edge's offset and name
        pts.splice(at, 0, q);
        eo.splice(at, 0, eo[at - 1] != null ? eo[at - 1] : null);
        es.splice(at, 0, !smooth && !!es[at - 1]);
        en.splice(at, 0, en[at - 1] || null);
        if (smooth) es[at - 1] = false;
      } else {
        pts.splice(at, 0, q);
        eo.splice(at, 0, null);
        es.splice(at, 0, false);
        en.splice(at, 0, null);
        if (at > 0) es[at - 1] = false; // the new segment into this point
      }
    });
    setSelection(at, null);
  }

  /** Only points with a neighbour on each side can be smooth. */
  function canSmooth(i) {
    const d = derived;
    if (!d || i == null || i >= d.n) return false;
    return d.closed ? true : i > 0 && i < d.n - 1;
  }

  /** Make point i smooth (on) or a corner. */
  function setSmooth(i, on) {
    if (!canSmooth(i)) return false;
    const n = derived.n;
    FB.state.update((pp) => {
      padEdges(pp);
      const es = pp.outline.edgeStraight, prev = (i - 1 + n) % n;
      pp.outline.points[i].smooth = !!on;
      // a smooth point needs a curve on at least one side
      if (on && es[prev] && es[i]) {
        es[prev] = false;
        es[i] = false;
      }
    });
    setSelection(i, null);
    return true;
  }

  /**
   * Curve segment i. Next to a smooth point it just stops being kept
   * straight. Between two corners there is nothing to bend it by, so a smooth
   * point is added half way, ready to be dragged onto the curve of the tube.
   */
  function makeCurved(i) {
    const d = derived;
    if (!d || i == null || i >= d.edgeCount || d.curved[i]) return false;
    const j = (i + 1) % d.n;
    if (d.smoothFlag[i] || d.smoothFlag[j]) {
      FB.state.update((pp) => {
        padEdges(pp);
        pp.outline.edgeStraight[i] = false;
      });
      setSelection(null, i);
      return true;
    }
    commitPlace({ insertAt: i + 1, pos: G.lerp(d.tracedPx[i], d.tracedPx[j], 0.5), fromEdge: true, alt: true });
    flashHint('Drag the new point onto the curve of the tube.');
    return true;
  }

  /** Keep segment i straight; a curve next to it leaves in its direction. */
  function makeStraight(i) {
    const d = derived;
    if (!d || i == null || i >= d.edgeCount || !d.curved[i]) return false;
    FB.state.update((pp) => {
      padEdges(pp);
      pp.outline.edgeStraight[i] = true;
    });
    setSelection(null, i);
    return true;
  }

  function resetScale() {
    if (!project().scale) return false;
    hidePop();
    FB.state.update((pp) => { pp.scale = null; });
    setTool('scale');
    flashHint('Scale cleared. Drag along the reference marking to set it again.');
    return true;
  }

  function closeOutline() {
    const p = project();
    if (mode === 'design' || p.outline.closed || p.outline.points.length < 3) return false;
    FB.state.update((pp) => { pp.outline.closed = true; });
    flashHint('Outline closed. Adjust offsets and corners in the panel on the right.');
    return true;
  }

  function deleteSelected() {
    if (mode === 'design') return deleteDesignSelected();
    if (selGuide != null && selGuide < guides().length) {
      const k = selGuide;
      selGuide = null;
      FB.state.update((pp) => { pp.guides = (pp.guides || []).filter((_, j) => j !== k); });
      return true;
    }
    const i = sel.point;
    const p = project();
    if (i == null || i >= p.outline.points.length) return false;
    const wasClosed = p.outline.closed;
    FB.state.update((pp) => {
      padEdges(pp);
      const m0 = pp.outline.points.length, es = pp.outline.edgeStraight, en = pp.outline.edgeNames;
      const prev = (i - 1 + m0) % m0;
      // the two segments at the point become one, kept straight only if both
      // were, and named after the first of them that has a name
      es[prev] = !!es[prev] && !!es[i];
      if (pp.outline.closed || (i > 0 && i < m0 - 1)) en[prev] = en[prev] || en[i] || null;
      shiftJoin(pp, i, -1);
      pp.outline.points.splice(i, 1);
      pp.outline.edgeOffsets.splice(i, 1);
      es.splice(i, 1);
      en.splice(i, 1);
      if (pp.outline.points.length < 3) pp.outline.closed = false;
    });
    const n = project().outline.points.length;
    if (!n) setSelection(null, null);
    else setSelection(wasClosed && n >= 3 ? (i - 1 + n) % n : Math.max(0, i - 1), null);
    if (wasClosed && !project().outline.closed) flashHint('Fewer than 3 points: the outline is open again.');
    return true;
  }

  function deletePoint(i) {
    setSelection(i, null);
    return deleteSelected();
  }

  function nudge(dx, dy) {
    // 02 Design: along the stitch line, 1 mm a step (right and up forward, left and down back)
    if (mode === 'design') return nudgeDesign(dx || -dy);
    const i = sel.point;
    const p = project();
    if (i == null || i >= p.outline.points.length) return false;
    FB.state.update((pp) => { pp.outline.points[i].x += dx; pp.outline.points[i].y += dy; }, { merge: 'nudge-' + i });
    loupeFlash = {
      until: performance.now() + 900,
      target: () => { const q = project().outline.points[i]; return q ? [q.x, q.y] : null; }
    };
    setTimeout(requestRender, 920);
    ensureVisible(i);
    return true;
  }

  function cycle(dir) {
    const n = project().outline.points.length;
    if (!n || mode === 'design') return false;
    const cur = sel.point == null ? (dir > 0 ? -1 : 0) : sel.point;
    const next = (cur + dir + n) % n;
    setSelection(next, null);
    ensureVisible(next);
    return true;
  }

  function ensureVisible(i) {
    const q = project().outline.points[i];
    if (!q) return;
    const s = toScr([q.x, q.y]);
    const m = 48;
    if (s[0] < m || s[1] < m || s[0] > view.w - m || s[1] > view.h - m) {
      view.tx = view.w / 2 - q.x * view.z;
      view.ty = view.h / 2 - q.y * view.z;
    }
    requestRender();
  }

  /** Esc: cancel the current drag, popover, measurement or selection. */
  function cancel() {
    if (!menuEl.hidden) { hideMenu(); return true; }
    if (drag) {
      if (REVERTS.indexOf(drag.kind) >= 0 && drag.moved) FB.state.revert();
      if (drag.kind === 'measure-new') measure = null;
      drag = null;
      stage.classList.remove('panning-active');
      requestRender();
      return true;
    }
    if (!popEl.hidden) { hidePop(); return true; }
    if (tool === 'level') { levelPts = []; setTool(prevTool || 'trace'); return true; }
    if (measure) { measure = null; requestRender(); return true; }
    if (selGuide != null) { selGuide = null; requestRender(); return true; }
    if (mode === 'design' && dsel) { setDesignSelection(null); return true; }
    if (sel.point != null || sel.edge != null) { setSelection(null, null); return true; }
    return false;
  }

  function setSelection(point, edge) {
    if (selGuide != null) { selGuide = null; requestRender(); }
    if (sel.point === point && sel.edge === edge) return;
    sel = { point, edge };
    FB.bus.emit('selection', sel);
    requestRender();
  }

  /**
   * 01 Trace or 02 Design. Design starts with Select and leaves the outline
   * alone; Trace comes back with the tool used there before. A tool that only
   * Trace has (Trace, Guide, Scale, Level) brings Trace back by itself.
   */
  function setMode(m) {
    if (m !== 'trace' && m !== 'design') return;
    if (m === mode || drag) return;
    if (m === 'design') {
      traceTool = ['scale', 'level'].indexOf(tool) >= 0 ? (prevTool || 'trace') : tool;
      applyMode('design');
      // an edge selected in 01 Trace stays selected, as its run
      const D = design(), side = sideOf(sel.edge);
      const r = D && side != null ? D.runs.findIndex((x) => x.side === side) : -1;
      dsel = r >= 0 ? { kind: 'run', run: r, s: G.wrapIn(D.total, D.runs[r].s + D.runs[r].len / 2) } : null;
      setSelection(null, sel.edge);
      setTool('select');
    } else {
      // and the other way round
      const D = design();
      const run = D && dsel && dsel.kind === 'run' ? D.runs[dsel.run] : null;
      if (run && run.side != null && derived.sides[run.side]) setSelection(null, derived.sides[run.side].segs[0]);
      dsel = null;
      applyMode('trace');
      setTool(traceTool || 'trace');
    }
  }

  function applyMode(m) {
    mode = m;
    hidePop();
    hideMenu();
    levelPts = [];
    selGuide = null;
    stage.classList.toggle('mode-design', m === 'design');
    document.documentElement.setAttribute('data-mode', m);
    FB.bus.emit('mode', m);
    requestRender();
  }

  function setTool(t) {
    if (drag) return;
    if (t === 'split' && mode !== 'design') setMode('design');
    if (mode === 'design' && DESIGN_TOOLS.indexOf(t) < 0) { dsel = null; applyMode('trace'); }
    if ((t === 'scale' || t === 'level') && tool !== t) prevTool = tool;
    if (t !== tool) hintMsg = null; // an old message would hide the new tool's hint
    if (t !== 'level') levelPts = [];
    snapNow = null;
    if (t !== 'measure') measure = null;
    if (t !== 'scale' && !popEl.hidden) hidePop();
    hideMenu();
    tool = t;
    ['select', 'trace', 'scale', 'measure', 'guide', 'split'].forEach((k) => stage.classList.toggle('tool-' + k, k === t));
    hover = blankHover();
    FB.bus.emit('tool', t);
    requestRender();
  }

  // ------------------------------------------------------------ view control

  function zoomAt(sx, sy, factor) {
    const z1 = Math.min(ZMAX, Math.max(ZMIN, view.z * factor));
    const f = z1 / view.z;
    view.tx = sx - (sx - view.tx) * f;
    view.ty = sy - (sy - view.ty) * f;
    view.z = z1;
    requestRender();
  }

  function zoomBy(factor) { zoomAt(view.w / 2, view.h / 2, factor); }

  function fit() {
    const img = project().image;
    if (!img || !view.w) return;
    const pad = 32;
    const z = Math.min((view.w - 2 * pad) / img.width, (view.h - 2 * pad) / img.height);
    view.z = Math.min(ZMAX, Math.max(ZMIN, z));
    view.tx = (view.w - img.width * view.z) / 2;
    view.ty = (view.h - img.height * view.z) / 2;
    requestRender();
  }

  function actualSize() { zoomAt(view.w / 2, view.h / 2, 1 / view.z); }

  function setSpace(down) {
    if (spaceHeld === down) return;
    spaceHeld = down;
    stage.classList.toggle('panning', down);
    hover = blankHover();
    requestRender();
  }

  function toggleLoupe() {
    loupeAlways = !loupeAlways;
    saveDisplay();
    flashHint(loupeAlways ? 'Loupe always on while hovering (L to turn off).' : 'Loupe only while placing or dragging.');
    FB.bus.emit('display', display);
    requestRender();
  }

  function setDisplay(key, value) {
    if (key === 'loupeAlways') loupeAlways = !!value;
    else display[key] = !!value;
    saveDisplay();
    FB.bus.emit('display', display);
    requestRender();
  }

  function saveDisplay() {
    try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(Object.assign({ loupeAlways }, display))); } catch (e) { /* view only */ }
  }

  // --------------------------------------------------------- scale popover

  function showPop(prefill) {
    popEl.hidden = false;
    popInput.classList.remove('err');
    popInput.value = prefill ? units.num(prefill, 1, '-') : '';
    positionPop();
    popInput.focus();
    popInput.select();
  }

  function hidePop() { popEl.hidden = true; }

  function commitPop() {
    const v = units.parse(popInput.value);
    if (v == null || v <= 0) {
      popInput.classList.add('err');
      popInput.focus();
      return;
    }
    FB.state.update((pp) => { if (pp.scale) pp.scale.lengthMm = v; });
    hidePop();
    setTool(prevTool || 'trace'); // the Scale button turns black again
    flashHint('Scale set. Use Measure (M) to check another known length.');
  }

  function positionPop() {
    if (popEl.hidden) return;
    const sc = project().scale;
    if (!sc) { hidePop(); return; }
    const a = toScr(sc.p1), b = toScr(sc.p2);
    const w = popEl.offsetWidth, h = popEl.offsetHeight;
    let x = (a[0] + b[0]) / 2 - w / 2;
    let y = Math.max(a[1], b[1]) + 20;
    x = Math.max(8, Math.min(view.w - w - 8, x));
    if (y + h > view.h - 8) y = Math.min(a[1], b[1]) - h - 20;
    y = Math.max(8, y);
    popEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  // ------------------------------------------------------------------ hints

  function flashHint(msg) {
    hintMsg = msg;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { hintMsg = null; requestRender(); }, 4000);
    requestRender();
  }

  function hintText() {
    if (snapNow) return K('Snap: ' + SNAP_NAMES[snapNow.kind] + (snapNow.label ? ' ' + snapNow.label : '') + '. Hold ⌘ to place freely.');
    if (hintMsg) return hintMsg;
    const p = project();
    if (!p.image) return 'Load a photo to start, or drop a photo or project file onto the canvas.';
    if (spaceHeld) return 'Drag to pan.';
    if (mode === 'design') {
      if (!design()) return 'Finish 01 Trace first: close the outline and set the scale.';
      if (tool === 'measure') return 'Drag to measure a distance. Drag its ends to adjust. Esc clears it.';
      if (drag && drag.kind === 'split-new') {
        const cr = G.dist(drag.p1, drag.p2) > 1e-9 ? G.splitCrossings(design().full, imgToMm(drag.p1), imgToMm(drag.p2)) : null;
        return cr ? 'Split line, ' + units.len(G.dist(cr.a.at, cr.b.at)) + ' across. Release to place it; Shift keeps it horizontal or vertical.'
                  : 'Draw the line across the outline, from one edge to another.';
      }
      if (tool === 'split') return 'Drag across the panel, from one edge to another, to split it. Its ends snap to the corners and the stitch line; Shift keeps it horizontal or vertical.';
      if (drag && drag.kind === 'split-end') return 'Drag the end of the split line along the outline.';
      if (dsel && (dsel.kind === 'mark' || dsel.kind === 'join')) {
        return placeText() + (drag ? '' : ' Drag it along the stitch line; arrow keys move it 1 mm, Shift 10.' + (dsel.kind === 'mark' ? ' Delete removes it.' : ''));
      }
      if (dsel && dsel.kind === 'split') return 'Drag an end of the split line along the outline; choose the piece to keep in the panel. Delete removes it.';
      if (dsel && dsel.kind === 'run') return 'Add a notch, a strap or bolt holes at the spot, in the panel or with a right-click on the line.';
      return 'Click the stitch line to add notches, straps or bolt holes there. Split (K) draws a split line. Lengths run from notch to notch.';
    }
    const n = p.outline.points.length;
    switch (tool) {
      case 'select':
        return 'Click a point or edge to select it, drag to move. Right-click a point where the tube curves to make it smooth.';
      case 'trace':
        if (p.outline.closed) return 'Click an edge to insert a point. Right-click a point to make it smooth or delete it.';
        if (n === 0) return 'Press and drag to place the first point, release to set it.';
        if (n < 3) return K('Press, drag to refine, release to place the next point. Shift squares the corner, ⌥ makes a smooth point.');
        return K('Place more points (Shift squares the corner, ⌥ makes a smooth point), or click the first point or press Enter to close.');
      case 'scale':
        return p.scale ? 'Drag an end of the scale line to adjust it, or drag elsewhere to draw it again.'
                       : 'Drag from one end of the reference to the other, then enter its real length.';
      case 'measure':
        return 'Drag to measure a distance. Drag its ends to adjust. Esc clears it.';
      case 'level':
        return levelPts.length ? 'Now click the centre of the other wheel’s axle. Esc cancels.'
                               : 'Level photo: click the centre of one wheel’s axle (press, refine with the loupe, release). Esc cancels.';
      case 'guide':
        return 'Drag through two points to draw a guide; Shift makes it horizontal or vertical. To remove one, select it (V) and press Delete.';
      default:
        return '';
    }
  }

  // ------------------------------------------------------------- rendering

  function requestRender() {
    if (!rafId) rafId = requestAnimationFrame(draw);
  }

  function setDerived(d) {
    derived = d;
    runFlat = d && d.design ? d.design.runs.map((r) => G.flatten(r.path, 0.2, true)) : [];
    // a design selection that no longer exists is let go
    const D = d && d.design;
    if (dsel && (!D ||
        (dsel.kind === 'run' && !D.runs[dsel.run]) ||
        (dsel.kind === 'mark' && (!D.marks[dsel.index] || D.marks[dsel.index].hidden)) ||
        (dsel.kind === 'split' && !D.split))) {
      dsel = null;
      FB.bus.emit('selection', sel);
    }
    hideMenu();
    if (selGuide != null && selGuide >= guides().length) selGuide = null;
    if (sel.point != null && sel.point >= d.n) setSelection(null, sel.edge);
    if (sel.edge != null && sel.edge >= d.edgeCount) setSelection(sel.point, null);
    requestRender();
  }

  function setPhoto(img) {
    currentImage = img;
    if (!img) {
      photoEl.removeAttribute('href');
      photoImg = null;
      return;
    }
    photoEl.setAttribute('href', img.dataUrl);
    photoEl.setAttribute('width', img.width);
    photoEl.setAttribute('height', img.height);
    const im = new Image();
    im.onload = requestRender;
    im.src = img.dataUrl;
    photoImg = im;
  }

  const r1 = (v) => Math.round(v * 10) / 10;

  function pathD(pts, closed) {
    let s = '';
    for (let i = 0; i < pts.length; i++) s += (i ? 'L' : 'M') + r1(pts[i][0]) + ' ' + r1(pts[i][1]);
    return closed ? s + 'Z' : s;
  }

  function stroke(d, cls, halo) {
    return '<path class="halo" style="stroke-width:' + halo + 'px" d="' + d + '"/><path class="' + cls + '" d="' + d + '"/>';
  }

  function text(x, y, str, cls) {
    return '<text class="tx ' + (cls || '') + '" x="' + r1(x) + '" y="' + r1(y) + '">' + esc(str) + '</text>';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Outward unit direction at vertex i of a closed outline (screen space). */
  function vertexOut(pts, i, sgn) {
    const n = pts.length;
    const a = G.norm(G.sub(pts[i], pts[(i - 1 + n) % n]));
    const b = G.norm(G.sub(pts[(i + 1) % n], pts[i]));
    const na = G.outwardNormal(a, sgn), nb = G.outwardNormal(b, sgn);
    const m = G.norm(G.add(na, nb));
    return m[0] || m[1] ? m : na;
  }

  function draw() {
    rafId = 0;
    const p = project();
    const img = p.image;
    emptyEl.hidden = !!img;
    stage.classList.toggle('no-image', !img);
    if (img !== currentImage) setPhoto(img);
    if (img) {
      photoEl.setAttribute('transform', 'matrix(' + view.z + ' 0 0 ' + view.z + ' ' + view.tx + ' ' + view.ty + ')');
      photoEl.setAttribute('opacity', p.view.photoOpacity);
      photoEl.classList.toggle('pixelated', view.z >= 3);
      photoEl.style.display = display.photo ? '' : 'none';
    }
    let s = '';
    if (img && derived) {
      s = mode === 'design'
        ? drawOutlines(p) + drawDesign() + drawScaleLine(p) + drawMeasure() + drawSnap()
        : drawGuides() + drawOutlines(p) + drawScaleLine(p) + drawMeasure() + drawPoints(p) + drawPreview(p) + drawLevel() + drawSnap();
    }
    drawLayer.innerHTML = s;
    drawCursor();
    drawLoupe();
    positionPop();
    updateStatus();
  }

  /** Screen path of segment i, following its curve. */
  const edgeD = (i) => pathD(derived.edgeFlatPx[i].map(toScr));
  /** Screen path of edge k, from corner to corner. */
  const sideD = (k) => pathD(derived.sides[k].flatPx.map(toScr));

  function drawOutlines(p) {
    const d = derived;
    let s = '';
    // traced first, so the finished outline stays visible where they coincide
    if (display.traced && d.n >= 2) s += stroke(pathD(d.tracedPathPx.map(toScr), d.closed), 'ln-traced', 3);
    // 02 Design: each piece of the side panel, its cut line and stitch line;
    // where a clip leaves part of the outline out, that part faint
    if (mode === 'design' && d.geometryOk && d.design) {
      const D = d.design;
      if (D.clip && display.finished) s += '<path class="ln-gone" d="' + pathD(d.finishedFlat.map(mmToScr), true) + '"/>';
      for (const pc of D.pieces) {
        if (display.cut && pc.cutFlat) s += stroke(pathD(pc.cutFlat.map(mmToScr), true), 'ln-cut', 3);
        if (display.finished) s += stroke(pathD(pc.finFlat.map(mmToScr), true), 'ln-fin', 3.5);
      }
      return s;
    }
    if (d.geometryOk) {
      if (display.cut) s += stroke(pathD(d.cutFlat.map(mmToScr), true), 'ln-cut', 3);
      if (display.finished) s += stroke(pathD(d.finishedFlat.map(mmToScr), true), 'ln-fin', 3.5);
    }
    for (const i of d.badEdges) {
      if (i < d.edgeCount) s += stroke(edgeD(i), 'ln-bad', 5);
    }
    // 02 Design marks its edges on the stitch line, in drawDesign
    if (mode === 'design') return s;
    const selSide = sideOf(sel.edge);
    if (tool === 'select' && hover.edge && hover.point == null && !drag) {
      const hs = sideOf(hover.edge.edge);
      if (hs != null && hs !== selSide) s += stroke(sideD(hs), 'ln-hover', 4);
    }
    if (selSide != null) s += stroke(sideD(selSide), 'ln-sel', 5);
    return s;
  }

  // ------------------------------------------------- 02 Design: drawing

  /**
   * 02 Design on the canvas: the edge (run) under the pointer and the
   * selected one; the split line with its ends when selected; the notches
   * of every piece across the seam allowance, the double notch where the
   * gusset strip's ends meet; straps as bands across the tube and bolt
   * holes as circles; the corner letters outside the cut line; each run's
   * name and length along the stitch line, from notch to notch; and the
   * spot clicked on the selected run, where a mark would be added.
   */
  function drawDesign() {
    const d = derived;
    const D = d && d.design;
    if (!D) return '';
    let s = '';
    const hv = tool === 'select' && !drag ? hover.design : null;
    const runSel = dsel && dsel.kind === 'run' ? dsel.run : -1;
    if (hv && hv.kind === 'run' && hv.run !== runSel && runFlat[hv.run]) s += stroke(pathD(runFlat[hv.run].map(mmToScr)), 'ln-hover', 4);
    if (runSel >= 0 && runFlat[runSel]) s += stroke(pathD(runFlat[runSel].map(mmToScr)), 'ln-sel', 5);
    if (D.split) {
      const A = mmToScr(D.split.a.at), B = mmToScr(D.split.b.at);
      const on = dsel && dsel.kind === 'split';
      if (on) s += stroke(pathD([A, B]), 'ln-sel', 5);
      else if (hv && hv.kind === 'split') s += stroke(pathD([A, B]), 'ln-hover', 4);
      if (on) for (const P of [A, B]) s += '<rect class="pt-h" x="' + r1(P[0] - 4) + '" y="' + r1(P[1] - 4) + '" width="8" height="8"/><rect class="pt" x="' + r1(P[0] - 4) + '" y="' + r1(P[1] - 4) + '" width="8" height="8"/>';
    }

    // notches: from the stitch line out to the cut line, at least NOTCH_MIN long
    const notchD = (q) => pathD([mmToScr(q.at), mmToScr(G.add(q.at, G.mul(q.nrm, Math.max(q.len, G.NOTCH_MIN))))]);
    let dd = '';
    for (const pc of D.pieces) for (const nl of pc.notches) dd += notchD(nl);
    if (dd) s += stroke(dd, 'ln-notch', 3.5);
    // the selected notch, or the join's double notch, in red
    let red = '';
    if (dsel && dsel.kind === 'join') for (const q of D.join.pair) red += notchD(q);
    if (dsel && dsel.kind === 'mark') {
      const nn = D.notches.find((x) => x.kind === 'mark' && x.mark === dsel.index);
      if (nn) red += notchD(nn);
    }
    if (red) s += '<path class="ln-notch sel" d="' + red + '"/>';

    // straps across the tube, bolt holes on the line
    const k = pxPerMm();
    for (const m of D.marks) {
      if (m.hidden || m.kind === 'notch') continue;
      const on = dsel && dsel.kind === 'mark' && dsel.index === m.index;
      if (m.kind === 'strap') {
        const P = (along, out) => mmToScr(G.add(G.add(m.at, G.mul(m.dir, along)), G.mul(m.nrm, out)));
        const h = m.width / 2, o = strapOut();
        s += '<path class="mk-strap' + (on ? ' sel' : '') + '" d="' + pathD([P(-h, 0), P(h, 0), P(h, o), P(-h, o)], true) + '"/>';
      } else if (m.kind === 'bolts') {
        const r = Math.max(4, 3 * k);
        for (const hl of m.holes) {
          const P = mmToScr(hl.at);
          s += '<circle class="mk-bolt-h" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="' + r1(r) + '"/>' +
               '<circle class="mk-bolt' + (on ? ' sel' : '') + '" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="' + r1(r) + '"/>' +
               '<path class="mk-bolt' + (on ? ' sel' : '') + '" d="M' + r1(P[0] - r - 3) + ' ' + r1(P[1]) + 'H' + r1(P[0] + r + 3) + 'M' + r1(P[0]) + ' ' + r1(P[1] - r - 3) + 'V' + r1(P[1] + r + 3) + '"/>';
        }
      }
    }

    // letters at the corners and at the ends of the split line, outside the cut line
    const out = (at, nrm, len, px) => {
      const P = mmToScr(G.add(at, G.mul(nrm, Math.max(len, G.NOTCH_MIN))));
      return [P[0] + nrm[0] * px, P[1] + nrm[1] * px];
    };
    // a corner the Split tool snaps to: its letter red
    const snapped = snapNow && snapNow.kind === 'corner' ? snapNow.label : null;
    let shown = false;
    if (display.labels) {
      for (const st of D.stations) {
        const P = out(st.at, st.nrm, st.len, 11);
        const live = st.label === snapped;
        if (live) shown = true;
        s += text(P[0], P[1] + 4, st.label, 'mid pl' + (live ? ' live' : (st.kind === 'split' ? ' soft' : '')));
      }
    }
    if (snapped && !shown) {
      const P = toScr(snapNow.pos);
      s += text(P[0] + 12, P[1] - 10, snapped, 'mid pl live');
    }
    // each run's name and length along the stitch line, half way along it
    if (display.lengths || display.labels) {
      D.runs.forEach((r) => {
        if (r.len * k < 60) return;
        const named = display.labels && r.title && r.title !== r.name;
        if (!display.lengths && !named) return;
        const nrm = G.outwardNormal(r.dir, d.sgn);
        const P = out(r.mid, nrm, D.sa, 14);
        const str = (named ? r.title : '') + (named && display.lengths ? '  ' : '') + (display.lengths ? units.num(r.len) : '');
        s += text(P[0], P[1] + 4, str, 'mid len');
      });
      // a split line keeping both pieces is no run of the gusset: its length beside it
      if (D.split && !D.clip && display.lengths && D.split.length * k >= 60) {
        const A = mmToScr(D.split.a.at), B = mmToScr(D.split.b.at);
        s += lineLabel(A, B, units.num(D.split.length), 'len');
      }
    }

    // the Split tool while drawing: its line, faint, across the canvas; and in
    // red the cut it makes, from one crossing of the stitch line to the other
    if (drag && drag.kind === 'split-new' && G.dist(drag.p1, drag.p2) > 1e-9) {
      const seg = guideSegment(drag);
      if (seg) s += '<path class="ln-split-guide" d="' + pathD(seg) + '"/>';
      const cr = G.splitCrossings(D.full, imgToMm(drag.p1), imgToMm(drag.p2));
      if (cr) {
        const A = mmToScr(cr.a.at), B = mmToScr(cr.b.at);
        s += stroke(pathD([A, B]), 'ln-split', 4.5) + '<path class="ln-split" d="' + endTicks(A, B) + '"/>' +
             lineLabel(A, B, units.num(G.dist(cr.a.at, cr.b.at)), 'live');
      }
    }

    // where a mark would be added on the selected run
    if (runSel >= 0 && dsel.s != null && !D.runs[runSel].isSplit) {
      const P = mmToScr(G.bagAt(D, dsel.s).at);
      s += '<circle class="spot-h" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="5"/><circle class="spot" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="5"/>';
    }
    return s;
  }

  /** "120.0 mm from B, 331.6 mm to C": where arc length s lies on run ri. */
  function whereOnRun(D, s, ri) {
    const r = D.runs[ri];
    if (!r) return '';
    const a = G.wrapIn(D.total, s - r.s);
    return units.len(a) + ' from ' + (r.from ? r.from.label : 'the start') + ', ' + units.len(Math.max(0, r.len - a)) + ' to ' + (r.to ? r.to.label : 'the end');
  }

  /** The command line for the selected mark or the join: what it is and where. */
  function placeText() {
    const D = design();
    if (!D || !dsel) return '';
    if (dsel.kind === 'join') return 'Ends meet: ' + whereOnRun(D, D.join.s, D.join.run) + '.';
    const m = D.marks[dsel.index];
    if (!m || m.hidden) return '';
    const name = MARK_NAMES[m.kind];
    return name.charAt(0).toUpperCase() + name.slice(1) + ': ' + whereOnRun(D, m.s, m.run) + '.';
  }

  /** Point half way along a polyline (image px), the direction of travel there and its length. */
  function polyMiddle(pl) {
    let total = 0;
    for (let k = 0; k + 1 < pl.length; k++) total += G.dist(pl[k], pl[k + 1]);
    let run = 0;
    for (let k = 0; k + 1 < pl.length; k++) {
      const L = G.dist(pl[k], pl[k + 1]);
      if (run + L >= total / 2 && L > 0) return { at: G.lerp(pl[k], pl[k + 1], (total / 2 - run) / L), dir: G.norm(G.sub(pl[k + 1], pl[k])), len: total };
      run += L;
    }
    return { at: pl[0], dir: [1, 0], len: total };
  }

  function endTicks(A, B) {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 0.5) return '';
    const nx = -(B[1] - A[1]) / L * 6, ny = (B[0] - A[0]) / L * 6;
    return pathD([[A[0] + nx, A[1] + ny], [A[0] - nx, A[1] - ny]]) + pathD([[B[0] + nx, B[1] + ny], [B[0] - nx, B[1] - ny]]);
  }

  function lineLabel(A, B, str, cls) {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    let nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
    if (ny > 0) { nx = -nx; ny = -ny; } // label above the line
    return text((A[0] + B[0]) / 2 + nx * 12, (A[1] + B[1]) / 2 + ny * 12 + 4, str, 'mid ' + (cls || ''));
  }

  function drawScaleLine(p) {
    let a, b, label;
    if (drag && drag.kind === 'scale-new') {
      a = drag.p1;
      b = drag.p2;
      label = fmt(G.dist(a, b), 0) + ' px';
    } else if (p.scale) {
      a = p.scale.p1;
      b = p.scale.p2;
      label = p.scale.lengthMm ? units.len(p.scale.lengthMm) : 'length?';
    } else {
      return '';
    }
    if (!display.scale && tool !== 'scale') return '';
    const A = toScr(a), B = toScr(b);
    let s = stroke(pathD([A, B]) + endTicks(A, B), 'ln-scale', 3);
    s += lineLabel(A, B, label, 'scale');
    if (tool === 'scale' && !(drag && drag.kind === 'scale-new')) {
      ['p1', 'p2'].forEach((k) => {
        const P = k === 'p1' ? A : B;
        const on = hover.scaleEnd === k || (drag && drag.kind === 'scale-end' && drag.which === k);
        s += '<circle class="handle-h" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="5"/>' +
             '<circle class="handle' + (on ? ' on' : '') + '" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="5"/>';
      });
    }
    return s;
  }

  function measureText() {
    const dpx = G.dist(measure.p1, measure.p2);
    return derived && derived.hasScale ? units.len(dpx * derived.scale) : fmt(dpx, 0) + ' px';
  }

  function drawMeasure() {
    if (!measure) return '';
    const A = toScr(measure.p1), B = toScr(measure.p2);
    let s = stroke(pathD([A, B]) + endTicks(A, B), 'ln-measure', 3);
    s += lineLabel(A, B, measureText(), 'measure');
    if (tool === 'measure' && !(drag && drag.kind === 'measure-new')) {
      ['p1', 'p2'].forEach((k) => {
        const P = k === 'p1' ? A : B;
        const on = hover.measureEnd === k;
        s += '<circle class="handle-h" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="5"/>' +
             '<circle class="handle' + (on ? ' on' : '') + '" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="5"/>';
      });
    }
    return s;
  }

  function drawPoints(p) {
    const d = derived;
    const pts = d.tracedPx;
    const n = pts.length;
    const scr = pts.map(toScr);
    let s = '';

    // one length per edge, from corner to corner, along the traced outline,
    // after the edge's name when it has one (shown with the point labels)
    if (display.lengths || display.labels) {
      for (const sd of d.sides) {
        const named = display.labels && sd.label;
        if (!display.lengths && !named) continue;
        const mid = polyMiddle(sd.flatPx);
        if (mid.len * view.z < 40) continue;
        const dir = d.closed ? G.outwardNormal(mid.dir, d.sgn) : [mid.dir[1], -mid.dir[0]];
        const M = toScr(mid.at);
        const len = d.hasScale ? units.num(sd.tracedLen) : fmt(sd.tracedLen, 0) + ' px';
        const str = (named ? sd.label : '') + (named && display.lengths ? '  ' : '') + (display.lengths ? len : '');
        s += text(M[0] + dir[0] * 14, M[1] + dir[1] * 14 + 4, str, 'mid len');
      }
    }

    for (let i = 0; i < n; i++) {
      const P = scr[i];
      const isSel = sel.point === i;
      const isHov = hover.point === i || (drag && drag.kind === 'point' && drag.index === i);
      s += pointGlyph(P, d.smooth[i], isSel, isSel || isHov);
      if (display.angles && d.angles && d.angles[i] != null) {
        const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
        const short = Math.min(G.dist(a, pts[i]), G.dist(c, pts[i])) * view.z < 24;
        const live = !!drag && drag.kind === 'point' && drag.index === i;
        if (!short || live) s += angleText(a, pts[i], c, d.angles[i], d.closed ? d.sgn : 0, live);
      }
      if (d.badCorners.indexOf(i) >= 0) s += '<circle class="bad-ring" cx="' + r1(P[0]) + '" cy="' + r1(P[1]) + '" r="10"/>';
      if (display.labels) {
        let dir = [0.7, -0.7];
        // corners are labelled outside; smooth points lighter and inside, clear
        // of the edge lengths, which sit outside half way along each edge
        if (d.closed) dir = G.mul(vertexOut(pts, i, d.sgn), d.smooth[i] ? -1 : 1);
        s += text(P[0] + dir[0] * 13, P[1] + dir[1] * 13 + 4, d.labels[i], 'mid pl' + (d.smooth[i] ? ' soft' : '') + (isSel ? ' sel' : ''));
      }
    }

    if (tool === 'trace' && !d.closed && n >= 3 && (hover.point === 0 || (drag && drag.kind === 'close'))) {
      s += '<circle class="close-ring" cx="' + r1(scr[0][0]) + '" cy="' + r1(scr[0][1]) + '" r="10"/>';
    }
    return s;
  }

  /** A point: a square for a corner, a circle for a smooth point. */
  function pointGlyph(P, smooth, selected, big) {
    const cx = r1(P[0]), cy = r1(P[1]);
    const cls = 'pt' + (selected ? ' sel' : '');
    if (smooth) {
      const r = big ? 4 : 3;
      return '<circle class="pt-h" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' +
             '<circle class="' + cls + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
    }
    const size = big ? 7 : 5, h = size / 2;
    const x = r1(P[0] - h), y = r1(P[1] - h);
    return '<rect class="pt-h" x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '"/>' +
           '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '"/>';
  }

  function drawPreview(p) {
    if (tool !== 'trace') return '';
    const d = derived;
    const pts = d.tracedPx;
    const n = pts.length;
    let s = '';
    if (drag && drag.kind === 'place') {
      const P = toScr(drag.pos);
      let prev = null, next = null;
      if (drag.fromEdge) {
        prev = pts[drag.insertAt - 1];
        next = pts[drag.insertAt % n];
      } else if (n) {
        prev = pts[n - 1];
      }
      if (prev) s += stroke(pathD([toScr(prev), P]), 'ln-rubber', 3);
      if (next) s += stroke(pathD([P, toScr(next)]), 'ln-rubber', 3);
      const smooth = drag.alt || (drag.fromEdge && d.curved[drag.insertAt - 1]);
      // the angle being formed: at the new point between its neighbours, or at the previous point
      if (display.angles && prev && next && !smooth) {
        s += angleText(prev, drag.pos, next, cornerAngle(prev, drag.pos, next, d.closed ? d.sgn : 0), d.closed ? d.sgn : 0, true);
      } else if (display.angles && !drag.fromEdge && n >= 2 && !d.smooth[n - 1] && !smoothFlag(n - 1)) {
        s += angleText(pts[n - 2], pts[n - 1], drag.pos, cornerAngle(pts[n - 2], pts[n - 1], drag.pos, 0), 0, true);
      }
      return s + pointGlyph(P, smooth, true, true);
    }
    if (drag || !pointer.inside || spaceHeld) return '';
    if (hover.point == null && hover.edge) {
      const pos = toScr(hover.edge.pos);
      s += '<circle class="ins-h" cx="' + r1(pos[0]) + '" cy="' + r1(pos[1]) + '" r="4"/>';
      s += '<circle class="ins" cx="' + r1(pos[0]) + '" cy="' + r1(pos[1]) + '" r="4"/>';
    } else if (!d.closed && n > 0 && hover.point == null) {
      const end = appendPos(toImg(pointer.x, pointer.y)).pos;
      s += stroke(pathD([toScr(pts[n - 1]), toScr(end)]), 'ln-rubber', 3);
      if (display.angles && n >= 2 && !smoothFlag(n - 1)) s += angleText(pts[n - 2], pts[n - 1], end, cornerAngle(pts[n - 2], pts[n - 1], end, 0), 0, true);
    }
    return s;
  }

  /**
   * The thin crosshair for placing things precisely. Select shows the
   * system's arrow instead (style.css), which says at a glance that nothing
   * is being placed (spec v1.0).
   */
  function drawCursor() {
    const p = project();
    if (!pointer.inside || spaceHeld || !p.image || tool === 'select' || (drag && drag.kind === 'pan')) {
      cursorLayer.innerHTML = '';
      return;
    }
    const x = Math.round(pointer.x) + 0.5, y = Math.round(pointer.y) + 0.5;
    const g = 3, r = 12;
    const d = 'M' + (x - r) + ' ' + y + 'H' + (x - g) + 'M' + (x + g) + ' ' + y + 'H' + (x + r) +
              'M' + x + ' ' + (y - r) + 'V' + (y - g) + 'M' + x + ' ' + (y + g) + 'V' + (y + r);
    cursorLayer.innerHTML = '<path class="xh-h" d="' + d + '"/><path class="xh" d="' + d + '"/>';
  }

  // ------------------------------------------------------------------ loupe

  function loupeTarget() {
    const p = project();
    if (drag) {
      switch (drag.kind) {
        case 'point': {
          const q = p.outline.points[drag.index];
          return q ? [q.x, q.y] : null;
        }
        case 'place': return drag.pos;
        case 'close': return p.outline.points[0] ? [p.outline.points[0].x, p.outline.points[0].y] : null;
        case 'scale-new': return drag.p2;
        case 'scale-end': return p.scale ? p.scale[drag.which] : null;
        case 'measure-new': return measure ? measure.p2 : null;
        case 'measure-end': return measure ? measure[drag.which] : null;
        case 'guide-new': return drag.p2;
        case 'level-place': return drag.pos;
        default: return null;
      }
    }
    if (loupeFlash && performance.now() < loupeFlash.until) return loupeFlash.target();
    if (loupeAlways && pointer.inside && !spaceHeld) return toImg(pointer.x, pointer.y);
    return null;
  }

  function strokeCtx(ctx, pts, closed, color, width, dash) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (closed) ctx.closePath();
    ctx.setLineDash([]);
    ctx.lineWidth = width + 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    ctx.setLineDash(dash || []);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawLoupe() {
    const target = project().image ? loupeTarget() : null;
    if (!target || !photoImg || !photoImg.complete || !photoImg.naturalWidth) {
      loupe.hidden = true;
      return;
    }
    const anchor = drag || (loupeAlways && pointer.inside) ? [pointer.x, pointer.y] : toScr(target);
    let left = anchor[0] - LOUPE - 18, top = anchor[1] - LOUPE - 18;
    if (left < 6) left = anchor[0] + 18;
    if (top < 6) top = anchor[1] + 18;
    loupe.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    loupe.hidden = false;

    const dpr = root.devicePixelRatio || 1;
    const size = Math.round(LOUPE * dpr);
    if (loupe.width !== size) { loupe.width = size; loupe.height = size; }
    const ctx = loupeCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, LOUPE, LOUPE);

    const mag = Math.min(view.z * 4, 64);   // loupe px per image px
    const half = LOUPE / 2 / mag;
    const x0 = target[0] - half, y0 = target[1] - half;
    const W = photoImg.naturalWidth, H = photoImg.naturalHeight;
    const ix0 = Math.max(0, x0), iy0 = Math.max(0, y0);
    const ix1 = Math.min(W, x0 + 2 * half), iy1 = Math.min(H, y0 + 2 * half);
    if (display.photo && ix1 > ix0 && iy1 > iy0) {
      ctx.globalAlpha = project().view.photoOpacity;
      ctx.imageSmoothingEnabled = mag < 3;
      ctx.drawImage(photoImg, ix0, iy0, ix1 - ix0, iy1 - iy0,
        (ix0 - x0) * mag, (iy0 - y0) * mag, (ix1 - ix0) * mag, (iy1 - iy0) * mag);
      ctx.globalAlpha = 1;
    }
    const L = (q) => [(q[0] - x0) * mag, (q[1] - y0) * mag];
    const d = derived;
    if (d) {
      if (guidesOn()) {
        const gl = guides().concat(drag && drag.kind === 'guide-new' ? [drag] : []);
        for (const g of gl) {
          const u = G.norm(G.sub(g.p2, g.p1));
          if (u[0] || u[1]) strokeCtx(ctx, [L(G.sub(g.p1, G.mul(u, 1e5))), L(G.add(g.p1, G.mul(u, 1e5)))], false, '#6b6b6b', 1, [12, 3, 2, 3]);
        }
      }
      if (display.traced && d.n >= 2) strokeCtx(ctx, d.tracedPathPx.map(L), d.closed, '#000', 1);
      if (d.geometryOk) {
        // 02 Design: each piece, with its notches; 01 Trace: the whole outline
        const pieces = mode === 'design' && d.design ? d.design.pieces : [{ cutFlat: d.cutFlat, finFlat: d.finishedFlat, notches: [] }];
        for (const pc of pieces) {
          if (display.cut && pc.cutFlat) strokeCtx(ctx, pc.cutFlat.map((q) => L(mmToImg(q))), true, '#000', 1, [6, 4]);
          if (display.finished) strokeCtx(ctx, pc.finFlat.map((q) => L(mmToImg(q))), true, '#e2001a', 1.5);
          for (const nl of pc.notches) strokeCtx(ctx, [L(mmToImg(nl.at)), L(mmToImg(G.add(nl.at, G.mul(nl.nrm, Math.max(nl.len, G.NOTCH_MIN)))))], false, '#000', 1.5);
        }
      }
      const sc = project().scale;
      if (drag && drag.kind === 'scale-new') strokeCtx(ctx, [L(drag.p1), L(drag.p2)], false, '#6b6b6b', 1);
      else if (sc && (display.scale || tool === 'scale')) strokeCtx(ctx, [L(sc.p1), L(sc.p2)], false, '#6b6b6b', 1);
      if (measure) strokeCtx(ctx, [L(measure.p1), L(measure.p2)], false, '#000', 1);
      if (drag && drag.kind === 'place') {
        const pts = d.tracedPx, n = pts.length;
        const prev = drag.fromEdge ? pts[drag.insertAt - 1] : (n ? pts[n - 1] : null);
        const next = drag.fromEdge ? pts[drag.insertAt % n] : null;
        if (prev) strokeCtx(ctx, [L(prev), L(drag.pos)], false, '#000', 1, [3, 3]);
        if (next) strokeCtx(ctx, [L(drag.pos), L(next)], false, '#000', 1, [3, 3]);
      }
    }
    // crosshair at the exact position
    const c = LOUPE / 2;
    const xh = [[[c - 22, c], [c - 4, c]], [[c + 4, c], [c + 22, c]], [[c, c - 22], [c, c - 4]], [[c, c + 4], [c, c + 22]]];
    for (const seg of xh) strokeCtx(ctx, seg, false, '#e2001a', 1);
  }

  // ----------------------------------------------------------------- status

  function updateStatus() {
    setText('st-hint', hintText());
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && el.textContent !== value) el.textContent = value;
  }

  FB.editor = {
    init,
    render: requestRender,
    setDerived,
    setTool,
    getTool: () => tool,
    setMode,
    getMode: () => mode,
    getSelection: () => sel,
    selectPoint: (i) => setSelection(i, null),
    selectEdge: (i) => setSelection(null, i),
    // 02 Design
    getDesignSelection: () => dsel,
    selectRun: (r) => { const D = design(); if (D && D.runs[r]) setDesignSelection({ kind: 'run', run: r, s: G.wrapIn(D.total, D.runs[r].s + D.runs[r].len / 2) }); },
    selectDesign: setDesignSelection,
    addMark,
    joinHere,
    setMarkFrom,
    deleteDesignSelected,
    canAdd: () => addSpot() != null,
    deleteSelected,
    deletePoint,
    makeCurved,
    makeStraight,
    setSmooth,
    canSmooth,
    resetScale,
    toggleScale,
    startLevel,
    getSelectedGuide: () => selGuide,
    nudge,
    cycle,
    closeOutline,
    cancel,
    zoomBy,
    fit,
    actualSize,
    setSpace,
    toggleLoupe,
    setDisplay,
    getDisplay: () => Object.assign({ loupeAlways }, display),
    flashHint,
    isDragging: () => !!drag
  };
})(window);
