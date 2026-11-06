/*
 * Framebag Pattern — state.js
 *
 * The project (exactly what is saved to file) and its undo/redo history.
 * Everything that changes the project goes through FB.state.update().
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};

  // Tiny event bus for UI notifications that are not project changes
  // ('selection', 'tool', 'display', 'layout').
  const handlers = {};
  FB.bus = {
    on: (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); },
    emit: (name, data) => { (handlers[name] || []).forEach((fn) => fn(data)); }
  };

  const MAX_HISTORY = 200;
  const MERGE_MS = 1000;

  /**
   * The side of the bike the photo shows, printed on the pattern label with
   * an arrow to the front: to the right for the drive side, to the left for
   * the non-drive side (spec v0.7 E).
   */
  const SIDES = { drive: 'Drive side', nondrive: 'Non-drive side' };

  /**
   * A new, empty project. The seam allowance, margin, overlap and paper start
   * at round values in the unit chosen in the status bar (units.js).
   */
  function defaultProject() {
    const now = new Date().toISOString();
    const u = FB.units ? FB.units.defaults() : { seamAllowance: 10, marginMm: 10, overlapMm: 15, paper: 'A4', gussetWidth: 60, strapWidth: 25 };
    return {
      format: 'framebag-pattern',
      version: 2,
      name: '',
      created: now,
      modified: now,
      image: null,          // { dataUrl, width, height, name }
      scale: null,          // { p1: [x, y], p2: [x, y], lengthMm } in image px
      outline: {
        closed: false,
        points: [],         // { x, y, radius, smooth } in image px, radius in mm
        uniformOffset: 0,   // mm, − smaller / + larger
        edgeOffsets: [],    // per segment i (point i → i+1): mm, or null = uniform;
                            // an edge (corner to corner) uses the first one set on its segments
        edgeStraight: [],   // per segment i: true keeps it straight next to a smooth point
        edgeNames: []       // per segment i: the edge's name ("Top tube"), or null; like the
                            // offsets, an edge uses the first one set on its segments
      },
      guides: [],           // { p1: [x, y], p2: [x, y] } in image px: infinite construction lines
      seamAllowance: u.seamAllowance,
      print: {
        paper: u.paper,     // id in FB.geom.PAPERS
        marginMm: u.marginMm,
        overlapMm: u.overlapMm,
        optimiseLayout: true,
        showTraced: true,
        showLengths: true,
        showLabel: true
      },
      // printed on the piece: its name, the side ('', 'drive', 'nondrive'), a note
      label: { piece: 'Side panel', side: '', note: '' },
      // 02 Design (spec v1.0): the gusset, notches, marks on the stitch line, a split line
      design: {
        gusset: {
          width: u.gussetWidth, // mm, finished: between the two stitch lines
          join: null            // where the strip's ends meet: a corner's point index, a spot on the
                                // stitch line ([x, y] in image px), or null for the first corner
        },
        notches: {
          corners: true,        // a notch at every corner
          spacing: null         // mm: more notches between the corners, about this far apart; null: none
        },
        // placed on the stitch line, held by the photo ([x, y] in image px):
        //   { kind: 'notch', at }  { kind: 'strap', at, width }  { kind: 'bolts', at, count, spacing }
        marks: [],
        strapWidth: u.strapWidth, // mm, for the next strap placed
        // a line across the panel through p1 and p2 (image px): keep 'both' pieces, or
        // the piece on the 'left' or 'right' of it, seen from p1 towards p2 (a clip)
        split: null
      },
      view: { photoOpacity: 0.8 }
    };
  }

  let project = defaultProject();
  let undoStack = [];
  let redoStack = [];
  let lastMerge = null;
  let lastMergeTime = 0;
  let dirty = false;
  const listeners = [];

  // The photo is large and never edited in place, so snapshots share it.
  function snapshot(p) {
    const img = p.image;
    const copy = JSON.parse(JSON.stringify(Object.assign({}, p, { image: null })));
    copy.image = img;
    return copy;
  }

  function emit(reason) {
    for (const fn of listeners) fn(reason);
  }

  /** Push the current project onto the undo stack (merged within 1 s for equal keys). */
  function checkpoint(mergeKey) {
    const now = Date.now();
    if (mergeKey && mergeKey === lastMerge && now - lastMergeTime < MERGE_MS) {
      lastMergeTime = now;
      return;
    }
    undoStack.push(snapshot(project));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    lastMerge = mergeKey || null;
    lastMergeTime = now;
  }

  /**
   * Change the project in place.
   * opts.history === false: no undo step (drag moves after the first, view-only fields).
   * opts.merge: key for merging quick repeats (nudges, typing) into one undo step.
   */
  function update(mutator, opts) {
    opts = opts || {};
    if (opts.history !== false) checkpoint(opts.merge);
    mutator(project);
    project.modified = new Date().toISOString();
    dirty = true;
    emit(opts.reason || 'update');
  }

  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snapshot(project));
    project = undoStack.pop();
    lastMerge = null;
    dirty = true;
    emit('undo');
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snapshot(project));
    project = redoStack.pop();
    lastMerge = null;
    dirty = true;
    emit('redo');
    return true;
  }

  /** Drop the last checkpoint and go back to it, without a redo step (cancelled drag). */
  function revert() {
    if (!undoStack.length) return;
    project = undoStack.pop();
    lastMerge = null;
    emit('revert');
  }

  /** Replace the whole project (new, open, restore). Clears the history. */
  function replace(p, clean) {
    project = p;
    undoStack = [];
    redoStack = [];
    lastMerge = null;
    dirty = !clean;
    emit('load');
  }

  function isEmpty(p) {
    p = p || project;
    return !p.image && p.outline.points.length === 0;
  }

  FB.state = {
    SIDES,
    defaultProject,
    get: () => project,
    update,
    checkpoint,
    undo,
    redo,
    revert,
    replace,
    isEmpty,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    isDirty: () => dirty,
    markSaved: () => { dirty = false; emit('saved'); },
    subscribe: (fn) => { listeners.push(fn); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
