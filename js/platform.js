/*
 * Framebag Pattern — platform.js
 *
 * Which computer and browser the page runs on (spec v0.7 A).
 *
 * On a Mac the keys are ⌘ (Command) and ⌥ (Option), and Ctrl+click opens
 * the right-click menu. On Windows and Linux the same actions use Ctrl and
 * Alt. Every text in the tool is written with the Mac symbols, so the Mac
 * version stays the primary one; keys() translates them for other systems.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const nav = root.navigator || {};
  const uad = nav.userAgentData;
  const ua = String(nav.userAgent || '');
  // userAgentData.platform in Chrome and Edge ("macOS", "Windows", "Linux"),
  // navigator.platform elsewhere ("MacIntel", "Win32", "Linux x86_64")
  const plat = String((uad && uad.platform) || nav.platform || '');

  const isMac = plat ? /mac|iphone|ipad|ipod/i.test(plat) : /macintosh|mac os x/i.test(ua);
  const os = isMac ? 'mac' : (/win/i.test(plat) || /windows/i.test(ua) ? 'windows' : 'linux');
  const isFirefox = /firefox\//i.test(ua);

  /** True when the primary modifier is held: ⌘ on a Mac, Ctrl elsewhere. */
  const mod = (e) => !!(isMac ? e.metaKey : e.ctrlKey);

  /** e.key of the primary modifier. */
  const MOD_KEY = isMac ? 'Meta' : 'Control';

  /**
   * A text written with Mac key symbols, as this computer names the keys:
   * "⌘Z" → "Ctrl+Z", "⇧⌘Z" → "Ctrl+Y", "hold ⌘" → "hold Ctrl", "⌥" → "Alt".
   */
  function keys(s) {
    s = String(s);
    if (isMac) return s;
    return s
      .replace(/⇧⌘Z/g, 'Ctrl+Y')
      .replace(/⇧⌘(\S)/g, 'Ctrl+Shift+$1')
      .replace(/⌘(\S)/g, 'Ctrl+$1')
      .replace(/⌘/g, 'Ctrl')
      .replace(/⌥/g, 'Alt')
      .replace(/⇧/g, 'Shift+');
  }

  /** Put this computer's key names into the page's tooltips and key hints. */
  function localize(scope) {
    if (isMac || !scope) return;
    scope.querySelectorAll('[title]').forEach((el) => { el.title = keys(el.title); });
    scope.querySelectorAll('kbd').forEach((el) => { el.textContent = keys(el.textContent); });
  }

  if (root.document && root.document.documentElement) {
    root.document.documentElement.setAttribute('data-os', os);
  }

  FB.platform = { isMac, os, isFirefox, mod, MOD_KEY, keys, localize };
})(typeof window !== 'undefined' ? window : globalThis);
