/* router.js — Roteador baseado em hash (#/rota) */

(function (global) {
  'use strict';

  const routes = [];

  function on(pattern, handler) {
    // pattern: 'dashboard' | 'capitulo/:mid/:cid' etc.
    const keys = [];
    const rx = new RegExp('^' + pattern.replace(/:([\w]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    }) + '$');
    routes.push({ rx, keys, handler });
  }

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    return raw.split('?')[0];
  }

  function match(path) {
    for (const route of routes) {
      const m = path.match(route.rx);
      if (m) {
        const params = {};
        route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { handler: route.handler, params };
      }
    }
    return null;
  }

  function navigate(path) {
    const target = '#/' + path.replace(/^#?\/?/, '');
    if (location.hash === target) {
      // força re-render
      resolve();
    } else {
      location.hash = target;
    }
  }

  function resolve() {
    const path = parseHash() || '';
    const found = match(path) || match('') || null;
    if (found) {
      try {
        found.handler(found.params || {});
      } catch (err) {
        console.error('Erro na rota', path, err);
        renderError(err);
      }
      // scroll to top do main
      const main = document.getElementById('main-content');
      if (main) main.scrollTop = 0;
      Utils.emit('route:change', { path });
    }
  }

  function renderError(err) {
    const main = document.getElementById('main-content');
    if (!main) return;
    main.innerHTML = `
      <div class="empty">
        <h3>Ocorreu um erro</h3>
        <p>${Utils.escapeHtml(err && err.message || String(err))}</p>
      </div>`;
  }

  function init() {
    window.addEventListener('hashchange', resolve);
    // Aguarda registro das rotas antes do primeiro resolve — app.js chama Router.start()
  }

  function start() {
    if (!location.hash) location.hash = '#/';
    resolve();
  }

  global.Router = { on, navigate, resolve, init, start };
})(window);
