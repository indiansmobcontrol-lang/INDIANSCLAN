import React, { useEffect, useState } from 'react';
import { CLAN, TAGLINE } from './config.js';
import { Emblem, Wordmark } from './components/ui.jsx';
import Overview from './pages/Overview.jsx';
import Race from './pages/Race.jsx';
import { PlayerList, Profile } from './pages/Players.jsx';
import { Kraken, Records, Ratings, Trends } from './pages/Misc.jsx';
import Admin, { Gate } from './pages/Admin.jsx';
import { isAdmin, lock } from './services/admin.js';

const NAV = [
  ['', 'Overview', '⌂', 'Clan performance at a glance'],
  ['piggy', 'Piggy Race', '🐷', 'Overall, event and week-by-week PR comparison'],
  ['space', 'Space Race', '🚀', 'Overall, event and week-by-week SR comparison'],
  ['kraken', 'Kraken', '🐙', 'Monthly damage and personal bests'],
  ['trends', 'Trends', '↗', 'Compare players over time'],
  ['ratings', 'Player Ratings', '★', 'How close each player is to the weekly leader'],
  ['players', 'Players', '●', 'Individual performance history and profiles'],
  ['records', 'Records', '♛', 'All-time personal bests'],
  ['admin', 'Data', '⚙', 'Import scores and manage players'],
];
const THEMES = ['tricolour', 'midnight'];
const useHash = () => {
  const [h, set] = useState(location.hash.slice(2));
  useEffect(() => { const f = () => { set(location.hash.slice(2)); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
};

export default function App() {
  const hash = useHash(), [open, setOpen] = useState(false), [admin, setAdmin] = useState(isAdmin());
  const [theme, setTheme] = useState(document.documentElement.dataset.theme || 'tricolour');
  const [path, qs = ''] = hash.split('?'), [root, arg] = path.split('/');
  const go = p => { location.hash = '/' + p; setOpen(false); };
  const cur = NAV.find(n => n[0] === root) || NAV[0];
  const flip = () => {
    const t = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    document.documentElement.dataset.theme = t; setTheme(t);
    try { localStorage.setItem('indians-theme', t); } catch {}
  };
  const params = new URLSearchParams(qs);
  let page;
  switch (root) {
    case 'piggy': page = <Race key={'pr' + qs} k="pr" go={go} params={params} />; break;
    case 'space': page = <Race key={'sr' + qs} k="sr" go={go} params={params} />; break;
    case 'kraken': page = <Kraken />; break;
    case 'trends': page = <Trends key={qs} params={params} />; break;
    case 'ratings': page = <Ratings go={go} />; break;
    case 'players': page = arg ? <Profile id={arg} go={go} /> : <PlayerList />; break;
    case 'records': page = <Records go={go} />; break;
    case 'admin': page = admin ? <Admin onLock={() => { lock(); setAdmin(false); go(''); }} /> : <Gate onUnlock={() => setAdmin(true)} />; break;
    default: page = <Overview go={go} />;
  }
  return (
    <div className="shell">
      <div className={'scrim' + (open ? ' on' : '')} onClick={() => setOpen(false)} />
      <nav className={'nav' + (open ? ' on' : '')} aria-label="Main menu">
        <div className="brand"><Emblem /><div><Wordmark size={21} bar /><small>{TAGLINE}</small></div></div>
        {NAV.filter(n => n[0] !== 'admin' || admin).map(([k, l, i]) => <a key={k} href={'#/' + k} className={k === cur[0] ? 'on' : ''} onClick={() => setOpen(false)}><span>{i}</span>{l}</a>)}
        <div className="src"><div className="up">Data source</div>{CLAN} weekly score log</div>
      </nav>
      <header className="hdr">
        <button className="ico menu" aria-label="Open menu" onClick={() => setOpen(true)}>☰</button>
        <div className="t"><h1>{root === 'players' && arg ? 'Player Profile' : cur[1]}</h1><small>{cur[3]}</small></div>
        <button className="ico" aria-label="Switch theme" title="Switch theme" onClick={flip}>🎨</button>
      </header>
      <main className="main">{page}</main>
    </div>
  );
}
