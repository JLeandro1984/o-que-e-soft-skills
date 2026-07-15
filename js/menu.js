/* menu.js — Renderização da árvore de navegação da sidebar */

(function (global) {
  'use strict';

  const Menu = {};

  const ICONS = {
    home: Utils.icon('home', 16),
    dashboard: Utils.icon('dashboard', 16),
    quiz: Utils.icon('simulator', 16),
    certificate: Utils.icon('certificate', 16),
    download: Utils.icon('download', 16),
    chapter: Utils.icon('chapter', 14),
    caret: Utils.icon('caret', 14),
    check: Utils.icon('check', 14),
  };

  const OPEN_KEY = 'ssp:menu-open';
  function getOpenState() { return Storage.get(OPEN_KEY, {}) || {}; }
  function setOpenState(s) { Storage.set(OPEN_KEY, s); }

  Menu.render = function () {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;
    nav.innerHTML = '';

    // Fixos no topo
    const fixed = [
      { href: '#/',           icon: 'home',       label: 'Início' },
      { href: '#/dashboard',  icon: 'dashboard',  label: 'Dashboard' },
    ];
    fixed.forEach((it) => nav.appendChild(fixedItem(it)));

    // Módulos (dinâmicos)
    const openState = getOpenState();
    const modules = PDFIngest.getModules();

    if (modules.length) {
      const heading = Utils.el('div', { class: 'nav-module__label', style: 'margin: 16px 8px 6px; font-size: 11px; letter-spacing: 0.02em; color: var(--text-soft); font-weight: 500;' }, 'Conteúdo');
      nav.appendChild(heading);
    }

    modules.forEach((m, idx) => {
      const isOpen = openState[m.id] !== undefined ? !!openState[m.id] : idx === 0;
      const group = Utils.el('div', { class: 'nav-module', dataset: { open: String(isOpen) } });
      const header = Utils.el('button', {
        class: 'nav-module__header',
        type: 'button',
        'aria-expanded': String(isOpen),
        onclick: () => toggleModule(m.id, group),
      });
      header.innerHTML = `
        <span class="nav-module__caret">${ICONS.caret}</span>
        <span class="nav-module__title" style="flex:1; text-align:left;">${Utils.escapeHtml(m.title)}</span>
        <span class="nav-item__badge">${m.chapters.length}</span>
      `;
      group.appendChild(header);

      const chList = Utils.el('div', { class: 'nav-module__chapters' });
      m.chapters.forEach((c) => chList.appendChild(chapterItem(c)));
      group.appendChild(chList);
      nav.appendChild(group);
    });

    // Fixos no rodapé
    const bottom = [
      { href: '#/simulado',    icon: 'quiz',        label: 'Simulado' },
      { href: '#/certificado', icon: 'certificate', label: 'Certificado' },
      { href: '#/downloads',   icon: 'download',    label: 'Downloads' },
    ];
    const spacer = Utils.el('div', { style: 'margin-top: 16px;' });
    nav.appendChild(spacer);
    bottom.forEach((it) => nav.appendChild(fixedItem(it)));

    Menu.updateActive();
    Menu.updateGlobalProgress();
  };

  function fixedItem(it) {
    return Utils.el('a', {
      href: it.href,
      class: 'nav-item',
      dataset: { route: it.href },
    }, htmlNode(`
      <span class="nav-item__icon">${Utils.icon(it.icon, 16)}</span>
      <span class="nav-item__label">${Utils.escapeHtml(it.label)}</span>
    `));
  }

  function chapterItem(chapter) {
    const progress = Storage.getProgress()[chapter.id] || {};
    const done = !!progress.completed;
    const node = Utils.el('a', {
      href: `#/capitulo/${encodeURIComponent(chapter.moduleId)}/${encodeURIComponent(chapter.id)}`,
      class: 'nav-item nav-chapter' + (done ? ' is-done' : ''),
      dataset: { chapterId: chapter.id },
    }, htmlNode(`
      <span class="nav-item__icon">${done ? ICONS.check : ICONS.chapter}</span>
      <span class="nav-item__label" title="${Utils.escapeHtml(chapter.title)}">${Utils.escapeHtml(chapter.title)}</span>
    `));
    return node;
  }

  function htmlNode(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    // Retorna fragmento — mas Utils.el precisa de nodes; devolvemos array
    return Array.from(t.content.childNodes);
  }

  function toggleModule(id, groupEl) {
    const isOpen = groupEl.dataset.open === 'true';
    groupEl.dataset.open = String(!isOpen);
    const openState = getOpenState();
    openState[id] = !isOpen;
    setOpenState(openState);
    const header = groupEl.querySelector('.nav-module__header');
    if (header) header.setAttribute('aria-expanded', String(!isOpen));
  }

  Menu.updateActive = function () {
    const current = location.hash || '#/';
    Utils.$$('#sidebar-nav .nav-item').forEach((el) => {
      el.classList.remove('is-active');
      el.removeAttribute('aria-current');
    });
    // Match exato
    let el = Utils.$$('#sidebar-nav .nav-item').find((n) => n.getAttribute('href') === current);
    if (!el) {
      // Match parcial (capítulo → módulo)
      const chapterMatch = current.match(/#\/capitulo\/[^/]+\/([^/?#]+)/);
      if (chapterMatch) {
        const cid = decodeURIComponent(chapterMatch[1]);
        el = Utils.$$('#sidebar-nav .nav-item').find((n) => n.dataset.chapterId === cid);
      }
    }
    if (el) {
      el.classList.add('is-active');
      el.setAttribute('aria-current', 'page');
      // Expande módulo pai se estiver colapsado
      const group = el.closest('.nav-module');
      if (group && group.dataset.open === 'false') {
        toggleModule(group.querySelector('.nav-module__header')?.dataset?.mid || '', group);
        group.dataset.open = 'true';
      }
    }
  };

  Menu.updateGlobalProgress = function () {
    const chapters = PDFIngest.getAllChapters();
    const progress = Storage.getProgress();
    const done = chapters.filter((c) => progress[c.id]?.completed).length;
    const pct = Utils.pct(done, chapters.length);
    const valueEl = document.getElementById('global-progress-value');
    const barEl = document.getElementById('global-progress-bar');
    if (valueEl) valueEl.textContent = pct + '%';
    if (barEl) {
      barEl.setAttribute('aria-valuenow', String(pct));
      const fill = barEl.querySelector('.progress__fill');
      if (fill) fill.style.width = pct + '%';
    }
    // atualiza check nos itens
    Utils.$$('#sidebar-nav .nav-chapter').forEach((el) => {
      const cid = el.dataset.chapterId;
      const isDone = !!progress[cid]?.completed;
      el.classList.toggle('is-done', isDone);
      const icon = el.querySelector('.nav-item__icon');
      if (icon) icon.innerHTML = isDone ? ICONS.check : ICONS.chapter;
    });
  };

  Menu.wireDrawer = function () {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const toggleBtn = document.getElementById('menu-toggle');
    const closeBtn = document.getElementById('sidebar-close');

    function open() {
      sidebar.classList.add('is-open');
      backdrop.hidden = false;
      toggleBtn?.setAttribute('aria-expanded', 'true');
    }
    function close() {
      sidebar.classList.remove('is-open');
      backdrop.hidden = true;
      toggleBtn?.setAttribute('aria-expanded', 'false');
    }
    toggleBtn?.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);

    // Fecha ao clicar num link (mobile)
    document.getElementById('sidebar-nav')?.addEventListener('click', (e) => {
      const link = e.target.closest('a.nav-item');
      if (link && window.matchMedia('(max-width: 768px)').matches) close();
    });
  };

  global.Menu = Menu;
})(window);
