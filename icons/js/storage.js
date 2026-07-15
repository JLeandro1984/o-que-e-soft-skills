/* storage.js — Camada de persistência (localStorage) */

(function (global) {
  'use strict';

  const NS = 'ssp:'; // Soft Skills Platform
  const KEYS = {
    theme:        NS + 'theme',
    progress:     NS + 'progress',       // { chapterId: {completed:bool, timeSpent:sec, lastVisited:ts} }
    quizzes:      NS + 'quizzes',        // { chapterId: [{score, total, at}] }
    simulations:  NS + 'simulations',    // [{score, total, timeSec, at}]
    certificates: NS + 'certificates',   // [{code, at, score, hours, name}]
    profile:      NS + 'profile',        // {name, initials}
    stats:        NS + 'stats',          // {xp, streak, lastStudyDate, totalTimeSec}
    ranking:      NS + 'ranking',        // [{name, xp}]
    cache:        NS + 'pdf-cache',      // {version, chapters:{...}, generatedAt}
    prefs:        NS + 'prefs',          // {minPassScore, ...}
    achievements: NS + 'achievements',   // [id...]
  };

  const Storage = {};

  Storage.get = function (key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  };

  Storage.set = function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[Storage] falha ao gravar', key, err);
      return false;
    }
  };

  Storage.remove = function (key) {
    try { localStorage.removeItem(key); } catch (_) {}
  };

  Storage.KEYS = KEYS;

  // ─── Profile ──────────────────────────────────────────────────
  Storage.getProfile = function () {
    return Storage.get(KEYS.profile, { name: 'Estudante', initials: 'ES' });
  };
  Storage.setProfile = function (profile) {
    return Storage.set(KEYS.profile, profile);
  };

  // ─── Prefs ────────────────────────────────────────────────────
  Storage.getPrefs = function () {
    return Object.assign(
      { minPassScore: 70, defaultSimSize: 30 },
      Storage.get(KEYS.prefs, {})
    );
  };
  Storage.setPrefs = function (prefs) {
    return Storage.set(KEYS.prefs, prefs);
  };

  // ─── Progress ────────────────────────────────────────────────
  Storage.getProgress = function () {
    return Storage.get(KEYS.progress, {});
  };
  Storage.setChapterProgress = function (chapterId, patch) {
    const all = Storage.getProgress();
    all[chapterId] = Object.assign(
      { completed: false, timeSpent: 0, lastVisited: 0 },
      all[chapterId] || {},
      patch
    );
    Storage.set(KEYS.progress, all);
    return all[chapterId];
  };
  Storage.markChapterCompleted = function (chapterId) {
    return Storage.setChapterProgress(chapterId, { completed: true, completedAt: Date.now() });
  };
  Storage.addChapterTime = function (chapterId, seconds) {
    const prog = Storage.getProgress()[chapterId] || {};
    return Storage.setChapterProgress(chapterId, {
      timeSpent: (prog.timeSpent || 0) + seconds,
      lastVisited: Date.now(),
    });
  };

  // ─── Quizzes / Simulados ─────────────────────────────────────
  Storage.getQuizHistory = function () {
    return Storage.get(KEYS.quizzes, {});
  };
  Storage.recordQuiz = function (chapterId, result) {
    const all = Storage.getQuizHistory();
    all[chapterId] = all[chapterId] || [];
    all[chapterId].push(Object.assign({ at: Date.now() }, result));
    Storage.set(KEYS.quizzes, all);
  };

  Storage.getSimulations = function () {
    return Storage.get(KEYS.simulations, []);
  };
  Storage.recordSimulation = function (result) {
    const list = Storage.getSimulations();
    list.push(Object.assign({ at: Date.now() }, result));
    Storage.set(KEYS.simulations, list);
  };

  // ─── Certificados ────────────────────────────────────────────
  Storage.getCertificates = function () {
    return Storage.get(KEYS.certificates, []);
  };
  Storage.addCertificate = function (cert) {
    const list = Storage.getCertificates();
    list.push(cert);
    Storage.set(KEYS.certificates, list);
  };

  // ─── Stats & Gamificação ─────────────────────────────────────
  Storage.getStats = function () {
    return Object.assign(
      { xp: 0, streak: 0, lastStudyDate: null, totalTimeSec: 0, chaptersDone: 0 },
      Storage.get(KEYS.stats, {})
    );
  };
  Storage.setStats = function (stats) { Storage.set(KEYS.stats, stats); };

  Storage.addXP = function (amount, reason = '') {
    const stats = Storage.getStats();
    stats.xp += amount;
    Storage.setStats(stats);
    Utils.emit('xp:added', { amount, reason, total: stats.xp });
    return stats.xp;
  };

  Storage.registerStudyDay = function () {
    const stats = Storage.getStats();
    const today = new Date().toISOString().slice(0, 10);
    if (stats.lastStudyDate === today) return stats.streak;
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yISO = y.toISOString().slice(0, 10);
    stats.streak = stats.lastStudyDate === yISO ? (stats.streak || 0) + 1 : 1;
    stats.lastStudyDate = today;
    Storage.setStats(stats);
    return stats.streak;
  };

  // ─── Ranking local ──────────────────────────────────────────
  Storage.getRanking = function () {
    const list = Storage.get(KEYS.ranking, null);
    if (list) return list;
    // seed com nomes fictícios para dar contexto
    const seed = [
      { name: 'Ana',   xp: 620 },
      { name: 'Bruno', xp: 540 },
      { name: 'Carla', xp: 480 },
      { name: 'Diego', xp: 390 },
      { name: 'Eva',   xp: 300 },
    ];
    Storage.set(KEYS.ranking, seed);
    return seed;
  };
  Storage.getMyRank = function () {
    const stats = Storage.getStats();
    const profile = Storage.getProfile();
    const list = Storage.getRanking().slice();
    list.push({ name: profile.name || 'Você', xp: stats.xp, self: true });
    list.sort((a, b) => b.xp - a.xp);
    return list;
  };

  // ─── Conquistas ──────────────────────────────────────────────
  Storage.getAchievements = function () {
    return Storage.get(KEYS.achievements, []);
  };
  Storage.unlockAchievement = function (id) {
    const list = Storage.getAchievements();
    if (list.includes(id)) return false;
    list.push(id);
    Storage.set(KEYS.achievements, list);
    return true;
  };

  // ─── Cache do PDF (extração) ─────────────────────────────────
  Storage.getPdfCache = function () {
    return Storage.get(KEYS.cache, null);
  };
  Storage.setPdfCache = function (cache) {
    return Storage.set(KEYS.cache, cache);
  };
  Storage.clearPdfCache = function () {
    Storage.remove(KEYS.cache);
  };

  global.Storage = Storage;
})(window);
