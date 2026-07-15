/* dashboard.js — Métricas + gráficos em Canvas (sem libs externas) */

(function (global) {
  'use strict';

  const Dashboard = {};

  Dashboard.render = function () {
    const main = document.getElementById('main-content');
    if (!main) return;

    const chapters = PDFIngest.getAllChapters();
    const progress = Storage.getProgress();
    const done = chapters.filter((c) => progress[c.id]?.completed).length;
    const remaining = chapters.length - done;
    const quizzes = Storage.getQuizHistory();
    const sims = Storage.getSimulations();
    const stats = Storage.getStats();

    // tempo estudado
    const timeStudied = Object.values(progress).reduce((s, p) => s + (p.timeSpent || 0), 0) + (stats.totalTimeSec || 0);
    // estimativa 8min por 300 palavras
    const estWords = chapters.reduce((s, c) => s + (c.wordCount || 0), 0);
    const estimateSec = Math.round((estWords / 300) * 8 * 60);

    // média dos quizzes
    const allQuizAttempts = Object.values(quizzes).flat();
    const avgPct = allQuizAttempts.length
      ? Math.round(allQuizAttempts.reduce((s, a) => s + Utils.pct(a.score, a.total), 0) / allQuizAttempts.length)
      : 0;

    main.innerHTML = `
      <div class="page-hero">
        <div class="badge badge--accent">${Utils.icon('dashboard', 12)} Dashboard</div>
        <h1>Seu progresso</h1>
        <p>Métricas e gráficos calculados localmente a partir da sua atividade.</p>
      </div>

      <div class="grid-metrics">
        <div class="card card--metric">
          <div class="card__label">Capítulos concluídos</div>
          <div class="card__value">${done}<span style="font-size:14px; color:var(--text-muted);">/${chapters.length}</span></div>
          <div class="card__sub">${remaining} restantes</div>
        </div>
        <div class="card card--metric">
          <div class="card__label">Tempo estudado</div>
          <div class="card__value">${Utils.formatDuration(timeStudied)}</div>
          <div class="card__sub">de ~${Utils.formatDuration(estimateSec)} estimados</div>
        </div>
        <div class="card card--metric">
          <div class="card__label">Média nos exercícios</div>
          <div class="card__value">${avgPct}%</div>
          <div class="card__sub">${allQuizAttempts.length} tentativas</div>
        </div>
        <div class="card card--metric">
          <div class="card__label">Simulados</div>
          <div class="card__value">${sims.length}</div>
          <div class="card__sub">${sims.length ? 'Melhor: ' + Math.max.apply(null, sims.map((s) => s.percent || 0)) + '%' : 'nenhum ainda'}</div>
        </div>
        <div class="card card--metric">
          <div class="card__label">XP</div>
          <div class="card__value">${stats.xp}</div>
          <div class="card__sub">nível ${Math.floor(stats.xp / 100) + 1}</div>
        </div>
        <div class="card card--metric">
          <div class="card__label">Sequência</div>
          <div class="card__value">${stats.streak}</div>
          <div class="card__sub">${stats.streak === 1 ? 'dia' : 'dias'} estudando</div>
        </div>
      </div>

      <div class="dashboard-row">
        <div class="card chart-card">
          <h3 class="card__title">Progresso por módulo</h3>
          <canvas id="chart-modules" height="220"></canvas>
        </div>
        <div class="card chart-card">
          <h3 class="card__title">Evolução dos simulados</h3>
          <canvas id="chart-sims" height="220"></canvas>
        </div>
      </div>

      <div class="dashboard-row">
        <div class="card chart-card">
          <h3 class="card__title">Distribuição de acertos</h3>
          <canvas id="chart-donut" height="220"></canvas>
        </div>
        <div class="card">
          <h3 class="card__title">Ranking local</h3>
          <ul class="rank-list" id="rank-list"></ul>
        </div>
      </div>

      <h2 class="section-title">Histórico de simulados</h2>
      <div class="card">
        ${sims.length === 0 ? `<p style="color: var(--text-muted); margin:0;">Você ainda não realizou nenhum simulado.</p>` : `
          <table>
            <thead><tr><th>Data</th><th>Acertos</th><th>Nota</th><th>Tempo</th></tr></thead>
            <tbody>${sims.slice(-10).reverse().map((s) => `
              <tr>
                <td>${Utils.formatDateTime(s.at)}</td>
                <td>${s.score}/${s.total}</td>
                <td>${s.percent}%</td>
                <td>${Utils.formatDuration(s.timeSec)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;

    // gráficos
    setTimeout(() => {
      drawModulesBar(document.getElementById('chart-modules'), progress);
      drawSimsLine(document.getElementById('chart-sims'), sims);
      drawDonut(document.getElementById('chart-donut'), done, remaining);
      renderRanking(document.getElementById('rank-list'));
    }, 30);
  };

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(200, Math.floor(rect.width * dpr));
    canvas.height = Math.max(200, Math.floor((canvas.height || 220) * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: canvas.height / dpr };
  }

  function drawModulesBar(canvas, progress) {
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    const accent = css('--accent');
    const border = css('--border');
    const text = css('--text-muted');

    const modules = PDFIngest.getModules();
    const data = modules.map((m) => {
      const done = m.chapters.filter((c) => progress[c.id]?.completed).length;
      return { label: m.title.length > 26 ? m.title.slice(0, 24) + '…' : m.title, value: Utils.pct(done, m.chapters.length), done, total: m.chapters.length };
    });

    ctx.clearRect(0, 0, w, h);
    if (!data.length) return;

    const padding = { top: 10, right: 12, bottom: 26, left: 200 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const rowH = Math.min(28, chartH / data.length);
    const gap = 6;

    ctx.font = '12px ' + css('--font-sans');
    ctx.textBaseline = 'middle';
    data.forEach((d, i) => {
      const y = padding.top + i * (rowH + gap);
      // label
      ctx.fillStyle = text;
      ctx.textAlign = 'right';
      ctx.fillText(d.label, padding.left - 12, y + rowH / 2);
      // trilho
      ctx.fillStyle = border;
      roundRect(ctx, padding.left, y + rowH / 2 - 5, chartW, 10, 6);
      ctx.fill();
      // preenchimento
      ctx.fillStyle = accent;
      const filled = Math.max(2, chartW * (d.value / 100));
      roundRect(ctx, padding.left, y + rowH / 2 - 5, filled, 10, 6);
      ctx.fill();
      // percentual
      ctx.fillStyle = css('--text');
      ctx.textAlign = 'left';
      ctx.fillText(`${d.value}% (${d.done}/${d.total})`, padding.left + chartW + 6, y + rowH / 2);
    });
  }

  function drawSimsLine(canvas, sims) {
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const accent = css('--accent');
    const grid = css('--border');
    const text = css('--text-muted');

    const padding = { top: 16, right: 16, bottom: 24, left: 34 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // eixos
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + chartW, y); ctx.stroke();
      ctx.fillStyle = text; ctx.font = '11px ' + css('--font-sans'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((100 - i * 25) + '%', padding.left - 6, y);
    }

    if (!sims.length) {
      ctx.fillStyle = text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Nenhum simulado realizado ainda', w / 2, h / 2);
      return;
    }
    const values = sims.map((s) => s.percent);
    const stepX = chartW / Math.max(1, values.length - 1);

    // linha
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartH * (1 - v / 100);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // pontos
    ctx.fillStyle = accent;
    values.forEach((v, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartH * (1 - v / 100);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawDonut(canvas, done, remaining) {
    if (!canvas) return;
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 16;
    const r = R - 20;
    const total = Math.max(1, done + remaining);
    const pct = done / total;

    // trilho
    ctx.fillStyle = css('--border');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = css('--surface');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    // arco preenchido
    ctx.strokeStyle = css('--accent');
    ctx.lineWidth = R - r;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(cx, cy, (R + r) / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();

    // texto central
    ctx.fillStyle = css('--text');
    ctx.font = '600 22px ' + css('--font-sans');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pct * 100) + '%', cx, cy - 6);
    ctx.fillStyle = css('--text-muted');
    ctx.font = '12px ' + css('--font-sans');
    ctx.fillText('concluído', cx, cy + 14);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderRanking(el) {
    if (!el) return;
    const list = Storage.getMyRank();
    el.innerHTML = list.slice(0, 8).map((it, i) => `
      <li class="rank-item">
        <span class="rank-item__pos ${i < 3 ? 'is-top' : ''}">${i + 1}</span>
        <span style="flex:1;">${Utils.escapeHtml(it.name)}${it.self ? ' <span class="badge badge--accent">você</span>' : ''}</span>
        <strong>${it.xp} XP</strong>
      </li>
    `).join('');
  }

  global.Dashboard = Dashboard;
})(window);
