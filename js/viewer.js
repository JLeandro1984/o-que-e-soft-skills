/* viewer.js — Visualização inline do PDF original com PDF.js
 * API: Viewer.render({ mid, page })
 * Rota: #/visualizar/:mid  ou  #/visualizar/:mid/:page
 */

(function (global) {
  'use strict';

  const Viewer = {};

  // Estado local do visualizador ativo
  const state = {
    doc: null,          // PDFDocumentProxy carregado
    file: null,         // nome do arquivo carregado
    pageNumber: 1,
    numPages: 0,
    scale: null,        // null → fit width; número → zoom explícito
    lastEffectiveScale: 1, // última escala CSS aplicada (usada como base ao aumentar/diminuir a partir do fit)
    renderTask: null,   // task em curso (para cancelamento)
    renderToken: 0,     // token incremental para evitar corridas
  };

  Viewer.render = async function ({ mid, page }) {
    const main = document.getElementById('main-content');
    if (!main) return;

    const mod = PDFIngest.getModule(mid);
    if (!mod) {
      main.innerHTML = `
        <div class="page-hero">
          <h1>Módulo não encontrado</h1>
          <p>Volte para a <a href="#/downloads">lista de materiais</a>.</p>
        </div>`;
      return;
    }

    const initialPage = clampPage(parseInt(page, 10) || 1, mod.pages || 1);

    main.innerHTML = `
      <div class="viewer" data-file="${Utils.escapeHtml(mod.file)}">
        <div class="page-hero" style="margin-bottom: 8px;">
          <div class="badge badge--accent">${Utils.icon('book', 12)} Visualizar PDF</div>
          <h1>${Utils.escapeHtml(mod.title)}</h1>
          <p>${mod.pages} páginas · ${mod.chapters.length} capítulos · leitura direta no navegador.</p>
        </div>

        <div class="viewer__toolbar" role="toolbar" aria-label="Controles do PDF">
          <div class="viewer__group">
            <button class="btn btn--ghost" id="v-prev" aria-label="Página anterior" title="Página anterior (←)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span class="viewer__page">
              Página
              <input id="v-page" type="number" min="1" max="${mod.pages || 1}" value="${initialPage}" aria-label="Número da página" />
              de <strong id="v-total">${mod.pages || '—'}</strong>
            </span>
            <button class="btn btn--ghost" id="v-next" aria-label="Próxima página" title="Próxima página (→)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
            </button>
          </div>

          <div class="viewer__group">
            <button class="btn btn--ghost" id="v-zoom-out" aria-label="Reduzir zoom" title="Reduzir zoom">−</button>
            <span class="viewer__zoom" id="v-zoom" aria-live="polite">Ajustar</span>
            <button class="btn btn--ghost" id="v-zoom-in" aria-label="Aumentar zoom" title="Aumentar zoom">+</button>
            <button class="btn btn--ghost" id="v-fit" title="Ajustar à largura">Ajustar</button>
          </div>

          <div class="viewer__group viewer__group--end">
            <a class="btn btn--ghost" href="${PDFIngest.DOCS_DIR}${encodeURIComponent(mod.file)}" download="${Utils.escapeHtml(mod.file)}">
              ${Utils.icon('download', 14)} Baixar
            </a>
          </div>
        </div>

        <div class="viewer__stage" id="v-stage" tabindex="0" aria-label="Visualização do PDF">
          <div class="viewer__loading" id="v-loading">
            <div class="spinner" aria-hidden="true"></div>
            <p>Carregando PDF…</p>
          </div>
          <canvas id="v-canvas" hidden></canvas>
        </div>

        <p class="viewer__hint">
          Dica: use as setas ← → para navegar. Este visualizador roda 100% no seu navegador — nenhum dado sai do seu computador.
        </p>
      </div>
    `;

    // Reset estado
    cleanup();
    state.file = mod.file;
    state.pageNumber = initialPage;
    state.scale = null; // começar em fit-width

    wireControls(mod);
    await loadDocument(mod);
    await renderCurrentPage();
  };

  function clampPage(n, max) {
    if (!Number.isFinite(n) || n < 1) return 1;
    if (n > max) return max;
    return n;
  }

  function cleanup() {
    if (state.renderTask && typeof state.renderTask.cancel === 'function') {
      try { state.renderTask.cancel(); } catch (_) { /* ignore */ }
    }
    if (state.doc && typeof state.doc.destroy === 'function') {
      try { state.doc.destroy(); } catch (_) { /* ignore */ }
    }
    state.doc = null;
    state.file = null;
    state.pageNumber = 1;
    state.numPages = 0;
    state.scale = null;
    state.renderTask = null;
    state.renderToken = 0;
  }

  async function loadDocument(mod) {
    try {
      const bin = await PDFIngest.fetchPdfBinary(mod.file);
      state.doc = await pdfjsLib.getDocument({ data: bin }).promise;
      state.numPages = state.doc.numPages;
      const totalEl = document.getElementById('v-total');
      if (totalEl) totalEl.textContent = String(state.numPages);
      const input = document.getElementById('v-page');
      if (input) input.max = state.numPages;
      state.pageNumber = clampPage(state.pageNumber, state.numPages);
      if (input) input.value = state.pageNumber;
    } catch (err) {
      const stage = document.getElementById('v-stage');
      if (stage) {
        stage.innerHTML = `
          <div class="viewer__error">
            <strong>Não foi possível carregar o PDF.</strong>
            <p style="color: var(--text-muted); margin-top: 6px;">${Utils.escapeHtml(err.message || String(err))}</p>
            <a class="btn btn--primary" href="${PDFIngest.DOCS_DIR}${encodeURIComponent(mod.file)}" download style="margin-top: 12px;">
              ${Utils.icon('download', 14)} Baixar PDF
            </a>
          </div>
        `;
      }
      throw err;
    }
  }

  async function renderCurrentPage() {
    if (!state.doc) return;
    const canvas = document.getElementById('v-canvas');
    const stage = document.getElementById('v-stage');
    const loading = document.getElementById('v-loading');
    if (!canvas || !stage) return;

    const myToken = ++state.renderToken;

    // Cancelar tarefa anterior
    if (state.renderTask && typeof state.renderTask.cancel === 'function') {
      try { state.renderTask.cancel(); } catch (_) { /* ignore */ }
      state.renderTask = null;
    }

    if (loading) loading.hidden = false;

    let page;
    try {
      page = await state.doc.getPage(state.pageNumber);
    } catch (err) {
      if (myToken !== state.renderToken) return;
      console.warn('[Viewer] getPage falhou:', err);
      return;
    }
    if (myToken !== state.renderToken) return;

    // Calcula escala final: fit-width ou explícita, multiplicada por DPR
    const baseViewport = page.getViewport({ scale: 1 });
    const stageWidth = Math.max(320, stage.clientWidth - 24); // padding
    const fitScale = stageWidth / baseViewport.width;
    const cssScale = state.scale == null ? fitScale : state.scale;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    const viewport = page.getViewport({ scale: cssScale * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
    canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
    state.lastEffectiveScale = cssScale;

    const ctx = canvas.getContext('2d');
    state.renderTask = page.render({ canvasContext: ctx, viewport });
    try {
      await state.renderTask.promise;
    } catch (err) {
      if (err && err.name === 'RenderingCancelledException') return;
      console.warn('[Viewer] render falhou:', err);
      return;
    } finally {
      state.renderTask = null;
    }
    if (myToken !== state.renderToken) return;

    canvas.hidden = false;
    if (loading) loading.hidden = true;

    // Atualiza indicador de zoom
    const zoomEl = document.getElementById('v-zoom');
    if (zoomEl) {
      zoomEl.textContent = state.scale == null
        ? 'Ajustar'
        : Math.round(state.scale * 100) + '%';
    }
    const input = document.getElementById('v-page');
    if (input) input.value = state.pageNumber;

    updateUrlSilently();
  }

  function updateUrlSilently() {
    if (!state.file) return;
    const mid = extractMidFromHash();
    if (!mid) return;
    const target = `#/visualizar/${encodeURIComponent(mid)}/${state.pageNumber}`;
    if (location.hash !== target) {
      // history.replaceState evita disparar o roteador novamente
      history.replaceState(null, '', target);
    }
  }

  function extractMidFromHash() {
    const m = /^#\/visualizar\/([^\/]+)/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function goToPage(n) {
    const target = clampPage(n, state.numPages || 1);
    if (target === state.pageNumber) return;
    state.pageNumber = target;
    renderCurrentPage();
  }

  function setScale(next) {
    // next: número (0.5 – 3) ou null (fit)
    if (next != null) {
      next = Math.max(0.5, Math.min(3, next));
    }
    state.scale = next;
    renderCurrentPage();
  }

  function wireControls(mod) {
    document.getElementById('v-prev')?.addEventListener('click', () => goToPage(state.pageNumber - 1));
    document.getElementById('v-next')?.addEventListener('click', () => goToPage(state.pageNumber + 1));
    document.getElementById('v-fit')?.addEventListener('click', () => setScale(null));
    document.getElementById('v-zoom-in')?.addEventListener('click', () => {
      const current = state.scale == null ? state.lastEffectiveScale : state.scale;
      setScale(current + 0.15);
    });
    document.getElementById('v-zoom-out')?.addEventListener('click', () => {
      const current = state.scale == null ? state.lastEffectiveScale : state.scale;
      setScale(current - 0.15);
    });

    const input = document.getElementById('v-page');
    input?.addEventListener('change', () => {
      goToPage(parseInt(input.value, 10) || 1);
    });

    // Setas do teclado quando o stage tem foco (ou body sem input focado)
    const onKey = (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (!location.hash.startsWith('#/visualizar/')) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPage(state.pageNumber - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goToPage(state.pageNumber + 1); }
    };
    document.addEventListener('keydown', onKey);

    // Re-renderiza em resize (debounced) — apenas no modo fit-width
    let resizeT = null;
    const onResize = () => {
      if (!location.hash.startsWith('#/visualizar/')) {
        window.removeEventListener('resize', onResize);
        return;
      }
      if (state.scale != null) return;
      clearTimeout(resizeT);
      resizeT = setTimeout(() => renderCurrentPage(), 150);
    };
    window.addEventListener('resize', onResize);

    // Ao sair da rota, limpa estado
    const onRoute = (ev) => {
      const path = ev?.detail?.path || '';
      if (!path.startsWith('visualizar/')) {
        Utils.off('route:change', onRoute);
        cleanup();
      }
    };
    Utils.on('route:change', onRoute);
  }

  global.Viewer = Viewer;
})(window);
