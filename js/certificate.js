/* certificate.js — Certificado gerado no cliente + validação local */

(function (global) {
  'use strict';

  const Certificate = {};

  Certificate.render = function (params) {
    const main = document.getElementById('main-content');
    if (!main) return;

    if (params && params.code) {
      renderValidation(main, params.code);
      return;
    }

    const prefs = Storage.getPrefs();
    const passScore = prefs.minPassScore || 70;
    const sims = Storage.getSimulations();
    const bestSim = sims.reduce((best, s) => (s.percent > (best?.percent || -1) ? s : best), null);

    const eligible = !!bestSim && bestSim.percent >= passScore;

    if (!eligible) {
      main.innerHTML = `
        <div class="page-hero">
          <div class="badge badge--warning">Ainda não disponível</div>
          <h1>Certificado</h1>
          <p>Faça um simulado com nota mínima de <strong>${passScore}%</strong> para liberar o certificado.</p>
        </div>
        <div class="card" style="max-width:680px;">
          <p>Melhor nota atual: <strong>${bestSim ? bestSim.percent + '%' : 'nenhum simulado realizado'}</strong>.</p>
          <div class="btn-group" style="margin-top:12px;">
            <a class="btn btn--primary" href="#/simulado">Ir para o simulado</a>
          </div>
        </div>`;
      return;
    }

    const profile = Storage.getProfile();
    let certs = Storage.getCertificates();
    let latest = certs[certs.length - 1];
    // Emite um novo se não existe para essa melhor nota, ou o valor mudou
    if (!latest || latest.score !== bestSim.percent) {
      latest = issueCertificate(profile, bestSim);
    }

    main.innerHTML = renderCertificateCard(latest, profile);
    wireCertificateActions(latest);
  };

  function issueCertificate(profile, bestSim) {
    const stats = Storage.getStats();
    const chaptersDone = Object.values(Storage.getProgress()).filter((p) => p.completed).length;
    const totalTimeSec = Object.values(Storage.getProgress()).reduce((s, p) => s + (p.timeSpent || 0), 0) + (stats.totalTimeSec || 0);
    const hours = Math.max(1, Math.round(totalTimeSec / 3600));
    const cert = {
      code: generateCode(),
      at: Date.now(),
      name: profile.name || 'Estudante',
      course: 'Soft skills para pessoas desenvolvedoras',
      score: bestSim.percent,
      correct: bestSim.score,
      total: bestSim.total,
      hours,
      chaptersDone,
    };
    Storage.addCertificate(cert);
    Storage.unlockAchievement('certified');
    return cert;
  }

  function generateCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 12; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
  }

  function renderCertificateCard(cert, profile) {
    const initials = (profile.initials || (profile.name || 'ES').slice(0, 2)).toUpperCase();
    return `
      <div class="page-hero" style="text-align:center;">
        <div class="badge badge--success">${Utils.icon('certificate', 12)} Certificado emitido</div>
      </div>
      <div class="certificate" id="certificate-card">
        <div class="certificate__frame">
          <p class="certificate__eyebrow">Certificado de conclusão</p>
          <h2 class="certificate__title">${Utils.escapeHtml(cert.course)}</h2>
          <p class="certificate__course">Este certificado é concedido a</p>
          <p class="certificate__name">${Utils.escapeHtml(cert.name)}</p>
          <p class="certificate__course">Por concluir o treinamento com aproveitamento mínimo exigido, demonstrando conhecimento nos temas abordados.</p>

          <dl class="certificate__grid">
            <div><dt>Data</dt><dd>${Utils.formatDate(cert.at)}</dd></div>
            <div><dt>Nota</dt><dd>${cert.score}% (${cert.correct}/${cert.total})</dd></div>
            <div><dt>Carga horária</dt><dd>${cert.hours} h</dd></div>
            <div><dt>Código</dt><dd><span style="font-family: var(--font-mono); font-size: 12px;">${Utils.escapeHtml(cert.code)}</span></dd></div>
          </dl>

          <div class="certificate__qr">
            <div id="qr-holder" aria-label="QR code de validação"></div>
            <div style="text-align:left;">
              <strong style="display:block; color: var(--text);">Validação local</strong>
              Acesse:<br/>
              <code style="font-size:11px;">#/certificado/validar/${Utils.escapeHtml(cert.code)}</code>
            </div>
          </div>
        </div>
        <div class="certificate__actions">
          <button class="btn btn--primary" id="cert-download">${Utils.icon('download', 14)} Baixar PDF</button>
          <button class="btn" id="cert-print">Imprimir</button>
          <a class="btn btn--ghost" href="#/certificado/validar/${encodeURIComponent(cert.code)}">Validar</a>
        </div>
      </div>
    `;
  }

  function wireCertificateActions(cert) {
    // Fingerprint QR
    const holder = document.getElementById('qr-holder');
    if (holder) holder.appendChild(buildFingerprint(cert.code));

    document.getElementById('cert-print')?.addEventListener('click', () => window.print());
    document.getElementById('cert-download')?.addEventListener('click', () => {
      // Sem lib de PDF: usamos print-to-PDF do navegador (funciona 100% offline)
      Utils.toast('Use a caixa de diálogo para "Salvar como PDF".');
      setTimeout(() => window.print(), 260);
    });
  }

  // "QR fingerprint" — pattern 21×21 determinístico a partir do código.
  // Não é um QR real, mas serve como marcador visual + link de validação legível.
  function buildFingerprint(code) {
    const size = 21;
    const canvas = document.createElement('canvas');
    canvas.width = size * 6; canvas.height = size * 6;
    canvas.style.width = '120px';
    canvas.style.height = '120px';
    canvas.style.background = 'white';
    canvas.style.borderRadius = '8px';
    canvas.style.padding = '6px';
    canvas.style.border = '1px solid var(--border)';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0f1120';
    // hash simples do código
    const bits = hashBits(code, size * size);
    // três "olhos" fixos como um QR
    const eye = [[0,0],[0,size-7],[size-7,0]];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let paint = bits[y * size + x] === 1;
        // eyes
        eye.forEach(([ey, ex]) => {
          const dx = x - ex, dy = y - ey;
          if (dx >= 0 && dy >= 0 && dx < 7 && dy < 7) {
            paint = (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
          }
        });
        if (paint) ctx.fillRect(x * 6, y * 6, 6, 6);
      }
    }
    return canvas;
  }

  function hashBits(str, n) {
    const bits = new Array(n).fill(0);
    let seed = 0;
    for (let i = 0; i < str.length; i++) seed = ((seed << 5) - seed + str.charCodeAt(i)) | 0;
    let s = seed || 1;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      bits[i] = (s >> 6) & 1;
    }
    return bits;
  }

  function renderValidation(main, code) {
    const certs = Storage.getCertificates();
    const found = certs.find((c) => c.code === code);
    if (!found) {
      main.innerHTML = `
        <div class="page-hero"><div class="badge badge--danger">Não encontrado</div><h1>Validação</h1></div>
        <div class="card"><p>Nenhum certificado com o código <code>${Utils.escapeHtml(code)}</code> foi encontrado neste dispositivo.</p></div>`;
      return;
    }
    main.innerHTML = `
      <div class="page-hero">
        <div class="badge badge--success">Certificado válido</div>
        <h1>Validação de certificado</h1>
        <p>Este certificado é autêntico e foi emitido neste dispositivo.</p>
      </div>
      <div class="card" style="max-width:640px;">
        <dl class="certificate__grid" style="grid-template-columns: 1fr 1fr;">
          <div><dt>Nome</dt><dd>${Utils.escapeHtml(found.name)}</dd></div>
          <div><dt>Curso</dt><dd>${Utils.escapeHtml(found.course)}</dd></div>
          <div><dt>Data</dt><dd>${Utils.formatDate(found.at)}</dd></div>
          <div><dt>Nota</dt><dd>${found.score}%</dd></div>
          <div><dt>Carga horária</dt><dd>${found.hours} h</dd></div>
          <div><dt>Código</dt><dd style="font-family: var(--font-mono); font-size: 12px;">${Utils.escapeHtml(found.code)}</dd></div>
        </dl>
        <div class="btn-group" style="margin-top:16px;">
          <a class="btn btn--primary" href="#/certificado">Ver certificado</a>
        </div>
      </div>
    `;
  }

  global.Certificate = Certificate;
})(window);
