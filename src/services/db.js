// Data layer. The UI reads and writes ONLY through this file, so swapping localStorage
// for Supabase / Firebase / a REST API later means changing this folder and nothing else.
import { seed } from '../data/seed.js';
import { validWeekId, weekRange, parseWeek, parseScore } from '../utils/format.js';
import { parseCsv } from '../utils/csv.js';

const KEY = 'indians-stats:v4';
const K = { pr: 'prScores', sr: 'srScores' };
let state = null; const subs = new Set();
const load = () => {
  if (state) return state;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; }
  return (state ||= seed());
};
const commit = () => { state = { ...state }; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} subs.forEach(f => f()); };
export const subscribe = f => (subs.add(f), () => subs.delete(f));

const rerank = (list, wid) => {
  const rk = new Map(list.filter(r => r.weekId === wid).sort((a, b) => b.score - a.score).map((r, i) => [r.playerId, i + 1]));
  return list.map(r => (r.weekId === wid ? { ...r, rank: rk.get(r.playerId) } : r));
};
// The UI reads a *view*: players marked "Left" (and their scores) are hidden and ranks recomputed.
// The raw data keeps everything, so hiding someone is reversible.
let viewSrc = null, view = null;
const makeView = s => {
  const gone = new Set(s.players.filter(p => p.status === 'Left').map(p => p.id));
  if (!gone.size) return s;
  const strip = list => { let out = list.filter(r => !gone.has(r.playerId)); new Set(list.filter(r => gone.has(r.playerId)).map(r => r.weekId)).forEach(w => (out = rerank(out, w))); return out; };
  return { ...s, players: s.players.filter(p => !gone.has(p.id)), prScores: strip(s.prScores), srScores: strip(s.srScores) };
};
export const getDb = () => { const s = load(); if (view && viewSrc === s) return view; viewSrc = s; return (view = makeView(s)); };
export const getAllPlayers = () => load().players;
export const exportJson = () => JSON.stringify(load(), null, 2);
export const resetDb = () => { try { localStorage.removeItem(KEY); } catch {} state = null; };

/** Call once before the first render. With no saved data in this browser, use the published public/data.json. */
let pubInfo = 'not checked yet';
/** Plain-English result of looking for the published data.json (shown on empty pages to help debugging). */
export const getPublishInfo = () => pubInfo;
export async function initDb() {
  try { if (localStorage.getItem(KEY)) { pubInfo = 'this browser is using its own saved data'; return; } } catch {}
  try {
    const r = await fetch(`data.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) { pubInfo = `data.json not found (HTTP ${r.status})`; return; }
    let j; try { j = await r.json(); } catch { pubInfo = 'data.json is not valid JSON'; return; }
    if (!(j && Array.isArray(j.players) && Array.isArray(j.weeks) && Array.isArray(j.prScores) && Array.isArray(j.srScores))) { pubInfo = 'data.json has the wrong format'; return; }
    state = { ...seed(), ...j };
    pubInfo = j.weeks.length ? `loaded ${j.weeks.length} weeks, ${j.players.length} players` : 'data.json was found but has no weeks yet';
  } catch { pubInfo = 'data.json could not be loaded (network problem)'; }
}

// ---------- players ----------
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const nextId = players => 'p' + String(Math.max(0, ...players.map(p => Number(p.id.slice(1)) || 0)) + 1).padStart(3, '0');
export function addPlayer(name) {
  const n = clean(name), db = load();
  if (!n) return 'Enter a name.';
  if (db.players.some(p => p.name === n)) return `"${n}" already exists.`;
  state = { ...db, players: [...db.players, { id: nextId(db.players), name: n, status: 'Active' }] }; commit(); return '';
}
export function renamePlayer(id, name) {
  const n = clean(name), db = load();
  if (!n) return 'Name cannot be empty.';
  if (db.players.some(p => p.name === n && p.id !== id)) return `"${n}" already exists.`;
  state = { ...db, players: db.players.map(p => (p.id === id ? { ...p, name: n } : p)) }; commit(); return '';
}
export function setStatus(id, status) { const db = load(); state = { ...db, players: db.players.map(p => (p.id === id ? { ...p, status } : p)) }; commit(); }
/** Permanently delete a player and all their scores; affected weeks are re-ranked. */
export function deletePlayer(id) {
  const db = load(), next = { ...db, players: db.players.filter(p => p.id !== id) };
  ['prScores', 'srScores'].forEach(t => {
    const weeks = new Set(db[t].filter(r => r.playerId === id).map(r => r.weekId));
    let list = db[t].filter(r => r.playerId !== id); weeks.forEach(w => (list = rerank(list, w))); next[t] = list;
  });
  state = next; commit();
}
/** Permanently delete a week and every score in it. */
export function deleteWeek(id) {
  const db = load();
  state = { ...db, weeks: db.weeks.filter(w => w.id !== id), prScores: db.prScores.filter(r => r.weekId !== id), srScores: db.srScores.filter(r => r.weekId !== id) }; commit();
}

// ---------- manual week form ----------
const num = v => (v === '' || v == null ? null : Number(v));
/** Create a week, or replace it when {edit:true}. rows: [{playerId, pr, sr}]. Returns a list of errors (empty = saved). */
export function saveWeek(w, rows, { edit = false } = {}) {
  const db = load(), errs = [];
  if (!validWeekId(w.id)) errs.push('Invalid week ID (expected e.g. 2026-W41).');
  if (db.weeks.some(x => x.id === w.id) && !edit) errs.push(`${w.id} already exists. Use Edit on that week instead.`);
  if (w.endDate < w.startDate) errs.push('End date is before start date.');
  const seen = new Set();
  rows.forEach(r => {
    if (!db.players.some(p => p.id === r.playerId)) errs.push(`Unknown player "${r.playerId}".`);
    if (seen.has(r.playerId)) errs.push(`Duplicate entry for ${r.playerId}.`);
    seen.add(r.playerId);
    ['pr', 'sr'].forEach(k => { const v = num(r[k]); if (v != null && !(v >= 0)) errs.push(`${k.toUpperCase()} for ${r.playerId} must be a number ≥ 0.`); });
  });
  if (errs.length) return errs;
  const left = new Set(db.players.filter(p => p.status === 'Left').map(p => p.id)); // hidden players keep their scores
  const next = { ...db, weeks: [...db.weeks.filter(x => x.id !== w.id), { id: w.id, weekNumber: Number(w.id.split('-W')[1]), startDate: w.startDate, endDate: w.endDate }] };
  ['pr', 'sr'].forEach(k => {
    const list = db[K[k]].filter(r => r.weekId !== w.id || left.has(r.playerId));
    rows.filter(r => !left.has(r.playerId)).forEach(r => { const s = num(r[k]); if (s != null) list.push({ weekId: w.id, playerId: r.playerId, score: s, rank: 0 }); });
    next[K[k]] = rerank(list, w.id);
  });
  state = next; commit(); return [];
}

// ---------- CSV import ----------
/**
 * Read a spreadsheet saved as CSV with the columns: Week, Event (PR or SR), Player, Score.
 * Nothing is saved here. Unknown names are flagged as new players; existing scores are never overwritten.
 * mapping: { "typed name": existingPlayerId } lets the user say "this new name is really that player".
 */
export function previewCsv(text, mapping = {}) {
  const db = load(), all = parseCsv(text);
  if (!all.length) return { rows: [], fatal: 'File is empty.' };
  const head = all[0].cells.map(h => h.trim().toLowerCase());
  const col = (...n) => head.findIndex(h => n.includes(h));
  const ci = { Week: col('week', 'weekid', 'week id', 'date'), Event: col('event', 'type', 'race'), Player: col('player', 'name', 'playername', 'player name', 'member'), Score: col('score', 'points', 'value') };
  const miss = Object.entries(ci).filter(([, i]) => i < 0).map(([k]) => k);
  if (miss.length) return { rows: [], fatal: `Missing column(s): ${miss.join(', ')}. The first row must have the headers: Week, Event, Player, Score.` };
  const byName = new Map(db.players.map(p => [p.name, p])), seen = new Set(), news = new Set();
  const EV = { PR: 'pr', PIGGY: 'pr', 'PIGGY RACE': 'pr', SR: 'sr', SPACE: 'sr', 'SPACE RACE': 'sr' };
  const rows = all.slice(1).map(({ line, cells }) => {
    const rawWeek = clean(cells[ci.Week]), name = clean(cells[ci.Player]), ev = EV[clean(cells[ci.Event]).toUpperCase()], score = parseScore(cells[ci.Score]);
    const weekId = parseWeek(rawWeek), issues = [];
    if (!weekId) issues.push('Unrecognised week');
    if (!ev) issues.push('Event must be PR or SR');
    if (!name) issues.push('Missing player name');
    if (score == null || Number.isNaN(score)) issues.push('Score is not a number'); else if (score < 0) issues.push('Score is negative');
    const known = mapping[name] ? db.players.find(p => p.id === mapping[name]) : byName.get(name), playerId = known?.id || null;
    if (!issues.length) {
      const key = [weekId, ev, playerId || name].join('|');
      if (seen.has(key)) issues.push('Duplicate row in file'); seen.add(key);
      if (playerId && db[K[ev]].some(r => r.weekId === weekId && r.playerId === playerId)) issues.push(`${ev.toUpperCase()} already saved for this week`);
    }
    if (name && !byName.has(name) && !issues.length) news.add(name);
    return { line, rawWeek, weekId, ev, name, score, playerId, hidden: known?.status === 'Left', isNewPlayer: !!name && !playerId, isNewWeek: !!weekId && !db.weeks.some(w => w.id === weekId), issues };
  });
  const lower = new Map(db.players.map(p => [p.name.toLowerCase(), p.name]));
  const similar = Object.fromEntries([...news].filter(n => lower.has(n.toLowerCase())).map(n => [n, lower.get(n.toLowerCase())]));
  return { rows, newNames: [...news], similar };
}
/** Save every valid row. New names become new players automatically. Returns counts. */
export function commitCsv(rows) {
  const db = load(), ok = rows.filter(r => !r.issues.length);
  const next = { ...db, players: [...db.players], weeks: [...db.weeks], prScores: [...db.prScores], srScores: [...db.srScores] };
  const made = new Map(), touched = new Set(), newWeeks = new Set();
  ok.forEach(r => {
    let pid = r.playerId;
    if (!pid && !(pid = made.get(r.name))) { pid = nextId(next.players); made.set(r.name, pid); next.players.push({ id: pid, name: r.name, status: 'Active' }); }
    if (!next.weeks.some(w => w.id === r.weekId)) { next.weeks.push({ id: r.weekId, weekNumber: Number(r.weekId.split('-W')[1]), ...weekRange(r.weekId) }); newWeeks.add(r.weekId); }
    touched.add(r.weekId);
    next[K[r.ev]].push({ weekId: r.weekId, playerId: pid, score: r.score, rank: 0 });
  });
  touched.forEach(w => { next.prScores = rerank(next.prScores, w); next.srScores = rerank(next.srScores, w); });
  state = next; commit();
  return { rows: ok.length, players: made.size, weeks: newWeeks.size };
}
