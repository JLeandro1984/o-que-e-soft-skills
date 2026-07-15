/* search.js — Busca instantânea sobre todos os capítulos */

(function (global) {
  'use strict';

  const Search = {};

  let index = []; // [{chapterId, moduleId, title, moduleTitle, text, blocks}]

  Search.buildIndex = function () {
    index = [];
    const modules = PDFIngest.getModules();
    modules.forEach((m) => {
      m.chapters.forEach((c) => {
        index.push({
          chapterId: c.id,
          moduleId: m.id,
          title: c.title,
          moduleTitle: m.title,
          text: c.text || '',
        });
      });
    });
  };

  Search.wire = function () {
    const input = document.getElementById('global-search');
    const box   = document.getElementById('search-results');
    if (!input || !box) return;

    const run = Utils.debounce(() => runSearch(input.value.trim(), box), 140);
    input.addEventListener('input', run);
    input.addEventListener('focus', () => { if (input.value.trim()) runSearch(input.value.trim(), box); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.blur(); box.hidden = true; }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search')) box.hidden = true;
    });
  };

  function runSearch(term, box) {
    if (!term || term.length < 2) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const results = query(term).slice(0, 20);
    if (!results.length) {
      box.innerHTML = `<div class="search__empty">Nenhum resultado para "${Utils.escapeHtml(term)}"</div>`;
      box.hidden = false;
      return;
    }
    box.innerHTML = results.map((r) => `
      <a class="search-result" href="#/capitulo/${encodeURIComponent(r.moduleId)}/${encodeURIComponent(r.chapterId)}?q=${encodeURIComponent(term)}">
        <div class="search-result__meta">
          <span>${Utils.escapeHtml(r.moduleTitle)}</span>
          <span>·</span>
          <span>${Utils.escapeHtml(r.title)}</span>
        </div>
        <div class="search-result__title">${Utils.highlightTerm(r.title, term)}</div>
        <div class="search-result__snippet">${Utils.highlightTerm(Utils.snippet(r.text, term, 90), term)}</div>
      </a>
    `).join('');
    box.hidden = false;

    box.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => { box.hidden = true; });
    });
  }

  function query(term) {
    const t = term.toLowerCase();
    const scored = [];
    index.forEach((item) => {
      const titleIdx = item.title.toLowerCase().indexOf(t);
      const textIdx  = item.text.toLowerCase().indexOf(t);
      const modIdx   = item.moduleTitle.toLowerCase().indexOf(t);
      if (titleIdx < 0 && textIdx < 0 && modIdx < 0) return;
      let score = 0;
      if (titleIdx >= 0) score += 5;
      if (modIdx >= 0)   score += 2;
      if (textIdx >= 0)  score += 1 + Math.max(0, 3 - textIdx / 200);
      scored.push({ item, score, textIdx });
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }

  Search.query = query;

  global.Search = Search;
})(window);
