/* Bowls Competition Manager — engine (Stage 1)
 * Pure functions only: no screens, no storage. Used by the app and by the test suite.
 */
(function (root) {
  'use strict';

  // ---------- Formats and position groups ----------
  const FORMATS = {
    pairs: { size: 2, positions: ['Skip', 'Lead'] },
    trips: { size: 3, positions: ['Skip', 'Second', 'Lead'] },
    fours: { size: 4, positions: ['Skip', 'Third', 'Second', 'Lead'] },
  };
  // Positions sit on a line Skip(0) Third(1) Second(2) Lead(3).
  const POS_X = { Skip: 0, Third: 1, Second: 2, Lead: 3 };
  // Each position group covers a stretch of that line.
  const GROUPS = {
    S:   { label: 'Skip',                range: [0, 0] },
    STS: { label: 'Skip/Third/Second',   range: [0, 2] },
    TS:  { label: 'Third/Second',        range: [1, 2] },
    SL:  { label: 'Second/Lead',         range: [2, 3] },
    L:   { label: 'Lead',                range: [3, 3] },
  };
  const GROUP_KEYS = Object.keys(GROUPS);
  // Cost of playing a group in a position = distance outside its stretch (0 = in position).
  function posCost(group, position) {
    const [a, b] = GROUPS[group].range, x = POS_X[position];
    return x < a ? a - x : x > b ? x - b : 0;
  }

  // ---------- Random helpers (seedable for repeatable tests) ----------
  function makeRng(seed) {
    if (seed === undefined) return Math.random;
    let t = seed >>> 0;
    return function () { // mulberry32
      t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---------- Names ----------
  function teamLetter(i) { // A..Z, AA, AB ...
    let s = ''; i++;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function rinkKey(r) { const m = /^(.*?)(\d+)$/.exec(r); return m ? [m[1], +m[2]] : [r, 0]; }
  function sortRinks(rs, greenOrder) {
    return rs.slice().sort((x, y) => {
      const [gx, nx] = rinkKey(x), [gy, ny] = rinkKey(y);
      const ox = greenOrder ? greenOrder.indexOf(gx) : gx, oy = greenOrder ? greenOrder.indexOf(gy) : gy;
      return ox < oy ? -1 : ox > oy ? 1 : nx - ny;
    });
  }
  function greenOf(r) { return rinkKey(r)[0]; }

  // ---------- Entry checks ----------
  // Tabs-in: how many teams can be formed and how many players are left over.
  function tabsInCount(playerCount, format) {
    const size = FORMATS[format].size;
    const teams = Math.floor(playerCount / (2 * size)) * 2;
    return { teams, rinks: teams / 2, used: teams * size, leftover: playerCount - teams * size,
             needForNextRink: teams * size + 2 * size - playerCount };
  }
  function checkEntries({ format, mode, playerCount, teamCount, rinksInUse, rounds }) {
    const msgs = [];
    let teams;
    if (mode === 'tabsin') {
      const c = tabsInCount(playerCount, format); teams = c.teams;
      if (c.leftover) msgs.push({ level: 'warn', code: 'leftover', text: `${c.leftover} player${c.leftover > 1 ? 's' : ''} unallocated. Add ${c.needForNextRink} for another rink, or sit ${c.leftover} out.` });
    } else {
      teams = teamCount;
      if (teams % 2) msgs.push({ level: 'error', code: 'oddTeams', text: `${teams} teams: the number of teams must be even.` });
    }
    const matches = Math.floor(teams / 2);
    if (teams < 2) msgs.push({ level: 'error', code: 'tooFew', text: 'At least 2 teams are needed.' });
    if (rinksInUse !== undefined) {
      if (rinksInUse < matches) msgs.push({ level: 'error', code: 'rinksShort', text: `${matches} rinks needed, only ${rinksInUse} ticked.` });
      if (rinksInUse > matches) msgs.push({ level: 'warn', code: 'rinksSpare', text: `${rinksInUse - matches} ticked rink(s) will not be used.` });
    }
    if (rounds === 2 && matches > 0 && matches < 3) msgs.push({ level: 'error', code: 'r2Impossible', text: 'A second game needs at least 3 rinks so that no team plays the same rink twice.' });
    return { teams, matches, ok: !msgs.some(m => m.level === 'error'), msgs };
  }

  // ---------- Tabs-in team forming ----------
  // Min-cost flow: groups -> positions, so nobody plays out of position unless unavoidable,
  // and when they must, they move the shortest distance (nearest neighbouring group).
  function solveGroupPositions(supply, positions, perPos) {
    // nodes: 0 src, 1..G groups, G+1..G+P positions, last sink
    const G = GROUP_KEYS.length, P = positions.length, N = G + P + 2, src = 0, sink = N - 1;
    const edges = [], adj = Array.from({ length: N }, () => []);
    const add = (u, v, cap, cost) => { adj[u].push(edges.length); edges.push({ u, v, cap, cost, flow: 0 });
                                        adj[v].push(edges.length); edges.push({ u: v, v: u, cap: 0, cost: -cost, flow: 0 }); };
    GROUP_KEYS.forEach((g, i) => add(src, 1 + i, supply[g] || 0, 0));
    GROUP_KEYS.forEach((g, i) => positions.forEach((p, j) => add(1 + i, 1 + G + j, 1e9, posCost(g, p))));
    positions.forEach((p, j) => add(1 + G + j, sink, perPos, 0));
    let total = 0, cost = 0;
    for (;;) { // Bellman-Ford shortest augmenting path
      const dist = Array(N).fill(Infinity), prev = Array(N).fill(-1); dist[src] = 0;
      for (let it = 0; it < N; it++) { let ch = false;
        for (let e = 0; e < edges.length; e++) { const E = edges[e];
          if (E.cap - E.flow > 0 && dist[E.u] + E.cost < dist[E.v]) { dist[E.v] = dist[E.u] + E.cost; prev[E.v] = e; ch = true; } }
        if (!ch) break; }
      if (dist[sink] === Infinity) break;
      let f = Infinity; for (let v = sink; v !== src; v = edges[prev[v]].u) f = Math.min(f, edges[prev[v]].cap - edges[prev[v]].flow);
      for (let v = sink; v !== src; v = edges[prev[v]].u) { edges[prev[v]].flow += f; edges[prev[v] ^ 1].flow -= f; }
      total += f; cost += f * dist[sink];
    }
    const plan = {}; GROUP_KEYS.forEach((g, i) => { plan[g] = {}; positions.forEach((p, j) => {
      const e = adj[1 + i].map(k => edges[k]).find(E => E.v === 1 + G + j); plan[g][p] = e ? e.flow : 0; }); });
    return { plan, filled: total, cost };
  }

  // players: [{id, name, group, seed}]  (exact count = teams * size)
  function formTabsInTeams(players, format, rng) {
    rng = rng || Math.random;
    const F = FORMATS[format], nTeams = players.length / F.size;
    if (!Number.isInteger(nTeams) || nTeams % 2) throw new Error('Player count must fill complete rinks');
    const byGroup = {}; GROUP_KEYS.forEach(g => byGroup[g] = shuffle(players.filter(p => p.group === g), rng));
    const supply = {}; GROUP_KEYS.forEach(g => supply[g] = byGroup[g].length);
    const { plan, cost } = solveGroupPositions(supply, F.positions, nTeams);
    // fill each position's list
    const posLists = {}; F.positions.forEach(p => posLists[p] = []);
    GROUP_KEYS.forEach(g => F.positions.forEach(p => { for (let k = 0; k < plan[g][p]; k++) posLists[p].push(byGroup[g].pop()); }));
    // build teams position by position, sending seeded players to teams with fewest seeds
    const teams = Array.from({ length: nTeams }, (_, i) => ({ id: teamLetter(i), players: [], seeds: 0 }));
    F.positions.forEach(p => {
      const list = shuffle(posLists[p], rng).sort((a, b) => (b.seed ? 1 : 0) - (a.seed ? 1 : 0));
      const order = shuffle(teams.map((_, i) => i), rng);
      const taken = new Set();
      list.forEach(pl => {
        let best = -1;
        for (const i of order) if (!taken.has(i) && (best < 0 || teams[i].seeds < teams[best].seeds)) best = i;
        taken.add(best); teams[best].players.push({ ...pl, position: p, outOfPosition: posCost(pl.group, p) > 0 });
        if (pl.seed) teams[best].seeds++;
      });
    });
    teams.forEach(t => { t.name = t.players.map(x => x.name).join(', '); delete t.seeds; });
    return { teams, outOfPosition: cost };
  }

  // ---------- Round 1 draw ----------
  // teams: [{id,...}], rinks: ['A1',...]  -> [{rink, teams:[idA,idB]}]
  function drawRound1(teams, rinks, rng) {
    rng = rng || Math.random;
    if (teams.length !== 2 * rinks.length) throw new Error(`${teams.length} teams need ${teams.length / 2} rinks; ${rinks.length} given`);
    const ts = shuffle(teams.map(t => t.id), rng), rs = shuffle(rinks, rng);
    const out = [];
    for (let i = 0; i < ts.length; i += 2) out.push({ rink: rs[i / 2], teams: [ts[i], ts[i + 1]] });
    return out;
  }

  // ---------- Round 2 rink table ----------
  // For every Round 1 rink: where its winner and its loser play Round 2.
  // Rules: never the same rink twice; every rink used once; no rematch; W v W, L v L,
  // one W v L match when the number of rinks is odd. Prefers keeping teams on their green.
  function round2Table(rinks, rng, tries) {
    rng = rng || Math.random; tries = tries || 40;
    const n = rinks.length; if (n < 3) throw new Error('A second game needs at least 3 rinks');
    let best = null;
    for (let t = 0; t < tries; t++) {
      // group-wise shuffle so linked pairs tend to share a green
      const greens = {}; rinks.forEach(r => (greens[greenOf(r)] = greens[greenOf(r)] || []).push(r));
      const s = [].concat(...shuffle(Object.keys(greens), rng).map(g => shuffle(greens[g], rng)));
      const matches = [];
      if (n % 2 === 0) for (let i = 0; i < n; i += 2) { matches.push([[s[i], 'W'], [s[i + 1], 'W']]); matches.push([[s[i], 'L'], [s[i + 1], 'L']]); }
      else {
        for (let i = 0; i < n - 1; i += 2) matches.push([[s[i], 'W'], [s[i + 1], 'W']]);
        for (let i = 1; i < n; i += 2) matches.push([[s[i], 'L'], [s[i + 1], 'L']]);
        matches.push([[s[n - 1], 'W'], [s[0], 'L']]);
      }
      const dest = assignDest(matches, rinks, rng);
      if (!dest) continue;
      const table = {}; rinks.forEach(r => table[r] = {});
      let cross = 0, wl = null;
      matches.forEach((m, k) => { m.forEach(([st, res]) => { table[st][res === 'W' ? 'winnersTo' : 'losersTo'] = dest[k]; if (greenOf(st) !== greenOf(dest[k])) cross++; });
        if (m[0][1] !== m[1][1]) wl = dest[k]; });
      if (!best || cross < best.crossGreenMoves) best = { table, crossGreenMoves: cross, winnerVsLoserRink: wl };
      if (cross === 0) break;
    }
    if (!best) throw new Error('No valid Round 2 table found');
    return best;
  }
  function assignDest(matches, rinks, rng) {
    const order = shuffle(matches.map((_, i) => i), rng);
    const dest = {}, used = new Set();
    // candidates: prefer a rink on the same green as the teams arriving
    function cands(m) {
      const banned = new Set(matches[m].map(x => x[0])), gs = new Set(matches[m].map(x => greenOf(x[0])));
      const free = shuffle(rinks.filter(r => !used.has(r) && !banned.has(r)), rng);
      return free.filter(r => gs.has(greenOf(r))).concat(free.filter(r => !gs.has(greenOf(r))));
    }
    let steps = 0;
    function bt(k) {
      if (k === order.length) return true;
      if (++steps > 20000) return false;
      const m = order[k];
      for (const r of cands(m)) { dest[m] = r; used.add(r); if (bt(k + 1)) return true; used.delete(r); delete dest[m]; }
      return false;
    }
    return bt(0) ? dest : null;
  }

  // ---------- Scoring ----------
  // One rink result -> each team's line.  lastEnd: team id that scored the last end (needed only when level).
  function scoreMatch(teamA, teamB, shotsA, shotsB, lastEnd, bonus) {
    if (!(shotsA >= 0 && shotsB >= 0)) throw new Error('Scores must be numbers 0 or more');
    let winner;
    if (shotsA > shotsB) winner = teamA; else if (shotsB > shotsA) winner = teamB;
    else { if (lastEnd !== teamA && lastEnd !== teamB) throw new Error('Scores level: who scored the last end?'); winner = lastEnd; }
    const line = (id, f, a) => { const b = id === winner ? (bonus || 0) : 0; return { team: id, for: f, against: a, score: f - a, bonus: b, total: f - a + b, won: id === winner }; };
    return { winner, loser: winner === teamA ? teamB : teamA, peal: shotsA === shotsB, lines: [line(teamA, shotsA, shotsB), line(teamB, shotsB, shotsA)] };
  }

  // Round 2 matches from Round 1 results and the table.
  function round2Matches(round1, results1, table) {
    const at = {};
    round1.forEach(m => { const r = results1[m.rink]; if (!r) throw new Error(`No score for rink ${m.rink}`);
      const t = table[m.rink];
      (at[t.winnersTo] = at[t.winnersTo] || []).push(r.winner);
      (at[t.losersTo] = at[t.losersTo] || []).push(r.loser); });
    return Object.keys(at).map(rink => ({ rink, teams: at[rink] }));
  }

  // ---------- Results ----------
  // rounds: [ {rink: result}, ... ]  results from scoreMatch
  function standings(teams, rounds, opts) {
    opts = opts || {};
    const rows = teams.map(t => ({ team: t.id, name: t.name || '', rounds: [], wins: 0, for: 0, against: 0, score: 0, bonus: 0, total: 0 }));
    const byId = {}; rows.forEach(r => byId[r.team] = r);
    rounds.forEach((res, ri) => Object.values(res).forEach(m => m.lines.forEach(l => {
      const r = byId[l.team]; r.rounds[ri] = l; r.wins += l.won ? 1 : 0;
      r.for += l.for; r.against += l.against; r.score += l.score; r.bonus += l.bonus; r.total += l.total; })));
    const cmp = (a, b) => b.wins - a.wins || b.total - a.total || b.for - a.for || a.against - b.against;
    rows.sort(cmp);
    rows.forEach((r, i) => { r.place = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].place : i + 1; });
    const bestOf = ri => { const c = rows.filter(r => r.rounds[ri]); if (!c.length) return null;
      return c.slice().sort((a, b) => b.rounds[ri].total - a.rounds[ri].total || b.rounds[ri].for - a.rounds[ri].for)[0]; };
    const prizes = [];
    if (rows[0]) prizes.push({ prize: 'Winners', team: rows[0].team, value: rows[0].total });
    if (rows[1]) prizes.push({ prize: 'Runners-up', team: rows[1].team, value: rows[1].total });
    rounds.forEach((_, ri) => { const b = bestOf(ri); if (b) prizes.push({ prize: `Best game ${ri + 1}`, team: b.team, value: b.rounds[ri].total }); });
    if (opts.booby && rows.length) {
      const bb = rows.slice().sort((a, b) => a.total - b.total || a.for - b.for || b.against - a.against)[0];
      prizes.push({ prize: 'Booby', team: bb.team, value: bb.total });
    }
    return { rows, prizes };
  }

  // ---------- Skip cards ----------
  function skipCards(comp, teams, round1, table) {
    const cards = [];
    round1.forEach(m => m.teams.forEach(id => {
      const t = teams.find(x => x.id === id);
      cards.push({ title: comp.name, team: id, names: t.name || '', positions: FORMATS[comp.format].positions,
                   start: m.rink, losersTo: table ? table[m.rink].losersTo : '', winnersTo: table ? table[m.rink].winnersTo : '',
                   rounds: comp.rounds, showBonus: !!comp.bonusOn });
    }));
    return cards.sort((a, b) => a.team.length - b.team.length || (a.team < b.team ? -1 : 1));
  }

  // ---------- Remembered settings per format ----------
  const STARTING = { mode: 'tabsin', rounds: 2, ends: 10, bonusOn: true, bonus: 2, booby: true, draw: 'random' };
  function newCompetitionSettings(memory) {
    memory = memory || {};
    const format = memory.lastFormat || 'trips';
    return Object.assign({ format, name: '' }, STARTING, (memory.byFormat || {})[format] || {});
  }
  function switchFormat(memory, format) {
    return Object.assign({ format, name: '' }, STARTING, ((memory || {}).byFormat || {})[format] || {});
  }
  function rememberSettings(memory, settings) { // call on Create competition
    const m = JSON.parse(JSON.stringify(memory || {})); m.byFormat = m.byFormat || {};
    const { format, ...rest } = settings; m.byFormat[format] = rest; m.lastFormat = format; return m;
  }

  const api = { FORMATS, GROUPS, POS_X, posCost, makeRng, shuffle, teamLetter, sortRinks, greenOf,
    tabsInCount, checkEntries, solveGroupPositions, formTabsInTeams, drawRound1, round2Table,
    scoreMatch, round2Matches, standings, skipCards, STARTING, newCompetitionSettings, switchFormat, rememberSettings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BowlsEngine = api;
})(this);
