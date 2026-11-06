/*
 * Framebag Pattern — project.js
 *
 * Project files (save / open), photo import and the autosave safety net.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};

  const FORMAT = 'framebag-pattern';
  const VERSION = 2; // 1: v0.1–v0.2, curves as handles; 2: v0.3, smooth points
  const DB_NAME = 'framebag-pattern';
  const STORE = 'autosave';
  const KEY = 'current';
  const LS_KEY = 'framebag-pattern.autosave';

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const isPt = (v) => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** A mark on the stitch line (spec v1.0), checked; null if it is not one. */
  function normalizeMark(m) {
    if (!m || !isPt(m.at)) return null;
    const at = m.at.slice(0, 2);
    if (m.kind === 'notch') return { kind: 'notch', at };
    if (m.kind === 'strap') return { kind: 'strap', at, width: isNum(m.width) && m.width > 0 ? clamp(m.width, 5, 200) : 25 };
    if (m.kind === 'bolts') {
      return {
        kind: 'bolts',
        at,
        count: isNum(m.count) ? clamp(Math.round(m.count), 1, 3) : 2,
        spacing: isNum(m.spacing) && m.spacing > 0 ? clamp(m.spacing, 10, 500) : 64
      };
    }
    return null;
  }
  /** A trimmed string of at most max characters, or '' (names, notes). */
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  // ---------------------------------------------------------- file format

  /** Check a parsed file and bring it into the current shape. Throws a readable error. */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.format !== FORMAT) {
      throw new Error('This file is not a Framebag Pattern project.');
    }
    if (raw.version !== 1 && raw.version !== VERSION) {
      throw new Error('This project was saved by a newer Framebag Pattern (file format ' + raw.version + '). Open it with that version.');
    }
    const p = FB.state.defaultProject();
    if (typeof raw.name === 'string') p.name = raw.name;
    if (typeof raw.created === 'string') p.created = raw.created;
    if (typeof raw.modified === 'string') p.modified = raw.modified;

    const im = raw.image;
    if (im && typeof im.dataUrl === 'string' && im.dataUrl.indexOf('data:image/') === 0 &&
        isNum(im.width) && isNum(im.height)) {
      p.image = { dataUrl: im.dataUrl, width: im.width, height: im.height, name: typeof im.name === 'string' ? im.name : '' };
    }

    const sc = raw.scale;
    if (sc && isPt(sc.p1) && isPt(sc.p2)) {
      p.scale = {
        p1: [sc.p1[0], sc.p1[1]],
        p2: [sc.p2[0], sc.p2[1]],
        lengthMm: isNum(sc.lengthMm) && sc.lengthMm > 0 ? sc.lengthMm : null
      };
    }

    const ol = raw.outline || {};
    const rawPts = Array.isArray(ol.points) ? ol.points : [];
    const keep = rawPts.map((q) => !!q && isNum(q.x) && isNum(q.y));
    // lists per segment stay with the point each segment starts at
    const perSegment = (v) => (Array.isArray(v) ? v : []).filter((_, i) => keep[i]);
    let pts = rawPts.filter((_, i) => keep[i]).map((q) => ({
      x: q.x,
      y: q.y,
      radius: isNum(q.radius) && q.radius > 0 ? q.radius : 0,
      smooth: q.smooth === true
    }));
    const closed = !!ol.closed && pts.length >= 3;
    const rawEo = perSegment(ol.edgeOffsets), rawEs = perSegment(ol.edgeStraight), rawEn = perSegment(ol.edgeNames);
    let eo = pts.map((_, i) => (isNum(rawEo[i]) ? rawEo[i] : null));
    let es = pts.map((_, i) => rawEs[i] === true);
    let en = pts.map((_, i) => str(rawEn[i], 40) || null);
    if (raw.version === 1) {
      // v0.2 bent an edge through a round handle. The handle becomes a smooth
      // point between the edge's two corners: the arc through all three is
      // exactly the old curve. Both halves keep the edge's offset.
      const ec = perSegment(ol.edgeCurves);
      const P = [], O = [], S = [], N = [];
      pts.forEach((q, i) => {
        P.push(q);
        O.push(eo[i]);
        S.push(false);
        N.push(en[i]);
        const h = isPt(ec[i]) ? ec[i] : null;
        const isEdge = closed || i < pts.length - 1;
        const nx = pts[(i + 1) % pts.length];
        if (!isEdge || !h || !nx) return;
        const chord = Math.hypot(nx.x - q.x, nx.y - q.y);
        const away = chord > 0 ? Math.abs((nx.x - q.x) * (h[1] - q.y) - (nx.y - q.y) * (h[0] - q.x)) / chord : 0;
        if (away < 0.02 || Math.hypot(h[0] - q.x, h[1] - q.y) < 0.5 || Math.hypot(h[0] - nx.x, h[1] - nx.y) < 0.5) return;
        P.push({ x: h[0], y: h[1], radius: 0, smooth: true });
        O.push(eo[i]);
        S.push(false);
        N.push(en[i]);
      });
      pts = P;
      eo = O;
      es = S;
      en = N;
    }
    p.outline.points = pts;
    p.outline.closed = closed;
    p.outline.uniformOffset = isNum(ol.uniformOffset) ? ol.uniformOffset : 0;
    p.outline.edgeOffsets = eo;
    p.outline.edgeStraight = es;
    p.outline.edgeNames = en;

    p.guides = (Array.isArray(raw.guides) ? raw.guides : [])
      .filter((g) => g && isPt(g.p1) && isPt(g.p2) && Math.hypot(g.p2[0] - g.p1[0], g.p2[1] - g.p1[1]) > 1e-6)
      .map((g) => ({ p1: [g.p1[0], g.p1[1]], p2: [g.p2[0], g.p2[1]] }));

    if (isNum(raw.seamAllowance) && raw.seamAllowance >= 0) p.seamAllowance = raw.seamAllowance;

    const pr = raw.print || {};
    // files from before v0.7 were printed on A4
    p.print.paper = typeof pr.paper === 'string' && FB.geom.PAPERS.some((q) => q.id === pr.paper) ? pr.paper : 'A4';
    if (isNum(pr.marginMm)) p.print.marginMm = clamp(pr.marginMm, 0, 40);
    if (isNum(pr.overlapMm)) p.print.overlapMm = clamp(pr.overlapMm, 5, 60);
    ['optimiseLayout', 'showTraced', 'showLengths', 'showLabel'].forEach((k) => {
      if (typeof pr[k] === 'boolean') p.print[k] = pr[k];
    });

    const lb = raw.label;
    if (lb && typeof lb === 'object') {
      // the first v0.7 build marked the front in the photo instead of the side
      let side = lb.side === 'drive' || lb.side === 'nondrive' ? lb.side : '';
      if (!side && lb.front === 'right') side = 'drive';
      if (!side && lb.front === 'left') side = 'nondrive';
      p.label = { piece: str(lb.piece, 60), side, note: str(lb.note, 120) };
    }

    // 02 Design (v1.0); older files get the defaults
    const ds = raw.design;
    if (ds && typeof ds === 'object') {
      const g = ds.gusset || {}, nt = ds.notches || {};
      if (isNum(g.width) && g.width > 0) p.design.gusset.width = clamp(g.width, 5, 500);
      // the first v1.0 build also had one gusset piece per edge: now always one strip
      p.design.gusset.join = Number.isInteger(g.join) && g.join >= 0 && g.join < pts.length ? g.join
        : (isPt(g.join) ? g.join.slice(0, 2) : null);
      p.design.notches.corners = nt.corners !== false;
      p.design.notches.spacing = isNum(nt.spacing) && nt.spacing > 0 ? clamp(nt.spacing, 10, 2000) : null;
      if (isNum(ds.strapWidth) && ds.strapWidth > 0) p.design.strapWidth = clamp(ds.strapWidth, 5, 200);
      p.design.marks = (Array.isArray(ds.marks) ? ds.marks : []).slice(0, 200).map(normalizeMark).filter(Boolean);
      const sp = ds.split;
      p.design.split = sp && isPt(sp.p1) && isPt(sp.p2) && Math.hypot(sp.p2[0] - sp.p1[0], sp.p2[1] - sp.p1[1]) > 1e-6
        ? { p1: sp.p1.slice(0, 2), p2: sp.p2.slice(0, 2), keep: sp.keep === 'left' || sp.keep === 'right' ? sp.keep : 'both' }
        : null;
    }

    const vw = raw.view || {};
    if (isNum(vw.photoOpacity)) p.view.photoOpacity = clamp(vw.photoOpacity, 0, 1);
    return p;
  }

  function serialize(p) {
    return JSON.stringify({
      format: FORMAT,
      version: VERSION,
      name: p.name,
      created: p.created,
      modified: p.modified,
      image: p.image ? { dataUrl: p.image.dataUrl, width: p.image.width, height: p.image.height, name: p.image.name || '' } : null,
      scale: p.scale,
      outline: p.outline,
      guides: p.guides || [],
      seamAllowance: p.seamAllowance,
      print: p.print,
      label: p.label,
      design: p.design,
      view: p.view
    }, null, 2);
  }

  function safeFileName(name, fallback) {
    const s = String(name || '').replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim();
    return s || fallback || 'framebag-pattern';
  }

  // ------------------------------------------------------------- browser I/O

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 30000);
  }

  function readAs(file, how) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('The file could not be read.'));
      if (how === 'text') fr.readAsText(file);
      else fr.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This browser can’t read this image. Export it as JPEG or PNG and try again.'));
      img.src = src;
    });
  }

  function saveProject(p) {
    const name = safeFileName(p.name, 'framebag-pattern');
    download(new Blob([serialize(p)], { type: 'application/json' }), name + '.framebag.json');
  }

  async function openProjectFile(file) {
    const text = await readAs(file, 'text');
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error('This file is not a Framebag Pattern project.');
    }
    const p = normalize(raw);
    if (p.image) await loadImage(p.image.dataUrl); // fail early on a broken photo
    return p;
  }

  /**
   * Import a photo. It is drawn once to a canvas, which applies the EXIF
   * orientation, and stored as a JPEG at its original resolution (spec §3.2).
   */
  async function readPhoto(file) {
    const looksLikeImage = /^image\//.test(file.type) || /\.(jpe?g|png|gif|webp|bmp|tiff?|avif|hei[cf])$/i.test(file.name);
    if (!looksLikeImage) throw new Error('“' + file.name + '” is not an image.');
    const src = await readAs(file, 'dataurl');
    let img;
    try {
      img = await loadImage(src);
    } catch (e) {
      // iPhones save HEIC by default; only Safari can show it
      if (/\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type)) {
        throw new Error('This is an HEIC photo, the iPhone’s usual format, which this browser can’t read. ' +
          'Export it as JPEG (in Photos: File → Export) or set the iPhone to Settings → Camera → Formats → Most Compatible, then load it again.');
      }
      throw e;
    }
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error('This image has no size.');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    } catch (e) {
      throw new Error('This image is too large for the browser to process.');
    }
    if (!dataUrl || dataUrl.length < 32) throw new Error('This image is too large for the browser to process.');
    return { dataUrl, width: w, height: h, name: file.name };
  }

  // ---------------------------------------------------------------- autosave

  // IndexedDB can stall on file:// pages in some configurations: give up
  // after a few seconds and fall back to localStorage.
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('IndexedDB did not respond.')), ms);
      promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  function openDb() {
    return withTimeout(new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error('IndexedDB is not available.'));
        return;
      }
      let req;
      try {
        req = root.indexedDB.open(DB_NAME, 1);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB could not be opened.'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked.'));
    }), 3000);
  }

  function idb(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('aborted')); };
    }));
  }

  /** Save the current project for crash recovery. Returns where it went. */
  async function autosave(p) {
    const record = { savedAt: new Date().toISOString(), json: serialize(p) };
    try {
      await idb('readwrite', (s) => s.put(record, KEY));
      return 'indexeddb';
    } catch (e) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(record));
        return 'localstorage';
      } catch (e2) {
        try {
          const lite = Object.assign({}, p, { image: null });
          localStorage.setItem(LS_KEY, JSON.stringify({ savedAt: record.savedAt, json: serialize(lite), photoMissing: true }));
          return 'localstorage-without-photo';
        } catch (e3) {
          return 'none';
        }
      }
    }
  }

  async function loadAutosave() {
    let rec = null;
    try {
      rec = await idb('readonly', (s) => s.get(KEY));
    } catch (e) {
      rec = null;
    }
    if (!rec) {
      try {
        const s = localStorage.getItem(LS_KEY);
        if (s) rec = JSON.parse(s);
      } catch (e) {
        rec = null;
      }
    }
    if (!rec || typeof rec.json !== 'string') return null;
    try {
      return { project: normalize(JSON.parse(rec.json)), savedAt: rec.savedAt, photoMissing: !!rec.photoMissing };
    } catch (e) {
      return null;
    }
  }

  async function clearAutosave() {
    try { await idb('readwrite', (s) => s.delete(KEY)); } catch (e) { /* nothing to clear */ }
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* nothing to clear */ }
  }

  /**
   * Ask the browser to keep this page's storage, so the autosave is not
   * cleared when the disk runs low. Chrome and Edge decide by themselves;
   * Firefox asks the person. Resolves to 'kept', 'refused' or 'unsupported';
   * never rejects.
   */
  async function persistStorage() {
    const sm = root.navigator && root.navigator.storage;
    if (!sm || typeof sm.persist !== 'function') return 'unsupported';
    try {
      if (typeof sm.persisted === 'function' && await sm.persisted()) return 'kept';
      return (await sm.persist()) ? 'kept' : 'refused';
    } catch (e) {
      return 'unsupported';
    }
  }

  FB.project = {
    normalize,
    serialize,
    safeFileName,
    download,
    loadImage,
    saveProject,
    openProjectFile,
    readPhoto,
    autosave,
    loadAutosave,
    clearAutosave,
    persistStorage
  };
})(typeof window !== 'undefined' ? window : globalThis);
