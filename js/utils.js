/* utils.js — Funções utilitárias globais (namespace: window.Utils) */

(function (global) {
  'use strict';

  const Utils = {};

  // ─── DOM helpers ───────────────────────────────────────────────
  Utils.$  = (sel, root = document) => root.querySelector(sel);
  Utils.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  Utils.el = function (tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class' || k === 'className') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => (node.dataset[dk] = dv));
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in node && typeof v !== 'object') node[k] = v;
      else node.setAttribute(k, v);
    });
    children.flat().forEach((child) => {
      if (child == null || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  };

  Utils.escapeHtml = function (str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  Utils.escapeRegex = function (str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // ─── Slug / IDs ────────────────────────────────────────────────
  Utils.slugify = function (str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item';
  };

  Utils.uid = function (prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  };

  // ─── Numeric / formatação ──────────────────────────────────────
  Utils.clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  Utils.pct   = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

  Utils.formatDuration = function (seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  };
  Utils.formatMMSS = function (seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  Utils.formatDate = function (ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
  };
  Utils.formatDateTime = function (ts) {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  // ─── Array helpers ─────────────────────────────────────────────
  Utils.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  Utils.sample = function (arr, n) {
    return Utils.shuffle(arr).slice(0, n);
  };
  Utils.pick = function (arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  };
  Utils.unique = (arr) => Array.from(new Set(arr));

  // ─── Debounce / throttle ───────────────────────────────────────
  Utils.debounce = function (fn, wait = 200) {
    let t;
    return function debounced(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  // ─── Toast (mensagens efêmeras) ────────────────────────────────
  let toastTimeout;
  Utils.toast = function (message, duration = 2400) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.hidden = true; }, duration);
  };

  // ─── Copiar para o clipboard ──────────────────────────────────
  Utils.copyToClipboard = async function (text) {
    try {
      if (navigator.clipboard && window.isSecureContext !== false) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fallback */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  };

  // ─── Texto: normalização/sentenças ─────────────────────────────
  Utils.stripAccents = function (s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  };

  Utils.splitSentences = function (text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.length < 320);
  };

  Utils.wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length;

  // Heurística simples de correção de espaçamento / quebras vindas de OCR
  Utils.cleanOcrText = function (raw) {
    if (!raw) return '';
    return String(raw)
      // remove hifenização de fim de linha
      .replace(/-\n/g, '')
      // preserve paragraph breaks (double newline) -> marker
      .replace(/\n{2,}/g, '\u2029')
      // single newlines dentro do parágrafo → espaço
      .replace(/\n/g, ' ')
      // devolve paragraph breaks
      .replace(/\u2029/g, '\n\n')
      // colapsa espaços múltiplos
      .replace(/[\t ]{2,}/g, ' ')
      // remove espaços antes de pontuação
      .replace(/\s+([,.;:!?])/g, '$1')
      // liga letra+letra separados por espaço perdido (raro em pt-br), evitar mudar significado
      .trim();
  };

  // ─── Highlight de trechos ──────────────────────────────────────
  Utils.highlightTerm = function (text, term) {
    if (!term) return Utils.escapeHtml(text);
    const safe = Utils.escapeHtml(text);
    const rx = new RegExp(Utils.escapeRegex(term), 'gi');
    return safe.replace(rx, (m) => `<mark>${m}</mark>`);
  };

  Utils.snippet = function (text, term, radius = 80) {
    if (!text) return '';
    if (!term) return text.slice(0, radius * 2) + (text.length > radius * 2 ? '…' : '');
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx < 0) return text.slice(0, radius * 2) + '…';
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + term.length + radius);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  };

  // ─── Eventos globais leves (pub/sub) ───────────────────────────
  const bus = document.createElement('span');
  Utils.on   = (evt, fn) => bus.addEventListener(evt, fn);
  Utils.off  = (evt, fn) => bus.removeEventListener(evt, fn);
  Utils.emit = (evt, detail) => bus.dispatchEvent(new CustomEvent(evt, { detail }));

  // ─── Ícones SVG reutilizáveis ─────────────────────────────────
  Utils.icon = function (name, size = 16) {
    const paths = {
      book:       '<path d="M4 19V5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2Z"/><path d="M6 3v18"/>',
      dashboard:  '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
      chapter:    '<path d="M4 5h16M4 12h16M4 19h10"/>',
      quiz:       '<path d="M12 3v3M12 18v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/><circle cx="12" cy="12" r="4"/>',
      simulator:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      certificate:'<path d="M4 4h16v12H4z"/><path d="M8 20l4-2 4 2v-4"/>',
      download:   '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
      home:       '<path d="m3 11 9-8 9 8v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z"/>',
      check:      '<path d="m5 12 5 5 9-11"/>',
      arrow:      '<path d="M9 6l6 6-6 6"/>',
      caret:      '<path d="m6 9 6 6 6-6"/>',
      copy:       '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
      search:     '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
      info:       '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>',
      warning:    '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v5M12 18h.01"/>',
      lightbulb:  '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 2 2 2 3v1h4v-1c0-1 1-2 2-3a6 6 0 0 0-4-10Z"/>',
    };
    const p = paths[name] || paths.info;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  };

  // ─── Timer / ticker de tempo estudado ─────────────────────────
  Utils.startTicker = function (onTick, intervalMs = 30000) {
    const id = setInterval(onTick, intervalMs);
    return () => clearInterval(id);
  };

  global.Utils = Utils;
})(window);
