/*
 * Framebag Pattern — inspector.js
 *
 * The fixed panel on the right (spec §5.6, v1.0 A and E), one for each step.
 * 01 Trace:
 *   01 Offset          uniform offset, plus a specific offset for one edge
 *                      (an edge runs from corner to corner, over smooth points)
 *   02 Selection       the selected point (corner radius, smooth or corner,
 *                      delete) or edge (name, lengths; the clicked segment
 *                      straight or curved)
 *   03 Outline         finished perimeter and size, errors
 * 02 Design:
 *   01 Seam allowance  and the side panel's cut size
 *   02 Gusset          width, one strip or one piece per edge, where a strip's
 *                      ends meet, a drawing of it, its cut size
 *   03 Notches         at the corners, between them, and how many
 * Reads the project, the derived geometry and the selection; writes changes
 * through FB.state. Its field helpers are shared with the status bar and the
 * print settings (FB.ui). Lengths are shown in mm or inches (units.js).
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const fmt = FB.fmt;
  const U = FB.units;
  const $ = (id) => document.getElementById(id);

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);

  /** Show a value in an input unless the person is typing in it. */
  function setInput(el, text) {
    if (document.activeElement === el) return;
    if (el.value !== text) el.value = text;
    el.classList.remove('err');
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  /**
   * Length field, in mm or inches as chosen in the status bar: Enter or
   * leaving the field applies, Esc restores, arrows step by `step` mm, or by
   * 1/16 in (Shift: × 10, or 1/2 in). Commas, the typographic minus,
   * fractions of an inch and an explicit unit ("12 mm") are accepted. A field
   * left as it was shown changes nothing, so a value the unit rounds for
   * display (10 mm shown as 3/8 in) is not rounded by just pressing Enter.
   */
  function bindNumber(el, o) {
    let original = '';
    const step = o.step || 0.5;
    const toText = (v) => (v == null ? '' : U.num(v, o.dec == null ? 1 : o.dec));
    const baseValue = () => (typeof o.base === 'function' ? o.base() : (o.base || 0));

    function commit() {
      const txt = el.value.trim();
      if (txt === original.trim()) {
        el.value = original;
        el.classList.remove('err');
        return;
      }
      let v;
      if (txt === '') {
        if (!o.allowEmpty) { el.value = original; return; }
        v = null;
      } else {
        v = U.parse(txt);
        if (v == null) { el.classList.add('err'); return; }
        v = clamp(v, o.min, o.max);
      }
      el.classList.remove('err');
      if (!same(v, o.get())) o.set(v);
      el.value = toText(v);
      original = el.value;
    }

    el.addEventListener('focus', () => {
      original = el.value;
      setTimeout(() => { if (document.activeElement === el) el.select(); }, 0);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        el.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        el.value = original;
        el.classList.remove('err');
        el.blur();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const cur = U.parse(el.value);
        const base = cur == null ? (o.get() == null ? baseValue() : o.get()) : cur;
        const delta = U.step(step, e.shiftKey) * (e.key === 'ArrowUp' ? 1 : -1);
        el.value = toText(clamp(U.snap(base + delta), o.min, o.max));
        commit();
      }
    });
    el.addEventListener('change', commit);
    el.addEventListener('input', () => el.classList.remove('err'));
  }

  /** Text field (names, notes): Enter or leaving the field applies, trimmed; Esc restores. */
  function bindText(el, o) {
    let original = '';
    function commit() {
      const v = el.value.trim().slice(0, o.max || 60);
      if (v !== (o.get() || '')) o.set(v);
      el.value = v;
      original = v;
    }
    el.addEventListener('focus', () => { original = el.value; });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
        el.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        el.value = original;
        el.blur();
      }
    });
    el.addEventListener('change', commit);
  }

  function messages(el, list) {
    const key = JSON.stringify(list);
    if (el.getAttribute('data-key') === key) return;
    el.setAttribute('data-key', key);
    el.textContent = '';
    for (const m of list) {
      const para = document.createElement('p');
      para.className = m.kind || 'warning';
      para.textContent = m.text;
      el.appendChild(para);
    }
  }

  // ------------------------------------------------------------------- init

  /** The edge holding the selected segment, or null. */
  function selectedSide() {
    const d = FB.app.derived();
    const i = FB.editor.getSelection().edge;
    return d && i != null && i < d.edgeCount ? d.sides[d.segSide[i]] : null;
  }

  function init() {
    const S = FB.state;

    bindNumber($('seam-allowance'), {
      min: 0, max: 50,
      get: () => S.get().seamAllowance,
      set: (v) => S.update((p) => { p.seamAllowance = v; })
    });

    bindNumber($('uniform-offset'), {
      min: -100, max: 100,
      get: () => S.get().outline.uniformOffset,
      set: (v) => S.update((p) => { p.outline.uniformOffset = v; })
    });

    // one offset per edge: it is stored on every segment of the edge
    bindNumber($('edge-offset'), {
      min: -100, max: 100, allowEmpty: true,
      base: () => S.get().outline.uniformOffset,
      get: () => {
        const sd = selectedSide();
        return sd && sd.override ? sd.offset : null;
      },
      set: (v) => {
        const sd = selectedSide();
        if (!sd) return;
        S.update((p) => {
          while (p.outline.edgeOffsets.length < p.outline.points.length) p.outline.edgeOffsets.push(null);
          sd.segs.forEach((i) => { p.outline.edgeOffsets[i] = v; });
        });
      }
    });

    $('edge-select').addEventListener('change', (e) => {
      const v = e.target.value;
      FB.editor.selectEdge(v === '' ? null : parseInt(v, 10));
      e.target.blur();
      if (v !== '') $('edge-offset').focus();
    });

    $('edge-overrides').addEventListener('click', (e) => {
      const b = e.target.closest('[data-edge]');
      if (b) FB.editor.selectEdge(parseInt(b.getAttribute('data-edge'), 10));
    });

    bindNumber($('corner-radius'), {
      min: 0, max: 1000,
      get: () => {
        const i = FB.editor.getSelection().point;
        const q = i == null ? null : S.get().outline.points[i];
        return q ? q.radius : null;
      },
      set: (v) => {
        const i = FB.editor.getSelection().point;
        if (i == null) return;
        S.update((p) => { if (p.outline.points[i]) p.outline.points[i].radius = v; });
      }
    });

    // the selected edge's name: free text
    bindText($('edge-name'), {
      max: 40,
      get: () => {
        const sd = selectedSide();
        return sd ? sd.label : '';
      },
      set: setEdgeName
    });

    // 02 Design: the gusset and the notches
    const des = () => S.get().design;
    bindNumber($('gusset-width'), {
      min: 5, max: 500,
      get: () => des().gusset.width,
      set: (v) => S.update((p) => { p.design.gusset.width = v; })
    });
    // the strip's ends: at a corner (its point), at the end of a split line (the spot), or where it is
    $('gusset-join').addEventListener('change', (e) => {
      const v = e.target.value, d = FB.app.derived(), D = d && d.design;
      let val;
      if (v.indexOf('c:') === 0) val = parseInt(v.slice(2), 10);
      else if (v.indexOf('s:') === 0 && D) {
        const st = D.stations.find((x) => x.label === v.slice(2));
        if (st) val = [st.at[0] / d.scale, st.at[1] / d.scale];
      }
      if (val != null) S.update((p) => { p.design.gusset.join = val; });
      e.target.blur();
    });
    $('notch-corners').addEventListener('change', (e) => {
      const v = e.target.checked;
      S.update((p) => { p.design.notches.corners = v; });
    });
    bindNumber($('notch-spacing'), {
      min: 10, max: 2000, allowEmpty: true, step: 10,
      get: () => des().notches.spacing,
      set: (v) => S.update((p) => { p.design.notches.spacing = v; })
    });
    // a part of the strip selects its edge on the canvas, and the other way round; a strap or hole, its mark
    $('gusset-strip').addEventListener('click', (e) => {
      const mk = e.target.closest('[data-mark]');
      if (mk) { FB.editor.selectDesign({ kind: 'mark', index: parseInt(mk.getAttribute('data-mark'), 10) }); return; }
      const t = e.target.closest('[data-run]');
      if (t) FB.editor.selectRun(parseInt(t.getAttribute('data-run'), 10));
    });

    // 04 Selection: add at the spot on the line; the selected mark's place and size
    document.querySelectorAll('#dsel-run [data-add]').forEach((b) => {
      b.addEventListener('click', () => {
        const k = b.getAttribute('data-add');
        if (k === 'join') FB.editor.joinHere(); else FB.editor.addMark(k);
        b.blur();
      });
    });
    const selMark = () => {
      const ds = FB.editor.getDesignSelection();
      return ds && ds.kind === 'mark' ? ds.index : null;
    };
    const markOf = () => { const k = selMark(); return k == null ? null : des().marks[k]; };
    // how far along its edge, from the corner it starts at
    bindNumber($('mark-from'), {
      min: 0, max: 100000,
      get: () => {
        const d = FB.app.derived(), D = d && d.design, ds = FB.editor.getDesignSelection();
        if (!D || !ds) return null;
        const m = ds.kind === 'mark' ? D.marks[ds.index] : null;
        const s = ds.kind === 'join' ? D.join.s : (m ? m.s : null);
        const r = D.runs[ds.kind === 'join' ? D.join.run : (m ? m.run : -1)];
        return s == null || !r ? null : wrapS(D, s - r.s);
      },
      set: (v) => FB.editor.setMarkFrom(v)
    });
    bindNumber($('mark-width'), {
      min: 5, max: 200,
      get: () => (markOf() ? markOf().width : null),
      set: (v) => {
        const k = selMark();
        // the next strap placed is as wide
        if (k != null) S.update((p) => { p.design.marks[k].width = v; p.design.strapWidth = v; });
      }
    });
    $('mark-holes').addEventListener('change', (e) => {
      const k = selMark(), v = parseInt(e.target.value, 10);
      if (k != null && isFinite(v)) S.update((p) => { p.design.marks[k].count = v; });
      e.target.blur();
    });
    bindNumber($('mark-spacing'), {
      min: 10, max: 500,
      get: () => (markOf() ? markOf().spacing : null),
      set: (v) => { const k = selMark(); if (k != null) S.update((p) => { p.design.marks[k].spacing = v; }); }
    });
    $('btn-delete-mark').addEventListener('click', (e) => { FB.editor.deleteDesignSelected(); e.currentTarget.blur(); });
    $('btn-delete-split').addEventListener('click', (e) => { FB.editor.deleteDesignSelected(); e.currentTarget.blur(); });
    $('split-keep').addEventListener('change', (e) => {
      const v = e.target.value;
      S.update((p) => { if (p.design.split) p.design.split.keep = v; });
      e.target.blur();
    });
  }

  /** Name the selected edge: the name is stored on every segment of the edge ('' removes it). */
  function setEdgeName(v) {
    const sd = selectedSide();
    if (!sd || (sd.label || '') === (v || '')) return;
    FB.state.update((p) => {
      const en = p.outline.edgeNames || (p.outline.edgeNames = []);
      while (en.length < p.outline.points.length) en.push(null);
      sd.segs.forEach((i) => { en[i] = v || null; });
    });
  }

  // ------------------------------------------------------------------ update

  // The dropdown lists edges (corner to corner), by name when they have one;
  // choosing one selects its first segment.
  function edgeOptions(d) {
    const opts = [{ value: '', text: d.edgeCount ? 'Choose…' : '—' }];
    for (const sd of d.sides) {
      opts.push({ value: String(sd.segs[0]), text: sd.title + (sd.override ? '   ' + U.num(sd.offset) : '') });
    }
    return opts;
  }

  function updateEdgeSelect(d, sel) {
    const select = $('edge-select');
    const opts = edgeOptions(d);
    const key = JSON.stringify(opts);
    if (select.getAttribute('data-key') !== key && document.activeElement !== select) {
      select.setAttribute('data-key', key);
      select.textContent = '';
      for (const o of opts) {
        const el = document.createElement('option');
        el.value = o.value;
        el.textContent = o.text;
        select.appendChild(el);
      }
    }
    const want = sel.edge != null && sel.edge < d.edgeCount ? String(d.sides[d.segSide[sel.edge]].segs[0]) : '';
    if (select.value !== want && document.activeElement !== select) select.value = want;
    select.disabled = d.edgeCount === 0;
  }

  function updateOverrides(d) {
    const el = $('edge-overrides');
    const list = [];
    for (const sd of d.sides) {
      if (sd.override) list.push({ i: sd.segs[0], text: sd.title + ' ' + U.num(sd.offset) });
    }
    const key = JSON.stringify(list);
    if (el.getAttribute('data-key') === key) return;
    el.setAttribute('data-key', key);
    el.textContent = '';
    if (!list.length) return;
    el.appendChild(document.createTextNode('Specific: '));
    list.forEach((it, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.setAttribute('data-edge', it.i);
      b.textContent = it.text;
      el.appendChild(b);
      if (k < list.length - 1) el.appendChild(document.createTextNode(', '));
    });
  }

  function update() {
    const p = FB.state.get();
    const d = FB.app.derived();
    if (!d) return;
    const sel = FB.editor.getSelection();
    const design = FB.editor.getMode() === 'design';
    $('panel-trace').hidden = design;
    $('panel-design').hidden = !design;
    if (design) {
      updateDesign(p, d);
      return;
    }
    const length = (v) => (d.hasScale ? U.len(v) : fmt(v, 0) + ' px');

    // 01 Offset
    setInput($('uniform-offset'), U.num(p.outline.uniformOffset));
    updateEdgeSelect(d, sel);
    const ei = sel.edge != null && sel.edge < d.edgeCount ? sel.edge : null;
    const sd = ei != null ? d.sides[d.segSide[ei]] : null;
    const edgeIn = $('edge-offset');
    edgeIn.disabled = !(d.closed && sd);
    if (sd) {
      setInput(edgeIn, sd.override ? U.num(sd.offset) : '');
      edgeIn.placeholder = U.num(p.outline.uniformOffset);
      edgeIn.classList.toggle('uniform', !sd.override);
    } else {
      setInput(edgeIn, '');
      edgeIn.placeholder = '';
    }
    updateOverrides(d);
    const offMsgs = d.errors.filter((m) => m.section === 'offset').map((m) => ({ text: m.text, kind: 'error' }));
    messages($('offset-msgs'), offMsgs);

    // 02 Selection: a point (corner or smooth) or an edge
    const i = sel.point;
    const q = i != null ? p.outline.points[i] : null;
    const smooth = !!q && !!d.smooth[i];
    const isEdge = !q && !!sd;
    let title = 'Selection';
    if (q) title = (smooth ? 'Smooth point ' : 'Corner ') + d.labels[i];
    else if (isEdge) title = (sd.label ? sd.label + ' (' + sd.name + ')' : 'Edge ' + sd.name) + (sd.curved ? ', curved' : '');
    setText($('sel-title'), title);
    $('sel-empty').hidden = !!q || isEdge;
    $('sel-corner').hidden = !q;
    $('sel-edge').hidden = !isEdge;
    if (q) {
      $('corner-angle-row').hidden = smooth;
      setText($('corner-angle'), d.angles[i] != null ? fmt(d.angles[i]) + '°' : '—');
      $('corner-row').hidden = smooth;
      $('smooth-note').hidden = !smooth;
      $('btn-radius-all').hidden = smooth;
      setInput($('corner-radius'), U.num(q.radius || 0));
      const cm = smooth ? [] : d.warnings.filter((m) => m.section === 'corner' && m.vertex === i).map((m) => ({ text: m.text }));
      if (d.badCorners.indexOf(i) >= 0) cm.push({ text: 'The seam allowance is too large for this corner.', kind: 'error' });
      if (!d.closed && !smooth) cm.push({ text: 'The radius is applied once the outline is closed.' });
      messages($('corner-msgs'), cm);
      const bs = $('btn-smooth');
      setText(bs, smooth ? 'Make corner' : 'Make smooth');
      bs.disabled = !FB.editor.canSmooth(i);
      bs.title = bs.disabled
        ? 'The first and last points of an open outline are corners'
        : (smooth ? 'Corner: the outline changes direction here and the corner can be rounded'
                  : 'Smooth: the outline keeps its direction through the point, for curved tubes');
    }
    if (isEdge) {
      const nameIn = $('edge-name');
      setInput(nameIn, sd.label);
      nameIn.placeholder = sd.name;
      setText($('edge-traced'), length(sd.tracedLen));
      setText($('edge-finished'), sd.finishedLen != null && d.closed ? U.len(sd.finishedLen) : '—');
      setText($('btn-curve'), 'Make ' + FB.geom.edgeName(d.labels, ei) + (d.curved[ei] ? ' straight' : ' curved'));
    }

    // 03 Outline: the finished outline's size; the seam allowance's errors
    // are shown here too, since it is set in 02 Design
    $('outline-empty').hidden = d.n > 0;
    setText($('perimeter'), d.finishedPath ? U.len(d.perimeter) : '—');
    setText($('finished-size'), d.finishedSize ? U.num(d.finishedSize[0]) + ' × ' + U.num(d.finishedSize[1]) + ' ' + U.unit() : '—');
    const outlineMsgs = d.errors.filter((m) => m.section === 'outline').map((m) => ({ text: m.text, kind: 'error' }));
    d.errors.filter((m) => m.section === 'seam').forEach((m) => outlineMsgs.push({ text: m.text + ' Change it in 02 Design.', kind: 'error' }));
    if (d.closed && !d.hasScale && !outlineMsgs.length) outlineMsgs.push({ text: 'Set the scale to see the finished outline and cut line.' });
    messages($('outline-msgs'), outlineMsgs);
  }

  // ------------------------------------------------------------- 02 Design

  const MARK_TITLES = { notch: 'Notch', strap: 'Strap', bolts: 'Bolt holes' };
  const wrapS = (D, s) => FB.geom.wrapIn(D.total, s);

  function updateDesign(p, d) {
    const D = d.design;
    const g = p.design.gusset, nt = p.design.notches;
    const dsel = FB.editor.getDesignSelection();
    $('design-empty').hidden = !!D;
    $('panel-design').classList.toggle('not-ready', !D);

    // 01 Seam allowance, and the side panel's size (each piece's, when split)
    setInput($('seam-allowance'), U.num(p.seamAllowance));
    let cut = '—';
    const pcs = D ? D.pieces.filter((pc) => pc.cutSize) : [];
    if (pcs.length) cut = pcs.map((pc) => U.num(pc.cutSize[0]) + ' × ' + U.num(pc.cutSize[1])).join('\n') + ' ' + U.unit();
    else if (d.geometryOk) cut = U.num(d.cutSize[0]) + ' × ' + U.num(d.cutSize[1]) + ' ' + U.unit();
    setText($('cut-size-lbl'), pcs.length > 1 ? 'Side panel, cut in 2' : 'Side panel, cut');
    setText($('cut-size'), cut);
    const msgs = d.errors.filter((m) => m.section === 'seam').map((m) => ({ text: m.text, kind: 'error' }));
    d.warnings.filter((m) => m.section === 'design').forEach((m) => msgs.push({ text: m.text }));
    messages($('seam-msgs'), msgs);

    // 02 Gusset
    setInput($('gusset-width'), U.num(g.width));
    updateJoinSelect(d, D);
    renderStrip(d, D, dsel);
    const gs = D && D.gusset;
    setText($('gusset-size'), gs ? U.num(gs.cutLen) + ' × ' + U.num(gs.cutWidth) + ' ' + U.unit() : '—');
    $('gusset-size-row').title = gs
      ? 'The stitch line all round, ' + U.len(gs.len) + ', plus ' + U.len(D.sa) + ' seam allowance at each end, where the ends are sewn together; ' +
        U.len(gs.width) + ' wide plus ' + U.len(D.sa) + ' on each side.'
      : '';

    // 03 Notches: how many at the corners, and between them
    $('notch-corners').checked = nt.corners !== false;
    setInput($('notch-spacing'), nt.spacing ? U.num(nt.spacing) : '');
    setText($('notch-count'), D && nt.corners !== false ? String(D.counts.corners + D.counts.split) : '');
    setText($('notch-between'), D && D.counts.between ? 'evenly: ' + D.counts.between + ' in all' : 'evenly, about every');

    // 04 Selection: on the line
    updateDesignSelection(d, D, dsel);
  }

  /** The corners where the strip's ends can meet, and the spot between corners when it is there. */
  function updateJoinSelect(d, D) {
    const select = $('gusset-join');
    const val = (st) => (st.kind === 'corner' ? 'c:' + st.point : 's:' + st.label);
    const list = D ? D.stations.map((st) => ({ v: val(st), t: st.kind === 'split' ? 'Split line, ' + st.label : 'Corner ' + st.label })) : [];
    if (D && D.join.free) list.push({ v: 'free', t: 'On ' + (D.runs[D.join.run] ? D.runs[D.join.run].title : 'the line') });
    const key = JSON.stringify(list);
    if (select.getAttribute('data-key') !== key && document.activeElement !== select) {
      select.setAttribute('data-key', key);
      select.textContent = '';
      for (const o of list) {
        const el = document.createElement('option');
        el.value = o.v;
        el.textContent = o.t;
        select.appendChild(el);
      }
    }
    const want = !D ? '' : (D.join.free ? 'free' : (D.join.station ? val(D.join.station) : ''));
    if (select.value !== want && document.activeElement !== select) select.value = want;
    select.disabled = !list.length;
  }

  /** 04 Selection in 02 Design: an edge (its length, and adding at the spot), a mark or the join, the split line. */
  function updateDesignSelection(d, D, dsel) {
    const kind = D && dsel ? dsel.kind : null;
    const m = kind === 'mark' ? D.marks[dsel.index] : null;
    const onMark = (kind === 'mark' && m && !m.hidden) || kind === 'join';
    $('dsel-empty').hidden = !!kind;
    $('dsel-run').hidden = kind !== 'run';
    $('dsel-mark').hidden = !onMark;
    $('dsel-split').hidden = !(kind === 'split' && D.split);
    let title = 'Selection';
    if (kind === 'run' && D.runs[dsel.run]) {
      const r = D.runs[dsel.run];
      title = r.title + (r.name && r.title !== r.name ? ' (' + r.name + ')' : '');
      setText($('dsel-len'), U.len(r.len));
      const can = FB.editor.canAdd();
      document.querySelectorAll('#dsel-run [data-add]').forEach((b) => { b.disabled = !can; });
    } else if (onMark) {
      const s = kind === 'join' ? D.join.s : m.s;
      const r = D.runs[kind === 'join' ? D.join.run : m.run];
      title = kind === 'join' ? 'Ends meet' : MARK_TITLES[m.kind];
      const a = r ? wrapS(D, s - r.s) : 0;
      setText($('mark-from-lbl'), 'From ' + (r && r.from ? r.from.label : 'the start'));
      setText($('mark-to'), r ? U.len(Math.max(0, r.len - a)) + ' to ' + (r.to ? r.to.label : 'the end') : '');
      setInput($('mark-from'), U.num(a));
      $('mark-width-row').hidden = !(m && m.kind === 'strap');
      $('mark-holes-row').hidden = !(m && m.kind === 'bolts');
      $('mark-buttons').hidden = kind === 'join';
      if (m && m.kind === 'strap') setInput($('mark-width'), U.num(m.width));
      if (m && m.kind === 'bolts') {
        const sel = $('mark-holes');
        if (sel.value !== String(m.count) && document.activeElement !== sel) sel.value = String(m.count);
        setInput($('mark-spacing'), U.num(m.spacing));
      }
    } else if (kind === 'split' && D.split) {
      const sp = D.split;
      title = 'Split line ' + sp.a.label + '–' + sp.b.label;
      const name = (labels) => (labels.length ? 'Piece with ' + labels.join(', ') : 'The other piece');
      const list = [{ v: 'both', t: 'Both pieces' }, { v: 'left', t: name(sp.sides.left) }, { v: 'right', t: name(sp.sides.right) }];
      const select = $('split-keep'), key = JSON.stringify(list);
      if (select.getAttribute('data-key') !== key && document.activeElement !== select) {
        select.setAttribute('data-key', key);
        select.textContent = '';
        for (const o of list) {
          const el = document.createElement('option');
          el.value = o.v;
          el.textContent = o.t;
          select.appendChild(el);
        }
      }
      if (select.value !== sp.keep && document.activeElement !== select) select.value = sp.keep;
      setText($('split-len'), U.len(sp.length));
    }
    setText($('dsel-title'), title);
  }

  /**
   * The gusset in the panel, to its length: one strip, notched into both long
   * edges, with the corner letters under its corner notches, straps as bands
   * across it and bolt holes as dots on its middle. Each edge's part takes a
   * click, which selects that edge (shaded under the pointer, drawn heavier
   * when selected, as on the canvas); a strap or a hole selects that mark.
   */
  function renderStrip(d, D, dsel) {
    const box = $('gusset-strip');
    if (!D) {
      if (box.innerHTML) box.innerHTML = '';
      return;
    }
    const W = Math.max(120, Math.floor(box.clientWidth) || 256);
    const gs = D.gusset, L = gs.cutLen;
    const selRun = dsel && dsel.kind === 'run' ? dsel.run : -1;
    const selMark = dsel && dsel.kind === 'mark' ? dsel.index : -1;
    const n1 = (v) => Math.round(v * 10) / 10;
    const crisp = (v) => Math.round(v - 0.5) + 0.5; // a 1 px line on the pixel grid
    const x = (t) => 0.5 + t / L * (W - 1);
    const top = 2.5, h = 12, H = 28;
    const at = 'x="0.5" y="' + top + '" width="' + (W - 1) + '" height="' + h + '"';
    let s = '<rect class="bar" ' + at + '/>';
    // each edge's stretch: the area that takes the click, then the shading over the bar
    for (const pt of gs.parts) {
      const r = D.runs[pt.run], x0 = x(pt.t0), x1 = x(pt.t1);
      s += '<rect class="hit" data-run="' + pt.run + '" x="' + n1(x0) + '" y="0" width="' + n1(x1 - x0) + '" height="' + H + '"><title>' +
           esc(r.title + ', ' + U.len(r.len)) + '</title></rect>' +
           '<rect class="part' + (pt.run === selRun ? ' on' : '') + '" x="' + n1(x0) + '" y="' + top + '" width="' + n1(x1 - x0) + '" height="' + h + '"/>';
    }
    s += '<rect class="edge" ' + at + '/>';
    // notches into both long edges, the corners' deeper
    for (const mk of gs.marks) {
      const X = crisp(x(mk.t)), k = n1(h * (mk.label ? 0.4 : 0.25));
      s += '<line class="tick" x1="' + X + '" y1="' + top + '" x2="' + X + '" y2="' + n1(top + k) + '"/>' +
           '<line class="tick" x1="' + X + '" y1="' + (top + h) + '" x2="' + X + '" y2="' + n1(top + h - k) + '"/>';
    }
    // straps across the strip, bolt holes on its middle; each selects its mark
    for (const mt of gs.mounts) {
      const on = mt.mark === selMark ? ' sel' : '';
      if (mt.kind === 'strap') {
        const w = Math.max(2, mt.width / L * (W - 1));
        s += '<rect class="mk strap' + on + '" data-mark="' + mt.mark + '" x="' + n1(x(mt.t) - w / 2) + '" y="' + top + '" width="' + n1(w) + '" height="' + h + '"><title>Strap, ' + esc(U.len(mt.width)) + '</title></rect>';
      } else {
        s += '<circle class="mk hole' + on + '" data-mark="' + mt.mark + '" cx="' + n1(x(mt.t)) + '" cy="' + (top + h / 2) + '" r="2"><title>Bolt hole</title></circle>';
      }
    }
    // the letters under their notches; one too close to the last is left out
    let last = -1e9;
    for (const mk of gs.marks) {
      if (!mk.label) continue;
      const X = Math.min(W - 4, Math.max(4, x(mk.t)));
      if (X - last < 10) continue;
      last = X;
      s += '<text class="c" x="' + n1(X) + '" y="' + (H - 3) + '" text-anchor="middle">' + esc(mk.label) + '</text>';
    }
    const html = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + s + '</svg>';
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  FB.ui = { bindNumber, bindText, setInput, setText, messages };
  FB.inspector = { init, update };
})(window);
