/* quiz.js — Geração automática de exercícios + renderização do quiz por capítulo
 * Namespace: window.Quiz
 * Question types: mcq, tf, fill, match, case
 */

(function (global) {
  'use strict';

  const Quiz = {};
  const bankCache = {}; // {chapterId: [questions]}

  // ─── API ──────────────────────────────────────────────────────
  Quiz.buildBank = function (chapter) {
    if (bankCache[chapter.id]) return bankCache[chapter.id];
    const q = generateForChapter(chapter);
    bankCache[chapter.id] = q;
    return q;
  };

  Quiz.getMixedBank = function () {
    const all = [];
    PDFIngest.getAllChapters().forEach((c) => {
      all.push(...Quiz.buildBank(c).map((q) => Object.assign({}, q, { chapterId: c.id, moduleId: c.moduleId })));
    });
    return all;
  };

  // ─── Renderização de tela: capítulo → exercícios ──────────────
  Quiz.renderChapterQuiz = function (chapter) {
    const main = document.getElementById('main-content');
    if (!main) return;
    const bank = Quiz.buildBank(chapter);
    if (!bank.length) {
      main.innerHTML = `<div class="empty"><h3>Sem questões geradas</h3><p>Não foi possível gerar exercícios a partir deste capítulo.</p></div>`;
      return;
    }
    const questions = Utils.sample(bank, Math.min(10, bank.length))
      .map((q) => shuffleOptions(q));

    const state = { i: 0, answers: new Array(questions.length).fill(null), startedAt: Date.now() };

    main.innerHTML = `
      <div class="page-hero">
        <div class="badge badge--accent">${Utils.icon('quiz', 12)} Exercícios do capítulo</div>
        <h1>${Utils.escapeHtml(chapter.title)}</h1>
        <p>${questions.length} questões geradas automaticamente com base neste capítulo.</p>
      </div>
      <div class="quiz" id="quiz-root"></div>
    `;
    renderQuizStep(main, questions, state, chapter);
  };

  function renderQuizStep(main, questions, state, chapter) {
    const root = main.querySelector('#quiz-root');
    if (state.i >= questions.length) {
      renderQuizResult(main, questions, state, chapter);
      return;
    }
    const q = questions[state.i];
    root.innerHTML = `
      <div class="quiz__header">
        <div class="badge">Questão ${state.i + 1} de ${questions.length}</div>
        <div class="progress" style="flex:1; margin-left:16px;">
          <div class="progress__track"><div class="progress__fill" style="width:${Utils.pct(state.i, questions.length)}%"></div></div>
        </div>
      </div>
      <div class="quiz__question" id="qbox"></div>
      <div class="btn-group" style="justify-content: space-between; display:flex;">
        <button class="btn btn--ghost" id="qskip">Pular</button>
        <button class="btn btn--primary" id="qnext" disabled>Confirmar</button>
      </div>
    `;
    renderQuestionInto(root.querySelector('#qbox'), q, state);
    const nextBtn = root.querySelector('#qnext');
    nextBtn.addEventListener('click', () => {
      commitAnswer(q, state, root.querySelector('#qbox'));
      state.i += 1;
      renderQuizStep(main, questions, state, chapter);
    });
    root.querySelector('#qskip').addEventListener('click', () => {
      state.answers[state.i] = null;
      state.i += 1;
      renderQuizStep(main, questions, state, chapter);
    });

    // Habilita "Confirmar" quando o usuário responde
    root.querySelector('#qbox').addEventListener('input', () => { nextBtn.disabled = !hasAnswer(q, root.querySelector('#qbox')); });
    root.querySelector('#qbox').addEventListener('click', () => { nextBtn.disabled = !hasAnswer(q, root.querySelector('#qbox')); });
  }

  function renderQuestionInto(container, q, state) {
    if (q.type === 'mcq' || q.type === 'tf') {
      container.innerHTML = `
        <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
        <ul class="quiz__options" role="radiogroup">
          ${q.options.map((opt, i) => `
            <li>
              <label class="quiz__option">
                <input type="radio" name="qopt" value="${i}" />
                <span>${Utils.escapeHtml(opt)}</span>
              </label>
            </li>
          `).join('')}
        </ul>
      `;
      container.querySelectorAll('input[name="qopt"]').forEach((r) => {
        r.addEventListener('change', () => {
          container.querySelectorAll('.quiz__option').forEach((el) => el.classList.remove('is-selected'));
          r.closest('.quiz__option').classList.add('is-selected');
        });
      });
      return;
    }

    if (q.type === 'fill') {
      container.innerHTML = `
        <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
        <input type="text" class="quiz__fill" placeholder="Digite sua resposta" autocomplete="off" />
      `;
      return;
    }

    if (q.type === 'match') {
      container.innerHTML = `
        <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
        <div class="quiz__match">
          <div class="quiz__match-col" data-side="left">
            ${q.left.map((t, i) => `<button class="quiz__match-item" data-i="${i}">${Utils.escapeHtml(t)}</button>`).join('')}
          </div>
          <div class="quiz__match-col" data-side="right">
            ${q.right.map((t, i) => `<button class="quiz__match-item" data-i="${i}">${Utils.escapeHtml(t)}</button>`).join('')}
          </div>
        </div>
        <input type="hidden" name="match-selection" />
      `;
      wireMatch(container, q);
      return;
    }

    if (q.type === 'case') {
      container.innerHTML = `
        <p class="quiz__prompt"><strong>Estudo de caso.</strong> ${Utils.escapeHtml(q.scenario)}</p>
        <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
        <ul class="quiz__options" role="radiogroup">
          ${q.options.map((opt, i) => `
            <li><label class="quiz__option">
              <input type="radio" name="qopt" value="${i}" />
              <span>${Utils.escapeHtml(opt)}</span>
            </label></li>`).join('')}
        </ul>
      `;
      container.querySelectorAll('input[name="qopt"]').forEach((r) => {
        r.addEventListener('change', () => {
          container.querySelectorAll('.quiz__option').forEach((el) => el.classList.remove('is-selected'));
          r.closest('.quiz__option').classList.add('is-selected');
        });
      });
    }
  }

  function wireMatch(container, q) {
    const links = {};
    let selected = null;
    const hidden = container.querySelector('input[name="match-selection"]');
    container.querySelectorAll('.quiz__match-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const side = btn.parentElement.dataset.side;
        const i = +btn.dataset.i;
        if (btn.classList.contains('is-linked')) return;
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
        // liga os dois
        selected.btn.classList.remove('is-selected');
        selected.btn.classList.add('is-linked');
        btn.classList.add('is-linked');
        const key = selected.side === 'left' ? selected.i : i;
        const val = selected.side === 'left' ? i : selected.i;
        links[key] = val;
        selected = null;
        hidden.value = JSON.stringify(links);
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  function hasAnswer(q, container) {
    if (q.type === 'mcq' || q.type === 'tf' || q.type === 'case') {
      return !!container.querySelector('input[name="qopt"]:checked');
    }
    if (q.type === 'fill') return container.querySelector('.quiz__fill')?.value.trim().length > 0;
    if (q.type === 'match') {
      const raw = container.querySelector('input[name="match-selection"]')?.value || '{}';
      try { return Object.keys(JSON.parse(raw)).length === q.left.length; } catch { return false; }
    }
    return false;
  }

  function commitAnswer(q, state, container) {
    let ans = null;
    if (q.type === 'mcq' || q.type === 'tf' || q.type === 'case') {
      const r = container.querySelector('input[name="qopt"]:checked');
      ans = r ? +r.value : null;
    } else if (q.type === 'fill') {
      ans = (container.querySelector('.quiz__fill')?.value || '').trim();
    } else if (q.type === 'match') {
      try { ans = JSON.parse(container.querySelector('input[name="match-selection"]').value); } catch { ans = null; }
    }
    state.answers[state.i] = ans;
  }

  function evaluate(q, ans) {
    if (ans == null) return false;
    if (q.type === 'mcq' || q.type === 'tf' || q.type === 'case') return ans === q.answer;
    if (q.type === 'fill') {
      const norm = (s) => Utils.stripAccents(String(s || '').toLowerCase()).trim();
      return norm(ans) === norm(q.answer);
    }
    if (q.type === 'match') {
      return Object.keys(q.answer).every((k) => ans && ans[k] === q.answer[k]);
    }
    return false;
  }

  function renderQuizResult(main, questions, state, chapter) {
    const correct = questions.reduce((n, q, i) => n + (evaluate(q, state.answers[i]) ? 1 : 0), 0);
    const pct = Utils.pct(correct, questions.length);
    const durationSec = Math.round((Date.now() - state.startedAt) / 1000);
    Storage.recordQuiz(chapter.id, { score: correct, total: questions.length, timeSec: durationSec });
    Storage.addXP(10 + correct * 5, 'quiz');
    if (pct >= 70) {
      Storage.markChapterCompleted(chapter.id);
      Menu.updateGlobalProgress();
      if (pct === 100) Storage.unlockAchievement('perfect-quiz');
    }

    const status = pct >= 70 ? { label: 'Aprovado', kind: 'success' } : { label: 'Continue estudando', kind: 'warning' };

    const main_ = document.getElementById('main-content');
    main_.innerHTML = `
      <div class="page-hero">
        <div class="badge badge--${status.kind}">${status.label}</div>
        <h1>Resultado do exercício</h1>
        <p>${Utils.escapeHtml(chapter.title)}</p>
      </div>
      <div class="grid-metrics">
        <div class="card card--metric"><div class="card__label">Acertos</div><div class="card__value">${correct}/${questions.length}</div></div>
        <div class="card card--metric"><div class="card__label">Percentual</div><div class="card__value">${pct}%</div></div>
        <div class="card card--metric"><div class="card__label">Tempo</div><div class="card__value">${Utils.formatDuration(durationSec)}</div></div>
        <div class="card card--metric"><div class="card__label">XP ganho</div><div class="card__value">+${10 + correct * 5}</div></div>
      </div>

      <h2 class="section-title">Revisão questão a questão</h2>
      <div id="review-list"></div>

      <div class="btn-group" style="margin-top: 24px;">
        <a class="btn btn--primary" href="#/capitulo/${encodeURIComponent(chapter.moduleId)}/${encodeURIComponent(chapter.id)}">Revisar este capítulo</a>
        <a class="btn" href="#/capitulo/${encodeURIComponent(chapter.moduleId)}/${encodeURIComponent(chapter.id)}/quiz">Refazer exercício</a>
      </div>
    `;
    const list = document.getElementById('review-list');
    questions.forEach((q, i) => {
      const ok = evaluate(q, state.answers[i]);
      list.appendChild(renderReviewItem(q, state.answers[i], ok, i + 1, chapter));
    });
  }

  function renderReviewItem(q, userAns, ok, num, chapter) {
    const cls = ok ? 'is-correct' : 'is-wrong';
    let bodyHtml = '';
    if (q.type === 'mcq' || q.type === 'tf' || q.type === 'case') {
      const scenarioHtml = q.type === 'case' && q.scenario ? `<p><em>${Utils.escapeHtml(q.scenario)}</em></p>` : '';
      bodyHtml = `
        ${scenarioHtml}
        <ul class="quiz__options">
          ${q.options.map((opt, i) => {
            let optCls = 'quiz__option';
            if (i === q.answer) optCls += ' is-correct';
            else if (i === userAns) optCls += ' is-wrong';
            return `<li><div class="${optCls}"><span>${Utils.escapeHtml(opt)}</span></div></li>`;
          }).join('')}
        </ul>`;
    } else if (q.type === 'fill') {
      bodyHtml = `
        <p>Sua resposta: <strong>${Utils.escapeHtml(userAns || '—')}</strong></p>
        <p>Resposta esperada: <strong>${Utils.escapeHtml(q.answer)}</strong></p>`;
    } else if (q.type === 'match') {
      bodyHtml = `<ul>${q.left.map((t, i) => `<li>${Utils.escapeHtml(t)} → <strong>${Utils.escapeHtml(q.right[q.answer[i]] || '?')}</strong></li>`).join('')}</ul>`;
    }
    const node = Utils.el('div', { class: 'card', style: 'margin-bottom: 12px;' });
    node.innerHTML = `
      <div style="display:flex; justify-content: space-between; align-items:center; gap:12px; margin-bottom:8px;">
        <strong>Questão ${num}</strong>
        <span class="badge badge--${ok ? 'success' : 'danger'}">${ok ? 'Correta' : 'Incorreta'}</span>
      </div>
      <p class="quiz__prompt">${Utils.escapeHtml(q.prompt)}</p>
      ${bodyHtml}
      ${q.explanation ? `<div class="callout callout--info"><span class="callout__icon">${Utils.icon('info',16)}</span><div class="callout__body"><strong class="callout__title">Explicação</strong><p class="callout__text">${Utils.escapeHtml(q.explanation)}</p></div></div>` : ''}
      ${q.source ? `<div class="callout callout--example"><span class="callout__icon">${Utils.icon('chapter',16)}</span><div class="callout__body"><strong class="callout__title">Trecho da apostila</strong><p class="callout__text">"${Utils.escapeHtml(q.source)}"</p><a href="#/capitulo/${encodeURIComponent(chapter.moduleId)}/${encodeURIComponent(chapter.id)}?q=${encodeURIComponent((q.source || '').slice(0,60))}" class="btn btn--sm" style="margin-top:8px;">Revisar este assunto</a></div></div>` : ''}
    `;
    return node;
  }

  function shuffleOptions(q) {
    if (!Array.isArray(q.options) || q.type === 'tf') return q; // TF mantém ordem (V/F)
    const idx = q.options.map((_, i) => i);
    const shuffled = Utils.shuffle(idx);
    const newOptions = shuffled.map((i) => q.options[i]);
    const newAnswer = shuffled.indexOf(q.answer);
    return Object.assign({}, q, { options: newOptions, answer: newAnswer });
  }

  Quiz.evaluate = evaluate;
  Quiz.shuffleOptions = shuffleOptions;

  // ─── Geração automática de banco a partir do texto do capítulo ─────
  const STOP = new Set('a o os as um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre entre e ou mas que se como quando onde qual quais é são foi foram ser estar tem têm há muito muitos muitas muita são também não sim ao à às aos pelo pela pelos pelas seu sua seus suas este esta estes estas isso aquilo já mais menos'.split(' '));

  function tokenize(text) {
    return String(text || '').toLowerCase()
      .replace(/[^a-zà-ú0-9\- ]/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function extractTerms(chapter, limit = 30) {
    const freq = {};
    const items = tokenize(chapter.text);
    items.forEach((w) => {
      if (w.length < 4) return;
      if (STOP.has(w)) return;
      if (/^\d+$/.test(w)) return;
      freq[w] = (freq[w] || 0) + 1;
    });
    // Bigramas relevantes (2 palavras seguidas)
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i], b = items[i + 1];
      if (a.length < 4 || b.length < 4) continue;
      if (STOP.has(a) || STOP.has(b)) continue;
      const bg = a + ' ' + b;
      freq[bg] = (freq[bg] || 0) + 2;
    }
    return Object.entries(freq)
      .filter(([, f]) => f >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term]) => term);
  }

  function generateForChapter(chapter) {
    const bank = [];
    const sentences = Utils.splitSentences(chapter.text);
    if (sentences.length < 3) return bank;

    const terms = extractTerms(chapter);
    const otherChapters = PDFIngest.getAllChapters().filter((c) => c.id !== chapter.id);

    // 1) MCQ com foco em termo-chave (fill-the-blank em MCQ)
    sentences.forEach((s, i) => {
      const term = terms.find((t) => new RegExp('\\b' + Utils.escapeRegex(t) + '\\b', 'i').test(s) && !STOP.has(t.split(' ')[0]));
      if (!term) return;
      if (bank.filter((q) => q.type === 'mcq').length >= 6) return;
      const blanked = s.replace(new RegExp('\\b' + Utils.escapeRegex(term) + '\\b', 'i'), '_____');
      const distractors = pickDistractors(terms, term, otherChapters, 3);
      if (distractors.length < 3) return;
      const options = Utils.shuffle([term, ...distractors]);
      bank.push({
        id: 'mcq-' + i,
        type: 'mcq',
        difficulty: pickDifficulty(s, term),
        prompt: 'Complete a frase: ' + blanked,
        options,
        answer: options.indexOf(term),
        explanation: 'A palavra correta é "' + term + '" conforme o trecho do capítulo.',
        source: s,
      });
    });

    // 2) Verdadeiro/falso (metade V, metade F a partir de trocas de termos)
    sentences.forEach((s, i) => {
      if (bank.filter((q) => q.type === 'tf').length >= 4) return;
      const term = terms.find((t) => new RegExp('\\b' + Utils.escapeRegex(t) + '\\b', 'i').test(s));
      if (!term) return;
      const flipTerm = pickDistractors(terms, term, otherChapters, 1)[0];
      const isFalse = Math.random() < 0.5 && flipTerm;
      const stmt = isFalse ? s.replace(new RegExp('\\b' + Utils.escapeRegex(term) + '\\b', 'i'), flipTerm) : s;
      bank.push({
        id: 'tf-' + i,
        type: 'tf',
        difficulty: 'facil',
        prompt: 'Julgue a afirmação: "' + stmt + '"',
        options: ['Verdadeiro', 'Falso'],
        answer: isFalse ? 1 : 0,
        explanation: isFalse
          ? `Falso. A afirmação original menciona "${term}", não "${flipTerm}".`
          : 'Verdadeiro conforme o trecho do capítulo.',
        source: s,
      });
    });

    // 3) Fill-in-the-blank textual
    sentences.forEach((s, i) => {
      if (bank.filter((q) => q.type === 'fill').length >= 3) return;
      const term = terms.find((t) => !t.includes(' ') && t.length >= 5 && new RegExp('\\b' + Utils.escapeRegex(t) + '\\b', 'i').test(s));
      if (!term) return;
      const blanked = s.replace(new RegExp('\\b' + Utils.escapeRegex(term) + '\\b', 'i'), '_____');
      bank.push({
        id: 'fill-' + i,
        type: 'fill',
        difficulty: 'medio',
        prompt: 'Preencha a lacuna: ' + blanked,
        answer: term,
        explanation: 'A palavra que completa é "' + term + '".',
        source: s,
      });
    });

    // 4) Associação (matching): termo ↔ trecho onde aparece
    const matchTerms = terms.filter((t) => !t.includes(' ')).slice(0, 4);
    if (matchTerms.length >= 3) {
      const pairs = matchTerms.map((t) => {
        const s = sentences.find((s) => new RegExp('\\b' + Utils.escapeRegex(t) + '\\b', 'i').test(s));
        if (!s) return null;
        const snippet = s.length > 90 ? s.slice(0, 87) + '…' : s;
        return { term: t, snippet };
      }).filter(Boolean);
      if (pairs.length >= 3) {
        const left = pairs.map((p) => p.term);
        const rightItems = pairs.map((p) => p.snippet);
        // right permutation
        const rightIdx = Utils.shuffle(pairs.map((_, i) => i));
        const right = rightIdx.map((i) => rightItems[i]);
        const answer = {};
        left.forEach((_, li) => { answer[li] = rightIdx.indexOf(li); });
        bank.push({
          id: 'match-1',
          type: 'match',
          difficulty: 'medio',
          prompt: 'Associe cada termo ao trecho correspondente do capítulo.',
          left, right,
          answer,
          explanation: 'Cada termo aparece exatamente no trecho indicado no material.',
        });
      }
    }

    // 5) Estudo de caso: constrói um cenário curto a partir de duas sentenças do capítulo
    if (sentences.length >= 4) {
      const s1 = Utils.pick(sentences);
      const s2 = Utils.pick(sentences.filter((s) => s !== s1));
      const correct = s1;
      const distractors = pickDistractors(sentences.filter((s) => s !== s1 && s !== s2), s1, otherChapters, 3, true);
      if (distractors.length >= 3) {
        const options = Utils.shuffle([correct, ...distractors]);
        bank.push({
          id: 'case-1',
          type: 'case',
          difficulty: 'dificil',
          scenario: `Suponha o seguinte contexto extraído do capítulo "${chapter.title}": ${s2}`,
          prompt: 'Qual das afirmações a seguir é coerente com o material?',
          options,
          answer: options.indexOf(correct),
          explanation: 'A alternativa correta corresponde a uma afirmação diretamente presente no capítulo.',
          source: s1,
        });
      }
    }

    return dedupQuestions(bank).slice(0, 20);
  }

  function pickDistractors(pool, correct, otherChapters, n, isSentence = false) {
    let candidates = pool.filter((x) => x !== correct);
    if (isSentence) {
      // adiciona sentenças de outros capítulos para não estar no atual
      otherChapters.forEach((c) => {
        Utils.splitSentences(c.text).slice(0, 5).forEach((s) => candidates.push(s));
      });
    } else {
      // adiciona termos de outros capítulos
      otherChapters.forEach((c) => {
        extractTerms(c, 8).forEach((t) => candidates.push(t));
      });
    }
    candidates = Utils.unique(candidates).filter((x) => x && x !== correct);
    return Utils.sample(candidates, n);
  }

  function pickDifficulty(sentence, term) {
    const len = Utils.wordCount(sentence);
    if (term.includes(' ')) return 'dificil';
    if (len > 24) return 'medio';
    return 'facil';
  }

  function dedupQuestions(list) {
    const seen = new Set();
    return list.filter((q) => {
      const key = q.type + '::' + (q.prompt || '').slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  global.Quiz = Quiz;
})(window);
