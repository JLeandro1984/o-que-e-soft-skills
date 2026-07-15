/* pdf.js — Ingestão dos PDFs (extração de texto, segmentação em capítulos)
 * Namespace: window.PDFIngest
 * Depende de: PDF.js (window.pdfjsLib), Storage, Utils
 */

(function (global) {
  'use strict';

  const CACHE_VERSION = 4;
  const DOCS_DIR = 'aulas/'; // pasta real dos PDFs no workspace atual
  const MANIFEST_URL = DOCS_DIR + 'manifest.json';

  // ─── PDF.js worker ────────────────────────────────────────────
  if (global.pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  }

  // ─── State em memória (após ingestão) ─────────────────────────
  const state = {
    ready: false,
    modules: [],       // [{id, title, file, description, pages, chapters:[]}]
    chapters: [],      // flat list de todos os capítulos
    byId: {},          // {chapterId: chapter}
    generatedAt: 0,
  };

  // ─── API pública ──────────────────────────────────────────────
  const PDFIngest = {
    state,
    async init(onProgress) {
      // Tenta usar cache
      const cache = Storage.getPdfCache();
      if (cache && cache.version === CACHE_VERSION && cache.modules && cache.modules.length) {
        applyState(cache);
        state.ready = true;
        return state;
      }
      await runIngestion(onProgress);
      state.ready = true;
      return state;
    },
    getModule(mid)  { return state.modules.find((m) => m.id === mid); },
    getChapter(cid) { return state.byId[cid]; },
    getAllChapters() { return state.chapters; },
    getModules() { return state.modules; },
    async refresh(onProgress) {
      Storage.clearPdfCache();
      await runIngestion(onProgress);
      return state;
    },
    async fetchPdfBinary(file) {
      const res = await fetch(DOCS_DIR + file);
      if (!res.ok) throw new Error('Não foi possível carregar ' + file);
      return await res.arrayBuffer();
    },
    async renderPdfPage(file, pageNumber, scale = 1.4) {
      const bin = await this.fetchPdfBinary(file);
      const doc = await pdfjsLib.getDocument({ data: bin }).promise;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas;
    },
    DOCS_DIR,
  };

  // ─── Ingestão ────────────────────────────────────────────────
  async function runIngestion(onProgress) {
    onProgress = onProgress || (() => {});
    onProgress({ pct: 2, msg: 'Lendo manifesto…' });

    const files = await loadManifest();
    const modules = [];
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const baseProgress = 5 + (i / files.length) * 90;
      onProgress({ pct: baseProgress, msg: `Extraindo ${file}…` });

      try {
        const bin = await fetchPdf(file);
        const doc = await pdfjsLib.getDocument({ data: bin }).promise;
        const items = await extractItems(doc, (p) => {
          onProgress({ pct: baseProgress + (p / doc.numPages) * (90 / files.length), msg: `Extraindo ${file} — página ${p}/${doc.numPages}` });
        });
        const mod = buildModule(file, i, items, doc.numPages);
        modules.push(mod);
        successCount++;
      } catch (err) {
        console.warn('[PDFIngest] falha em', file, err);
        modules.push(buildFallbackModule(file, i, err));
      }
    }

    if (successCount === 0) {
      throw new Error('Não foi possível ler nenhum PDF. Verifique se os arquivos existem em aulas/ e as permissões do navegador para arquivos locais.');
    }

    onProgress({ pct: 96, msg: 'Salvando cache…' });

    const cache = {
      version: CACHE_VERSION,
      generatedAt: Date.now(),
      modules,
    };
    try {
      Storage.setPdfCache(cache);
    } catch (err) {
      console.warn('[PDFIngest] cache muito grande, seguindo em memória.', err);
    }

    applyState(cache);
    onProgress({ pct: 100, msg: 'Pronto!' });
  }

  function applyState(cache) {
    state.modules = cache.modules;
    state.generatedAt = cache.generatedAt;
    state.chapters = [];
    state.byId = {};
    cache.modules.forEach((m) => {
      m.chapters.forEach((c) => {
        state.chapters.push(c);
        state.byId[c.id] = c;
      });
    });
  }

  // ─── Manifesto ───────────────────────────────────────────────
  async function loadManifest() {
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) throw new Error('manifest ' + res.status);
      const data = await res.json();
      const files = (data.files || []).filter((f) => /\.pdf$/i.test(f));
      if (files.length) return files;
    } catch (err) {
      console.warn('[PDFIngest] manifest indisponível, tentando fallback', err);
    }
    // fallback: lista fixa baseada no workspace conhecido
    return [
      'alura_01_apostila_soft_skills_devs.pdf',
      'alura_02_apostila_9_softskills_desejadas.pdf',
      'alura_03_apostila_hacks_carreira_2026.pdf',
      'apostila_comunicacao_devs_aula01.pdf',
      'apostila_comunicacao_devs_aula02.pdf',
      'apostila_comunicacao_devs_aula03.pdf',
      'apostila_comunicacao_devs_aula04.pdf',
      'apostila_comunicacao_devs_aula05.pdf',
    ];
  }

  async function fetchPdf(file) {
    const res = await fetch(DOCS_DIR + file);
    if (!res.ok) throw new Error(`Falha ao carregar ${file}`);
    return await res.arrayBuffer();
  }

  // ─── Extração de items por página ────────────────────────────
  async function extractItems(doc, onPage) {
    const items = []; // {text, size, x, y, page, bold}
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      let lastY = null;
      tc.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const size = (it.transform && it.transform[3]) ? Math.abs(it.transform[3]) : 10;
        const x = it.transform ? it.transform[4] : 0;
        const y = it.transform ? it.transform[5] : 0;
        const font = it.fontName || '';
        const bold = /bold|black|heavy/i.test(font);
        items.push({ text: it.str, size, x, y, page: p, bold, break: lastY != null && Math.abs(y - lastY) > size * 1.5 });
        lastY = y;
      });
      onPage && onPage(p);
    }
    return items;
  }

  // ─── Reagrupar itens em linhas → detectar títulos → montar capítulos ─────
  function buildModule(file, index, items, numPages) {
    const title = filenameToTitle(file);
    const moduleId = 'm' + (index + 1) + '-' + Utils.slugify(file.replace(/\.pdf$/i, ''));

    const lines = itemsToLines(items);
    const sizes = lines.map((l) => l.size).filter((s) => s > 0);
    const bodySize = median(sizes) || 10;
    const headingCutoff = bodySize * 1.22; // > 22% acima do corpo = título

    // 1a passada: rotula cada linha
    const labeledRaw = lines.map((l) => {
      const isHead = l.size >= headingCutoff && l.text.length < 140 && !/[.]$/.test(l.text.trim());
      const isH1   = l.size >= bodySize * 1.6 && isHead;
      return Object.assign({}, l, { isHead, isH1 });
    });

    // Mescla títulos que quebram em múltiplas linhas (mesma página, mesmo tamanho, adjacentes)
    const labeled = mergeHeadingLines(labeledRaw);

    // 2a passada: detecta pontos de capítulo (H1 ou H2 relevantes)
    const anchors = [];
    labeled.forEach((l, i) => {
      if (l.isH1 || (l.isHead && !anchors.length)) anchors.push({ i, l });
    });

    // Se não achou nenhum, usa H2 heading
    if (anchors.length < 2) {
      const headings = labeled.filter((l) => l.isHead);
      headings.forEach((h) => anchors.push({ i: labeled.indexOf(h), l: h }));
    }

    // Deduplica e ordena
    const uniqueAnchors = [];
    const seen = new Set();
    anchors.sort((a, b) => a.i - b.i).forEach((a) => {
      if (!seen.has(a.i)) { seen.add(a.i); uniqueAnchors.push(a); }
    });

    // Se ainda não há âncoras, cria um único capítulo com tudo
    let chapterRanges;
    if (!uniqueAnchors.length) {
      chapterRanges = [{ start: 0, end: labeled.length, title: title }];
    } else {
      chapterRanges = uniqueAnchors.map((a, idx) => ({
        start: a.i,
        end: idx + 1 < uniqueAnchors.length ? uniqueAnchors[idx + 1].i : labeled.length,
        title: cleanTitle(a.l.text),
      }));
    }

    // Se resultou em capítulos gigantes (> 40 páginas) e apenas 1 capítulo, força split por página
    if (chapterRanges.length === 1 && numPages > 15) {
      chapterRanges = splitByPageGroups(labeled, 8);
    }

    // Constrói cada capítulo
    const rawChapters = chapterRanges.map((r, idx) => {
      const sub = labeled.slice(r.start, r.end);
      const pageStart = sub[0]?.page || 1;
      const pageEnd = sub[sub.length - 1]?.page || pageStart;
      const blocks = buildBlocks(sub, bodySize, headingCutoff);
      const plain = blocks.filter((b) => b.type !== 'code').map((b) => Array.isArray(b.content) ? b.content.join(' ') : b.content).join('\n');
      const chapterTitle = r.title && r.title.length > 3 ? r.title : `Parte ${idx + 1}`;
      return {
        title: chapterTitle,
        pageStart,
        pageEnd,
        blocks,
        text: plain,
        wordCount: Utils.wordCount(plain),
      };
    });

    // Mescla capítulos vazios (capas, subtítulos soltos) no vizinho para
    // não gerar capítulos com zero conteúdo. Preserva blocos não-título.
    const coalesced = coalesceShortChapters(rawChapters, 30);

    const chapters = coalesced.map((c, idx) => {
      const chapterId = `${moduleId}::c${idx + 1}-${Utils.slugify(c.title)}`.slice(0, 90);
      return {
        id: chapterId,
        moduleId,
        index: idx + 1,
        title: c.title,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        blocks: c.blocks,
        text: c.text,
        wordCount: c.wordCount,
      };
    });

    return {
      id: moduleId,
      title,
      file,
      description: buildDescription(file, chapters),
      pages: numPages,
      chapters,
    };
  }

  function buildFallbackModule(file, index, err) {
    const moduleId = 'm' + (index + 1) + '-' + Utils.slugify(file.replace(/\.pdf$/i, ''));
    return {
      id: moduleId,
      title: filenameToTitle(file),
      file,
      description: 'Não foi possível processar este PDF automaticamente.',
      pages: 0,
      chapters: [{
        id: moduleId + '::c1-erro',
        moduleId,
        index: 1,
        title: 'Conteúdo indisponível',
        pageStart: 1,
        pageEnd: 1,
        blocks: [{ type: 'p', content: 'Ocorreu um erro na extração: ' + (err.message || err) }],
        text: '',
        wordCount: 0,
      }],
    };
  }

  // Cabeçalho — agrupa items em linhas por página + posição Y
  function itemsToLines(items) {
    const groups = {};
    items.forEach((it) => {
      const key = it.page + ':' + Math.round(it.y);
      if (!groups[key]) groups[key] = { page: it.page, y: it.y, size: it.size, bold: it.bold, texts: [], xs: [] };
      groups[key].texts.push(it.text);
      groups[key].xs.push(it.x);
      groups[key].size = Math.max(groups[key].size, it.size);
      groups[key].bold = groups[key].bold || it.bold;
    });
    const lines = Object.values(groups).map((g) => ({
      page: g.page,
      y: g.y,
      size: g.size,
      bold: g.bold,
      xStart: Math.min.apply(null, g.xs),
      text: g.texts.join(' ').replace(/\s+/g, ' ').trim(),
    }));
    // Ordena por página asc, y desc (PDF y cresce para cima)
    lines.sort((a, b) => a.page - b.page || b.y - a.y);
    return lines.filter((l) => l.text.length > 0);
  }

  // Constrói blocos estruturais a partir das linhas
  function buildBlocks(lines, bodySize, headingCutoff) {
    const blocks = [];
    let bufferP = [];

    function flushP() {
      if (!bufferP.length) return;
      const raw = bufferP.join(' ').replace(/\s+/g, ' ').trim();
      if (!raw) { bufferP = []; return; }
      // Detecção de callouts a partir de padrões
      const callout = detectCallout(raw);
      if (callout) {
        blocks.push(callout);
      } else {
        blocks.push({ type: 'p', content: raw });
      }
      bufferP = [];
    }

    lines.forEach((l, idx) => {
      const t = l.text.replace(/\s+/g, ' ').trim();
      if (!t) return;

      // Salta índices/números soltos de página
      if (/^\d{1,3}$/.test(t)) return;

      // Título
      if (l.size >= headingCutoff * 1.4) {
        flushP();
        blocks.push({ type: 'h2', content: normalizeHeading(t) });
        return;
      }
      if (l.size >= headingCutoff) {
        flushP();
        blocks.push({ type: 'h3', content: normalizeHeading(t) });
        return;
      }

      // Bullet
      if (/^[•·●\-–—▪]\s+/.test(t) || /^[a-z]\)\s/i.test(t) || /^\d+\)\s/.test(t) || /^\d+\.\s/.test(t)) {
        flushP();
        const cleaned = t.replace(/^([•·●\-–—▪]|\d+[\.\)]|[a-z]\))\s+/i, '').trim();
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'list') {
          last.content.push(cleaned);
        } else {
          blocks.push({ type: 'list', content: [cleaned] });
        }
        return;
      }

      // Código (heurística: linha com muitos símbolos técnicos + monospace)
      if (looksLikeCode(t)) {
        flushP();
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'code') {
          last.content += '\n' + t;
        } else {
          blocks.push({ type: 'code', lang: 'plain', content: t });
        }
        return;
      }

      bufferP.push(t);
    });
    flushP();

    return blocks;
  }

  function detectCallout(text) {
    const patterns = [
      { rx: /^(dica|dicas?)[:\-]/i,           kind: 'tip',        label: 'Dica' },
      { rx: /^(importante|atenção|nota)[:\-]/i, kind: 'important', label: 'Importante' },
      { rx: /^(cuidado|aviso|alerta)[:\-]/i,   kind: 'warning',    label: 'Atenção' },
      { rx: /^(curiosidade|você sabia)[:\-]/i, kind: 'curiosity',  label: 'Curiosidade' },
      { rx: /^(exemplo|ex\.)[:\-]/i,           kind: 'example',    label: 'Exemplo' },
      { rx: /^(erro comum|antipadrão)[:\-]/i,  kind: 'error',      label: 'Erro comum' },
      { rx: /^(boas práticas|boa prática|recomendação)[:\-]/i, kind: 'best', label: 'Boas práticas' },
      { rx: /^(informação|info)[:\-]/i,        kind: 'info',       label: 'Informação' },
    ];
    for (const p of patterns) {
      if (p.rx.test(text)) {
        return { type: 'callout', kind: p.kind, label: p.label, content: text.replace(p.rx, '').trim() };
      }
    }
    return null;
  }

  function looksLikeCode(t) {
    if (t.length < 4) return false;
    if (/[{};=<>]{2,}/.test(t)) return true;
    if (/^(function|const|let|var|import|class|def |public |private |if\s*\()/.test(t)) return true;
    return false;
  }

  // Mescla capítulos com muito pouco conteúdo (típico de capas / subtítulos soltos)
  // no vizinho, preservando blocos de corpo. Preferência: absorver no próximo capítulo.
  function coalesceShortChapters(chapters, minWords) {
    if (!chapters || chapters.length <= 1) return chapters || [];
    const out = [];
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i];
      if (c.wordCount >= minWords) { out.push(c); continue; }

      // Sem vizinho útil (só um capítulo curto) → mantém como está
      const hasNext = i < chapters.length - 1;
      const hasPrev = out.length > 0;
      if (!hasNext && !hasPrev) { out.push(c); continue; }

      // Blocos que valem preservar (removemos títulos redundantes da capa)
      const extraBlocks = c.blocks.filter((b) => b.type !== 'h2' && b.type !== 'h3');
      const extraText = extraBlocks
        .map((b) => Array.isArray(b.content) ? b.content.join(' ') : b.content)
        .filter(Boolean)
        .join('\n');

      if (hasNext) {
        const next = chapters[i + 1];
        next.pageStart = Math.min(c.pageStart, next.pageStart);
        next.blocks = extraBlocks.concat(next.blocks);
        next.text = (extraText ? extraText + '\n' : '') + next.text;
        next.wordCount = Utils.wordCount(next.text);
      } else {
        const prev = out[out.length - 1];
        prev.pageEnd = Math.max(prev.pageEnd, c.pageEnd);
        prev.blocks = prev.blocks.concat(extraBlocks);
        prev.text = prev.text + (extraText ? '\n' + extraText : '');
        prev.wordCount = Utils.wordCount(prev.text);
      }
    }
    // Garante que sempre haja pelo menos um capítulo
    return out.length ? out : chapters;
  }

  function splitByPageGroups(labeled, pagesPerChunk) {
    const chunks = {};
    labeled.forEach((l) => {
      const bucket = Math.floor((l.page - 1) / pagesPerChunk);
      if (!chunks[bucket]) chunks[bucket] = [];
      chunks[bucket].push(l);
    });
    return Object.keys(chunks).sort((a, b) => +a - +b).map((k) => {
      const arr = chunks[k];
      const startIdx = labeled.indexOf(arr[0]);
      const endIdx   = labeled.indexOf(arr[arr.length - 1]) + 1;
      return {
        start: startIdx,
        end: endIdx,
        title: `Parte ${+k + 1}`,
      };
    });
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function cleanTitle(t) {
    const cleaned = String(t || '')
      .replace(/^\s*\d+[\.\)]\s+/, '')
      .replace(/\s+/g, ' ')
      .replace(/[.:;]+$/, '')
      .trim()
      .slice(0, 120);
    return toSentenceCase(cleaned);
  }

  function sentenceCase(t) {
    const lower = t.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  // Aplica sentence case preservando acrônimos comuns e nomes próprios curtos
  const KEEP_ACRONYMS = new Set(['CNV', 'AWS', 'GCP', 'CNPJ', 'RH', 'CEO', 'CTO', 'API', 'SQL', 'HTML', 'CSS', 'JS', 'TS', 'IA', 'AI', 'PDF', 'QR']);
  function toSentenceCase(t) {
    if (!t) return t;
    // Se contém letras minúsculas em quantidade razoável, mantém (não é Title Case nem CAPS)
    const hasMixedCase = /[a-zà-ú]/.test(t) && /[A-ZÀ-Ú]/.test(t);
    const words = t.split(/(\s+)/);
    const capsWords = words.filter((w) => /^[A-ZÀ-Ú][a-zà-ú]/.test(w)).length;
    const lowerWords = words.filter((w) => /^[a-zà-ú]/.test(w)).length;
    // Título já em sentence case ou frase normal → mantém
    const looksTitleCase = capsWords >= 3 && capsWords > lowerWords;
    const isAllCaps = t === t.toUpperCase() && /[A-ZÀ-Ú]/.test(t);
    if (!isAllCaps && !looksTitleCase) return t;
    // Reconstrói em sentence case preservando acrônimos
    const rebuilt = words.map((w) => {
      if (/\s+/.test(w)) return w;
      const bare = w.replace(/[^\wÀ-ú]/g, '');
      if (bare.length >= 2 && KEEP_ACRONYMS.has(bare.toUpperCase())) return w.toUpperCase();
      // Preserva palavras com números (ex: "9") ou pontuação
      return w.toLowerCase();
    }).join('');
    return rebuilt.charAt(0).toUpperCase() + rebuilt.slice(1);
  }

  function normalizeHeading(t) {
    return cleanTitle(t);
  }

  function mergeHeadingLines(labeled) {
    const out = [];
    for (let i = 0; i < labeled.length; i++) {
      const cur = labeled[i];
      out.push(cur);
      if (!cur.isHead) continue;
      // Enquanto a próxima linha for heading, mesma página, tamanho equivalente, mescla
      while (i + 1 < labeled.length) {
        const nxt = labeled[i + 1];
        if (!nxt.isHead) break;
        if (nxt.page !== cur.page) break;
        if (Math.abs(nxt.size - cur.size) > 0.5) break;
        // mescla
        cur.text = (cur.text + ' ' + nxt.text).replace(/\s+/g, ' ').trim();
        cur.isH1 = cur.isH1 || nxt.isH1;
        i += 1;
      }
    }
    return out;
  }

  function filenameToTitle(file) {
    const base = file.replace(/\.pdf$/i, '');
    // patterns
    const t = base
      .replace(/^alura[_ -]?0?(\d+)[_ -]?apostila[_ -]?/i, 'Apostila $1 — ')
      .replace(/^apostila[_ -]?/i, 'Apostila ')
      .replace(/[_-]+/g, ' ')
      .replace(/\baula\s?0?(\d+)\b/i, 'aula $1')
      .replace(/\bdevs\b/i, 'devs')
      .replace(/\s+/g, ' ')
      .trim();
    return capitalizeSentence(t);
  }

  function capitalizeSentence(t) {
    if (!t) return t;
    const lower = t.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  function buildDescription(file, chapters) {
    const n = chapters.length;
    return `Material com ${n} ${n === 1 ? 'capítulo' : 'capítulos'} extraídos automaticamente do PDF original.`;
  }

  global.PDFIngest = PDFIngest;
})(window);
