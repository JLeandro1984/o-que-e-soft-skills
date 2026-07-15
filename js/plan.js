/* plan.js — Página "Plano de estudos": objetivo, fontes originais e métricas */

(function (global) {
  'use strict';

  const Plan = {};

  // Fontes originais que deram origem às apostilas em `aulas/`.
  // Cada item liga o(s) PDF(s) ao vídeo/artigo original,
  // permitindo que o estudante confira o material de referência.
  const SOURCES = [
    {
      title: 'Soft Skills para Programadores — Código CEO',
      author: 'Código CEO (YouTube • PT-BR)',
      type: 'video',
      status: 'Assistido',
      url: 'https://www.youtube.com/watch?v=TvWwG8xSZLQ',
      files: ['alura_03_apostila_hacks_carreira_2026.pdf'],
      notes: 'Vídeo único com panorama de soft skills e hacks de carreira para pessoas desenvolvedoras.',
    },
    {
      title: 'Comunicação para Devs — como se destacar',
      author: 'YouTube • PT-BR',
      type: 'playlist',
      status: 'Assistido (5/5 videoaulas)',
      url: 'https://www.youtube.com/results?search_query=comunica%C3%A7%C3%A3o+para+devs',
      files: [
        'apostila_comunicacao_devs_aula01.pdf',
        'apostila_comunicacao_devs_aula02.pdf',
        'apostila_comunicacao_devs_aula03.pdf',
        'apostila_comunicacao_devs_aula04.pdf',
        'apostila_comunicacao_devs_aula05.pdf',
      ],
      notes: 'Série de 5 videoaulas focadas em comunicação técnica no dia a dia da pessoa desenvolvedora.',
    },
    {
      title: 'Soft Skills para Desenvolvedores — Alura',
      author: 'Alura (artigo)',
      type: 'article',
      status: 'Lido',
      url: 'https://www.alura.com.br/artigos/soft-skills-para-devs',
      files: [
        'alura_01_apostila_soft_skills_devs.pdf',
        'alura_02_apostila_9_softskills_desejadas.pdf',
      ],
      notes: 'Artigos da Alura sobre as principais soft skills desejadas em pessoas desenvolvedoras.',
    },
  ];

  const COMPETENCIAS = [
    'Comunicação técnica',
    'Colaboração',
    'Clareza nas decisões',
    'Influência técnica',
    'Postura sênior',
  ];

  const ACOES_SEMANAIS = [
    'Melhorar descrição de 1 PR (Pull Request).',
    'Explicar solução com mais clareza em reuniões.',
    'Fazer 1 code review mais detalhado.',
    'Ajudar 1 pessoa do time quando possível.',
  ];

  const METRICAS = [
    'Redução de dúvidas sobre entregas.',
    'Melhor feedback em PR/code review.',
    'Participação mais ativa em discussões.',
    'Maior autonomia nas tasks.',
  ];

  const RESULTADO = [
    'Comunicação mais clara.',
    'Maior segurança técnica.',
    'Participação ativa no time.',
    'Postura mais próxima de nível sênior.',
  ];

  Plan.render = function () {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `
      <article class="plan-page">
        <div class="page-hero">
          <div class="badge badge--accent">${Utils.icon('lightbulb', 12)} Plano de estudos</div>
          <h1>Objetivo do treinamento</h1>
          <p>Desenvolver <strong>comunicação técnica</strong> e <strong>colaboração no time</strong> para aumentar clareza,
             autonomia e influência nas decisões técnicas. As apostilas em <code>aulas/</code> foram geradas a partir
             das fontes originais listadas abaixo — sinta-se à vontade para conferir os vídeos e artigos completos.</p>
        </div>

        <section class="plan-section">
          <h2 class="section-title">${Utils.icon('quiz', 16)} Competências desenvolvidas</h2>
          <div class="plan-chips">
            ${COMPETENCIAS.map((c) => `<span class="badge badge--accent">${Utils.escapeHtml(c)}</span>`).join('')}
          </div>
        </section>

        <section class="plan-section">
          <h2 class="section-title">${Utils.icon('book', 16)} Fontes originais</h2>
          <p class="plan-lead">Cada apostila em PDF foi organizada a partir de um destes materiais.
             Os links levam ao conteúdo original em vídeo ou artigo.</p>
          <div class="grid-cards plan-sources" id="plan-sources"></div>
        </section>

        <section class="plan-section">
          <h2 class="section-title">${Utils.icon('dashboard', 16)} Plano de desenvolvimento</h2>
          <div class="plan-grid-2">
            <div class="card plan-card">
              <div class="card__label">1. Estudo</div>
              <h3 class="card__title">Baixo esforço e contínuo</h3>
              <p class="card__desc">Consumir os materiais de referência acima em blocos curtos,
                 revisitando os capítulos aqui na plataforma e reforçando com os exercícios.</p>
            </div>
            <div class="card plan-card">
              <div class="card__label">2. Aplicação prática — ações semanais</div>
              <h3 class="card__title">No trabalho</h3>
              <ul class="plan-list">
                ${ACOES_SEMANAIS.map((a) => `<li>${Utils.escapeHtml(a)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </section>

        <section class="plan-section">
          <div class="plan-grid-2">
            <div class="card plan-card">
              <div class="card__label">Métricas de evolução</div>
              <ul class="plan-list">
                ${METRICAS.map((m) => `<li>${Utils.escapeHtml(m)}</li>`).join('')}
              </ul>
            </div>
            <div class="card plan-card">
              <div class="card__label">Resultado esperado</div>
              <p class="card__desc">Ao final do período, demonstrar:</p>
              <ul class="plan-list">
                ${RESULTADO.map((r) => `<li>${Utils.escapeHtml(r)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </section>

        <section class="plan-section">
          <div class="callout callout--tip">
            <span class="callout__icon">${Utils.icon('lightbulb', 16)}</span>
            <div class="callout__body">
              <strong class="callout__title">Dica de uso</strong>
              <p class="callout__text">Comece pelo <a href="#/">Início</a> para navegar pelos módulos gerados a partir dos PDFs,
                 rode os exercícios de cada capítulo e acompanhe seu progresso no
                 <a href="#/dashboard">Dashboard</a>. Quando concluir tudo, gere seu <a href="#/certificado">Certificado</a>.</p>
            </div>
          </div>
        </section>
      </article>
    `;

    renderSources();
  };

  function renderSources() {
    const grid = document.getElementById('plan-sources');
    if (!grid) return;
    const modules = (global.PDFIngest && PDFIngest.getModules) ? PDFIngest.getModules() : [];
    const byFile = {};
    modules.forEach((m) => { if (m.file) byFile[m.file] = m; });

    SOURCES.forEach((src) => {
      const card = Utils.el('article', { class: 'module-card plan-source' });
      const typeLabel = src.type === 'video' ? 'Vídeo' : (src.type === 'playlist' ? 'Playlist' : 'Artigo');
      const typeIcon = src.type === 'article' ? 'book' : 'simulator';

      const filesHtml = src.files.map((f) => {
        const mod = byFile[f];
        if (mod) {
          return `<li><a href="#/modulo/${encodeURIComponent(mod.id)}">${Utils.escapeHtml(mod.title)}</a>
                    <small style="color: var(--text-soft);"> · ${mod.chapters.length} cap. · ${mod.pages} pág.</small></li>`;
        }
        return `<li><code>${Utils.escapeHtml(f)}</code></li>`;
      }).join('');

      card.innerHTML = `
        <div class="module-card__head">
          <div class="module-card__icon">${Utils.icon(typeIcon, 18)}</div>
          <div style="min-width:0; flex:1;">
            <h3 class="module-card__title">${Utils.escapeHtml(src.title)}</h3>
            <p class="module-card__meta">${Utils.escapeHtml(src.author)} · ${typeLabel}</p>
          </div>
          <span class="badge badge--success">${Utils.icon('check', 12)} ${Utils.escapeHtml(src.status)}</span>
        </div>
        <p class="card__desc" style="margin:0;">${Utils.escapeHtml(src.notes)}</p>
        <div class="plan-source__files">
          <div class="plan-source__label">Apostilas correspondentes</div>
          <ul class="plan-list plan-list--compact">${filesHtml}</ul>
        </div>
        <div class="plan-source__actions">
          <a class="btn btn--primary" href="${src.url}" target="_blank" rel="noopener noreferrer">
            ${Utils.icon('arrow', 14)} Abrir fonte original
          </a>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  global.Plan = Plan;
})(window);
