/* Bowls Competition Manager — app screens (Stage 2) */
(function () {
  'use strict';
  const E = window.BowlsEngine;
  const VERSION = '0.4.1 (Stage 4)';
  const KEY = 'bowls.v1';
  const FORMAT_NAMES = { pairs: 'Pairs', trips: 'Trips', fours: 'Fours' };
  const GROUP_ORDER = ['S', 'STS', 'TS', 'SL', 'L'];

  // ---------- Storage ----------
  let state;
  function blank() { return { club: null, members: [], memory: {}, competitions: [] }; }
  function load() {
    try { state = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); }
    catch (e) { state = blank(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save on this device'); }
  }
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }

  // ---------- Helpers ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const go = h => { if (location.hash === h) render(); else location.hash = h; };
  const comp = id => state.competitions.find(c => c.id === id);
  const groupLabel = g => (E.GROUPS[g] || {}).label || '';
  const byName = (a, b) => a.name.localeCompare(b.name);
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
  function clubRinks() { return (state.club ? state.club.greens : []).flatMap(g => Array.from({ length: g.rinks }, (_, i) => g.name + (i + 1))); }
  function greenOrder() { return state.club ? state.club.greens.map(g => g.name) : []; }
  function dayName() { return new Date().toLocaleDateString('en-GB', { weekday: 'long' }); }
  function fmtDate(t) { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

  // ---------- Dialog ----------
  function dialog(html, onReady) {
    const d = document.createElement('dialog'); d.innerHTML = html; document.body.appendChild(d);
    d.addEventListener('close', () => d.remove());
    d.showModal(); if (onReady) onReady(d); return d;
  }
  function confirmBox(text, yes, cb) {
    const d = dialog(`<p style="margin-top:0">${esc(text)}</p><div class="btns"><button class="btn alt" data-x>Cancel</button><button class="btn" data-y>${esc(yes)}</button></div>`);
    d.querySelector('[data-x]').onclick = () => d.close();
    d.querySelector('[data-y]').onclick = () => { d.close(); cb(); };
  }

  // ---------- Router ----------
  let screen = {};
  window.addEventListener('hashchange', render);
  function render() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] !== 'setup' && state.club) setupDraft = null;
    if (parts[0] !== 'new') newDraft = null;
    let r;
    if (!state.club) r = setupScreen(true);
    else if (parts[0] === 'setup') r = setupScreen(false);
    else if (parts[0] === 'members') r = membersScreen();
    else if (parts[0] === 'new') r = newScreen();
    else if (parts[0] === 'backup') r = backupScreen();
    else if (parts[0] === 'comp' && comp(parts[1])) r = compScreen(comp(parts[1]), parts[2] || 'entries');
    else r = homeScreen();
    screen = r;
    $('#app').innerHTML = `
      <header class="bar">${r.back ? `<button class="back" data-act="back" aria-label="Back">‹</button>` : ''}
        <div class="titles"><div class="t">${esc(r.title)}</div>${r.sub ? `<div class="s">${esc(r.sub)}</div>` : ''}</div></header>
      <main>${r.body}</main>${r.bottom ? `<div class="bottom"><div class="inner">${r.bottom}</div></div>` : ''}`;
    if (r.after) r.after();
    window.scrollTo(0, r.keepScroll ? window.scrollY : 0);
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.closest('dialog')) return;
    const act = el.dataset.act;
    if (act === 'back') { go(screen.back); return; }
    if (act === 'go') { go(el.dataset.to); return; }
    if (screen.actions && screen.actions[act]) screen.actions[act](el, e);
  });

  // ---------- Home ----------
  function homeScreen() {
    const comps = state.competitions.slice().sort((a, b) => b.created - a.created);
    const active = state.members.filter(m => !m.left).length;
    const list = comps.length ? comps.map(c => `
      <div class="row tap" data-act="go" data-to="#comp/${c.id}">
        <div class="main"><b>${esc(c.settings.name)}</b><div class="sub">${c.settings.mode === 'tabsin' ? 'Tabs-in' : 'Fixed teams'} · ${FORMAT_NAMES[c.settings.format]} · ${c.settings.rounds} × ${c.settings.ends} ends · ${fmtDate(c.created)}</div></div>
        <span class="chip ${c.status === 'entries' ? 'grey' : ''}">${statusLabel(c)}</span><span class="chev">›</span></div>`).join('')
      : `<div class="empty">No competitions yet.</div>`;
    return {
      title: state.club.name || 'Bowls Competition Manager', sub: state.club.greens.map(g => `Green ${g.name} · ${g.rinks}`).join('   '),
      body: `
        <button class="btn" data-act="go" data-to="#new" style="margin:0 0 14px">+ New competition</button>
        <div class="card"><div class="lbl">Competitions</div>${list}</div>
        <div class="card"><div class="lbl">Club</div>
          <div class="row tap" data-act="go" data-to="#members"><div class="main">Members<div class="sub">${active} active</div></div><span class="chev">›</span></div>
          <div class="row tap" data-act="go" data-to="#setup"><div class="main">Greens &amp; rinks<div class="sub">Change greens or number of rinks</div></div><span class="chev">›</span></div>
          <div class="row tap" data-act="go" data-to="#backup"><div class="main">Backup / restore</div><span class="chev">›</span></div>
        </div>
        <div class="version">Version ${VERSION}</div>`,
    };
  }

  // ---------- Club set-up ----------
  let setupDraft = null;
  function setupScreen(first) {
    if (!setupDraft) setupDraft = state.club ? JSON.parse(JSON.stringify(state.club)) : { name: '', greens: [{ name: 'A', rinks: 6 }, { name: 'B', rinks: 6 }] };
    const d = setupDraft, total = d.greens.reduce((a, g) => a + g.rinks, 0);
    return {
      title: first ? 'Welcome — club set-up' : 'Greens & rinks', sub: first ? 'Done once. You can change it later.' : 'Club set-up', back: first ? null : '#home', keepScroll: true,
      body: `
        <div class="card"><div class="field"><label for="clubname">Club name</label><input type="text" id="clubname" value="${esc(d.name)}" placeholder="e.g. Queens Bowling Club"></div></div>
        <div class="card"><div class="lbl">Greens</div>
          ${d.greens.map((g, i) => `<div class="row">
              <input type="text" class="gname" data-i="${i}" value="${esc(g.name)}" style="width:110px" aria-label="Green name">
              <div class="stepper"><button data-act="rk" data-i="${i}" data-d="-1">−</button><b>${g.rinks}</b><button data-act="rk" data-i="${i}" data-d="1">+</button></div>
              <span class="small muted">rinks</span>
              ${d.greens.length > 1 ? `<button class="back" style="color:var(--err);font-size:22px;background:none;border:0;cursor:pointer" data-act="delg" data-i="${i}" aria-label="Remove green">✕</button>` : ''}</div>`).join('')}
          <button class="btn alt" data-act="addg">+ Add green</button>
          <p class="small muted">Name greens with a letter (A, B, C) or a short name. Rinks show as A1, A2…</p>
        </div>
        <div class="msg ok">${total} rinks in total — room for up to ${total * 2} teams.</div>`,
      bottom: `<button class="btn" data-act="save">Save</button>`,
      after() {
        $('#clubname').oninput = e => d.name = e.target.value;
        document.querySelectorAll('.gname').forEach(inp => inp.oninput = e => d.greens[+e.target.dataset.i].name = e.target.value.trim());
      },
      actions: {
        rk(el) { const g = d.greens[+el.dataset.i]; g.rinks = Math.max(1, Math.min(20, g.rinks + +el.dataset.d)); render(); },
        addg() { const used = d.greens.map(g => g.name); const n = 'ABCDEFGH'.split('').find(c => !used.includes(c)) || 'G' + (d.greens.length + 1); d.greens.push({ name: n, rinks: 6 }); render(); },
        delg(el) { d.greens.splice(+el.dataset.i, 1); render(); },
        save() {
          if (!d.name.trim()) { toast('Please enter the club name'); return; }
          const names = d.greens.map(g => g.name);
          if (names.some(n => !n || /\d$/.test(n))) { toast('Each green needs a name that does not end in a number'); return; }
          if (new Set(names).size !== names.length) { toast('Two greens have the same name'); return; }
          state.club = { name: d.name.trim(), greens: d.greens }; save(); setupDraft = null; toast('Saved'); go('#home');
        },
      },
    };
  }

  // ---------- Members ----------
  function memberDialog(m, onSaved) {
    const isNew = !m; m = m ? Object.assign({}, m) : { id: uid(), name: '', group: 'STS', seed: false, left: false };
    const d = dialog(`
      <h3 style="margin:0 0 12px">${isNew ? 'Add member' : 'Edit member'}</h3>
      <div class="field"><label>Name</label><input type="text" id="mname" value="${esc(m.name)}" autocomplete="off"></div>
      <div class="field"><label>Preferred positions</label><div class="groups">${GROUP_ORDER.map(g => `<button data-g="${g}" class="${m.group === g ? 'on' : ''}">${groupLabel(g)}</button>`).join('')}</div></div>
      <div class="row"><div class="main">Seeded player<div class="sub">Used only when a tabs-in draw is seeded</div></div><button class="tog ${m.seed ? 'on' : ''}" data-t="seed"></button></div>
      ${isNew ? '' : `<div class="row"><div class="main">Has left the club<div class="sub">Hidden from entries; kept for past results</div></div><button class="tog ${m.left ? 'on' : ''}" data-t="left"></button></div>`}
      <div class="btns" style="margin-top:8px"><button class="btn alt" data-x>Cancel</button><button class="btn" data-s>Save</button></div>
      ${isNew ? '' : `<button class="btn danger" data-del>Delete member</button>`}`, dd => { if (isNew) dd.querySelector('#mname').focus(); });
    d.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { m.group = b.dataset.g; d.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === b)); });
    d.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { m[b.dataset.t] = !m[b.dataset.t]; b.classList.toggle('on', m[b.dataset.t]); });
    d.querySelector('[data-x]').onclick = () => d.close();
    d.querySelector('[data-s]').onclick = () => {
      m.name = d.querySelector('#mname').value.trim(); if (!m.name) { toast('Please enter a name'); return; }
      const i = state.members.findIndex(x => x.id === m.id); if (i >= 0) state.members[i] = m; else state.members.push(m);
      save(); d.close(); if (onSaved) onSaved(m); else render();
    };
    const del = d.querySelector('[data-del]');
    if (del) del.onclick = () => { d.close(); confirmBox(`Delete ${m.name}? Past results keep the name.`, 'Delete', () => { state.members = state.members.filter(x => x.id !== m.id); save(); render(); }); };
  }
  function membersScreen() {
    const act = state.members.filter(m => !m.left).sort(byName), left = state.members.filter(m => m.left).sort(byName);
    const row = m => `<div class="row tap mrow" data-act="edit" data-id="${m.id}" data-n="${esc(m.name.toLowerCase())}">
        <div class="main">${esc(m.name)} ${m.seed ? '<span class="seed" title="Seeded">★</span>' : ''}</div><span class="chip">${groupLabel(m.group)}</span><span class="chev">›</span></div>`;
    return {
      title: 'Members', sub: `${act.length} active${left.length ? ` · ${left.length} left` : ''}`, back: '#home',
      body: `
        ${state.members.length > 8 ? `<input type="search" id="msearch" placeholder="Search names" style="margin-bottom:12px">` : ''}
        <div class="card">${act.length ? act.map(row).join('') : '<div class="empty">No members yet. Add them in your own time; tabs-in entry is then just ticking names.</div>'}</div>
        ${left.length ? `<div class="card"><div class="lbl">Left the club</div>${left.map(row).join('')}</div>` : ''}
        <p class="small muted">One person should keep this list and send a backup to anyone else using the app.</p>`,
      bottom: `<button class="btn" data-act="add">+ Add member</button>`,
      after() { const s = $('#msearch'); if (s) s.oninput = () => { const q = s.value.toLowerCase(); document.querySelectorAll('.mrow').forEach(r => r.style.display = r.dataset.n.includes(q) ? '' : 'none'); }; },
      actions: {
        add() { memberDialog(null); },
        edit(el) { memberDialog(state.members.find(m => m.id === el.dataset.id)); },
      },
    };
  }

  // ---------- New competition ----------
  let newDraft = null;
  function newScreen() {
    if (!newDraft) { newDraft = E.newCompetitionSettings(state.memory); if (!newDraft.name) newDraft.name = `${dayName()} ${FORMAT_NAMES[newDraft.format]}`; }
    const s = newDraft;
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-act="set" data-k="${key}" data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    return {
      title: 'New competition', sub: 'Remembers your last settings for each format', back: '#home', keepScroll: true,
      body: `
        <div class="card">
          <div class="lbl">Format</div>${seg('format', [['pairs', 'Pairs'], ['trips', 'Trips'], ['fours', 'Fours']])}
          <div class="field" style="margin-top:12px"><label for="cname">Name</label><input type="text" id="cname" value="${esc(s.name)}"></div>
        </div>
        <div class="card">
          <div class="lbl">Teams</div>${seg('mode', [['tabsin', 'Tabs-in'], ['fixed', 'Fixed teams']])}
          ${s.mode === 'tabsin' ? `<div class="lbl" style="margin-top:12px">Draw</div>${seg('draw', [['random', 'Random'], ['seeded', 'Seeded']])}` : ''}
        </div>
        <div class="card">
          <div class="row">Games<div style="width:140px">${seg('rounds', [[1, '1'], [2, '2']])}</div></div>
          <div class="row">Ends per game<div class="stepper"><button data-act="ends" data-d="-1">−</button><b>${s.ends}</b><button data-act="ends" data-d="1">+</button></div></div>
        </div>
        <div class="card"><div class="lbl">Scoring &amp; prizes</div>
          <div class="row">Points for a win / draw<button class="tog ${s.bonusOn ? 'on' : ''}" data-act="tog" data-k="bonusOn"></button></div>
          ${s.bonusOn ? `<div class="row"><div class="main">Win points<div class="sub">A draw gives ${s.bonus / 2} each</div></div><div class="stepper"><button data-act="bonus" data-d="-1">−</button><b>${s.bonus}</b><button data-act="bonus" data-d="1">+</button></div></div>` : ''}
          <div class="row">Booby prize<button class="tog ${s.booby ? 'on' : ''}" data-act="tog" data-k="booby"></button></div>
        </div>`,
      bottom: `<button class="btn" data-act="create">Create competition</button>`,
      after() { $('#cname').oninput = e => s.name = e.target.value; },
      actions: {
        set(el) {
          const k = el.dataset.k, v = k === 'rounds' ? +el.dataset.v : el.dataset.v;
          if (k === 'format' && v !== s.format) {
            newDraft = E.switchFormat(state.memory, v);
            if (!newDraft.name) newDraft.name = `${dayName()} ${FORMAT_NAMES[v]}`;
          } else s[k] = v;
          render();
        },
        tog(el) { s[el.dataset.k] = !s[el.dataset.k]; render(); },
        ends(el) { s.ends = Math.max(1, Math.min(30, s.ends + +el.dataset.d)); render(); },
        bonus(el) { s.bonus = Math.max(2, Math.min(10, s.bonus + 2 * el.dataset.d)); render(); },
        create() {
          if (!s.name.trim()) s.name = `${dayName()} ${FORMAT_NAMES[s.format]}`;
          const settings = Object.assign({}, s, { name: s.name.trim() });
          state.memory = E.rememberSettings(state.memory, settings);
          const c = { id: uid(), created: Date.now(), settings, status: 'entries', present: [], visitors: [], fixedTeams: [], rinks: [], draw: null };
          state.competitions.push(c); save(); newDraft = null; go(`#comp/${c.id}/entries`);
        },
      },
    };
  }

  // ---------- Competition ----------
  function entrants(c) { // tabs-in players
    const ms = c.present.map(id => state.members.find(m => m.id === id)).filter(Boolean);
    return ms.concat(c.visitors);
  }
  function teamCountOf(c) { return c.settings.mode === 'tabsin' ? E.tabsInCount(entrants(c).length, c.settings.format).teams : c.fixedTeams.length; }
  function checks(c) {
    return E.checkEntries({ format: c.settings.format, mode: c.settings.mode, playerCount: entrants(c).length, teamCount: c.fixedTeams.length,
      rinksInUse: c.rinks.length, rounds: c.settings.rounds });
  }
  function clearDraw(c) { c.draw = null; c.scores = {}; c.status = 'entries'; }
  function hasScores(c) { return Object.values(c.scores || {}).some(g => (g || []).some(e => e && (Number.isInteger(e.f) || Number.isInteger(e.a)))); }
  function guardDrawn(c, fn) {
    if (!c.draw) { fn(); return; }
    confirmBox(`The draw has been made${hasScores(c) ? ' and scores entered' : ''}. Changing this clears the draw${hasScores(c) ? ' and all scores' : ''} so it can be made again.`, 'Change', () => { clearDraw(c); fn(); save(); render(); });
  }
  function winPts(c) { return c.settings.bonusOn ? c.settings.bonus : 0; }
  function statusLabel(c) {
    if (!c.draw) return 'Entries';
    const n = E.cardsEntered(c.draw.teams, c.scores || {}, c.settings.rounds);
    return n === c.draw.teams.length ? 'Finished' : hasScores(c) ? 'Scoring' : 'Drawn';
  }

  function compScreen(c, tab) {
    const s = c.settings;
    const tabs = [['entries', 'Entries'], ['rinks', 'Rinks'], ['draw', 'Draw'], ['cards', 'Cards'], ['scores', 'Scores'], ['results', 'Results']];
    const head = `<div class="tabs">${tabs.map(([k, l]) => `<button data-act="go" data-to="#comp/${c.id}/${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const sub = `${s.mode === 'tabsin' ? 'Tabs-in' : 'Fixed teams'} · ${FORMAT_NAMES[s.format]} · ${s.rounds} × ${s.ends} ends${s.bonusOn ? ` · ${s.bonus} pts a win` : ''}`;
    const r = tab === 'rinks' ? rinksTab(c) : tab === 'draw' ? drawTab(c) : tab === 'cards' ? cardsTab(c) : tab === 'scores' ? scoresTab(c) : tab === 'results' ? resultsTab(c) : (s.mode === 'tabsin' ? tabsInEntries(c) : fixedEntries(c));
    r.title = s.name; r.sub = sub; r.back = '#home'; r.body = head + r.body;
    return r;
  }

  function countBar(c) {
    const s = c.settings, size = E.FORMATS[s.format].size;
    if (s.mode === 'tabsin') {
      const n = entrants(c).length, k = E.tabsInCount(n, s.format);
      return `<div class="count"><b>${n}</b> players → <b>${k.teams}</b> teams on <b>${k.rinks}</b> rinks${k.leftover ? ` · <b>${k.leftover}</b> left over (add ${k.needForNextRink} for another rink)` : ''}</div>`;
    }
    const t = c.fixedTeams.length;
    return `<div class="count"><b>${t}</b> teams → <b>${Math.floor(t / 2)}</b> rinks${t % 2 ? ' · <b>odd number</b> — one more team needed' : ''}</div>`;
  }

  function tabsInEntries(c) {
    const seeded = c.settings.draw === 'seeded';
    const active = state.members.filter(m => !m.left).sort(byName);
    const ticked = new Set(c.present);
    const row = (id, name, group, seed, visitor) => `<div class="row tap prow" data-act="${visitor ? 'delv' : 'tick'}" data-id="${id}" data-n="${esc(name.toLowerCase())}">
        ${visitor ? '<span class="check on">✓</span>' : `<span class="check ${ticked.has(id) ? 'on' : ''}">${ticked.has(id) ? '✓' : ''}</span>`}
        <div class="main">${esc(name)} ${seeded && seed ? '<span class="seed">★</span>' : ''}${visitor ? ' <span class="small muted">(visitor — tap to remove)</span>' : ''}</div><span class="chip">${groupLabel(group)}</span></div>`;
    return {
      keepScroll: true,
      body: `
        ${c.draw ? `<div class="msg warn">The draw has been made. Changing entries will clear it.</div>` : ''}
        ${active.length > 8 ? `<input type="search" id="psearch" placeholder="Search names" style="margin-bottom:12px">` : ''}
        <div class="card"><div class="lbl">Tick the players present</div>
          ${active.length ? active.map(m => row(m.id, m.name, m.group, m.seed)).join('') : `<div class="empty">No members on the list yet. Add players as visitors, or set up the members list from the home screen.</div>`}
        </div>
        ${c.visitors.length ? `<div class="card"><div class="lbl">Visitors</div>${c.visitors.map(v => row(v.id, v.name, v.group, v.seed, true)).join('')}</div>` : ''}
        <div class="btns"><button class="btn alt" data-act="visitor">+ Add visitor</button>${active.length ? `<button class="btn alt" data-act="none">Untick all</button>` : ''}</div>
        <button class="btn danger" data-act="delcomp" style="margin-top:28px">Delete this competition</button>`,
      bottom: countBar(c) + `<button class="btn" data-act="go" data-to="#comp/${c.id}/rinks" style="margin-top:0">Next: rinks</button>`,
      after() { const sb = $('#psearch'); if (sb) sb.oninput = () => { const q = sb.value.toLowerCase(); document.querySelectorAll('.prow').forEach(r => r.style.display = r.dataset.n.includes(q) ? '' : 'none'); }; },
      actions: {
        tick(el) { guardDrawn(c, () => { const id = el.dataset.id; c.present = c.present.includes(id) ? c.present.filter(x => x !== id) : c.present.concat(id); save(); render(); }); },
        none() { guardDrawn(c, () => { c.present = []; save(); render(); }); },
        delv(el) { guardDrawn(c, () => { c.visitors = c.visitors.filter(v => v.id !== el.dataset.id); save(); render(); }); },
        visitor() { guardDrawn(c, () => visitorDialog(c)); },
        delcomp() { confirmBox(`Delete “${c.settings.name}”? This cannot be undone.`, 'Delete', () => { state.competitions = state.competitions.filter(x => x.id !== c.id); save(); go('#home'); }); },
      },
    };
  }
  function visitorDialog(c) {
    const v = { id: uid(), name: '', group: 'STS', seed: false }; let keep = false;
    const d = dialog(`<h3 style="margin:0 0 12px">Add visitor</h3>
      <div class="field"><label>Name</label><input type="text" id="vname" autocomplete="off"></div>
      <div class="field"><label>Preferred positions</label><div class="groups">${GROUP_ORDER.map(g => `<button data-g="${g}" class="${v.group === g ? 'on' : ''}">${groupLabel(g)}</button>`).join('')}</div></div>
      <div class="row"><div class="main">Also save to the members list</div><button class="tog" data-keep></button></div>
      <div class="btns"><button class="btn alt" data-x>Cancel</button><button class="btn" data-s>Add</button></div>`, dd => dd.querySelector('#vname').focus());
    d.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { v.group = b.dataset.g; d.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === b)); });
    d.querySelector('[data-keep]').onclick = e => { keep = !keep; e.target.classList.toggle('on', keep); };
    d.querySelector('[data-x]').onclick = () => d.close();
    d.querySelector('[data-s]').onclick = () => {
      v.name = d.querySelector('#vname').value.trim(); if (!v.name) { toast('Please enter a name'); return; }
      if (keep) { const m = { id: v.id, name: v.name, group: v.group, seed: false, left: false }; state.members.push(m); c.present.push(m.id); }
      else c.visitors.push(v);
      save(); d.close(); render();
    };
  }

  function fixedEntries(c) {
    const names = state.members.filter(m => !m.left).map(m => m.name).sort();
    return {
      keepScroll: true,
      body: `
        ${c.draw ? `<div class="msg warn">The draw has been made. Changing teams will clear it.</div>` : ''}
        <div class="card"><div class="lbl">Add a team</div>
          <div style="display:flex;gap:8px"><input type="text" id="tname" list="mnames" placeholder="Entrant or team name, e.g. Queens A" autocomplete="off"><button class="btn" style="width:auto;margin:0;padding:0 18px" data-act="addt">Add</button></div>
          <datalist id="mnames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        </div>
        <div class="card"><div class="lbl">Teams</div>
          ${c.fixedTeams.length ? c.fixedTeams.map((t, i) => `<div class="row"><span class="chip">${E.teamLetter(i)}</span><div class="main">${esc(t.name)}</div><button style="background:none;border:0;color:var(--err);font-size:20px;cursor:pointer" data-act="delt" data-i="${i}" aria-label="Remove">✕</button></div>`).join('') : '<div class="empty">No teams yet.</div>'}
        </div>
        <button class="btn danger" data-act="delcomp" style="margin-top:28px">Delete this competition</button>`,
      bottom: countBar(c) + `<button class="btn" data-act="go" data-to="#comp/${c.id}/rinks" style="margin-top:0">Next: rinks</button>`,
      after() { const t = $('#tname'); t.onkeydown = e => { if (e.key === 'Enter') screen.actions.addt(); }; },
      actions: {
        addt() { const t = $('#tname'), n = t.value.trim(); if (!n) return; guardDrawn(c, () => { c.fixedTeams.push({ name: n }); save(); render(); setTimeout(() => $('#tname') && $('#tname').focus(), 0); }); },
        delt(el) { guardDrawn(c, () => { c.fixedTeams.splice(+el.dataset.i, 1); save(); render(); }); },
        delcomp() { confirmBox(`Delete “${c.settings.name}”? This cannot be undone.`, 'Delete', () => { state.competitions = state.competitions.filter(x => x.id !== c.id); save(); go('#home'); }); },
      },
    };
  }

  // Picks rinks so that Game 2 can stay on the same green where possible, then uses as few greens as possible.
  function pickRinks(need, rounds) {
    const greens = state.club.greens; let best = null;
    (function rec(i, left, alloc) {
      if (i === greens.length) {
        if (left) return;
        const rinks = greens.flatMap((g, k) => Array.from({ length: alloc[k] }, (_, j) => g.name + (j + 1)));
        let cross = 0;
        if (rounds === 2 && need >= 3) { try { cross = E.round2Table(rinks, E.makeRng(1), 30).crossGreenMoves; } catch (e) { cross = 999; } }
        const used = alloc.filter(x => x).length, spread = Math.max(...alloc) - Math.min(...alloc.filter(x => x));
        const score = [cross, used, spread];
        const better = !best || (() => { for (let k = 0; k < score.length; k++) if (score[k] !== best.score[k]) return score[k] < best.score[k]; return false; })();
        if (better) best = { score, rinks };
        return;
      }
      for (let k = Math.min(greens[i].rinks, left); k >= 0; k--) rec(i + 1, left - k, alloc.concat(k));
    })(0, need, []);
    return best ? best.rinks : [];
  }
  function rinksTab(c) {
    const need = Math.floor(teamCountOf(c) / 2), chosen = new Set(c.rinks), res = checks(c);
    const msgs = res.msgs;
    const blocked = res.msgs.some(m => m.code === 'leftover') && c.settings.mode === 'tabsin';
    return {
      keepScroll: true,
      body: `
        <div class="msg ${chosen.size === need && need ? 'ok' : 'warn'}">${need ? `${need} rink${need > 1 ? 's' : ''} needed · ${chosen.size} ticked` : 'Add entries first.'}</div>
        ${state.club.greens.map(g => `<div class="card"><div class="lbl">Green ${esc(g.name)}</div><div class="rinks">
          ${Array.from({ length: g.rinks }, (_, i) => g.name + (i + 1)).map(r => `<button class="rink ${chosen.has(r) ? 'on' : ''}" data-act="rink" data-r="${r}">${r}</button>`).join('')}</div></div>`).join('')}
        <div class="btns"><button class="btn alt" data-act="auto" ${need ? '' : 'disabled'}>Pick ${need || ''} for me</button><button class="btn alt" data-act="clear">Clear</button></div>
        ${msgs.map(m => `<div class="msg ${m.level === 'error' ? 'error' : 'warn'}" style="margin-top:12px">${esc(m.text)}</div>`).join('')}`,
      bottom: `${blocked ? '<div class="small muted" style="text-align:center">Sort out the left-over players on the Entries tab first.</div>' : ''}<button class="btn" data-act="draw" ${res.ok && !blocked && chosen.size === need && need ? '' : 'disabled'}>${c.draw ? 'Make the draw again' : 'Make the draw'}</button>`,
      actions: {
        rink(el) { guardDrawn(c, () => { const r = el.dataset.r; c.rinks = chosen.has(r) ? c.rinks.filter(x => x !== r) : c.rinks.concat(r); save(); render(); }); },
        auto() { guardDrawn(c, () => { c.rinks = pickRinks(need, c.settings.rounds); save(); render(); }); },
        clear() { guardDrawn(c, () => { c.rinks = []; save(); render(); }); },
        draw() { const doIt = () => { makeDraw(c); go(`#comp/${c.id}/draw`); }; if (c.draw) confirmBox('Make a new draw? The current one will be replaced.', 'New draw', doIt); else doIt(); },
      },
    };
  }

  function makeDraw(c) {
    const s = c.settings; let teams, oop = 0;
    if (s.mode === 'tabsin') {
      const all = entrants(c), k = E.tabsInCount(all.length, s.format);
      if (k.leftover) { toast(`${k.leftover} player(s) left over — adjust entries first`); return; }
      const players = all.map(p => ({ id: p.id, name: p.name, group: p.group, seed: s.draw === 'seeded' && !!p.seed }));
      const f = E.formTabsInTeams(players, s.format); teams = f.teams.map(t => ({ id: t.id, name: t.name, players: t.players.map(p => ({ name: p.name, group: p.group, position: p.position, out: p.outOfPosition })) })); oop = f.outOfPosition;
    } else teams = c.fixedTeams.map((t, i) => ({ id: E.teamLetter(i), name: t.name }));
    const rinks = E.sortRinks(c.rinks, greenOrder());
    const round1 = E.drawRound1(teams, rinks);
    const t2 = s.rounds === 2 ? E.round2Table(rinks) : null;
    c.draw = { made: Date.now(), teams, round1, table: t2 ? t2.table : null, crossGreen: t2 ? t2.crossGreenMoves : 0, outOfPosition: oop };
    c.scores = {}; c.status = 'drawn'; save();
  }

  function drawTab(c) {
    const s = c.settings, d = c.draw;
    if (!d) return { body: `<div class="empty">No draw yet. Tick the entries and rinks, then tap Make the draw.</div>`, bottom: `<button class="btn" data-act="go" data-to="#comp/${c.id}/rinks">Go to rinks</button>` };
    const order = E.sortRinks(d.round1.map(m => m.rink), greenOrder());
    const byRink = Object.fromEntries(d.round1.map(m => [m.rink, m]));
    const two = s.rounds === 2 && d.table;
    const moved = s.mode === 'tabsin' ? d.teams.reduce((a, t) => a + t.players.filter(p => p.out).length, 0) : 0;
    return {
      keepScroll: true,
      body: `
        ${moved ? `<div class="msg warn">${moved} player${moved > 1 ? 's are' : ' is'} placed outside their usual group because a position was short (filled from the nearest group). Teams sort out positions themselves on the day.</div>` : ''}
        <div class="card"><div class="lbl">Rinks${two ? ' · same details on both teams’ cards' : ''}</div>
          <table><tr><th>Start</th><th>Teams</th>${two ? '<th class="c">Winners to</th><th class="c">Losers to</th>' : ''}</tr>
          ${order.map(r => `<tr><td><b>${r}</b></td><td>${byRink[r].teams.join(' v ')}</td>${two ? `<td class="c">${d.table[r].winnersTo}</td><td class="c">${d.table[r].losersTo}</td>` : ''}</tr>`).join('')}</table>
        </div>
        <div class="card"><div class="lbl">Teams${s.mode === 'tabsin' ? ' · skip listed first' : ''}</div>
          ${d.teams.map(t => `<div class="row tap" data-act="editteam" data-id="${t.id}"><span class="chip">${t.id}</span><div class="main">${esc(t.name)}</div><span class="small muted">${startOf(d, t.id)}</span><span class="chev">›</span></div>`).join('')}
          <p class="small muted">Tap a team to change a name (e.g. a late replacement).</p>
        </div>
        `,
      bottom: `<div class="btns"><button class="btn alt" data-act="redraw">New draw</button><button class="btn" data-act="go" data-to="#comp/${c.id}/cards">Skip cards</button></div>`,
      actions: {
        redraw() { confirmBox(`Make a new draw? The current one${hasScores(c) ? ' and all scores entered' : ''} will be replaced.`, 'New draw', () => { makeDraw(c); render(); toast('New draw made'); }); },
        editteam(el) {
          const t = d.teams.find(x => x.id === el.dataset.id);
          const dd = dialog(`<h3 style="margin:0 0 12px">Team ${t.id}</h3><div class="field"><label>Names (skip first)</label><input type="text" id="tn" value="${esc(t.name)}"></div>
            <div class="btns"><button class="btn alt" data-x>Cancel</button><button class="btn" data-s>Save</button></div>`);
          dd.querySelector('[data-x]').onclick = () => dd.close();
          dd.querySelector('[data-s]').onclick = () => { const v = dd.querySelector('#tn').value.trim(); if (v) { t.name = v; save(); } dd.close(); render(); };
        },
      },
    };
  }
  // ---------- Skip cards ----------
  function cardList(c) {
    const s = c.settings, d = c.draw;
    const pos = E.FORMATS[s.format].positions;
    return E.sortRinks(d.round1.map(m => m.rink), greenOrder()).flatMap(r => {
      const m = d.round1.find(x => x.rink === r);
      return m.teams.slice().sort().map(id => {
        const t = d.teams.find(x => x.id === id);
        return { title: s.name, team: id, names: t.name, positions: pos, start: r,
          winnersTo: d.table ? d.table[r].winnersTo : '', losersTo: d.table ? d.table[r].losersTo : '', rounds: s.rounds, showPoints: !!s.bonusOn };
      });
    });
  }
  function cardsTab(c) {
    if (!c.draw) return { body: `<div class="empty">Make the draw first; the cards are filled in from it.</div>`, bottom: `<button class="btn" data-act="go" data-to="#comp/${c.id}/rinks">Go to rinks</button>` };
    const cards = cardList(c), sheets = window.BowlsCards.sheets(cards);
    const fileName = c.settings.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '_cards.pdf';
    return {
      keepScroll: true,
      body: `
        <div class="msg ok">${cards.length} cards on ${sheets.length} A4 page${sheets.length > 1 ? 's' : ''} · the two cards for each rink sit side by side.</div>
        <div class="sheets">${sheets.map(sh => `<div class="sheetwrap">${window.BowlsCards.sheetSvg(sh)}</div>`).join('')}</div>`,
      bottom: `<div class="btns"><button class="btn alt" data-act="print">Print</button><button class="btn" data-act="pdf">Share PDF</button></div>`,
      actions: {
        print() {
          let pa = document.getElementById('printArea'); if (!pa) { pa = document.createElement('div'); pa.id = 'printArea'; document.body.appendChild(pa); }
          pa.innerHTML = sheets.map(sh => window.BowlsCards.sheetSvg(sh)).join('');
          setTimeout(() => window.print(), 50);
        },
        async pdf() {
          let blob; try { blob = window.BowlsCards.pdf(cards); } catch (e) { toast('Could not make the PDF'); return; }
          const file = new File([blob], fileName, { type: 'application/pdf' });
          try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: c.settings.name + ' skip cards' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
          const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
          toast('PDF saved to Downloads');
        },
      },
    };
  }
  // ---------- Scores: typed card by card ----------
  const teamOrder = (a, b) => a.id.length - b.id.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  function warnText(c, w, me) {
    const other = w.teams.find(t => t !== me), g = w.game - 1, sc = c.scores || {};
    const fmt = id => { const e = (sc[id] || [])[g]; return `${e.f}–${e.a}`; };
    return `Game ${w.game} doesn’t match Team ${other}’s card (${me}: ${fmt(me)}, ${other}: ${fmt(other)})`;
  }
  function scoresTab(c) {
    if (!c.draw) return { body: `<div class="empty">Make the draw first.</div>`, bottom: `<button class="btn" data-act="go" data-to="#comp/${c.id}/rinks">Go to rinks</button>` };
    c.scores = c.scores || {};
    const teams = c.draw.teams.slice().sort(teamOrder), games = c.settings.rounds;
    const val = (t, g, k) => { const e = (c.scores[t] || [])[g]; return e && Number.isInteger(e[k]) ? e[k] : ''; };
    const inp = (t, g, k) => `<td class="in g${g}"><input class="sc" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" enterkeyhint="next" autocomplete="off" data-t="${t}" data-g="${g}" data-k="${k}" value="${val(t, g, k)}" aria-label="Team ${t} game ${g + 1} ${k === 'f' ? 'for' : 'against'}"></td>`;
    const gname = ['First game', 'Second game'];
    function refresh() {
      const n = E.cardsEntered(c.draw.teams, c.scores, games), warns = E.checkCards(c.draw.round1, c.draw.table, c.scores);
      document.querySelectorAll('tr.srow').forEach(r => {
        const t = r.dataset.t;
        r.querySelector('.dn').textContent = E.cardsEntered([{ id: t }], c.scores, games) === 1 ? '✓' : '';
        for (let g = 0; g < games; g++) r.querySelectorAll('td.g' + g).forEach(td => td.classList.toggle('bad', warns.some(w => w.game === g + 1 && w.teams.includes(t))));
      });
      $('#swarns').innerHTML = warns.length ? `<div class="msg error">${warns.map(w => `⚠ ${esc(warnText(c, w, w.teams[0]))}`).join('<br>')}</div>` : '';
      const cnt = $('#scount'); if (cnt) cnt.innerHTML = `<b>${n}</b> of <b>${teams.length}</b> cards entered${warns.length ? ` · <b>${warns.length}</b> to check` : ''}`;
    }
    return {
      keepScroll: true,
      body: `
        <table class="sheet-t">
          <thead><tr class="h1"><th rowspan="2" class="tm">Team</th>${Array.from({ length: games }, (_, g) => `<th colspan="2" class="gh">${gname[g]}</th>`).join('')}<th rowspan="2" class="dn">Done</th></tr>
          <tr class="h2">${Array.from({ length: games }, () => '<th>For</th><th>Against</th>').join('')}</tr></thead>
          <tbody>${teams.map(t => `<tr class="srow" data-t="${t.id}"><td class="tm">${t.id}</td>${Array.from({ length: games }, (_, g) => inp(t.id, g, 'f') + inp(t.id, g, 'a')).join('')}<td class="dn"></td></tr>`).join('')}</tbody>
        </table>
        <div id="swarns" style="margin-top:12px"></div>`,
      bottom: `<div class="count" id="scount"></div><button class="btn" data-act="go" data-to="#comp/${c.id}/results" style="margin-top:0">Results</button>`,
      after() {
        // freeze the two heading rows just under the title bar
        const top = document.querySelector('header.bar').offsetHeight, h1 = document.querySelector('.sheet-t tr.h1');
        document.querySelectorAll('.sheet-t tr.h1 th').forEach(th => th.style.top = top + 'px');
        document.querySelectorAll('.sheet-t tr.h2 th').forEach(th => th.style.top = (top + h1.offsetHeight) + 'px');
        const all = [...document.querySelectorAll('input.sc')];
        all.forEach((el, i) => {
          el.addEventListener('input', () => {
            el.value = el.value.replace(/\D/g, '').slice(0, 2);
            const t = el.dataset.t, g = +el.dataset.g, k = el.dataset.k;
            const arr = c.scores[t] = c.scores[t] || [];
            arr[g] = arr[g] || {}; arr[g][k] = el.value === '' ? null : parseInt(el.value, 10);
            c.status = statusLabel(c).toLowerCase(); save(); refresh();
          });
          el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const nx = all[i + 1]; if (nx) nx.focus(); else el.blur(); } });
          el.addEventListener('focus', () => el.select());
        });
        refresh();
      },
    };
  }

  // ---------- Results ----------
  function resultsData(c) {
    const s = c.settings, teams = c.draw.teams, wp = winPts(c);
    const st = E.standingsFromCards(teams, c.scores || {}, s.rounds, wp, { booby: s.booby });
    const n = E.cardsEntered(teams, c.scores || {}, s.rounds), warns = E.checkCards(c.draw.round1, c.draw.table, c.scores || {});
    const name = id => (teams.find(t => t.id === id) || {}).name || '';
    return { st, n, warns, wp, name, total: teams.length };
  }
  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
  function prizeText(p, wp) {
    const r = p.row || p.line;
    return `${wp ? `${r.points} pts, ` : ''}${signed(r.score)}${p.line ? ' in game 2' : ''}`;
  }
  function resultsTab(c) {
    if (!c.draw) return { body: `<div class="empty">Make the draw first.</div>` };
    const { st, n, warns, wp, name, total } = resultsData(c);
    if (!n && !hasScores(c)) return { body: `<div class="empty">No scores yet. Enter the cards on the Scores tab.</div>`, bottom: `<button class="btn" data-act="go" data-to="#comp/${c.id}/scores">Enter scores</button>` };
    const rows = st.rows.filter(r => r.played);
    return {
      keepScroll: true,
      body: `
        ${n < total ? `<div class="msg warn">Results so far — ${total - n} card${total - n > 1 ? 's' : ''} still to enter.</div>` : '<div class="msg ok">All cards entered.</div>'}
        ${warns.length ? `<div class="msg error">${warns.length} pair${warns.length > 1 ? 's' : ''} of cards don’t agree. Check them on the Scores tab.</div>` : ''}
        <div class="card"><div class="lbl">Prizes</div>
          ${st.prizes.map(p => `<div class="row"><div class="main"><b>${esc(p.prize)}</b><div class="sub">Team ${p.team} · ${esc(name(p.team))}</div></div><b>${prizeText(p, wp)}</b></div>`).join('') || '<div class="muted">—</div>'}
        </div>
        <div class="card" style="overflow-x:auto"><div class="lbl">Placings</div>
          <table><tr><th>#</th><th>Team</th>${wp ? '<th class="c">Pts</th>' : ''}<th class="c">For</th><th class="c">Agst</th><th class="c">Diff</th></tr>
          ${rows.map(r => `<tr><td>${r.place}</td><td><b>${r.team}</b><div class="small muted">${esc(r.name)}</div></td>${wp ? `<td class="c"><b>${r.points}</b></td>` : ''}<td class="c">${r.for}</td><td class="c">${r.against}</td><td class="c"><b>${signed(r.score)}</b></td></tr>`).join('')}</table>
          <p class="small muted">Ranked on ${wp ? 'points, then ' : ''}difference, then fewest shots against.</p>
        </div>`,
      bottom: `<div class="btns"><button class="btn alt" data-act="print">Print</button><button class="btn" data-act="share">Share</button></div>`,
      actions: {
        async share() {
          const lines = [`${c.settings.name} — results${n < total ? ' (so far)' : ''}`, ''];
          st.prizes.forEach(p => lines.push(`${p.prize}: Team ${p.team} (${name(p.team)}) ${prizeText(p, wp)}`));
          lines.push('', 'Placings:');
          rows.forEach(r => lines.push(`${r.place}. Team ${r.team} – ${wp ? `${r.points} pts, ` : ''}${signed(r.score)} (${r.for}–${r.against}) – ${r.name}`));
          const text = lines.join('\n');
          try { if (navigator.share) { await navigator.share({ title: c.settings.name + ' results', text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
          try { await navigator.clipboard.writeText(text); toast('Results copied — paste into WhatsApp'); } catch (e) { toast('Could not share'); }
        },
        print() {
          let pa = document.getElementById('printArea'); if (!pa) { pa = document.createElement('div'); pa.id = 'printArea'; document.body.appendChild(pa); }
          pa.innerHTML = `<div class="printres"><h1>${esc(c.settings.name)} — results</h1><p>${esc(state.club.name)} · ${fmtDate(c.created)}${n < total ? ' · results so far' : ''}</p>
            <h2>Prizes</h2><table>${st.prizes.map(p => `<tr><td><b>${esc(p.prize)}</b></td><td>Team ${p.team}</td><td>${esc(name(p.team))}</td><td>${prizeText(p, wp)}</td></tr>`).join('')}</table>
            <h2>Placings</h2><table><tr><th>#</th><th>Team</th><th>Players</th>${wp ? '<th>Pts</th>' : ''}<th>For</th><th>Agst</th><th>Diff</th></tr>
            ${rows.map(r => `<tr><td>${r.place}</td><td><b>${r.team}</b></td><td>${esc(r.name)}</td>${wp ? `<td>${r.points}</td>` : ''}<td>${r.for}</td><td>${r.against}</td><td>${signed(r.score)}</td></tr>`).join('')}</table></div>`;
          setTimeout(() => window.print(), 50);
        },
      },
    };
  }

  function startOf(d, id) { const m = d.round1.find(x => x.teams.includes(id)); return m ? m.rink : ''; }

  // ---------- Backup ----------
  function backupScreen() {
    return {
      title: 'Backup / restore', sub: 'Keep a copy, or pass the club to another phone', back: '#home',
      body: `
        <div class="card"><div class="lbl">Save a backup</div>
          <p class="small">One file holds the club set-up, members and all competitions. Send it to yourself or to the other organiser by WhatsApp or email.</p>
          <button class="btn" data-act="backup">Save / share backup</button></div>
        <div class="card"><div class="lbl">Restore</div>
          <p class="small">Loads a backup file onto this phone. <b>Everything on this phone is replaced</b> by what is in the file.</p>
          <input type="file" id="restore" accept=".json,application/json" style="display:none">
          <button class="btn alt" data-act="restore">Choose backup file</button></div>`,
      after() {
        $('#restore').onchange = e => {
          const f = e.target.files[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = () => {
            let data; try { data = JSON.parse(rd.result); } catch (err) { toast('That file is not a backup'); return; }
            if (!data || data.app !== 'bowls' || !data.state || !data.state.club) { toast('That file is not a Bowls backup'); return; }
            confirmBox(`Replace everything on this phone with the backup of “${data.state.club.name}” (${fmtDate(data.saved)})?`, 'Replace', () => {
              state = Object.assign(blank(), data.state); save(); toast('Backup restored'); go('#home');
            });
          };
          rd.readAsText(f);
        };
      },
      actions: {
        restore() { $('#restore').click(); },
        async backup() {
          const body = JSON.stringify({ app: 'bowls', version: VERSION, saved: Date.now(), state }, null, 1);
          const name = `bowls-backup-${new Date().toISOString().slice(0, 10)}.json`;
          const file = new File([body], name, { type: 'application/json' });
          try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Bowls backup' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
          const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
          toast('Backup saved to Downloads');
        },
      },
    };
  }

  // ---------- Start ----------
  load(); render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
