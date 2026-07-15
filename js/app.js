/* app.js — Orquestração principal (init + rotas de alto nível) */

(function () {
  'use strict';

  let currentTicker = null; // função de cleanup
  let currentChapterId = null;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    Theme.init();
    updateAvatar();
    Router.init();

    // Ingestão dos PDFs
    try {
      await PDFIngest.init(reportProgress);
    } catch (err) {
      console.error('Falha na ingestão dos PDFs', err);
      showFatal(err);
      return;
    }

    if (!PDFIngest.getAllChapters().length) {
      showEmpty();
      return;
    }

    // Menu + busca
    Menu.render();
    Menu.wireDrawer();
    Search.buildIndex();
    Search.wire();

    // Rotas
    registerRoutes();

    // back-to-top
    wireBackToTop();

    // Eventos globais
    Utils.on('route:change', onRouteChange);

    Router.start();

    // Registro diário de estudo (streak)
    Storage.registerStudyDay();

    // Ticker de tempo (a cada 30s, adiciona 30s ao capítulo atual se estiver visível)
    startGlobalTimeTicker();
  }

  function reportProgress({ pct, msg }) {
    const fill = document.getElementById('loading-fill');
    const hint = document.getElementById('loading-hint');
    const text = document.querySelector('.loading-screen__text');
    if (fill) fill.style.width = Math.min(100, Math.round(pct)) + '%';
    if (msg && text) text.textContent = msg;
    if (msg && hint) hint.textContent = 'Isso acontece apenas na primeira vez.';
  }

  function showFatal(err) {
    const main = document.getElementById('main-content');
    const isFileProto = location.protocol === 'file:';
    const tip = isFileProto ? `
      <div class="callout callout--important" style="text-align:left;">
        <span class="callout__icon">${Utils.icon('warning', 16)}</span>
        <div class="callout__body">
          <strong class="callout__title">Restrição do navegador</strong>
          <p class="callout__text">O Chrome bloqueia leitura de arquivos locais quando o HTML é aberto direto do disco. Duas opções para rodar 100% offline:</p>
          <ul style="text-align:left; margin: 8px 0 4px;">
            <li>Abrir o <code>index.html</code> no <strong>Firefox</strong> (funciona sem servidor).</li>
            <li>Ou executar um servidor estático simples nesta pasta: <br/><code>python -m http.server 8080</code> e acessar <code>http://localhost:8080</code>.</li>
          </ul>
        </div>
      </div>` : '';
    main.innerHTML = `
      <div class="empty">
        <h3>Não foi possível carregar as apostilas</h3>
        <p>${Utils.escapeHtml(err.message || String(err))}</p>
      </div>
      ${tip}`;
  }

  function showEmpty() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="empty">
        <h3>Nenhuma apostila encontrada</h3>
        <p>Adicione arquivos <code>.pdf</code> na pasta <code>aulas/</code> e atualize a página.</p>
      </div>`;
  }

  function updateAvatar() {
    const profile = Storage.getProfile();
    const el = document.getElementById('avatar-initials');
    if (el) el.textContent = (profile.initials || (profile.name || 'ES').slice(0, 2)).toUpperCase();
  }

  // ─── Rotas ────────────────────────────────────────────────────
  function registerRoutes() {
    Router.on('', renderHome);
    Router.on('plano', () => { setBreadcrumb(['Início', 'Plano de estudos']); Plan.render(); });
    Router.on('dashboard', () => { setBreadcrumb(['Início', 'Dashboard']); Dashboard.render(); });
    Router.on('downloads', () => { setBreadcrumb(['Início', 'Downloads']); Download.render(); });
    Router.on('visualizar/:mid', (p) => {
      const mod = PDFIngest.getModule(p.mid);
      setBreadcrumb(['Início', 'Downloads', mod ? mod.title : 'Visualizar', 'Visualizar']);
      Viewer.render(p);
    });
    Router.on('visualizar/:mid/:page', (p) => {
      const mod = PDFIngest.getModule(p.mid);
      setBreadcrumb(['Início', 'Downloads', mod ? mod.title : 'Visualizar', 'Página ' + p.page]);
      Viewer.render(p);
    });
    Router.on('simulado', () => { setBreadcrumb(['Início', 'Simulado']); Simulator.renderIntro(); });
    Router.on('certificado', () => { setBreadcrumb(['Início', 'Certificado']); Certificate.render({}); });
    Router.on('certificado/validar/:code', (p) => { setBreadcrumb(['Início', 'Certificado', 'Validar']); Certificate.render(p); });
    Router.on('capitulo/:mid/:cid', renderChapter);
    Router.on('capitulo/:mid/:cid/quiz', renderChapterQuiz);
    Router.on('modulo/:mid', renderModule);
  }

  function onRouteChange() {
    Menu.updateActive();
    // Fecha resultados de busca
    const box = document.getElementById('search-results');
    if (box) box.hidden = true;
  }

  // ─── Home ─────────────────────────────────────────────────────
  function renderHome() {
    setBreadcrumb(['Início']);
    const main = document.getElementById('main-content');
    const modules = PDFIngest.getModules();
    const chapters = PDFIngest.getAllChapters();
    const progress = Storage.getProgress();
    const done = chapters.filter((c) => progress[c.id]?.completed).length;
    const totalPages = modules.reduce((s, m) => s + (m.pages || 0), 0);
    const bank = Quiz.getMixedBank();
    const estWords = chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    const estimateH = Math.max(1, Math.round((estWords / 220 / 60) * 10) / 10);

    main.innerHTML = `
      <div class="page-hero">
        <div class="badge badge--accent">${Utils.icon('book', 12)} Treinamento local</div>
        <h1>Soft skills para pessoas desenvolvedoras</h1>
        <p>Estude, pratique e certifique-se sem depender de rede. Todo o conteúdo é extraído automaticamente dos PDFs em <code>aulas/</code> e organizado em módulos e capítulos navegáveis.</p>
        <div class="btn-group" style="margin-top: 12px;">
          <a class="btn btn--primary" href="#/plano">${Utils.icon('lightbulb', 14)} Ver objetivo e fontes originais</a>
          <a class="btn btn--ghost" href="#/dashboard">${Utils.icon('dashboard', 14)} Meu progresso</a>
        </div>
      </div>

      <div class="grid-metrics">
        <div class="card card--metric"><div class="card__label">PDFs</div><div class="card__value">${modules.length}</div><div class="card__sub">materiais indexados</div></div>
        <div class="card card--metric"><div class="card__label">Capítulos</div><div class="card__value">${chapters.length}</div><div class="card__sub">${done} concluídos</div></div>
        <div class="card card--metric"><div class="card__label">Exercícios</div><div class="card__value">${bank.length}</div><div class="card__sub">gerados automaticamente</div></div>
        <div class="card card--metric"><div class="card__label">Tempo estimado</div><div class="card__value">${estimateH} h</div><div class="card__sub">${totalPages} páginas</div></div>
      </div>

      <h2 class="section-title">Módulos</h2>
      <div class="grid-cards" id="modules-grid"></div>
    `;

    const grid = document.getElementById('modules-grid');
    modules.forEach((m) => {
      const doneCount = m.chapters.filter((c) => progress[c.id]?.completed).length;
      const pct = Utils.pct(doneCount, m.chapters.length);
      const firstChapter = m.chapters[0];
      const link = firstChapter ? `#/capitulo/${encodeURIComponent(m.id)}/${encodeURIComponent(firstChapter.id)}` : `#/modulo/${encodeURIComponent(m.id)}`;
      const card = Utils.el('a', { class: 'module-card', href: link });
      card.innerHTML = `
        <div class="module-card__head">
          <div class="module-card__icon">${Utils.icon('book', 18)}</div>
          <div style="min-width:0; flex:1;">
            <h3 class="module-card__title">${Utils.escapeHtml(m.title)}</h3>
            <p class="module-card__meta">${m.chapters.length} ${m.chapters.length === 1 ? 'capítulo' : 'capítulos'} · ${m.pages} páginas</p>
          </div>
          ${pct === 100 ? `<span class="badge badge--success">${Utils.icon('check',12)} Concluído</span>` : ''}
        </div>
        <p class="card__desc" style="margin:0;">${Utils.escapeHtml(m.description || '')}</p>
        <div class="module-card__foot">
          <div class="progress">
            <div class="progress__row">
              <span class="progress__label">${doneCount}/${m.chapters.length} concluídos</span>
              <span class="progress__value">${pct}%</span>
            </div>
            <div class="progress__track"><div class="progress__fill" style="width:${pct}%"></div></div>
          </div>
        </div>`;
      grid.appendChild(card);
    });
  }

  // ─── Módulo (índice de capítulos) ─────────────────────────────
  function renderModule(params) {
    const mod = PDFIngest.getModule(params.mid);
    if (!mod) { renderNotFound(); return; }
    setBreadcrumb(['Início', mod.title]);
    const main = document.getElementById('main-content');
    const progress = Storage.getProgress();
    main.innerHTML = `
      <div class="page-hero">
        <div class="badge">${Utils.icon('book', 12)} Módulo</div>
        <h1>${Utils.escapeHtml(mod.title)}</h1>
        <p>${Utils.escapeHtml(mod.description || '')}</p>
      </div>
      <div class="grid-cards" id="chapter-grid"></div>
    `;
    const grid = document.getElementById('chapter-grid');
    mod.chapters.forEach((c) => {
      const done = !!progress[c.id]?.completed;
      const card = Utils.el('a', { class: 'module-card', href: `#/capitulo/${encodeURIComponent(mod.id)}/${encodeURIComponent(c.id)}` });
      card.innerHTML = `
        <div class="module-card__head">
          <div class="module-card__icon">${Utils.icon('chapter', 16)}</div>
          <div style="flex:1; min-width:0;">
            <h3 class="module-card__title">${c.index}. ${Utils.escapeHtml(c.title)}</h3>
            <p class="module-card__meta">Páginas ${c.pageStart}–${c.pageEnd} · ${c.wordCount || 0} palavras</p>
          </div>
          ${done ? `<span class="badge badge--success">${Utils.icon('check',12)} Concluído</span>` : ''}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // ─── Capítulo (leitura) ───────────────────────────────────────
  function renderChapter(params) {
    const mod = PDFIngest.getModule(params.mid);
    const chapter = PDFIngest.getChapter(params.cid);
    if (!chapter || !mod) { renderNotFound(); return; }

    setBreadcrumb(['Início', mod.title, chapter.title]);
    Storage.setChapterProgress(chapter.id, { lastVisited: Date.now() });
    currentChapterId = chapter.id;

    const main = document.getElementById('main-content');
    const highlight = parseQuery('q');
    const progress = Storage.getProgress()[chapter.id] || {};
    const isDone = !!progress.completed;

    const prevNext = neighborChapters(mod, chapter);

    main.innerHTML = `
      <article class="chapter">
        <div class="page-hero" style="margin-bottom:8px;">
          <div class="badge">${Utils.escapeHtml(mod.title)} · páginas ${chapter.pageStart}–${chapter.pageEnd}</div>
          <h1>${chapter.index}. ${Utils.escapeHtml(chapter.title)}</h1>
        </div>

        <div class="btn-group" style="margin-bottom: 16px;">
          <a class="btn btn--primary" href="#/capitulo/${encodeURIComponent(mod.id)}/${encodeURIComponent(chapter.id)}/quiz">${Utils.icon('quiz', 14)} Fazer exercícios</a>
          ${isDone
            ? `<button class="btn" id="mark-todo">Marcar como não lido</button>`
            : `<button class="btn" id="mark-done">${Utils.icon('check', 14)} Marcar como concluído</button>`}
          <a class="btn btn--ghost" href="#/visualizar/${encodeURIComponent(mod.id)}/${chapter.pageStart || 1}">${Utils.icon('book', 14)} Ver no PDF</a>
          <a class="btn btn--ghost" href="${PDFIngest.DOCS_DIR}${encodeURIComponent(mod.file)}" download>${Utils.icon('download', 14)} PDF original</a>
        </div>

        <div id="chapter-body"></div>

        <div class="chapter-complete-bar">
          <div>
            <strong>${isDone ? 'Capítulo concluído' : 'Ao terminar a leitura, marque como concluído.'}</strong>
            <div style="color: var(--text-muted); font-size: 13px;">Você também completa o capítulo obtendo 70%+ nos exercícios.</div>
          </div>
          <div>
            ${isDone
              ? `<span class="badge badge--success">${Utils.icon('check',12)} Concluído</span>`
              : `<button class="btn btn--primary" id="mark-done-2">Concluir capítulo</button>`}
          </div>
        </div>

        <nav class="chapter-nav" aria-label="Navegação entre capítulos">
          ${prevNext.prev ? `<a class="chapter-nav__btn" href="#/capitulo/${encodeURIComponent(prevNext.prev.moduleId)}/${encodeURIComponent(prevNext.prev.id)}"><small>Anterior</small><span>${Utils.escapeHtml(prevNext.prev.title)}</span></a>` : `<span></span>`}
          ${prevNext.next ? `<a class="chapter-nav__btn is-next" href="#/capitulo/${encodeURIComponent(prevNext.next.moduleId)}/${encodeURIComponent(prevNext.next.id)}"><small>Próximo</small><span>${Utils.escapeHtml(prevNext.next.title)}</span></a>` : `<a class="chapter-nav__btn is-next" href="#/dashboard"><small>Concluir treinamento</small><span>Ver dashboard</span></a>`}
        </nav>
      </article>
    `;

    renderBlocks(document.getElementById('chapter-body'), chapter.blocks, highlight);
    wireChapterActions(chapter);
    wireCodeCopyButtons();
  }

  function wireChapterActions(chapter) {
    document.getElementById('mark-done')?.addEventListener('click', () => {
      Storage.markChapterCompleted(chapter.id);
      Storage.addXP(15, 'chapter-completed');
      Menu.updateGlobalProgress();
      Utils.toast('Capítulo marcado como concluído.');
      Router.resolve();
    });
    document.getElementById('mark-done-2')?.addEventListener('click', () => {
      Storage.markChapterCompleted(chapter.id);
      Storage.addXP(15, 'chapter-completed');
      Menu.updateGlobalProgress();
      Utils.toast('Capítulo marcado como concluído.');
      Router.resolve();
    });
    document.getElementById('mark-todo')?.addEventListener('click', () => {
      Storage.setChapterProgress(chapter.id, { completed: false, completedAt: null });
      Menu.updateGlobalProgress();
      Utils.toast('Capítulo marcado como pendente.');
      Router.resolve();
    });
  }

  function renderBlocks(container, blocks, highlight) {
    const frag = document.createDocumentFragment();
    blocks.forEach((b) => {
      if (b.type === 'p') {
        const p = document.createElement('p');
        p.innerHTML = highlight ? Utils.highlightTerm(b.content, highlight) : Utils.escapeHtml(b.content);
        frag.appendChild(p);
      } else if (b.type === 'h2') {
        const h = document.createElement('h2');
        h.textContent = b.content;
        frag.appendChild(h);
      } else if (b.type === 'h3') {
        const h = document.createElement('h3');
        h.textContent = b.content;
        frag.appendChild(h);
      } else if (b.type === 'list') {
        const ul = document.createElement('ul');
        b.content.forEach((item) => {
          const li = document.createElement('li');
          li.innerHTML = highlight ? Utils.highlightTerm(item, highlight) : Utils.escapeHtml(item);
          ul.appendChild(li);
        });
        frag.appendChild(ul);
      } else if (b.type === 'code') {
        const box = document.createElement('div');
        box.className = 'code-block';
        box.innerHTML = `
          <div class="code-block__head">
            <span>${Utils.escapeHtml(b.lang || 'trecho')}</span>
            <button class="copy-btn" type="button" data-copy="${Utils.escapeHtml(b.content)}">Copiar</button>
          </div>
          <pre>${highlightCode(b.content)}</pre>`;
        frag.appendChild(box);
      } else if (b.type === 'callout') {
        const cls = `callout callout--${b.kind || 'info'}`;
        const el = document.createElement('div');
        el.className = cls;
        el.innerHTML = `
          <span class="callout__icon">${Utils.icon(iconForCallout(b.kind), 16)}</span>
          <div class="callout__body">
            <strong class="callout__title">${Utils.escapeHtml(b.label || 'Nota')}</strong>
            <p class="callout__text">${highlight ? Utils.highlightTerm(b.content, highlight) : Utils.escapeHtml(b.content)}</p>
          </div>`;
        frag.appendChild(el);
      }
    });
    container.innerHTML = '';
    container.appendChild(frag);

    // Se há termo, faz scroll até o primeiro <mark>
    if (highlight) {
      const first = container.querySelector('mark');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function iconForCallout(kind) {
    switch (kind) {
      case 'tip': case 'best': return 'lightbulb';
      case 'important': case 'warning': case 'error': return 'warning';
      case 'curiosity': return 'lightbulb';
      case 'example': return 'chapter';
      default: return 'info';
    }
  }

  function highlightCode(code) {
    const esc = Utils.escapeHtml(code);
    return esc
      .replace(/\/\/[^\n]*/g, (m) => `<span class="tok-cmt">${m}</span>`)
      .replace(/(["'`])((?:\\.|(?!\1).)*)\1/g, (m) => `<span class="tok-str">${m}</span>`)
      .replace(/\b(function|const|let|var|if|else|for|while|return|class|new|this|import|from|export|def|public|private)\b/g, `<span class="tok-kw">$1</span>`)
      .replace(/\b(\d+)\b/g, `<span class="tok-num">$1</span>`);
  }

  function wireCodeCopyButtons() {
    Utils.$$('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await Utils.copyToClipboard(btn.dataset.copy || '');
        Utils.toast(ok ? 'Código copiado.' : 'Não foi possível copiar.');
      });
    });
  }

  function neighborChapters(mod, chapter) {
    const idx = mod.chapters.findIndex((c) => c.id === chapter.id);
    const prevInMod = idx > 0 ? mod.chapters[idx - 1] : null;
    const nextInMod = idx < mod.chapters.length - 1 ? mod.chapters[idx + 1] : null;
    // Se não houver, tenta módulo anterior/próximo
    const modules = PDFIngest.getModules();
    const mi = modules.findIndex((m) => m.id === mod.id);
    const prev = prevInMod || (mi > 0 ? modules[mi - 1].chapters.slice(-1)[0] : null);
    const next = nextInMod || (mi < modules.length - 1 ? modules[mi + 1].chapters[0] : null);
    return { prev, next };
  }

  function renderChapterQuiz(params) {
    const mod = PDFIngest.getModule(params.mid);
    const chapter = PDFIngest.getChapter(params.cid);
    if (!chapter || !mod) { renderNotFound(); return; }
    setBreadcrumb(['Início', mod.title, chapter.title, 'Exercícios']);
    Quiz.renderChapterQuiz(chapter);
  }

  function renderNotFound() {
    const main = document.getElementById('main-content');
    setBreadcrumb(['Início', 'Não encontrado']);
    main.innerHTML = `
      <div class="empty">
        <h3>Página não encontrada</h3>
        <p>O conteúdo solicitado não existe.</p>
        <a class="btn btn--primary" href="#/">Voltar para o início</a>
      </div>`;
  }

  // ─── Breadcrumb ───────────────────────────────────────────────
  function setBreadcrumb(parts) {
    const el = document.getElementById('breadcrumb');
    if (!el) return;
    el.innerHTML = parts.map((p, i, arr) => {
      const isLast = i === arr.length - 1;
      if (isLast) return `<span class="breadcrumb__current">${Utils.escapeHtml(p)}</span>`;
      // Início sempre vai pra #/
      if (i === 0 && p.toLowerCase() === 'início') {
        return `<a href="#/">${Utils.escapeHtml(p)}</a><span class="breadcrumb__sep">/</span>`;
      }
      return `<span>${Utils.escapeHtml(p)}</span><span class="breadcrumb__sep">/</span>`;
    }).join('');
  }

  // ─── Query string helper ─────────────────────────────────────
  function parseQuery(key) {
    const hash = location.hash || '';
    const q = hash.split('?')[1];
    if (!q) return null;
    const params = new URLSearchParams(q);
    return params.get(key);
  }

  // ─── Back-to-top ────────────────────────────────────────────
  function wireBackToTop() {
    const btn = document.getElementById('back-to-top');
    const main = document.getElementById('main-content');
    if (!btn || !main) return;
    main.addEventListener('scroll', () => {
      btn.hidden = main.scrollTop < 300;
    });
    btn.addEventListener('click', () => main.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // ─── Time ticker ─────────────────────────────────────────────
  function startGlobalTimeTicker() {
    let lastActive = Date.now();
    document.addEventListener('mousemove',  () => { lastActive = Date.now(); }, { passive: true });
    document.addEventListener('keydown',    () => { lastActive = Date.now(); });
    document.addEventListener('touchstart', () => { lastActive = Date.now(); }, { passive: true });

    setInterval(() => {
      if (!currentChapterId) return;
      if (document.hidden) return;
      if (Date.now() - lastActive > 90000) return; // > 90s ocioso, pausa
      if (!location.hash.includes('/capitulo/')) return; // só conta em telas de leitura
      Storage.addChapterTime(currentChapterId, 30);
    }, 30000);
  }
})();
