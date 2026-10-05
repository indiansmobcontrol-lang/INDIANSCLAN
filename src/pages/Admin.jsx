import React, { useState } from 'react';
import { Card, useDb } from '../components/ui.jsx';
import { saveWeek, previewCsv, commitCsv, resetDb, exportJson, addPlayer, renamePlayer, setStatus, deletePlayer, deleteWeek, getAllPlayers } from '../services/db.js';
import { unlock, getToken, setToken, clearToken, getRepo, saveRepo, repoFromLocation, publishToGitHub } from '../services/admin.js';
import { weeksDesc, weekRows } from '../services/stats.js';
import { makeWeekId, weekRange, weekLabel } from '../utils/format.js';

function WeekForm({ initial, onDone }) {
  const db = useDb(), edit = !!initial, latest = weeksDesc(db)[0];
  const [num, setNum] = useState(initial?.weekNumber ?? (latest ? latest.weekNumber + 1 : 1)), [year, setYear] = useState(Number((initial?.id || latest?.id || '2026-W01').slice(0, 4)));
  const id = makeWeekId(year, num), auto = weekRange(id);
  const [dates, setDates] = useState(initial ? [initial.startDate, initial.endDate] : null);
  const [start, end] = dates || [auto.startDate, auto.endDate];
  const [rows, setRows] = useState(() => {
    if (!initial) return [];
    const m = {}; ['pr', 'sr'].forEach(k => weekRows(db, k, initial.id).forEach(r => ((m[r.playerId] ||= { playerId: r.playerId })[k] = r.score)));
    return Object.values(m);
  });
  const [errs, setErrs] = useState([]);
  const upd = (i, f, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [f]: v } : r)));
  const live = k => { const s = rows.filter(r => r[k] !== '' && r[k] != null && Number(r[k]) >= 0).sort((a, b) => b[k] - a[k]); return Object.fromEntries(s.map((r, i) => [r.playerId, i + 1])); };
  const rp = live('pr'), rs = live('sr'), free = db.players.filter(p => !rows.some(r => r.playerId === p.id));
  const save = () => { const e = saveWeek({ id, startDate: start, endDate: end }, rows, { edit }); setErrs(e); if (!e.length) onDone(); };
  return (
    <Card title={edit ? `Edit ${id}` : 'Add New Week'} sub="Ranks are calculated automatically from scores">
      <div className="stats" style={{ gridTemplateColumns: '1fr 1fr', margin: '10px 0' }}>
        <label><span className="up">Year</span><input type="number" value={year} disabled={edit} onChange={e => { setYear(+e.target.value); setDates(null); }} /></label>
        <label><span className="up">Week number</span><input type="number" min="1" max="53" value={num} disabled={edit} onChange={e => { setNum(+e.target.value); setDates(null); }} /></label>
        <label><span className="up">Start</span><input type="date" value={start} onChange={e => setDates([e.target.value, end])} /></label>
        <label><span className="up">End</span><input type="date" value={end} onChange={e => setDates([start, e.target.value])} /></label>
      </div>
      <div className="scroll"><table className="tbl"><thead><tr><th>PLAYER</th><th>PR</th><th>#</th><th>SR</th><th>#</th><th /></tr></thead><tbody>
        {rows.map((r, i) => <tr key={r.playerId}><td style={{ minWidth: 110 }}>{db.players.find(p => p.id === r.playerId)?.name || r.playerId}</td>
          <td><input style={{ width: 90 }} inputMode="numeric" aria-label="PR score" value={r.pr ?? ''} onChange={e => upd(i, 'pr', e.target.value)} /></td><td>{rp[r.playerId] || '—'}</td>
          <td><input style={{ width: 120 }} inputMode="numeric" aria-label="SR score" value={r.sr ?? ''} onChange={e => upd(i, 'sr', e.target.value)} /></td><td>{rs[r.playerId] || '—'}</td>
          <td><button className="btn g" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td></tr>)}</tbody></table></div>
      <div className="row" style={{ margin: '10px 0' }}><select value="" onChange={e => e.target.value && setRows([...rows, { playerId: e.target.value, pr: '', sr: '' }])} aria-label="Add player"><option value="">+ Add player…</option>{free.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button className="btn g" style={{ whiteSpace: 'nowrap' }} onClick={() => setRows([...rows, ...db.players.filter(p => p.status === 'Active' && !rows.some(r => r.playerId === p.id)).map(p => ({ playerId: p.id, pr: '', sr: '' }))])}>All active</button></div>
      {errs.map((e, i) => <div key={i} className="err">⚠ {e}</div>)}
      <div className="row"><button className="btn g" onClick={onDone}>Cancel</button><button className="btn" onClick={save}>{edit ? 'Save changes' : 'Save week'}</button></div>
    </Card>);
}
function Import() {
  const db = useDb();
  const [text, setText] = useState(''), [map, setMap] = useState({}), [msg, setMsg] = useState('');
  const pv = text ? previewCsv(text, map) : null;
  const good = pv?.rows?.filter(r => !r.issues.length) || [], bad = (pv?.rows?.length || 0) - good.length;
  const creating = (pv?.newNames || []).filter(n => !map[n]).length, newWeeks = [...new Set(good.filter(r => r.isNewWeek).map(r => r.weekId))];
  const load = async f => { if (!f) return; setMsg(''); setMap({}); setText(await f.text()); };
  const pick = (n, v) => setMap(m => ({ ...m, [n]: v || undefined }));
  return (
    <Card title="Import scores (CSV)" sub="Columns: Week, Event (PR or SR), Player, Score. New player names are added automatically.">
      <input type="file" accept=".csv,text/csv,.txt" onChange={e => { load(e.target.files[0]); e.target.value = ''; }} aria-label="CSV file" style={{ marginTop: 10 }} />
      {pv?.fatal && <div className="err">⚠ {pv.fatal}</div>}
      {pv?.rows?.length > 0 && <>
        <div className="note" style={{ marginTop: 10 }}><b>{good.length}</b> rows ready{bad > 0 && <> · <span className="neg"><b>{bad}</b> with problems (skipped)</span></>} · <b>{creating}</b> new player{creating === 1 ? '' : 's'} · <b>{newWeeks.length}</b> new week{newWeeks.length === 1 ? '' : 's'}{newWeeks.length > 0 && ` (${newWeeks.join(', ')})`}</div>
        {pv.newNames.length > 0 && <details style={{ marginTop: 10 }} open={db.players.length > 0 && pv.newNames.length <= 10}>
          <summary>Check new names ({pv.newNames.length}). Spelled differently? Match to an existing player</summary>
          {pv.newNames.map(n => <div key={n} className="row" style={{ margin: '6px 0' }}><span className="nm">{n}{pv.similar[n] && <small className="neg">⚠ looks like “{pv.similar[n]}”</small>}</span>
            <select style={{ maxWidth: 190 }} value={map[n] || ''} onChange={e => pick(n, e.target.value)} aria-label={`Match ${n}`}><option value="">Create new player</option>{db.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>)}
        </details>}
        <div className="scroll" style={{ maxHeight: '45vh', overflow: 'auto', marginTop: 10 }}><table className="tbl"><thead><tr><th>LINE</th><th>WEEK</th><th>EVENT</th><th>PLAYER</th><th>SCORE</th><th>STATUS</th></tr></thead><tbody>
          {pv.rows.map(r => <tr key={r.line}><td>{r.line}</td><td>{r.weekId || r.rawWeek}</td><td>{r.ev?.toUpperCase() || '?'}</td><td>{r.name}{r.isNewPlayer && !r.issues.length && <span className="pos"> ●new</span>}</td><td>{Number.isFinite(r.score) ? r.score.toLocaleString('en-US') : '?'}</td><td className={r.issues.length ? 'neg' : 'pos'}>{r.issues.length ? r.issues.join('; ') : r.hidden ? 'OK (left clan, stays hidden)' : 'OK'}</td></tr>)}</tbody></table></div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn g" onClick={() => { setText(''); setMap({}); }}>Cancel</button>
          <button className="btn" disabled={!good.length} onClick={() => { const r = commitCsv(pv.rows); setMsg(`Imported ${r.rows} scores · ${r.players} new players · ${r.weeks} new weeks.`); setText(''); setMap({}); }}>Confirm import</button></div>
        <div className="sub" style={{ marginTop: 6 }}>Existing scores are never overwritten. Problem rows are skipped: fix them in your sheet and upload again.</div></>}
      {msg && <div className="pos" style={{ marginTop: 8 }}>✓ {msg}</div>}
    </Card>);
}

function Players() {
  const db = useDb(), all = getAllPlayers(), [name, setName] = useState(''), [err, setErr] = useState('');
  const left = all.filter(p => p.status === 'Left').length;
  const del = p => { if (confirm(`Permanently delete ${p.name} and ALL of their scores?\n\nThis cannot be undone. To keep their history but hide them, set the status to "Left clan (hidden)" instead.`)) deletePlayer(p.id); };
  return (
    <Card title={`Players (${all.length - left}${left ? ` + ${left} hidden` : ''})`} sub="Added automatically from imports. Someone left? Set “Left clan (hidden)” to remove them from the site but keep the data, or Delete to erase them.">
      {all.length > 0 && <details style={{ marginTop: 10 }}><summary>Show / rename / remove players</summary>
        <div className="bd">{all.map(p => <div key={p.id} className="lr" style={{ gridTemplateColumns: '1fr', gap: 6, opacity: p.status === 'Left' ? 0.55 : 1 }}>
          <div className="row" style={{ justifyContent: 'flex-start' }}><span className="rk">{p.id}</span><b className="nm">{p.name}</b></div>
          <div className="row"><select style={{ flex: 1 }} value={p.status} onChange={e => setStatus(p.id, e.target.value)} aria-label={`Status of ${p.name}`}><option value="Active">Active</option><option value="Inactive">Inactive</option><option value="Left">Left clan (hidden)</option></select>
            <button className="btn g" onClick={() => { const n = prompt(`New name for ${p.name}:`, p.name); if (n != null) { const e = renamePlayer(p.id, n); if (e) alert(e); } }}>Rename</button>
            <button className="btn g" style={{ color: 'var(--red)' }} onClick={() => del(p)}>Delete</button></div></div>)}</div></details>}
      <div className="row" style={{ marginTop: 12 }}><input value={name} placeholder="Add a player manually…" aria-label="New player name" onChange={e => setName(e.target.value)} /><button className="btn g" onClick={() => { const e = addPlayer(name); setErr(e); if (!e) setName(''); }}>Add</button></div>
      {err && <div className="err">⚠ {err}</div>}
    </Card>);
}

export function Gate({ onUnlock }) {
  const [code, setCode] = useState(''), [err, setErr] = useState('');
  const submit = () => { if (unlock(code)) onUnlock(); else setErr('Wrong passcode.'); };
  return (
    <Card title="Owner access" sub="This page is only for the site owner. Enter the passcode to manage the data.">
      <input type="password" value={code} placeholder="Passcode" aria-label="Passcode" autoComplete="current-password" style={{ marginTop: 12 }} onChange={e => { setCode(e.target.value); setErr(''); }} onKeyDown={e => e.key === 'Enter' && submit()} />
      {err && <div className="err">⚠ {err}</div>}
      <button className="btn" style={{ marginTop: 12 }} onClick={submit}>Unlock</button>
    </Card>);
}

function Publish({ onLock }) {
  const saved = getRepo(), guess = repoFromLocation();
  const [owner, setOwner] = useState(saved.owner || guess.owner), [repo, setRepo] = useState(saved.repo || guess.repo);
  const [tok, setTok] = useState(getToken()), [draft, setDraft] = useState(''), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const publish = async () => { setBusy(true); setMsg(null); saveRepo(owner, repo); setMsg(await publishToGitHub({ owner: owner.trim(), repo: repo.trim(), token: tok })); setBusy(false); };
  const dl = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' })); a.download = 'data.json'; a.click(); };
  const copy = async () => { try { await navigator.clipboard.writeText(exportJson()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { alert('Copy failed. Use Download data.json instead.'); } };
  return (
    <Card title="Publish to the website" sub="Imports are saved only in this browser until you publish. Publishing saves them to GitHub so everyone, including your phone, sees them. Only someone with your private token can do this.">
      <div className="g2" style={{ marginTop: 12, gap: 8 }}>
        <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="GitHub username" aria-label="GitHub username" />
        <input value={repo} onChange={e => setRepo(e.target.value)} placeholder="Repository name" aria-label="Repository name" />
      </div>
      {!tok ? (
        <details style={{ marginTop: 12 }} open><summary>Set up one-click publish (do this once)</summary>
          <ol className="sub" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
            <li>On GitHub: profile picture → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
            <li>Repository access: <b>Only select repositories</b> → choose your repo.</li>
            <li>Permissions → Repository permissions → <b>Contents: Read and write</b>.</li>
            <li>Generate, copy the token and paste it below. It is stored only in this browser. Never share it.</li>
          </ol>
          <div className="row"><input type="password" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Paste token (github_pat_…)" aria-label="GitHub token" autoComplete="off" /><button className="btn g" disabled={!draft.trim()} onClick={() => { setToken(draft); setTok(draft.trim()); setDraft(''); }}>Save</button></div>
        </details>
      ) : (
        <div className="row" style={{ marginTop: 12 }}><button className="btn" disabled={busy} onClick={publish}>{busy ? 'Publishing…' : 'Publish to website'}</button><button className="btn g" onClick={() => { clearToken(); setTok(''); setMsg(null); }}>Remove token</button></div>
      )}
      {msg && <div className={msg.ok ? 'pos' : 'err'} style={{ marginTop: 10, fontSize: 13 }}>{msg.ok ? '✓ ' : '⚠ '}{msg.message}</div>}
      <details style={{ marginTop: 14 }}><summary>Manual option & backup</summary>
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap', justifyContent: 'flex-start' }}><button className="btn g" onClick={copy}>{copied ? 'Copied ✓' : 'Copy data JSON'}</button><button className="btn g" onClick={dl}>Download data.json</button>
          <button className="btn g" onClick={() => { if (confirm('Erase the data saved in this browser? (The published data.json, if any, will load instead.)')) { resetDb(); location.reload(); } }}>Erase local data</button></div>
        <div className="sub" style={{ marginTop: 8 }}>Manual publishing: paste the copied JSON into <b>public/data.json</b> on GitHub and commit.</div>
      </details>
      <button className="btn g" style={{ marginTop: 14 }} onClick={onLock}>🔒 Lock this page</button>
    </Card>);
}

export default function Admin({ onLock }) {
  const db = useDb(), [form, setForm] = useState(null);
  if (form) return <WeekForm initial={form === 'new' ? null : form} onDone={() => setForm(null)} />;
  const del = w => { const n = weekRows(db, 'pr', w.id).length + weekRows(db, 'sr', w.id).length; if (confirm(`Delete Week ${w.weekNumber} and all ${n} scores in it? This cannot be undone.`)) deleteWeek(w.id); };
  return (<>
    <Import />
    <Card title="Weeks" sub={db.weeks.length ? 'Edit fixes scores for a week. Delete removes the whole week.' : 'No weeks yet. Import a CSV above.'} right={<button className="btn g" onClick={() => setForm('new')}>+ Add manually</button>}>
      {db.weeks.length > 0 && <div className="bd">{weeksDesc(db).map(w => <div key={w.id} className="lr" style={{ gridTemplateColumns: '1fr auto auto' }}><span>{weekLabel(w)}<div className="sub">{weekRows(db, 'pr', w.id).length} PR · {weekRows(db, 'sr', w.id).length} SR</div></span>
        <button className="btn g" onClick={() => setForm(w)}>Edit</button><button className="btn g" style={{ color: 'var(--red)' }} aria-label={`Delete week ${w.weekNumber}`} onClick={() => del(w)}>✕</button></div>)}</div>}
    </Card>
    <Players />
    <Publish onLock={onLock} />
  </>);
}
