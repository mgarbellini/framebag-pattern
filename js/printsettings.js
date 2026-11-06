/*
 * Framebag Pattern — printsettings.js
 *
 * The gear button next to Export PDF opens the print settings: paper,
 * margin, overlap, layout options and the resulting page count (spec v0.7 C),
 * and the pattern label printed on the piece (spec v0.7 E). They are saved
 * with the project. "Reset to defaults" restores the paper, margin, overlap
 * and options for the chosen unit (A4, 10 mm, 15 mm; or Letter, 3/8 in,
 * 5/8 in; all options on). The label keeps its text.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const G = FB.geom;
  const U = FB.units;
  const $ = (id) => document.getElementById(id);

  let pop, btn;

  function isOpen() { return !!pop && !pop.hidden; }

  function position() {
    const r = btn.closest('.split').getBoundingClientRect();
    pop.style.top = Math.round(r.bottom + 6) + 'px';
    pop.style.right = Math.round(Math.max(8, root.innerWidth - r.right)) + 'px';
  }

  function open() {
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('open');
    position();
    update();
  }

  function close() {
    if (!isOpen()) return false;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('open');
    return true;
  }

  /** "A4, 210 × 297 mm", "Letter, 8.5 × 11 in": each paper in its own unit. */
  function paperText(pp) {
    if (pp.system === 'imperial') {
      const i = (mm) => String(Math.round(mm / U.IN * 10) / 10);
      return pp.name + ', ' + i(pp.w) + ' × ' + i(pp.h) + ' in';
    }
    return pp.name + ', ' + Math.round(pp.w) + ' × ' + Math.round(pp.h) + ' mm';
  }

  /** The papers of the chosen unit, and the project's own paper if it is of the other one. */
  function updatePaperSelect(p) {
    const select = $('print-paper');
    const cur = G.paperById(p.print.paper);
    const list = G.PAPERS.filter((pp) => pp.system === U.system());
    if (list.indexOf(cur) < 0) list.unshift(cur);
    const key = list.map((pp) => pp.id).join();
    if (select.getAttribute('data-key') !== key && document.activeElement !== select) {
      select.setAttribute('data-key', key);
      select.textContent = '';
      for (const pp of list) {
        const o = document.createElement('option');
        o.value = pp.id;
        o.textContent = paperText(pp);
        select.appendChild(o);
      }
    }
    if (select.value !== cur.id && document.activeElement !== select) select.value = cur.id;
  }

  function init() {
    const S = FB.state;
    pop = $('print-pop');
    btn = $('btn-print-settings');

    btn.addEventListener('click', () => {
      if (isOpen()) close(); else open();
      btn.blur();
    });
    // a press anywhere else closes it
    document.addEventListener('pointerdown', (e) => {
      if (isOpen() && !pop.contains(e.target) && !btn.contains(e.target)) close();
    }, true);
    root.addEventListener('resize', () => { if (isOpen()) position(); });

    $('print-paper').addEventListener('change', (e) => {
      const v = e.target.value;
      S.update((p) => { p.print.paper = v; });
    });
    FB.ui.bindNumber($('print-margin'), {
      min: 0, max: 40, step: 1,
      get: () => S.get().print.marginMm,
      set: (v) => S.update((p) => { p.print.marginMm = v; })
    });
    FB.ui.bindNumber($('print-overlap'), {
      min: 5, max: 60, step: 1,
      get: () => S.get().print.overlapMm,
      set: (v) => S.update((p) => { p.print.overlapMm = v; })
    });
    pop.querySelectorAll('[data-print]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const k = cb.getAttribute('data-print');
        S.update((p) => { p.print[k] = cb.checked; });
      });
    });

    // the pattern label
    FB.ui.bindText($('label-piece'), {
      max: 60,
      get: () => S.get().label.piece,
      set: (v) => S.update((p) => { p.label.piece = v; })
    });
    FB.ui.bindText($('label-note'), {
      max: 120,
      get: () => S.get().label.note,
      set: (v) => S.update((p) => { p.label.note = v; })
    });
    $('label-side').addEventListener('change', (e) => {
      const v = e.target.value;
      S.update((p) => { p.label.side = v; });
    });
  }

  function resetDefaults() {
    const def = FB.state.defaultProject().print;
    FB.state.update((p) => { p.print = Object.assign({}, def); });
  }

  function update() {
    const p = FB.state.get();
    const d = FB.app.derived();
    if (!d) return;
    const lay = FB.app.layout();

    // the export button looks unavailable while something blocks it; a click then says why
    const canExport = d.ok && !!lay;
    const reason = d.ok ? (lay ? '' : (FB.app.layoutError() || '')) : d.blocker;
    const exp = $('btn-export');
    exp.classList.toggle('is-disabled', !canExport);
    exp.setAttribute('aria-disabled', canExport ? 'false' : 'true');
    exp.title = canExport ? FB.platform.keys('Export the pattern as PDF (⌘E)') : reason;

    if (!isOpen()) return;
    updatePaperSelect(p);
    FB.ui.setInput($('print-margin'), U.num(p.print.marginMm));
    FB.ui.setInput($('print-overlap'), U.num(p.print.overlapMm));
    pop.querySelectorAll('[data-print]').forEach((cb) => { cb.checked = !!p.print[cb.getAttribute('data-print')]; });

    const lb = p.label;
    FB.ui.setInput($('label-piece'), lb.piece);
    FB.ui.setInput($('label-note'), lb.note);
    if ($('label-side').value !== lb.side) $('label-side').value = lb.side;
    $('pp-label').classList.toggle('off', !p.print.showLabel);

    if (d.ok && lay) {
      FB.ui.setText($('print-pages'), lay.count + (lay.count === 1 ? ' page' : ' pages') + ' + overview' + (d.design ? ', cut list' : ''));
      FB.ui.setText($('print-layout'), lay.cols + ' × ' + lay.rows + ', ' + lay.paper.name + ' ' + lay.orientation + (lay.angle ? ', ' + lay.angle + '°' : ''));
    } else {
      FB.ui.setText($('print-pages'), d.ok ? (FB.app.layoutError() || 'Calculating…') : '—');
      FB.ui.setText($('print-layout'), '—');
    }
    FB.ui.setText($('export-reason'), reason);
    const def = FB.state.defaultProject().print;
    $('btn-print-defaults').disabled = Object.keys(def).every((k) => p.print[k] === def[k]);
  }

  FB.printSettings = { init, update, open, close, isOpen, resetDefaults };
})(window);
