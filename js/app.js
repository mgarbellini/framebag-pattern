/*
 * Framebag Pattern — app.js
 *
 * Wiring: top bar (the steps 01 Trace and 02 Design), keyboard shortcuts,
 * files, autosave, and keeping the derived geometry, the canvas and the
 * panel in step with the project.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const $ = (id) => document.getElementById(id);
  const K = FB.platform.keys;   // "⌘Z" as this computer names it (spec v0.7 A)

  let derived = null;
  let layout = null;
  let layoutError = '';
  let layoutTimer = 0;
  let uiQueued = false;
  let autosaveTimer = 0;
  let autosavePaused = true;
  let pendingRestore = null;
  let toastTimer = 0;

  // ------------------------------------------------------------ derived data

  function recompute() {
    derived = FB.geom.computeDerived(FB.state.get());
    FB.editor.setDerived(derived);
    scheduleLayout();
    scheduleUi();
  }

  function scheduleUi() {
    if (uiQueued) return;
    uiQueued = true;
    requestAnimationFrame(() => {
      uiQueued = false;
      FB.inspector.update();
      FB.statusbar.update();
      FB.printSettings.update();
      updateChrome();
    });
  }

  // Planning takes a few tens of milliseconds, so while editing the page
  // count is refreshed shortly after the last change. When there is no plan
  // yet it is made at once. The export always plans the layout afresh.
  function scheduleLayout() {
    clearTimeout(layoutTimer);
    if (!derived || !derived.ok) {
      layout = null;
      layoutError = '';
      return;
    }
    const run = () => {
      layout = FB.pdf.plan(FB.state.get(), derived);
      layoutError = layout ? '' : 'Margin and overlap leave no room on the page.';
      scheduleUi();
    };
    if (!layout && !layoutError && !FB.editor.isDragging()) {
      run();
      return;
    }
    layoutTimer = setTimeout(function tick() {
      if (FB.editor.isDragging()) { layoutTimer = setTimeout(tick, 200); return; }
      run();
    }, 150);
  }

  function updateChrome() {
    const p = FB.state.get();
    document.querySelector('[data-action="undo"]').disabled = !FB.state.canUndo();
    document.querySelector('[data-action="redo"]').disabled = !FB.state.canRedo();
    const nameInput = $('project-name');
    if (document.activeElement !== nameInput && nameInput.value !== p.name) nameInput.value = p.name;
    const title = (p.name || 'Untitled project') + ' — Framebag Pattern';
    const t = (FB.state.isDirty() && !FB.state.isEmpty() ? '• ' : '') + title;
    if (document.title !== t) document.title = t;
    document.querySelectorAll('[data-tool]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tool') === FB.editor.getTool());
    });
    // 01 Trace | 02 Design
    const mode = FB.editor.getMode();
    document.querySelectorAll('.mode[data-mode]').forEach((b) => {
      const on = b.getAttribute('data-mode') === mode ? 'true' : 'false';
      if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
    });
    const photoLabel = $('btn-photo-label');
    const label = p.image ? 'Replace photo…' : 'Load photo…';
    if (photoLabel.textContent !== label) photoLabel.textContent = label;
    $('btn-clear-outline').disabled = !p.outline.points.length;
    $('btn-level').disabled = !p.image;
    $('btn-clear-guides').disabled = !(p.guides || []).length;
    // Millimetres or Inches, ticked in the logo menu
    const sys = FB.units.system();
    document.querySelectorAll('#file-menu [data-units]').forEach((b) => {
      const on = b.getAttribute('data-units') === sys ? 'true' : 'false';
      if (b.getAttribute('aria-checked') !== on) b.setAttribute('aria-checked', on);
    });
  }

  // -------------------------------------------------------------- File menu

  function fileMenuOpen() { return !$('file-menu').hidden; }

  function setFileMenu(open) {
    const menu = $('file-menu'), btn = $('btn-file');
    if (open) {
      const r = btn.getBoundingClientRect();
      menu.style.left = Math.round(Math.max(8, r.left)) + 'px';
      menu.style.top = Math.round(r.bottom + 6) + 'px';
    }
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('open', open);
  }

  // ------------------------------------------------------------- full screen
  //
  // The page's own full screen (like a video site): no tabs, no toolbars.
  // While it is on, the browser keeps Esc for leaving it.

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      return;
    }
    const de = document.documentElement;
    const fail = () => toast('The browser did not allow full screen. Try again with F or the button.', 'error');
    if (!de.requestFullscreen) { fail(); return; }
    de.requestFullscreen().then(() => {
      FB.editor.flashHint('Full screen. Press F or Esc to leave.');
    }, fail);
  }

  function updateFullscreenButton() {
    const on = !!document.fullscreenElement;
    $('btn-fullscreen-label').textContent = on ? 'Exit full screen' : 'Full screen';
  }

  // ------------------------------------------------------- level the photo

  /**
   * Turn the photo so the line p1–p2 (the wheel axles, image px) is level.
   * The photo is redrawn rotated about its centre on a canvas just big enough
   * (white outside); outline points, scale line and guides turn with it, so
   * lengths, angles and the scale stay the same. One undo step.
   */
  async function levelPhoto(p1, p2) {
    const img = FB.state.get().image;
    if (!img) return;
    let th = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    if (th > Math.PI / 2) th -= Math.PI;
    else if (th <= -Math.PI / 2) th += Math.PI;
    const deg = th * 180 / Math.PI;
    if (Math.abs(deg) < 0.05) { toast('The axles are already level.'); return; }
    try {
      const im = await FB.project.loadImage(img.dataUrl);
      const a = -th, c = Math.cos(a), s = Math.sin(a);
      const W = img.width, H = img.height;
      const W2 = Math.ceil(Math.abs(W * c) + Math.abs(H * s)), H2 = Math.ceil(Math.abs(W * s) + Math.abs(H * c));
      const cv = document.createElement('canvas');
      cv.width = W2;
      cv.height = H2;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W2, H2);
      ctx.translate(W2 / 2, H2 / 2);
      ctx.rotate(a);
      ctx.drawImage(im, -W / 2, -H / 2);
      const dataUrl = cv.toDataURL('image/jpeg', 0.92);
      if (!dataUrl || dataUrl.length < 32) throw new Error('too large');
      const turn = (q) => {
        const x = q[0] - W / 2, y = q[1] - H / 2;
        return [x * c - y * s + W2 / 2, x * s + y * c + H2 / 2];
      };
      FB.state.update((pp) => {
        pp.image = { dataUrl, width: W2, height: H2, name: img.name || '' };
        pp.outline.points.forEach((q) => { const m = turn([q.x, q.y]); q.x = m[0]; q.y = m[1]; });
        if (pp.scale) { pp.scale.p1 = turn(pp.scale.p1); pp.scale.p2 = turn(pp.scale.p2); }
        pp.guides = (pp.guides || []).map((g) => ({ p1: turn(g.p1), p2: turn(g.p2) }));
        // 02 Design: marks, the split line and a join between corners stay on the frame
        const ds = pp.design;
        if (ds) {
          (ds.marks || []).forEach((m) => { m.at = turn(m.at); });
          if (ds.split) { ds.split.p1 = turn(ds.split.p1); ds.split.p2 = turn(ds.split.p2); }
          if (Array.isArray(ds.gusset.join)) ds.gusset.join = turn(ds.gusset.join);
        }
      });
      FB.editor.fit();
      toast(K('Photo levelled: turned ' + FB.fmt(Math.abs(deg)) + '°. ⌘Z undoes it.'));
    } catch (e) {
      toast('The photo could not be turned; it may be too large for the browser.', 'error');
    }
  }

  /** Close the File menu; true if it was open. */
  function closeFileMenu() {
    if (!fileMenuOpen()) return false;
    setFileMenu(false);
    return true;
  }

  // ------------------------------------------------------------------ toast

  function toast(msg, kind) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (kind === 'error' ? ' error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 7000 : 4000);
  }

  // ---------------------------------------------------------------- autosave

  function scheduleAutosave() {
    if (autosavePaused) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      const p = FB.state.get();
      if (FB.state.isEmpty(p)) FB.project.clearAutosave();
      else FB.project.autosave(p).then((where) => { if (where !== 'none') wantPersist(); });
    }, 1000);
  }

  // Browsers may clear a page's storage when the disk runs low. Once the
  // autosave holds some work, the next click or key press asks the browser
  // to keep it: inside a gesture, as browsers expect, and not on load.
  // Chrome and Edge decide by themselves; Firefox asks the person. After a
  // refusal it is not asked again for 30 days.
  const PERSIST_KEY = 'framebag-pattern.persist-refused';
  const PERSIST_WAIT = 30 * 24 * 3600 * 1000;
  let persistState = 'idle';   // idle → wanted → asked, once a visit

  function wantPersist() {
    if (persistState !== 'idle') return;
    let refused = 0;
    try { refused = +root.localStorage.getItem(PERSIST_KEY) || 0; } catch (e) { /* ask */ }
    persistState = refused && Date.now() - refused < PERSIST_WAIT ? 'asked' : 'wanted';
  }

  function askPersist() {
    if (persistState !== 'wanted') return;
    persistState = 'asked';
    FB.project.persistStorage().then((r) => {
      try {
        if (r === 'refused') root.localStorage.setItem(PERSIST_KEY, String(Date.now()));
        else if (r === 'kept') root.localStorage.removeItem(PERSIST_KEY);
      } catch (e) { /* this visit only */ }
    });
  }

  function showRestore(rec) {
    let when = '';
    try {
      when = new Date(rec.savedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { when = ''; }
    const name = rec.project.name ? '“' + rec.project.name + '”' : 'Your last session';
    $('restore-text').textContent = name + (when ? ' (' + when + ')' : '') + ' can be restored' +
      (rec.photoMissing ? ', without its photo.' : '.');
    $('restore').hidden = false;
  }

  function restore() {
    if (!pendingRestore) return;
    if (!FB.state.isEmpty() && FB.state.isDirty() &&
        !root.confirm('Replace the current work with the restored session?')) return;
    FB.state.replace(pendingRestore.project, false);
    pendingRestore = null;
    $('restore').hidden = true;
    autosavePaused = false;
    afterLoad();
    toast('Session restored. Save it as a file to keep it.');
  }

  function discardRestore() {
    pendingRestore = null;
    $('restore').hidden = true;
    FB.project.clearAutosave().then(() => {
      autosavePaused = false;
      scheduleAutosave();
    });
  }

  // ------------------------------------------------------------------- files

  function confirmDiscard(question) {
    if (FB.state.isEmpty() || !FB.state.isDirty()) return true;
    return root.confirm(question || 'Discard the unsaved changes to this project?');
  }

  function afterLoad() {
    FB.editor.fit();
    const p = FB.state.get();
    FB.editor.setTool(p.image && !(p.scale && p.scale.lengthMm) ? 'scale' : 'trace');
  }

  async function loadPhotoFile(file) {
    try {
      const img = await FB.project.readPhoto(file);
      const p = FB.state.get();
      if ((p.outline.points.length || p.scale) && p.image &&
          !root.confirm('Replace the photo? The outline and the scale line stay at the same image positions.')) return;
      const hadImage = !!p.image;
      FB.state.update((pp) => {
        pp.image = img;
        if (!pp.name) pp.name = img.name.replace(/\.[^.]+$/, '');
      });
      FB.editor.fit();
      if (!hadImage || !(FB.state.get().scale && FB.state.get().scale.lengthMm)) {
        FB.editor.setTool('scale');
        FB.editor.flashHint('Drag along the reference marking, then enter its real length.');
      }
    } catch (e) {
      toast(e.message || 'The photo could not be loaded.', 'error');
    }
  }

  async function openProjectFile(file) {
    try {
      const p = await FB.project.openProjectFile(file);
      if (!confirmDiscard('Open “' + file.name + '” and discard the unsaved changes to this project?')) return;
      FB.state.replace(p, true);
      if (pendingRestore) { pendingRestore = null; $('restore').hidden = true; autosavePaused = false; }
      afterLoad();
      toast('Opened “' + file.name + '”.');
    } catch (e) {
      toast(e.message || 'The project could not be opened.', 'error');
    }
  }

  function openDroppedFile(file) {
    if (/\.json$/i.test(file.name) || file.type === 'application/json') openProjectFile(file);
    else loadPhotoFile(file);
  }

  // ----------------------------------------------------------------- actions

  function action(name) {
    const S = FB.state;
    switch (name) {
      case 'new':
        if (!confirmDiscard('Start a new project and discard the unsaved changes?')) return;
        S.replace(S.defaultProject(), true);
        FB.editor.setTool('trace');
        break;
      case 'open':
        $('file-project').value = '';
        $('file-project').click();
        break;
      case 'save': {
        const p = S.get();
        if (S.isEmpty(p)) { toast('Nothing to save yet.'); return; }
        FB.project.saveProject(p);
        S.markSaved();
        toast('Saved “' + FB.project.safeFileName(p.name) + '.framebag.json”.');
        break;
      }
      case 'load-photo':
        $('file-photo').value = '';
        $('file-photo').click();
        break;
      case 'undo':
        if (!FB.editor.isDragging()) S.undo();
        break;
      case 'redo':
        if (!FB.editor.isDragging()) S.redo();
        break;
      case 'export':
        exportPdf();
        break;
      case 'delete-point':
        FB.editor.deleteSelected();
        break;
      case 'toggle-smooth': {
        const i = FB.editor.getSelection().point;
        if (i != null && derived) FB.editor.setSmooth(i, !derived.smooth[i]);
        break;
      }
      case 'toggle-curve': {
        const i = FB.editor.getSelection().edge;
        if (i == null || !derived) return;
        if (derived.curved[i]) FB.editor.makeStraight(i); else FB.editor.makeCurved(i);
        break;
      }
      case 'reset-scale':
        FB.editor.resetScale();
        break;
      case 'level-photo':
        if (S.get().image) FB.editor.startLevel();
        break;
      case 'fullscreen':
        toggleFullscreen();
        break;
      case 'clear-guides':
        if (!(S.get().guides || []).length) return;
        S.update((p) => { p.guides = []; });
        toast(K('Guides cleared. ⌘Z brings them back.'));
        break;
      case 'clear-outline':
        if (!S.get().outline.points.length) return;
        S.update((p) => {
          p.outline.points = [];
          p.outline.closed = false;
          p.outline.edgeOffsets = [];
          p.outline.edgeStraight = [];
          p.outline.edgeNames = [];
          if (p.design) {
            p.design.gusset.join = null;
            p.design.marks = [];
            p.design.split = null;
          }
        });
        FB.editor.selectPoint(null);
        FB.editor.setTool('trace');
        toast(K('Outline cleared. ⌘Z brings it back.'));
        break;
      case 'print-defaults':
        FB.printSettings.resetDefaults();
        break;
      case 'radius-all': {
        const i = FB.editor.getSelection().point;
        const q = i == null ? null : S.get().outline.points[i];
        if (!q) return;
        const r = q.radius || 0;
        S.update((p) => { p.outline.points.forEach((pt) => { pt.radius = r; }); });
        toast('All corners set to ' + FB.units.len(r) + '.');
        break;
      }
      case 'restore':
        restore();
        break;
      case 'discard':
        discardRestore();
        break;
      default:
        break;
    }
  }

  function exportPdf() {
    if (!derived || !derived.ok) {
      toast(derived ? derived.blocker : 'Nothing to export yet.', 'error');
      return;
    }
    const p = FB.state.get();
    const lay = FB.pdf.plan(p, derived);
    if (!lay) {
      toast('Margin and overlap leave no room on the page.', 'error');
      return;
    }
    try {
      const name = FB.pdf.exportPdf(p, derived, lay);
      toast('Exported “' + name + '”: ' + lay.count + (lay.count === 1 ? ' page' : ' pages') + ' plus the overview' + (derived.design ? ' and the cut list.' : '.'));
    } catch (e) {
      toast('The PDF could not be created: ' + (e.message || e), 'error');
    }
  }

  // ----------------------------------------------------------------- keyboard

  function isTyping(t) {
    if (!t) return false;
    if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
    if (t.tagName !== 'INPUT') return false;
    return ['checkbox', 'radio', 'range', 'button', 'submit', 'file'].indexOf(t.type) < 0;
  }

  function onKeyDown(e) {
    const t = e.target;
    const typing = isTyping(t);
    const mod = e.metaKey || e.ctrlKey;
    const free = !document.activeElement || document.activeElement === document.body;
    const E = FB.editor;

    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); action('save'); return; }
      if (k === 'o') { e.preventDefault(); action('open'); return; }
      if (k === 'e') { e.preventDefault(); action('export'); return; }
      if ((k === 'z' || k === 'y') && !typing) {
        e.preventDefault();
        action(k === 'y' || e.shiftKey ? 'redo' : 'undo');
      }
      return; // other shortcuts, including page zoom, stay with the browser
    }
    if (typing || e.altKey) return;

    switch (e.key) {
      case 'v': case 'V': E.setTool('select'); break;
      case 't': case 'T': case 'p': case 'P': E.setTool('trace'); break;
      case 's': case 'S': E.toggleScale(); break;
      case 'g': case 'G': E.setTool('guide'); break;
      case 'm': case 'M': E.setTool('measure'); break;
      case 'd': case 'D': E.setMode('design'); break;
      case 'k': case 'K': E.setTool('split'); break;
      case 'l': case 'L': E.toggleLoupe(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case ' ':
        if (!free && t.tagName === 'BUTTON') return;
        e.preventDefault();
        if (!e.repeat) E.setSpace(true);
        break;
      case 'Escape':
        if (FB.printSettings.close() || closeFileMenu() || E.cancel()) e.preventDefault();
        break;
      default:
        if (!free) return;
        handleFreeKey(e);
    }
  }

  function handleFreeKey(e) {
    const E = FB.editor;
    const step = e.shiftKey ? 10 : 1;
    let handled = true;
    switch (e.key) {
      case 'Enter': handled = E.closeOutline(); break;
      case 'Delete': case 'Backspace': handled = E.deleteSelected(); break;
      case 'ArrowLeft': handled = E.nudge(-step, 0); break;
      case 'ArrowRight': handled = E.nudge(step, 0); break;
      case 'ArrowUp': handled = E.nudge(0, -step); break;
      case 'ArrowDown': handled = E.nudge(0, step); break;
      case 'Tab': handled = E.cycle(e.shiftKey ? -1 : 1); break;
      case '0': E.fit(); break;
      case '1': E.actualSize(); break;
      case '+': case '=': E.zoomBy(1.25); break;
      case '-': case '_': E.zoomBy(0.8); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  }

  function onKeyUp(e) {
    if (e.key === ' ') FB.editor.setSpace(false);
  }

  // ------------------------------------------------------------------- start

  function bindChrome() {
    // a missing logo (README: replacing the logo): the File button reads "File"
    const logo = $('logo');
    const noLogo = () => { logo.hidden = true; $('logo-text').hidden = false; };
    if (logo.complete && !logo.naturalWidth) noLogo();
    else logo.addEventListener('error', noLogo);

    // on a phone or in a small window a notice covers the page (style.css);
    // "Continue anyway" lifts it for the rest of the browser session
    const SMALL_KEY = 'framebag-pattern.small-ok';
    const smallOk = () => document.documentElement.classList.add('small-ok');
    try { if (root.sessionStorage.getItem(SMALL_KEY)) smallOk(); } catch (e) { /* show it */ }
    $('small-screen-ok').addEventListener('click', () => {
      smallOk();
      try { root.sessionStorage.setItem(SMALL_KEY, '1'); } catch (e) { /* this page only */ }
    });

    document.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.currentTarget.blur();
        action(b.getAttribute('data-action'));
      });
    });
    document.querySelectorAll('[data-tool]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.currentTarget.blur();
        const t = b.getAttribute('data-tool');
        if (t === 'scale') FB.editor.toggleScale(); else FB.editor.setTool(t);
      });
    });
    document.querySelectorAll('.mode[data-mode]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.currentTarget.blur();
        FB.editor.setMode(b.getAttribute('data-mode'));
      });
    });

    // File menu: the button toggles it; a press elsewhere, Esc or an item closes it
    $('btn-file').addEventListener('click', (e) => {
      e.currentTarget.blur();
      setFileMenu(!fileMenuOpen());
    });
    $('file-menu').addEventListener('click', (e) => {
      if (e.target.closest('.ctx-item')) setFileMenu(false);
    });
    // millimetres or inches: only how lengths are shown and typed, never the project
    document.querySelectorAll('#file-menu [data-units]').forEach((b) => {
      b.addEventListener('click', () => FB.units.set(b.getAttribute('data-units')));
    });
    document.addEventListener('pointerdown', (e) => {
      if (fileMenuOpen() && !$('file-menu').contains(e.target) && !$('btn-file').contains(e.target)) setFileMenu(false);
    }, true);
    root.addEventListener('blur', closeFileMenu);
    root.addEventListener('resize', closeFileMenu);
    document.addEventListener('fullscreenchange', updateFullscreenButton);

    const nameInput = $('project-name');
    nameInput.addEventListener('input', () => {
      const v = nameInput.value;
      FB.state.update((p) => { p.name = v; }, { merge: 'name' });
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); nameInput.blur(); }
    });

    $('file-photo').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) loadPhotoFile(f);
    });
    $('file-project').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) openProjectFile(f);
    });

    // the browser would otherwise open a file dropped outside the canvas
    root.addEventListener('dragover', (e) => e.preventDefault());
    root.addEventListener('drop', (e) => e.preventDefault());

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    // the request to keep the autosave rides on a gesture (see wantPersist)
    root.addEventListener('pointerup', askPersist, true);
    root.addEventListener('keyup', askPersist, true);
    root.addEventListener('blur', () => FB.editor.setSpace(false));
    root.addEventListener('beforeunload', (e) => {
      if (FB.state.isDirty() && !FB.state.isEmpty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    FB.bus.on('selection', scheduleUi);
    FB.bus.on('tool', scheduleUi);
    FB.bus.on('mode', scheduleUi);
    // mm or inches: messages and labels are written in the unit, so derive again
    FB.bus.on('units', () => {
      recompute();
      FB.editor.render();
    });
  }

  async function start() {
    FB.platform.localize(document);   // Ctrl and Alt in tooltips and key hints on Windows and Linux
    FB.editor.init();
    FB.inspector.init();
    FB.statusbar.init();
    FB.printSettings.init();
    bindChrome();
    FB.state.subscribe((reason) => {
      recompute();
      if (reason !== 'saved') scheduleAutosave();
    });
    recompute();

    const rec = await FB.project.loadAutosave();
    if (rec && !FB.state.isEmpty(rec.project)) {
      pendingRestore = rec;
      showRestore(rec);
    } else {
      autosavePaused = false;
    }
  }

  FB.app = {
    derived: () => derived,
    layout: () => layout,
    layoutError: () => layoutError,
    toast,
    levelPhoto,
    openDroppedFile,
    action
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
