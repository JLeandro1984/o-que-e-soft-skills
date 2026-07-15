/* theme.js — Alternador de tema (claro/escuro) */

(function (global) {
  'use strict';

  const KEY = Storage.KEYS.theme;
  const html = document.documentElement;

  function apply(theme) {
    html.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f1120' : '#4f46e5');
  }

  function init() {
    const saved = Storage.get(KEY, null);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved || (prefersDark ? 'dark' : 'light');
    apply(initial);

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        apply(next);
        Storage.set(KEY, next);
        Utils.emit('theme:change', { theme: next });
      });
    }
  }

  global.Theme = { init, apply };
})(window);
