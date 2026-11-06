/*
 * Framebag Pattern — statusbar.js
 *
 * The bar along the bottom of the window, in the manner of a CAD status bar:
 *   command line  the current tool, what to do next, and scale warnings
 *   status bar    photo on/off and opacity, the scale's reference length,
 *                 and the display toggles for everything drawn on the canvas.
 * The hint is written by the editor on every frame. The unit after every
 * length field (mm or in, chosen in the logo menu) is kept up to date here.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const U = FB.units;
  const $ = (id) => document.getElementById(id);

  function init() {
    const S = FB.state;

    $('img-opacity').addEventListener('input', (e) => {
      const v = Math.min(1, Math.max(0, parseInt(e.target.value, 10) / 100));
      S.update((p) => { p.view.photoOpacity = v; }, { history: false, reason: 'view' });
    });
    $('img-opacity').addEventListener('change', (e) => e.target.blur());

    FB.ui.bindNumber($('scale-length'), {
      min: 0.1, max: 100000,
      get: () => (S.get().scale ? S.get().scale.lengthMm : null),
      set: (v) => S.update((p) => { if (p.scale) p.scale.lengthMm = v; })
    });

    document.querySelectorAll('.tg[data-display]').forEach((b) => {
      b.addEventListener('click', () => {
        FB.editor.setDisplay(b.getAttribute('data-display'), b.getAttribute('aria-pressed') !== 'true');
        b.blur();
      });
    });

    FB.bus.on('display', update);
  }

  function update() {
    const p = FB.state.get();
    const d = FB.app.derived();
    if (!d) return;
    const hasImg = !!p.image;

    // display toggles; the angles and the guides are only drawn in 01 Trace
    const disp = FB.editor.getDisplay();
    const design = FB.editor.getMode() === 'design';
    document.querySelectorAll('.tg[data-display]').forEach((b) => {
      const k = b.getAttribute('data-display');
      const on = disp[k] ? 'true' : 'false';
      if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
      if (k === 'angles' || k === 'guides') {
        if (!b.hasAttribute('data-title')) b.setAttribute('data-title', b.title);
        b.disabled = design;
        b.title = design ? 'Shown in 01 Trace' : b.getAttribute('data-title');
      }
    });

    // photo
    const tg = $('tg-photo');
    tg.disabled = !hasImg;
    tg.title = hasImg
      ? 'Show the photo: ' + (p.image.name || 'photo') + ', ' + p.image.width + ' × ' + p.image.height + ' px'
      : 'No photo loaded';
    const op = Math.round(p.view.photoOpacity * 100);
    const slider = $('img-opacity');
    slider.disabled = !hasImg;
    if (document.activeElement !== slider && String(slider.value) !== String(op)) slider.value = op;
    FB.ui.setText($('img-opacity-val'), op + ' %');

    // the unit after every length field
    const unit = U.unit();
    document.querySelectorAll('.unit').forEach((el) => { if (el.textContent !== unit) el.textContent = unit; });

    // scale
    const len = $('scale-length');
    len.disabled = !p.scale;
    FB.ui.setInput(len, p.scale && p.scale.lengthMm ? U.num(p.scale.lengthMm) : '');
    len.placeholder = p.scale ? 'length' : '';
    len.setAttribute('aria-label', 'Reference length in ' + (U.imperial() ? 'inches' : 'mm'));
    len.classList.toggle('missing', !!p.scale && !d.hasScale);
    // only what still needs doing; the resolution itself is not shown
    const res = $('st-res');
    const text = hasImg && !d.hasScale ? (p.scale ? 'Enter the length' : 'Not set') : '';
    FB.ui.setText(res, text);
    res.classList.toggle('bad', !!text);
    $('btn-reset-scale').hidden = !p.scale;
    $('sb-scale').title = p.scale
      ? 'Real length of the scale line. Adjust its ends with the Scale tool (S).'
      : 'Draw the scale line along the reference with the Scale tool (S).';

    // warnings on the command line
    FB.ui.setText($('st-warn'), d.scaleWarnings.join(' '));
  }

  FB.statusbar = { init, update };
})(window);
