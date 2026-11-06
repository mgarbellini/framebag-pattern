/*
 * Framebag Pattern — pdf.js
 *
 * The printable pattern (spec §7, v0.7 C and E, v1.0): an overview page with
 * the check square; a page for the gusset, which is cut with a ruler, with its
 * cut size and where its notches go; then the side panel tiled over pages of
 * the chosen paper with overlap, trim and placement lines, registration marks
 * and page labels. The side panel carries its notches and the pattern label
 * (piece, seam allowance, a note, and the drive or non-drive side with an
 * arrow to the front). Lengths are in mm or inches, as chosen in the logo menu.
 *
 * Assembly: each page is trimmed along its dashed line on the left and/or top
 * edge and laid over its neighbour so the cut edge sits on the neighbour's
 * thin placement line. Registration marks are centred on those lines, so the
 * half printed on one page completes the half printed on the other.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const G = FB.geom;
  const U = FB.units;
  const VERSION = 'v1.0';
  const PT = 25.4 / 72; // mm per point

  const f1 = (v, dec) => FB.fmt(v, dec == null ? 1 : dec, '-');   // plain numbers: angles
  const n1 = (v) => U.num(v, 1, '-');                               // a length, without its unit
  const L1 = (v) => U.len(v, 1, '-');                               // a length with its unit

  // ---------------------------------------------------------------- planning

  /** Page layout for the current project, or null if it cannot be printed. */
  function plan(project, d) {
    if (!d || !d.ok) return null;
    const paper = G.paperById(project.print.paper);
    const pcs = printPieces(project, d);
    const polys = [];
    for (const pc of pcs) polys.push(pc.cut, pc.fin);
    for (const pc of pcs) for (const tl of pc.traced) if (tl.closed) polys.push(tl.pts);
    const lay = G.planLayout(polys, pcs.map((pc) => pc.cut), {
      paper: [paper.w, paper.h],
      margin: project.print.marginMm,
      overlap: project.print.overlapMm,
      optimise: project.print.optimiseLayout,
      pad: 5
    });
    if (lay) lay.paper = paper;
    return lay;
  }

  // ----------------------------------------------------------------- pieces
  //
  // The side panel as printed (spec v1.0), in unrotated mm: the whole panel;
  // the piece a clip keeps; or the two pieces of a split, the second moved
  // clear of the first across the split line, where their seam allowances
  // overlap. Each with its cut line, stitch line, traced outline (for a
  // piece, the part on its side of the split line), notches, corner letters,
  // edge labels, name and size.

  function printPieces(project, d) {
    const D = d.design;
    if (!D || !D.split) {
      const lg = labelGeometry(d);
      return [{
        cut: d.cutFlat, fin: d.finishedFlat,
        traced: project.print.showTraced ? [{ pts: d.tracedFlat, closed: true }] : [],
        notches: D ? notchSegs(D.pieces[0]) : [],
        letters: lg.corners, edges: lg.edges,
        part: '', cutSize: d.cutSize, cutArea: d.cutArea
      }];
    }
    const A = D.split.a.at, u = G.norm(G.sub(D.split.b.at, A));
    const side = (q) => G.cross(u, G.sub(q, A));
    const out = D.pieces.map((pc) => ({
      cut: pc.cutFlat, fin: pc.finFlat,
      traced: project.print.showTraced ? clipToSide(d.tracedFlat, A, u, side(centroid(pc.finFlat)) >= 0 ? 1 : -1) : [],
      notches: notchSegs(pc),
      letters: pc.letters.map((l) => ({ text: l.text, base: l.base, inward: l.inward })),
      edges: pieceEdges(d, pc),
      part: D.pieces.length > 1 ? pc.name : '', cutSize: pc.cutSize, cutArea: pc.cutArea
    }));
    if (out.length === 2) {
      const n = [-u[1], u[0]];
      const away = G.dot(G.sub(centroid(out[1].fin), centroid(out[0].fin)), n) >= 0 ? 1 : -1;
      moveBy(out[1], G.mul(n, away * (2 * D.sa + 15)));
    }
    return out;
  }

  const centroid = (pl) => {
    let x = 0, y = 0;
    for (const q of pl) { x += q[0]; y += q[1]; }
    return [x / pl.length, y / pl.length];
  };

  /** A piece's notches, each as a line across the seam allowance, from the stitch line to the cut line. */
  function notchSegs(pc) {
    return pc.notches.map((nl) => [nl.at, G.add(nl.at, G.mul(nl.nrm, Math.max(nl.len, G.NOTCH_MIN)))]);
  }

  /** Edge labels of a piece: a whole edge by its finished length, a part of one by its length notch to notch. */
  function pieceEdges(d, pc) {
    const out = [];
    for (const r of pc.runs) {
      const mid = r.path && r.path.length ? G.middleOf(r.path) : null;
      if (!mid) continue;
      const nrm = G.outwardNormal(mid.dir, d.sgn);
      const sd = r.side != null ? d.sides[r.side] : null;
      const text = r.whole && sd
        ? sd.title + '  ' + L1(sd.finishedLen) + (sd.curved ? ' curved' : '')
        : (r.title || r.name) + '  ' + L1(r.len);
      out.push({ text, at: G.sub(mid.at, G.mul(nrm, 4.5)), dir: mid.dir });
    }
    return out;
  }

  /**
   * The parts of the closed polyline poly on one side of the line through A
   * along u (sgn +1: where cross(u, q − A) ≥ 0), as polylines; the whole of
   * it, closed, when it lies on that side.
   */
  function clipToSide(poly, A, u, sgn) {
    const n = poly.length;
    const f = (q) => sgn * G.cross(u, G.sub(q, A));
    let start = -1;
    for (let i = 0; i < n; i++) if (f(poly[i]) < 0) { start = i; break; }
    if (start < 0) return [{ pts: poly, closed: true }];
    const lines = [];
    let cur = [];
    for (let k = 0; k < n; k++) {
      const p = poly[(start + k) % n], q = poly[(start + k + 1) % n];
      const fp = f(p), fq = f(q);
      if (fp >= 0) cur.push(p);
      if ((fp >= 0) !== (fq >= 0)) {
        const X = G.lerp(p, q, fp / (fp - fq));
        if (fp >= 0) { cur.push(X); lines.push(cur); cur = []; } else cur = [X];
      }
    }
    if (cur.length > 1) lines.push(cur);
    return lines.filter((l) => l.length > 1).map((pts) => ({ pts, closed: false }));
  }

  /** Move every part of a printed piece by v. */
  function moveBy(pc, v) {
    const mv = (q) => G.add(q, v);
    pc.cut = pc.cut.map(mv);
    pc.fin = pc.fin.map(mv);
    pc.traced = pc.traced.map((tl) => ({ pts: tl.pts.map(mv), closed: tl.closed }));
    pc.notches = pc.notches.map((sg) => sg.map(mv));
    pc.letters = pc.letters.map((l) => Object.assign({}, l, { base: mv(l.base) }));
    pc.edges = pc.edges.map((e) => Object.assign({}, e, { at: mv(e.at) }));
  }

  /** The same piece turned by `rad` for the pages. */
  function turnPiece(pc, rad) {
    const R = (q) => G.rotate(q, rad);
    return Object.assign({}, pc, {
      cut: pc.cut.map(R),
      fin: pc.fin.map(R),
      traced: pc.traced.map((tl) => ({ pts: tl.pts.map(R), closed: tl.closed })),
      notches: pc.notches.map((sg) => sg.map(R)),
      letters: pc.letters.map((l) => ({ text: l.text, base: R(l.base), inward: G.rotate(l.inward, rad) })),
      edges: pc.edges.map((e) => ({ text: e.text, at: R(e.at), dir: G.rotate(e.dir, rad) }))
    });
  }

  // ----------------------------------------------------------------- labels

  /**
   * Corner letters inside each corner and finished lengths along each edge
   * (unrotated mm), each edge by its name when it has one. Smooth points get
   * no letter: they are not corners, and the edges are named after the
   * corners they run between.
   */
  function labelGeometry(d) {
    const sgn = d.sgn;
    const corners = [], edges = [];
    for (let j = 0; j < d.n; j++) {
      const c = d.corners[j];
      if (!c || c.smooth) continue;
      const na = G.outwardNormal(c.a, sgn), nb = G.outwardNormal(c.b, sgn);
      let bis = G.norm(G.add(na, nb));
      if (!bis[0] && !bis[1]) bis = na;
      // base point on the stitch line and the inward direction; each drawing
      // places the letter a fixed distance in its own scale
      corners.push({ text: d.labels[j], base: c.arc ? G.arcPoint(c.arc, 0.5) : c.v, inward: G.mul(bis, -1) });
    }
    // edge lengths half way along each edge's part of the stitch line, along
    // it (straight or curved); an edge used up by its corners has none
    d.sides.forEach((sd, k) => {
      const mid = G.middleOf(G.sideElements(d, k));
      if (!mid) return;
      const nrm = G.outwardNormal(mid.dir, sgn);
      edges.push({
        text: sd.title + '  ' + L1(sd.finishedLen) + (sd.curved ? ' curved' : ''),
        at: G.sub(mid.at, G.mul(nrm, 4.5)),
        dir: mid.dir
      });
    });
    return { corners, edges };
  }

  function edgeText(doc, e, P, size) {
    const q = P(e.at);
    let th = Math.atan2(-e.dir[1], e.dir[0]) * 180 / Math.PI;
    if (th > 90) th -= 180;
    else if (th <= -90) th += 180;
    const r = th * Math.PI / 180;
    const half = size * 0.718 * PT / 2; // half the cap height
    // move the baseline down (in text space) so the text is centred on q
    const x = q[0] - Math.sin(r) * half;
    const y = q[1] + Math.cos(r) * half;
    doc.text(e.text, x, y, { size, align: 'center', angle: th, gray: 0 });
  }

  /** P maps pattern mm to page mm; k is page mm per pattern mm. */
  function cornerText(doc, c, P, size, k) {
    const q = P(G.add(c.base, G.mul(c.inward, (k ? 4 / k : 7))));
    doc.text(c.text, q[0], q[1] + size * 0.718 * PT / 2, { size, bold: true, align: 'center', gray: 0 });
  }

  /** str shortened with "…" to fit maxW mm. */
  function fitText(doc, str, maxW, size, bold) {
    if (doc.textWidth(str, size, bold) <= maxW) return str;
    let s = str;
    while (s.length > 1 && doc.textWidth(s + '…', size, bold) > maxW) s = s.slice(0, -1);
    return s.replace(/\s+$/, '') + '…';
  }

  // --------------------------------------------------------- pattern label
  //
  // A block of centred lines, upright in the photo's frame, placed inside the
  // finished outline where it is furthest from the lines (spec v0.7 E). It
  // turns with the pattern on the pages, half a turn more if it would read
  // upside down. With a side marked, the side is named over an arrow that
  // points to the bike's front: to the right in a photo of the drive side,
  // to the left in one of the non-drive side.

  function labelSummary(project) {
    const lb = project.label || {};
    if (!project.print.showLabel) return 'Not printed';
    const side = FB.state.SIDES[lb.side];
    const parts = [lb.piece, side ? side.toLowerCase() : ''].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Seam allowance only';
  }

  /** The label's lines (text, size, bold, grey) and the arrow; `few` keeps only the piece and the side. */
  function labelBlock(doc, project, few, part) {
    const lb = project.label || {};
    const lines = [];
    const add = (text, size, bold, gray) => { if (text) lines.push({ text, size, bold: !!bold, gray: gray || 0 }); };
    add(lb.piece, 14, true);
    // a panel split in two: which part
    if (part) add(part.charAt(0).toUpperCase() + part.slice(1), 8, true);
    if (!few) {
      const sa = project.seamAllowance;
      add(sa > 0 ? 'Includes ' + L1(sa) + ' seam allowance' : 'No seam allowance', 7.5, false, 0.3);
      add(project.name, 7.5, false, 0.3);
      if (lb.note) wrap(doc, lb.note, 70, 7.5, false).forEach((t) => add(t, 7.5, false, 0.3));
    }
    const side = FB.state.SIDES[lb.side];
    const front = lb.side === 'drive' ? 1 : (lb.side === 'nondrive' ? -1 : 0);
    if (side) add(side.toUpperCase(), 8, true);
    if (!lines.length) return null;
    let y = 0, w = 0;
    const rows = lines.map((l) => {
      const row = Object.assign({ base: y + l.size * PT * 0.95 }, l);
      y += l.size * PT * 1.35;
      w = Math.max(w, doc.textWidth(l.text, l.size, l.bold));
      return row;
    });
    let arrow = null;
    if (front) {
      arrow = { y: y + 1, half: 18, sign: front };
      y += 3;
      w = Math.max(w, 36);
    }
    return { rows, arrow, w, h: y };
  }

  /** Where the label goes in a piece (its stitch line, unrotated), in rotated pattern mm, with its reading directions; null if it does not fit. */
  function placeLabel(doc, project, pc, rad) {
    if (!project.print.showLabel || !pc.fin || pc.fin.length < 3) return null;
    // a coarser outline is enough to place it
    const poly = pc.fin.length > 600 ? pc.fin.filter((_, i) => i % Math.ceil(pc.fin.length / 600) === 0) : pc.fin;
    let block = labelBlock(doc, project, false, pc.part);
    if (!block) return null;
    let at = G.placeBlock(poly, block.w, block.h, 6);
    if (!at) {
      block = labelBlock(doc, project, true, pc.part);
      at = block ? G.placeBlock(poly, block.w, block.h, 4) : null;
    }
    if (!at) return null;
    let u = G.rotate([1, 0], rad);
    let th = Math.atan2(-u[1], u[0]) / G.DEG;
    if (th > 90 || th < -90) {
      u = G.mul(u, -1);
      th += th > 0 ? -180 : 180;
    }
    return {
      block,
      at: G.rotate(at, rad),
      u,
      v: [-u[1], u[0]],       // "down" while reading
      th,
      front: block.arrow ? G.rotate([block.arrow.sign, 0], rad) : null
    };
  }

  function drawLabel(doc, lab, P) {
    const C = P(lab.at), b = lab.block;
    for (const r of b.rows) {
      const q = G.add(C, G.mul(lab.v, r.base - b.h / 2));
      doc.text(r.text, q[0], q[1], { size: r.size, bold: r.bold, align: 'center', angle: lab.th, gray: r.gray });
    }
    if (b.arrow && lab.front) {
      const mid = G.add(C, G.mul(lab.v, b.arrow.y - b.h / 2));
      const dir = lab.front, half = b.arrow.half;
      const tail = G.sub(mid, G.mul(dir, half)), tip = G.add(mid, G.mul(dir, half));
      const back = G.sub(tip, G.mul(dir, 3)), side = G.mul([-dir[1], dir[0]], 1.2);
      doc.strokeGray(0).lineWidth(0.35).dash([]).lineCap(0);
      doc.line(tail[0], tail[1], back[0], back[1]);
      doc.fillGray(0);
      doc.polyline([tip, G.add(back, side), G.sub(back, side)], true).fill();
    }
  }

  // ------------------------------------------------------------------ marks

  function registrationMarks(lay, isIn) {
    const marks = [];
    const visW = (c) => (c < lay.cols - 1 ? lay.sx : lay.cw);
    const visH = (r) => (r < lay.rows - 1 ? lay.sy : lay.ch);
    for (let c = 1; c < lay.cols; c++) {
      const X = lay.gx0 + c * lay.sx;
      for (let r = 0; r < lay.rows; r++) {
        if (isIn(c - 1, r) && isIn(c, r)) marks.push([X, lay.gy0 + r * lay.sy + visH(r) / 2]);
      }
    }
    for (let r = 1; r < lay.rows; r++) {
      const Y = lay.gy0 + r * lay.sy;
      for (let c = 0; c < lay.cols; c++) {
        if (isIn(c, r - 1) && isIn(c, r)) marks.push([lay.gx0 + c * lay.sx + visW(c) / 2, Y]);
      }
    }
    for (let c = 1; c < lay.cols; c++) {
      for (let r = 1; r < lay.rows; r++) {
        const k = [isIn(c - 1, r - 1), isIn(c, r - 1), isIn(c - 1, r), isIn(c, r)].filter(Boolean).length;
        if (k >= 2) marks.push([lay.gx0 + c * lay.sx, lay.gy0 + r * lay.sy]);
      }
    }
    return marks;
  }

  function regMark(doc, x, y) {
    doc.circle(x, y, 3).stroke();
    doc.line(x - 4.5, y, x + 4.5, y);
    doc.line(x, y - 4.5, x, y + 4.5);
  }

  // ----------------------------------------------------------- check square

  /** The check square's side: 10 cm, or 4 in when lengths are in inches. */
  const checkSize = () => (U.imperial() ? 4 * U.IN : 100);

  /**
   * A check square of side S at (x, top), ticked every centimetre (every
   * 1/4 in, longer at each inch), with the instruction inside it.
   */
  function drawSquare(doc, x, top, S) {
    const imp = U.imperial();
    doc.strokeGray(0).lineWidth(0.3).dash([]).lineCap(0);
    doc.rect(x, top, S, S).stroke();
    doc.lineWidth(0.2);
    const step = imp ? U.IN / 4 : 10;
    const count = Math.round(S / step);
    for (let i = 1; i < count; i++) {
      const t = i * step;
      const L = imp ? (i % 4 === 0 ? 4 : (i % 2 === 0 ? 2.5 : 1.5)) : (i % 5 === 0 ? 4 : 2.5);
      doc.line(x + t, top + S, x + t, top + S - L);
      doc.line(x, top + t, x + L, top + t);
    }
    const big = S > 60;
    const name = imp ? Math.round(S / U.IN) + ' in' : Math.round(S / 10) + ' cm';
    doc.text(name, x + 6, top + (big ? 11 : 9), { size: big ? 14 : 11, bold: true, gray: 0 });
    doc.text('Print at 100 % (Actual size).', x + 6, top + (big ? 17 : 14), { size: big ? 8.5 : 6.5, gray: 0 });
    doc.text(big ? 'Check this square before cutting.' : 'Check it before cutting.', x + 6, top + (big ? 21.5 : 17.5), { size: big ? 8.5 : 6.5, gray: 0 });
  }

  /**
   * On a large sheet, printed at a copy shop, a check square in a free corner
   * of the page, clear of the pattern and the marks; half size if a full one
   * does not fit, none if neither does (spec v0.7 C).
   */
  function sheetSquare(doc, ctx, P, visW, visH) {
    const m = ctx.lay.margin, inset = 8, room = 4;
    const cuts = ctx.geo.pieces.map((pc) => pc.cut.map(P));
    const segs = G.segmentsOf(cuts);
    for (const S of [checkSize(), checkSize() / 2]) {
      const xs = [m + inset, m + visW - inset - S];
      const ys = [m + visH - inset - S, m + inset];
      for (const y of ys) {
        for (const x of xs) {
          const x0 = x - room, y0 = y - room, x1 = x + S + room, y1 = y + S + room;
          if (x0 < m || y0 < m || x1 > m + visW || y1 > m + visH) continue;
          if (segs.some((s) => G.segHitsRect(s, x0, y0, x1, y1))) continue;
          if (cuts.some((cut) => G.pointInPolygon([(x0 + x1) / 2, (y0 + y1) / 2], cut))) continue;
          drawSquare(doc, x, y, S);
          return true;
        }
      }
    }
    return false;
  }

  // ------------------------------------------------------------ line styles

  const STYLE = {
    cut(doc, scale) { doc.strokeGray(0).lineWidth(0.5 * (scale || 1)).lineCap(0).dash([]); },
    finished(doc, scale) { doc.strokeGray(0).lineWidth(0.25 * (scale || 1)).lineCap(0).dash([3 * (scale || 1), 1.5 * (scale || 1)]); },
    traced(doc) { doc.strokeGray(0.3).lineWidth(0.15).lineCap(1).dash([0.01, 0.5]); }
  };

  // ------------------------------------------------------------- the pages

  function build(project, d, lay) {
    const doc = new FB.PdfDoc({
      title: project.name || 'Framebag pattern',
      creator: 'Framebag Pattern ' + VERSION
    });
    const rad = lay.angle * G.DEG;
    const flat = printPieces(project, d);
    const geo = { pieces: flat.map((pc) => turnPiece(pc, rad)) };
    const tiles = lay.tiles.filter((t) => t.included).map((t, i) => Object.assign({}, t, {
      label: G.pointLabel(t.col) + (t.row + 1),
      index: i + 1
    }));
    const set = {};
    tiles.forEach((t) => { set[t.col + ',' + t.row] = true; });
    const isIn = (c, r) => !!set[c + ',' + r];
    // a pattern label in each piece
    geo.pieces.forEach((pc, k) => { pc.lab = placeLabel(doc, project, flat[k], rad); });
    const ctx = { project, d, lay, geo, tiles, isIn, marks: registrationMarks(lay, isIn) };

    drawOverview(doc, ctx);
    drawCutList(doc, ctx);
    tiles.forEach((t) => drawTile(doc, ctx, t));
    return doc;
  }

  function strokeNotches(doc, lines, P, width) {
    if (!lines.length) return;
    doc.strokeGray(0).lineWidth(width).lineCap(0).dash([]);
    for (const q of lines) {
      const a = P(q[0]), b = P(q[1]);
      doc.line(a[0], a[1], b[0], b[1]);
    }
  }

  /** "4 at corners, 10 between, double at A", as in the panel. */
  function notchSummary(d) {
    const ds = d.design;
    if (!ds) return 'None';
    const c = ds.counts;
    const parts = [
      c.corners ? c.corners + ' at corners' : '',
      c.split ? c.split + ' at the split line' : '',
      c.between ? c.between + ' between' : '',
      ds.join ? 'double at ' + (ds.join.label || 'the join') : ''
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'None';
  }

  /** A piece on a pattern page: traced outline, stitch line, cut line, notches, letters, lengths, label. */
  function drawPiece(doc, pc, P, lengths) {
    if (pc.traced.length) {
      STYLE.traced(doc);
      for (const tl of pc.traced) doc.polyline(tl.pts.map(P), tl.closed).stroke();
    }
    STYLE.finished(doc);
    doc.polyline(pc.fin.map(P), true).stroke();
    STYLE.cut(doc);
    doc.polyline(pc.cut.map(P), true).stroke();
    strokeNotches(doc, pc.notches, P, 0.3);
    for (const c of pc.letters) cornerText(doc, c, P, 10);
    if (lengths) for (const e of pc.edges) edgeText(doc, e, P, 8);
    if (pc.lab) drawLabel(doc, pc.lab, P);
  }

  function drawTile(doc, ctx, t) {
    const { project, lay, geo, isIn, marks, tiles } = ctx;
    const m = lay.margin, cw = lay.cw, ch = lay.ch, o = lay.overlap, sx = lay.sx, sy = lay.sy;
    doc.addPage(lay.pageW, lay.pageH);
    const ox = lay.gx0 + t.col * sx, oy = lay.gy0 + t.row * sy;
    const P = (q) => [m + q[0] - ox, m + q[1] - oy];
    const right = isIn(t.col + 1, t.row), bottom = isIn(t.col, t.row + 1);
    const left = isIn(t.col - 1, t.row), top = isIn(t.col, t.row - 1);

    // strips that will lie under the neighbouring page
    doc.fillGray(0.93);
    if (right) doc.rect(m + sx, m, o, ch).fill();
    if (bottom) doc.rect(m, m + sy, cw, o).fill();

    // page label, printed under the pattern lines; a single page needs none
    const visW = cw - (right ? o : 0), visH = ch - (bottom ? o : 0);
    if (tiles.length > 1) {
      const cx = m + visW / 2, cy = m + visH / 2;
      doc.text(t.label, cx, cy + 9, { size: 72, bold: true, align: 'center', gray: 0.86 });
      const info = (project.name ? project.name + ', page ' : 'Page ') + t.index + ' of ' + tiles.length;
      doc.text(info, cx, cy + 17, { size: 7.5, align: 'center', gray: 0.4 });
      miniMap(doc, ctx, t, cx, cy + 21);
    }

    doc.save();
    doc.clipRect(m, m, cw, ch);

    // where the trimmed edge of the next page goes
    doc.strokeGray(0.3).lineWidth(0.2).lineCap(0).dash([]);
    if (right) doc.line(m + sx, m, m + sx, m + ch);
    if (bottom) doc.line(m, m + sy, m + cw, m + sy);

    for (const pc of geo.pieces) drawPiece(doc, pc, P, project.print.showLengths);

    doc.strokeGray(0).lineWidth(0.2).dash([]);
    for (const mk of marks) {
      const q = P(mk);
      if (q[0] < m - 8 || q[0] > m + cw + 8 || q[1] < m - 8 || q[1] > m + ch + 8) continue;
      regMark(doc, q[0], q[1]);
    }
    doc.restore();

    // trim lines on the edges that go over a neighbour
    doc.strokeGray(0).lineWidth(0.3).lineCap(0).dash([2, 1.5]);
    if (left) doc.line(m, m, m, m + ch);
    if (top) doc.line(m, m, m + cw, m);
    doc.dash([]);
    if (left) doc.text('Trim', m + 3.4, m + ch * 0.3, { size: 6.5, angle: 90, align: 'center', gray: 0.35 });
    if (top) doc.text('Trim', m + cw * 0.3, m + 3.6, { size: 6.5, align: 'center', gray: 0.35 });

    // large sheets go to a copy shop: each gets its own check square
    if (G.isLargePaper(lay.paper)) sheetSquare(doc, ctx, P, visW, visH);
  }

  function miniMap(doc, ctx, t, cx, y) {
    const { lay, isIn } = ctx;
    const cellW = 3.2;
    const cellH = cellW * lay.pageH / lay.pageW;
    const gap = 0.8;
    const w = lay.cols * (cellW + gap) - gap;
    const x0 = cx - w / 2;
    doc.lineWidth(0.15).dash([]).lineCap(0);
    for (let r = 0; r < lay.rows; r++) {
      for (let c = 0; c < lay.cols; c++) {
        if (!isIn(c, r)) continue;
        doc.rect(x0 + c * (cellW + gap), y + r * (cellH + gap), cellW, cellH);
        if (c === t.col && r === t.row) doc.fillGray(0).fill();
        else doc.strokeGray(0.4).stroke();
      }
    }
  }

  // ---------------------------------------------------------- overview page

  function wrap(doc, str, widthMm, size, bold) {
    const words = String(str).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (doc.textWidth(t, size, bold) <= widthMm || !line) line = t;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /**
   * Text with "m²" or "ft²": the ² drawn as a small raised 2. Some stand-ins
   * for Helvetica (TeX Gyre Heros, on some Linux systems) name that glyph
   * differently, and the viewer then leaves it out: "0.454 m".
   */
  function textSup(doc, str, x, y, o) {
    const parts = String(str).split('²');
    if (parts.length === 1) { doc.text(str, x, y, o); return; }
    const bold = !!o.bold, small = o.size * 0.62, rise = o.size * 0.36 * PT;
    const sw = doc.textWidth('2', small, bold);
    const w = parts.reduce((t, p) => t + doc.textWidth(p, o.size, bold), 0) + (parts.length - 1) * sw;
    let cx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    const base = Object.assign({}, o, { align: 'left' });
    parts.forEach((p, i) => {
      if (p) doc.text(p, cx, y, base);
      cx += doc.textWidth(p, o.size, bold);
      if (i < parts.length - 1) {
        doc.text('2', cx, y - rise, Object.assign({}, base, { size: small }));
        cx += sw;
      }
    });
  }

  /** The overview is printed at home: A4, or Letter for the US paper sizes. */
  function overviewPaper(lay) {
    return G.paperById(lay.paper && lay.paper.system === 'imperial' ? 'Letter' : 'A4');
  }

  function drawOverview(doc, ctx) {
    const { project, lay, geo, tiles, isIn } = ctx;
    const sheet = overviewPaper(lay);
    const W = sheet.w, H = sheet.h;
    const m = Math.max(10, lay.margin);
    const right = W - m;
    const S = checkSize();
    doc.addPage(W, H);

    // title
    let y = m + 7;
    doc.text(project.name || 'Framebag pattern', m, y, { size: 20, bold: true, gray: 0 });
    y += 6.5;
    let date = '';
    try {
      date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { date = new Date().toISOString().slice(0, 10); }
    const sub = 'Framebag Pattern ' + VERSION + ', ' + date + '. ' + tiles.length + (tiles.length === 1 ? ' pattern page' : ' pattern pages') +
      ' on a ' + lay.cols + ' × ' + lay.rows + ' grid, ' + lay.paper.name + ' ' + lay.orientation + (lay.angle ? ', pattern rotated ' + lay.angle + '°' : '') + '.';
    doc.text(sub, m, y, { size: 8.5, gray: 0.4 });
    y += 4;
    doc.strokeGray(0).lineWidth(0.3).dash([]).line(m, y, right, y);

    // Small drawing of the whole layout. It shrinks so the tables fit above
    // the check square; below 45 mm the tables move to a page of their own.
    const squareTop = H - m - S;
    const boxTop = y + 6, boxW = right - m;
    const need = tablesHeight(doc, ctx, (right - m) / 2 - 6);
    let boxH = Math.min(88, squareTop - 8 - need - 14 - boxTop);
    const separate = boxH < 45;
    if (separate) boxH = 88;
    const gw = lay.cols * lay.sx + lay.overlap, gh = lay.rows * lay.sy + lay.overlap;
    const k = Math.min(boxW / gw, boxH / gh);
    const T = (q) => [m + (q[0] - lay.gx0) * k, boxTop + (q[1] - lay.gy0) * k];
    doc.lineWidth(0.15).strokeGray(0.55).dash([]);
    for (const t of tiles) {
      const a = T([lay.gx0 + t.col * lay.sx, lay.gy0 + t.row * lay.sy]);
      const w = (isIn(t.col + 1, t.row) ? lay.sx : lay.cw) * k;
      const h = (isIn(t.col, t.row + 1) ? lay.sy : lay.ch) * k;
      doc.rect(a[0], a[1], w, h).stroke();
      doc.text(t.label, a[0] + 1.5, a[1] + 4, { size: 8, bold: true, gray: 0.5 });
    }
    for (const pc of geo.pieces) {
      STYLE.finished(doc, 0.6);
      doc.polyline(pc.fin.map(T), true).stroke();
      STYLE.cut(doc, 0.7);
      doc.polyline(pc.cut.map(T), true).stroke();
      strokeNotches(doc, pc.notches, T, 0.2);
      for (const c of pc.letters) cornerText(doc, c, T, 8, k);
    }
    const drawBottom = boxTop + gh * k;
    doc.text('Overview, not to scale. Pages are named by column and row.', m, drawBottom + 5, { size: 7.5, gray: 0.4 });

    if (!separate) {
      drawTables(doc, ctx, m, right, drawBottom + 14);
      drawCheckSquare(doc, ctx, m, right, squareTop);
    } else {
      doc.text('Edge lengths and settings are on the next page.', m, drawBottom + 10, { size: 7.5, gray: 0.4 });
      drawCheckSquare(doc, ctx, m, right, squareTop);
      doc.addPage(W, H);
      doc.text(project.name || 'Framebag pattern', m, m + 7, { size: 14, bold: true, gray: 0 });
      drawTables(doc, ctx, m, right, m + 18);
    }
  }

  function settingsLines(ctx) {
    const { project, d, lay } = ctx;
    const unit = U.unit();
    const ov = d.sides.filter((sd) => sd.override).map((sd) => sd.title + ' ' + n1(sd.offset));
    const radii = d.corners
      .map((c, j) => (c && !c.smooth ? d.labels[j] + ' ' + n1(c.rEffective) + (c.clamped ? '*' : '') : null))
      .filter(Boolean).join(', ');
    const smoothNames = d.labels.filter((_, j) => d.smooth[j]).join(', ');
    const angles = d.labels.map((l, j) => (d.angles[j] != null ? l + ' ' + f1(d.angles[j]) + '°' : null)).filter(Boolean).join(', ');
    const lines = [
      ['Reference length', L1(project.scale.lengthMm)],
      ['Uniform offset', L1(project.outline.uniformOffset)],
      ['Edge offsets, ' + unit, ov.length ? ov.join(', ') : 'None'],
      ['Inside angles', angles || 'None'],
      ['Corner radii, ' + unit, radii || 'None'],
      ['Smooth points', smoothNames || 'None'],
      ['Seam allowance', L1(project.seamAllowance)],
      ['Gusset', d.design ? 'One strip, ' + L1(d.design.gusset.width) + ' wide' : 'None'],
      ['Notches', notchSummary(d)],
      ['On the stitch line', marksSummary(d)],
      ['Split line', splitSummary(d)],
      ['Margin, overlap', L1(lay.margin) + ', ' + L1(lay.overlap)],
      ['Pattern label', labelSummary(project)]
    ];
    const notes = d.warnings.filter((w) => w.section === 'corner').map((w) => '* ' + w.text);
    if (project.print.showLabel && ctx.geo.pieces.some((pc) => !pc.lab)) notes.push('The pattern label did not fit inside the piece.');
    return { lines, notes };
  }

  /**
   * Fabric for the cut list, in mm², seam allowance included: each piece of
   * the side panel (cut twice: drive and non-drive side) and the gusset strip
   * (once). Straps have no set length and are left out.
   */
  function cutAreas(d) {
    const D = d.design;
    const panel = D && D.split ? D.pieces.map((pc) => pc.cutArea) : [d.cutArea];
    const strip = D ? D.gusset.cutLen * D.gusset.cutWidth : 0;
    return { panel, strip, total: 2 * panel.reduce((t, a) => t + a, 0) + strip };
  }

  /** Under the edges: the stitch line all round, each piece's size, and the fabric for all of them. */
  function totalsOf(ctx) {
    const d = ctx.d, D = d.design, pcs = ctx.geo.pieces;
    const size = (v) => n1(v[0]) + ' × ' + n1(v[1]) + ' ' + U.unit();
    const out = [['Finished perimeter', L1(D ? D.total : d.perimeter)]];
    if (pcs.length === 1) out.push(['Cut piece', size(pcs[0].cutSize)], ['Cut piece area', U.area(pcs[0].cutArea)]);
    else pcs.forEach((pc, k) => out.push(['Cut piece, part ' + (k + 1), size(pc.cutSize)]));
    out.push(['Total area, all pieces', U.area(cutAreas(d).total)]);
    return out;
  }

  /** "2 straps, 2 bolt holes, 1 notch". */
  function marksSummary(d) {
    const D = d.design;
    if (!D) return 'None';
    const c = { notch: 0, strap: 0, bolt: 0 };
    for (const m of D.marks) {
      if (m.hidden) continue;
      if (m.kind === 'bolts') c.bolt += m.count; else c[m.kind]++;
    }
    const pl = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const parts = [c.strap ? pl(c.strap, 'strap', 'straps') : '', c.bolt ? pl(c.bolt, 'bolt hole', 'bolt holes') : '', c.notch ? pl(c.notch, 'notch', 'notches') : ''].filter(Boolean);
    return parts.length ? parts.join(', ') : 'None';
  }

  function splitSummary(d) {
    const sp = d.design && d.design.split;
    if (!sp) return 'None';
    const keep = sp.clip ? sp.sides[sp.keep] : null;
    return sp.a.label + '–' + sp.b.label + ', ' + L1(sp.length) + (sp.clip ? ': clipped, the piece with ' + keep.join(', ') + ' kept' : ': two pieces');
  }

  function tablesHeight(doc, ctx, colW) {
    const left = 10 + ctx.d.sides.length * 4.6 + 3 + totalsOf(ctx).length * 4.6;
    const s = settingsLines(ctx);
    let rightRows = 0;
    for (const l of s.lines) rightRows += wrap(doc, l[1], colW - 34, 8.5).length;
    for (const nline of s.notes) rightRows += wrap(doc, nline, colW, 8).length;
    return Math.max(left, 10 + rightRows * 4.6);
  }

  function drawTables(doc, ctx, m, right, top) {
    const d = ctx.d;
    const colW = (right - m) / 2 - 6;
    const row = 4.6;

    // edges, by name when they have one; the corner letters and "curved" in grey
    const xE = m, xF = m + colW, xO = xF - 18, xT = xO - 18;
    const nameMax = xT - 14 - xE;
    let y = top;
    doc.text('Edges', xE, y, { size: 9, bold: true, gray: 0 });
    y += 5;
    doc.text('Edge', xE, y, { size: 7.5, gray: 0.4 });
    doc.text('Traced', xT, y, { size: 7.5, gray: 0.4, align: 'right' });
    doc.text('Offset', xO, y, { size: 7.5, gray: 0.4, align: 'right' });
    doc.text('Finished, ' + U.unit(), xF, y, { size: 7.5, gray: 0.4, align: 'right' });
    y += 1.6;
    doc.strokeGray(0).lineWidth(0.25).dash([]).line(xE, y, xF, y);
    y += 3.6;
    for (const sd of d.sides) {
      const title = fitText(doc, sd.title, nameMax, 8.5, true);
      doc.text(title, xE, y, { size: 8.5, bold: true, gray: 0 });
      const extra = (sd.label ? ' ' + sd.name : '') + (sd.curved ? ' curved' : '');
      const xx = xE + doc.textWidth(title, 8.5, true);
      if (extra && xx + doc.textWidth(extra, 8.5, false) <= xE + nameMax) doc.text(extra, xx, y, { size: 8.5, gray: 0.45 });
      doc.text(n1(sd.tracedLen), xT, y, { size: 8.5, align: 'right', gray: 0 });
      doc.text(n1(sd.offset), xO, y, { size: 8.5, align: 'right', gray: sd.override ? 0 : 0.45 });
      doc.text(n1(sd.finishedLen), xF, y, { size: 8.5, align: 'right', gray: 0 });
      y += row;
    }
    y -= 2.4;
    doc.strokeGray(0.75).lineWidth(0.15).line(xE, y, xF, y);
    y += 4.8;
    const totals = totalsOf(ctx);
    for (const t of totals) {
      doc.text(t[0], xE, y, { size: 8.5, gray: 0 });
      textSup(doc, t[1], xF, y, { size: 8.5, align: 'right', gray: 0 });
      y += row;
    }

    // settings
    const xS = m + colW + 12, xV = right;
    y = top;
    doc.text('Settings', xS, y, { size: 9, bold: true, gray: 0 });
    y += 5;
    doc.strokeGray(0).lineWidth(0.25).line(xS, y + 1.6, xV, y + 1.6);
    y += 5.2;
    const s = settingsLines(ctx);
    for (const l of s.lines) {
      doc.text(l[0], xS, y, { size: 8.5, gray: 0 });
      const parts = wrap(doc, l[1], colW - 34, 8.5);
      parts.forEach((part, i) => {
        doc.text(part, xV, y, { size: 8.5, align: 'right', gray: 0 });
        if (i < parts.length - 1) y += row;
      });
      y += row;
    }
    for (const nline of s.notes) {
      for (const part of wrap(doc, nline, colW, 8)) {
        doc.text(part, xS, y, { size: 8, gray: 0 });
        y += row;
      }
    }
  }

  function drawCheckSquare(doc, ctx, m, right, top) {
    const { lay, tiles } = ctx;
    const S = checkSize();
    drawSquare(doc, m, top, S);

    // assembly and legend
    const x = m + S + 8, w = right - x;
    const name = U.imperial() ? '4 in' : '10 cm';
    const big = G.isLargePaper(lay.paper);
    let y = top + 4;
    doc.text('Assembly', x, y, { size: 9, bold: true, gray: 0 });
    y += 6;
    const steps = [];
    if (big) {
      steps.push('Print the pattern pages on ' + lay.paper.name + ' at 100 % or Actual size, never Fit to page. A copy shop can print them from this file.');
      steps.push('Measure the ' + name + ' square on this page and the check square on each ' + lay.paper.name + ' page. If one is off, check the printer settings.');
    } else {
      steps.push('Print every page at 100 % or Actual size, never Fit to page.');
      steps.push('Measure the ' + name + ' square. If it is off, check the printer settings.');
    }
    if (tiles.length > 1) {
      steps.push('Cut each page along its dashed trim line, on the left and top edges.');
      steps.push('Lay it over its neighbour: trimmed edge on the thin line, half marks completing each circle. Tape.');
      steps.push('Work row by row from the top left. Grey strips go under the next page.');
    } else {
      steps.push('The pattern is on one page: no trimming or taping.');
    }
    steps.forEach((s, i) => {
      doc.text(String(i + 1), x, y, { size: 8.5, bold: true, gray: 0 });
      for (const part of wrap(doc, s, w - 6, 8.5)) {
        doc.text(part, x + 6, y, { size: 8.5, gray: 0 });
        y += 4.2;
      }
      y += 1.4;
    });

    y += 3;
    doc.text('Lines', x, y, { size: 9, bold: true, gray: 0 });
    y += 6;
    const legend = [
      ['cut', 'Cut line'],
      ['finished', 'Stitch line (finished outline)'],
      ['traced', 'Traced outline']
    ];
    for (const l of legend) {
      STYLE[l[0]](doc);
      doc.line(x, y - 1.2, x + 14, y - 1.2);
      doc.text(l[1], x + 18, y, { size: 8.5, gray: 0 });
      y += 5;
    }
    // a notch across the seam allowance; the double one where the strip's ends meet
    if (ctx.d.design) {
      const notches = [['Notch: snip into the seam allowance', [7]]];
      if (ctx.d.design.join) notches.push(['Double notch: where the gusset\u2019s ends meet', [7 - G.NOTCH_PAIR / 2, 7 + G.NOTCH_PAIR / 2]]);
      for (const nt of notches) {
        STYLE.cut(doc);
        doc.line(x, y - 1.2, x + 14, y - 1.2);
        doc.lineWidth(0.3);
        for (const dx of nt[1]) doc.line(x + dx, y - 1.2, x + dx, y - 4);
        doc.text(nt[0], x + 18, y, { size: 8.5, gray: 0 });
        y += 5;
      }
    }
    doc.lineCap(0).dash([]);
    doc.strokeGray(0).lineWidth(0.2);
    regMark(doc, x + 7, y + 1.5);
    doc.text('Registration mark', x + 18, y + 2.7, { size: 8.5, gray: 0 });
  }

  // --------------------------------------------------------- cut list page
  //
  // After the overview, on its paper: what to cut (the side panel's pieces,
  // the gusset strip, straps and bolt holes), then the gusset strip, which is
  // cut with a ruler rather than from a printed piece: a reduced drawing of
  // it, how far each notch is from its left end, with the side panel's
  // letters, and where the straps and bolt holes go. Last, the steps.

  const GRID = 6;       // columns across the page for the notch distances
  const ROW = 4.4;      // their line spacing

  /** Distances fill up to `max` columns, at most 4 rows a column until then. */
  function columnsFor(n, max) {
    const cols = Math.min(max, Math.max(1, Math.ceil(n / 4)));
    return { cols, rows: n ? Math.ceil(n / cols) : 0 };
  }

  /** "Ends meet at A", or where between corners. */
  function joinText(D) {
    const j = D.join;
    if (!j.free) return 'Ends meet at ' + j.label;
    const r = D.runs[j.run];
    if (!r) return 'Ends meet between corners';
    return 'Ends meet on ' + r.title + ', ' + L1(G.wrapIn(D.total, j.s - r.s)) + ' from ' + (r.from ? r.from.label : 'its start');
  }

  function drawCutList(doc, ctx) {
    const { project, d, lay } = ctx;
    const D = d.design;
    if (!D) return;
    const gs = D.gusset;
    const sheet = overviewPaper(lay);
    const W = sheet.w, H = sheet.h;
    const m = Math.max(10, lay.margin);
    const right = W - m, bottom = H - m;

    let y = 0;
    const page = (first) => {
      doc.addPage(W, H);
      y = m + 7;
      doc.text(first ? 'Cut list' : 'Cut list, continued', m, y, { size: first ? 20 : 14, bold: true, gray: 0 });
      y += first ? 6.5 : 4;
      if (first) {
        const sub = (project.name ? project.name + '. ' : '') + 'Every size and area includes the ' + L1(D.sa) + ' seam allowance.';
        doc.text(sub, m, y, { size: 8.5, gray: 0.4 });
        y += 4;
      }
      doc.strokeGray(0).lineWidth(0.3).dash([]).lineCap(0).line(m, y, right, y);
      y += 10;
    };
    page(true);

    // ---- what to cut, with the fabric each row takes (all its pieces) and in all
    const piece = (project.label && project.label.piece) || 'Side panel';
    const size = (v) => n1(v[0]) + ' × ' + n1(v[1]);
    const areas = cutAreas(d);
    const rows = [];
    const pcs = ctx.geo.pieces;
    pcs.forEach((pc, k) => rows.push([piece + (pcs.length > 1 ? ', part ' + (k + 1) : ''), '2', size(pc.cutSize),
      'One as printed, one turned over: drive and non-drive side.', U.areaNum(2 * areas.panel[k])]));
    rows.push(['Gusset strip', '1', n1(gs.cutLen) + ' × ' + n1(gs.cutWidth), L1(gs.width) + ' wide finished. Cut with a ruler; marked as below.',
      U.areaNum(areas.strip)]);
    const straps = {}, holes = { n: 0 };
    for (const mt of gs.mounts) {
      if (mt.kind === 'strap') straps[mt.width] = (straps[mt.width] || 0) + 1;
      else holes.n++;
    }
    Object.keys(straps).forEach((w) => rows.push(['Strap, ' + L1(+w) + ' wide', String(straps[w]), '', 'Long enough to go round the tube; sewn to the gusset.', '']));
    if (holes.n) rows.push(['Bolt holes', String(holes.n), '', 'Eyelets in the gusset, on its middle, for bolts into the bottle bosses.', '']);
    rows.push(['Total', '', '', 'All the pieces above' + (Object.keys(straps).length ? ', except the straps' : '') +
      '. Add extra for laying them out on the fabric.', U.areaNum(areas.total), true]);

    const xQ = m + 62, xS = m + 92, xA = m + 110, xN = m + 118;
    doc.text('Piece', m, y, { size: 7.5, gray: 0.4 });
    doc.text('Qty', xQ, y, { size: 7.5, gray: 0.4, align: 'right' });
    doc.text('Size, ' + U.unit(), xS, y, { size: 7.5, gray: 0.4, align: 'right' });
    textSup(doc, 'Area, ' + U.areaUnit(), xA, y, { size: 7.5, gray: 0.4, align: 'right' });
    y += 1.6;
    doc.strokeGray(0).lineWidth(0.25).line(m, y, right, y);
    y += 3.8;
    for (const r of rows) {
      if (r[5]) {   // the total, under a thin rule
        doc.strokeGray(0.75).lineWidth(0.15).line(m, y - 2.4, right, y - 2.4);
        y += 1.6;
      }
      const note = wrap(doc, r[3], right - xN, 8, false);
      doc.text(fitText(doc, r[0], xQ - 10 - m, 8.5, true), m, y, { size: 8.5, bold: true, gray: 0 });
      if (r[1]) doc.text(r[1], xQ, y, { size: 8.5, align: 'right', gray: 0 });
      if (r[2]) doc.text(r[2], xS, y, { size: 8.5, align: 'right', gray: 0 });
      if (r[4]) doc.text(r[4], xA, y, { size: 8.5, align: 'right', bold: !!r[5], gray: 0 });
      note.forEach((t, i) => doc.text(t, xN, y + i * 3.8, { size: 8, gray: 0.4 }));
      y += Math.max(1, note.length) * 3.8 + 1.4;
    }
    y += 8;

    // ---- the gusset strip: reduced to the page's width, to scale unless very thin
    const k = (right - m) / gs.cutLen;
    const bh = Math.min(14, Math.max(8, gs.cutWidth * k));
    const tb = columnsFor(gs.marks.length, GRID);
    const mb = columnsFor(gs.mounts.length, 3);
    const h = 7 + bh + 5 + (tb.rows ? 7.5 + tb.rows * ROW : 0) + (mb.rows ? 9 + mb.rows * ROW : 0);
    if (y + h > bottom) page(false);
    drawStrip(doc, D, { m, right, top: y, k, bh, tb, mb });
    y += h + 9;

    // ---- the steps
    const join = D.join.label || 'the double notch';
    const marked = gs.marks.length > 0;
    const sp = D.split;
    const steps = [
      'Cut the ' + piece.toLowerCase() + (pcs.length > 1 ? ' parts' : '') + ' from the pattern pages, one as printed and one turned over. Snip each notch a little way into the seam allowance.',
      pcs.length > 1 ? 'Sew each pair of parts together along the split line, ' + sp.a.label + ' to ' + sp.a.label + ' and ' + sp.b.label + ' to ' + sp.b.label + ', notch to notch.' : '',
      'Cut the gusset strip to size with a ruler: it needs no printed piece.',
      marked ? 'Lay a tape measure along it from its left end. At each distance, snip both long edges a little way into the seam allowance.' : '',
      gs.mounts.length ? 'Mark ' + [Object.keys(straps).length ? 'the straps' : '', holes.n ? 'the bolt holes' : ''].filter(Boolean).join(' and ') +
        ' on its middle at their distances, and sew or set them before the gusset goes in.' : '',
      'Sew its ends together. Then sew it to each side panel, notch to notch, with the letters at their corners and its end seam at ' +
        (D.join.free ? 'the double notch.' : 'the double notch at ' + join + '.')
    ].filter(Boolean);
    const tw = Math.min(130, right - m - 6);
    const lines = steps.map((st) => wrap(doc, st, tw, 8.5));
    const need = 6 + lines.reduce((t, l) => t + l.length * 4.2 + 1.4, 0);
    if (y + need > bottom) page(false);
    doc.text('Cutting and sewing', m, y, { size: 9, bold: true, gray: 0 });
    y += 6;
    lines.forEach((parts, i) => {
      doc.text(String(i + 1), m, y, { size: 8.5, bold: true, gray: 0 });
      for (const part of parts) {
        doc.text(part, m + 6, y, { size: 8.5, gray: 0 });
        y += 4.2;
      }
      y += 1.4;
    });
  }

  /**
   * The gusset strip: its cut outline with the stitch line inside it (the
   * seam allowance along both edges and at both ends), notches into both
   * long edges with the letters under them, straps as grey bands, bolt holes
   * as circles; then the distances from its left end.
   */
  function drawStrip(doc, D, o) {
    const { m, right, top, k, bh } = o;
    const gs = D.gusset;
    doc.text('Gusset strip', m, top + 3.5, { size: 9, bold: true, gray: 0 });
    doc.text(joinText(D), right, top + 3.5, { size: 8.5, align: 'right', gray: 0 });
    const by = top + 7, bw = gs.cutLen * k;
    const X = (t) => m + t * k;
    doc.fillGray(0.82);
    for (const mt of gs.mounts) if (mt.kind === 'strap') doc.rect(X(mt.t - mt.width / 2), by, mt.width * k, bh).fill();
    doc.strokeGray(0).lineWidth(0.3).dash([]).lineCap(0);
    doc.rect(m, by, bw, bh).stroke();
    const e = D.sa * k;
    if (e >= 0.6) {
      STYLE.finished(doc, 0.5);
      doc.rect(m + e, by + e, bw - 2 * e, bh - 2 * e).stroke();
    }
    doc.strokeGray(0).lineWidth(0.3).dash([]).lineCap(0);
    for (const mk of gs.marks) {
      const x = X(mk.t), dd = bh * (mk.label ? 0.4 : 0.25);
      doc.line(x, by, x, by + dd);
      doc.line(x, by + bh, x, by + bh - dd);
    }
    doc.lineWidth(0.25);
    for (const mt of gs.mounts) if (mt.kind === 'bolt') doc.circle(X(mt.t), by + bh / 2, 1).stroke();
    let last = -1e9;
    for (const mk of gs.marks) {
      if (!mk.label) continue;
      const x = Math.min(m + bw - 1.2, Math.max(m + 1.2, X(mk.t)));
      if (x - last < 4) continue;
      last = x;
      doc.text(mk.label, x, by + bh + 4, { size: 7.5, bold: true, align: 'center', gray: 0 });
    }

    // how far each notch is from the left end, in columns read downwards
    let y = by + bh + 5 + 5;
    if (o.tb.rows) {
      const cw = (right - m) / GRID;
      doc.text('Notches, from the left end, ' + U.unit(), m, y, { size: 7.5, gray: 0.4 });
      y += 1.6;
      doc.strokeGray(0).lineWidth(0.25).line(m, y, m + o.tb.cols * cw - 6, y);
      y += 3.8;
      gs.marks.forEach((mk, i) => {
        const c = Math.floor(i / o.tb.rows), r = i % o.tb.rows;
        const x = m + c * cw, yy = y + r * ROW;
        doc.text(mk.label || '·', x, yy, { size: 8.5, bold: !!mk.label, gray: mk.label ? 0 : 0.45 });
        doc.text(n1(mk.t), x + cw - 6, yy, { size: 8.5, align: 'right', gray: 0 });
      });
      y += o.tb.rows * ROW + 5;
    }
    // straps and bolt holes: their centres
    if (o.mb.rows) {
      const cw = (right - m) / 3;
      doc.text('Straps and bolt holes, centres from the left end, ' + U.unit(), m, y, { size: 7.5, gray: 0.4 });
      y += 1.6;
      doc.strokeGray(0).lineWidth(0.25).line(m, y, m + o.mb.cols * cw - 6, y);
      y += 3.8;
      gs.mounts.forEach((mt, i) => {
        const c = Math.floor(i / o.mb.rows), r = i % o.mb.rows;
        const x = m + c * cw, yy = y + r * ROW;
        doc.text(mt.kind === 'strap' ? 'Strap, ' + L1(mt.width) + ' wide' : 'Bolt hole', x, yy, { size: 8.5, gray: 0 });
        doc.text(n1(mt.t), x + cw - 6, yy, { size: 8.5, align: 'right', gray: 0 });
      });
    }
  }

  // ------------------------------------------------------------------ export

  function exportPdf(project, d, lay) {
    const doc = build(project, d, lay);
    const bytes = doc.output();
    const name = FB.project.safeFileName(project.name, 'framebag-pattern') + '.pdf';
    FB.project.download(new Blob([bytes], { type: 'application/pdf' }), name);
    return name;
  }

  FB.pdf = { plan, build, exportPdf, cutAreas };
})(typeof window !== 'undefined' ? window : globalThis);
