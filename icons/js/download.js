/* download.js — Página de downloads (grid de cards com PDFs originais) */

(function (global) {
  'use strict';

  const Download = {};

  Download.render = function () {
    const main = document.getElementById('main-content');
    if (!main) return;
    const modules = PDFIngest.getModules();
    main.innerHTML = `
      <div class="page-hero">
        <div class="badge badge--accent">${Utils.icon('download', 12)} Downloads</div>
        <h1>Materiais originais</h1>
        <p>Baixe os PDFs que deram origem a este treinamento.</p>
      </div>
      <div class="grid-cards" id="download-grid"></div>
    `;

    const grid = document.getElementById('download-grid');
    modules.forEach((m) => {
      const chapters = m.chapters.length;
      const card = Utils.el('div', { class: 'download-card' });
      card.innerHTML = `
        <div class="download-card__head">
          <div class="download-card__icon">${Utils.icon('chapter', 20)}</div>
          <div>
            <h3 class="download-card__title">${Utils.escapeHtml(m.title)}</h3>
            <div class="download-card__meta">${m.pages} páginas · ${chapters} ${chapters === 1 ? 'capítulo' : 'capítulos'}</div>
          </div>
        </div>
        <p class="download-card__desc">${Utils.escapeHtml(m.description || '')}</p>
        <div class="download-card__footer">
          <span class="badge">${Utils.escapeHtml(m.file)}</span>
          <div class="btn-group" style="display:inline-flex; gap:8px; flex-wrap:wrap;">
            <a class="btn btn--ghost" href="#/visualizar/${encodeURIComponent(m.id)}">
              ${Utils.icon('book', 14)} Visualizar
            </a>
            <a class="btn btn--primary" href="${PDFIngest.DOCS_DIR}${encodeURIComponent(m.file)}" download="${Utils.escapeHtml(m.file)}">
              ${Utils.icon('download', 14)} Baixar PDF
            </a>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  };

  global.Download = Download;
})(window);
