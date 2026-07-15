/* simulator.js — Simulado completo (30-50 questões aleatórias, cronômetro) */

(function (global) {
  'use strict';

  const Simulator = {};

  Simulator.renderIntro = function () {
    const main = document.getElementById('main-content');
    const prefs = Storage.getPrefs();
    const size = prefs.defaultSimSize || 30;
    const bank = Quiz.getMixedBank();
    main.innerHTML = `
      <div class="page-hero">
        <div class="badge badge--accent">${Utils.icon('simulator', 12)} Simulado geral</div>
        <h1>Simulado do treinamento</h1>
        <p>Selecione a quantidade de questões e o tempo. As questões são sorteadas de todos os capítulos disponíveis e as alternativas são embaralhadas.</p>
      </div>

      <div class="grid-metrics">
        <div class="card card--metric"><div class="card__label">Banco disponível</div><div class="card__value">${bank.length}</div><div class="card__sub">questões geradas</div></div>
        <div class="card card--metric"><div class="card__label">Nota mínima</div><div class="card__value">${prefs.minPassScore}%</div><div class="card__sub">para aprovação</div></div>
      </div>

      <div class="card" style="max-width:640px;">
        <h3 class="card__title">Configurar simulado</h3>
        <label style="display:block; margin: 16px 0 6px; font-size:13px; color: var(--text-muted);">Número de questões</label>
        <select id="sim-size" class="quiz__fill" style="max-width:200px;">
          <option value="30" ${size === 30 ? 'selected' : ''}>30 questões</option>
          <option value="40" ${size === 40 ? 'selected' : ''}>40 questões</option>
          <option value="50" ${size === 50 ? 'selected' : ''}>50 questões</option>
        </select>
        <label style="display:block; margin: 16px 0 6px; font-size:13px; color: var(--text-muted);">Tempo</label>
        <select id="sim-time" class="quiz__fill" style="max-width:200px;">
          <option value="30">30 minutos</option>
          <option value="45" selected>45 minutos</option>
          <option value="60">60 minutos</option>
        </select>
        <div class="btn-group" style="margin-top: 20px;">
          <button class="btn btn--primary" id="sim-start" ${bank.length < 5 ? 'disabled' : ''}>Iniciar simulado</button>
        </div>
        ${bank.length < 5 ? `<p style="color: var(--text-muted); margin-top:12px;">Estude alguns capítulos antes para gerar mais questões no banco.</p>` : ''}
      </div>
    `;

    document.getElementById('sim-start')?.addEventListener('click', () => {
      const n = +document.getElementById('sim-size').value;
      const min = +document.getElementById('sim-time').value;
      Simulator.start(n, min * 60);
    });
  };

  let running = null;

  Simulator.start = function (n, seconds) {
    const bank = Quiz.getMixedBank();
    const selected = Utils.sample(bank, Math.min(n, bank.length)).map((q) => Quiz.shuffleOptions(q));
    running = {
      questions: selected,
      answers: new Array(selected.length).fill(null),
      i: 0,
      startedAt: Date.now(),
      timeLimit: seconds,
      remaining: seconds,
    };
    tick();
    running.timer = setInterval(() => {
      running.remaining -= 1;
      const t = document.getElementById('sim-timer');
      if (t) t.textContent = Utils.formatMMSS(running.remaining);
      if (t) t.className = 'quiz__timer' + (running.remaining < 60 ? ' is-danger' : running.remaining < 300 ? ' is-warn' : '');
      if (running.remaining <= 0) {
        clearInterval(running.timer);
        finish();
      }
    }, 1000);
    render();
  };

  function tick() { /* placeholder to force initial paint */ }

  function render() {
    const main = document.getElementById('main-content');
    if (!running) return;
    const state = running;
    const q = state.questions[state.i];

    main.innerHTML = `
      <div class="quiz__timer-bar">
        <span class="badge">Questão ${state.i + 1} de ${state.questions.length}</span>
        <div class="progress" style="flex:1;">
          <div class="progress__track"><div class="progress__fill" style="width:${Utils.pct(state.i, state.questions.length)}%"></div></div>
        </div>
        <span class="quiz__timer" id="sim-timer">${Utils.formatMMSS(state.remaining)}</span>
      </div>
      <div class="quiz" id="quiz-root">
        <div class="quiz__question" id="qbox"></div>
        <div class="btn-group" style="justify-content: space-between; display:flex;">
          <div>
            <button class="btn btn--ghost" id="qprev" ${state.i === 0 ? 'disabled' : ''}>Anterior</button>
          </div>
          <div class="btn-group">
            <button class="btn" id="qsave">Salvar e próxima</button>
            ${state.i === state.questions.length - 1 ? '<button class="btn btn--primary" id="qfinish">Encerrar simulado</button>' : ''}
          </div>
        </div>
      </div>
    `;
    renderQ(q, state);
    document.getElementById('qsave')?.addEventListener('click', () => { save(state); state.i = Math.min(state.i + 1, state.questions.length - 1); render(); });
    document.getElementById('qprev')?.addEventListener('click', () => { save(state); state.i = Math.max(0, state.i - 1); render(); });
    document.getElementById('qfinish')?.addEventListener('click', () => { save(state); finish(); });
  }

  function renderQ(q, state) {
    // Reutiliza o renderizador do Quiz
    const box = document.getElementById('qbox');
    // Reimplementação simplificada — chama a mesma função interna via delegação
    const tempMain = document.createElement('div');
    tempMain.innerHTML = `<div class="quiz__question" id="qbox-inner"></div>`;
    // Como a função interna do Quiz não é exposta, replicamos aqui a renderização
    if (q.type === 'mcq' || q.type === 'tf' || q.type === 'case') {
      box.innerHTML = `
        ${q.type === 'case' ? `<p class="quiz__prompt"><strong>Estudo de caso.</strong> ${Utils.escapeHtml(q.scenario || '')}</p>` : ''}
        <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
        <ul class="quiz__options" role="radiogroup">
          ${q.options.map((opt, i) => `
            <li><label class="quiz__option${state.answers[state.i] === i ? ' is-selected' : ''}">
              <input type="radio" name="qopt" value="${i}" ${state.answers[state.i] === i ? 'checked' : ''} />
              <span>${Utils.escapeHtml(opt)}</span>
            </label></li>`).join('')}
        </ul>
      `;
      box.querySelectorAll('input[name="qopt"]').forEach((r) => {
        r.addEventListener('change', () => {
          box.querySelectorAll('.quiz__option').forEach((el) => el.classList.remove('is-selected'));
          r.closest('.quiz__option').classList.add('is-selected');
        });
      });
    } else if (q.type === 'fill') {
      box.innerHTML = `
        <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
        <input type="text" class="quiz__fill" value="${Utils.escapeHtml(state.answers[state.i] || '')}" placeholder="Digite sua resposta" autocomplete="off" />
      `;
    } else if (q.type === 'match') {
      box.innerHTML = `
        <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
        <div class="quiz__match">
          <div class="quiz__match-col" data-side="left">
            ${q.left.map((t, i) => `<button class="quiz__match-item" data-i="${i}">${Utils.escapeHtml(t)}</button>`).join('')}
          </div>
          <div class="quiz__match-col" data-side="right">
            ${q.right.map((t, i) => `<button class="quiz__match-item" data-i="${i}">${Utils.escapeHtml(t)}</button>`).join('')}
          </div>
        </div>
        <input type="hidden" name="match-selection" value='${JSON.stringify(state.answers[state.i] || {})}' />
      `;
      wireMatch(box);
    }
  }

  function wireMatch(container) {
    const hidden = container.querySelector('input[name="match-selection"]');
    let links = {};
    try { links = JSON.parse(hidden.value || '{}'); } catch { links = {}; }
    let selected = null;
    container.querySelectorAll('.quiz__match-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const side = btn.parentElement.dataset.side;
        const i = +btn.dataset.i;
        if (!selected) {
          container.querySelectorAll('.quiz__match-item').forEach((b) => b.classList.remove('is-selected'));
          btn.classList.add('is-selected');
          selected = { side, i, btn };
          return;
        }
        if (selected.side === side) {
          selected.btn.classList.remove('is-selected');
          btn.classList.add('is-selected');
          selected = { side, i, btn };
          return;
        }
        selected.btn.classList.remove('is-selected');
        selected.btn.classList.add('is-linked');
        btn.classList.add('is-linked');
        const key = selected.side === 'left' ? selected.i : i;
        const val = selected.side === 'left' ? i : selected.i;
        links[key] = val;
        selected = null;
        hidden.value = JSON.stringify(links);
      });
    });
  }

  function save(state) {
    const box = document.getElementById('qbox');
    const q = state.questions[state.i];
    if (!box) return;
    if (q.type === 'mcq' || q.type === 'tf' || q.type === 'case') {
      const r = box.querySelector('input[name="qopt"]:checked');
      state.answers[state.i] = r ? +r.value : null;
    } else if (q.type === 'fill') {
      state.answers[state.i] = (box.querySelector('.quiz__fill')?.value || '').trim();
    } else if (q.type === 'match') {
      try { state.answers[state.i] = JSON.parse(box.querySelector('input[name="match-selection"]').value); } catch { state.answers[state.i] = null; }
    }
  }

  function finish() {
    if (!running) return;
    clearInterval(running.timer);
    const state = running;
    running = null;

    const results = state.questions.map((q, i) => ({ q, a: state.answers[i], ok: Quiz.evaluate(q, state.answers[i]) }));
    const correct = results.filter((r) => r.ok).length;
    const pct = Utils.pct(correct, state.questions.length);
    const durationSec = Math.min(state.timeLimit, Math.round((Date.now() - state.startedAt) / 1000));
    Storage.recordSimulation({ score: correct, total: state.questions.length, timeSec: durationSec, percent: pct });
    Storage.addXP(20 + correct * 3, 'simulado');
    if (pct >= (Storage.getPrefs().minPassScore || 70)) Storage.unlockAchievement('sim-approved');

    // Tópicos com baixo desempenho: agrupa por moduleId
    const errorByModule = {};
    results.forEach((r) => {
      if (!r.ok && r.q.moduleId) {
        errorByModule[r.q.moduleId] = errorByModule[r.q.moduleId] || { module: r.q.moduleId, errors: 0, chapters: new Set() };
        errorByModule[r.q.moduleId].errors += 1;
        if (r.q.chapterId) errorByModule[r.q.moduleId].chapters.add(r.q.chapterId);
      }
    });
    const weakTopics = Object.values(errorByModule)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 5)
      .map((x) => {
        const mod = PDFIngest.getModule(x.module);
        return { title: mod ? mod.title : x.module, errors: x.errors, chapters: Array.from(x.chapters).map((cid) => PDFIngest.getChapter(cid)).filter(Boolean) };
      });

    const main = document.getElementById('main-content');
    const status = pct >= 70 ? { label: 'Aprovado', kind: 'success' } : { label: 'Continue estudando', kind: 'warning' };
    main.innerHTML = `
      <div class="page-hero">
        <div class="badge badge--${status.kind}">${status.label}</div>
        <h1>Resultado do simulado</h1>
        <p>Confira o desempenho por questão e os tópicos que merecem atenção.</p>
      </div>
      <div class="grid-metrics">
        <div class="card card--metric"><div class="card__label">Nota</div><div class="card__value">${pct}%</div></div>
        <div class="card card--metric"><div class="card__label">Acertos</div><div class="card__value">${correct}/${state.questions.length}</div></div>
        <div class="card card--metric"><div class="card__label">Tempo</div><div class="card__value">${Utils.formatDuration(durationSec)}</div></div>
        <div class="card card--metric"><div class="card__label">XP ganho</div><div class="card__value">+${20 + correct * 3}</div></div>
      </div>

      ${weakTopics.length ? `
        <h2 class="section-title">Tópicos com baixo desempenho</h2>
        <div class="grid-cards">
          ${weakTopics.map((t) => `
            <div class="card">
              <h3 class="card__title">${Utils.escapeHtml(t.title)}</h3>
              <p class="card__desc">${t.errors} ${t.errors === 1 ? 'erro' : 'erros'} neste módulo</p>
              <div style="margin-top:12px; display:flex; flex-direction:column; gap:6px;">
                ${t.chapters.slice(0, 5).map((c) => `<a class="btn btn--sm" href="#/capitulo/${encodeURIComponent(c.moduleId)}/${encodeURIComponent(c.id)}">Revisar: ${Utils.escapeHtml(c.title)}</a>`).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <h2 class="section-title">Revisão completa</h2>
      <div id="sim-review-list"></div>
      <div class="btn-group" style="margin-top: 24px;">
        <a class="btn btn--primary" href="#/simulado">Refazer simulado</a>
        ${pct >= (Storage.getPrefs().minPassScore || 70) ? `<a class="btn" href="#/certificado">Ver certificado</a>` : ''}
      </div>
    `;
    const list = document.getElementById('sim-review-list');
    results.forEach((r, i) => {
      const chapter = r.q.chapterId ? PDFIngest.getChapter(r.q.chapterId) : null;
      list.appendChild(renderReview(r.q, r.a, r.ok, i + 1, chapter));
    });
  }

  function renderReview(q, userAns, ok, num, chapter) {
    const node = Utils.el('div', { class: 'card', style: 'margin-bottom: 12px;' });
    let bodyHtml = '';
    if (q.type === 'mcq' || q.type === 'tf' || q.type === 'case') {
      bodyHtml = `
        ${q.type === 'case' && q.scenario ? `<p><em>${Utils.escapeHtml(q.scenario)}</em></p>` : ''}
        <ul class="quiz__options">
          ${q.options.map((opt, i) => {
            let cls = 'quiz__option';
            if (i === q.answer) cls += ' is-correct';
            else if (i === userAns) cls += ' is-wrong';
            return `<li><div class="${cls}"><span>${Utils.escapeHtml(opt)}</span></div></li>`;
          }).join('')}
        </ul>`;
    } else if (q.type === 'fill') {
      bodyHtml = `<p>Sua resposta: <strong>${Utils.escapeHtml(userAns || '—')}</strong></p><p>Resposta esperada: <strong>${Utils.escapeHtml(q.answer)}</strong></p>`;
    } else if (q.type === 'match') {
      bodyHtml = `<ul>${q.left.map((t, i) => `<li>${Utils.escapeHtml(t)} → <strong>${Utils.escapeHtml(q.right[q.answer[i]] || '?')}</strong></li>`).join('')}</ul>`;
    }
    node.innerHTML = `
      <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom:8px;">
        <strong>Questão ${num}</strong>
        <span class="badge badge--${ok ? 'success' : 'danger'}">${ok ? 'Correta' : 'Incorreta'}</span>
      </div>
      <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
      ${bodyHtml}
      ${q.explanation ? `<div class="callout callout--info"><span class="callout__icon">${Utils.icon('info',16)}</span><div class="callout__body"><strong class="callout__title">Explicação</strong><p class="callout__text">${Utils.escapeHtml(q.explanation)}</p></div></div>` : ''}
      ${chapter ? `<div class="callout callout--example"><span class="callout__icon">${Utils.icon('chapter',16)}</span><div class="callout__body"><strong class="callout__title">Estudar novamente</strong><p class="callout__text">${Utils.escapeHtml(chapter.title)}</p><a class="btn btn--sm" href="#/capitulo/${encodeURIComponent(chapter.moduleId)}/${encodeURIComponent(chapter.id)}" style="margin-top:8px;">Revisar este assunto</a></div></div>` : ''}
    `;
    return node;
  }

  global.Simulator = Simulator;
})(window);
