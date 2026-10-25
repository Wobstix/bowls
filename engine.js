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
  // One rink result -> each team's line.
  // A level score is a draw: points shared (half the win points each), score difference 0.
  // lastEnd (team id that scored the last end) is still needed when level: it decides only
  // who goes to the winners' rink and who to the losers' rink for the next game.
  function scoreMatch(teamA, teamB, shotsA, shotsB, lastEnd, winPoints) {
    if (!(Number.isInteger(shotsA) && Number.isInteger(shotsB) && shotsA >= 0 && shotsB >= 0)) throw new Error('Scores must be whole numbers, 0 or more');
    const wp = winPoints || 0, drawn = shotsA === shotsB;
    let winner = null, goesWin;
    if (shotsA > shotsB) winner = goesWin = teamA; else if (shotsB > shotsA) winner = goesWin = teamB;
    else { if (lastEnd !== teamA && lastEnd !== teamB) throw new Error('Scores level: who scored the last end?'); goesWin = lastEnd; }
    const line = (id, f, a) => { const pts = drawn ? wp / 2 : id === winner ? wp : 0;
      return { team: id, for: f, against: a, score: f - a, points: pts, total: f - a + pts, won: id === winner, drawn }; };
    return { winner, drawn, peal: drawn, goesWin, goesLose: goesWin === teamA ? teamB : teamA, lines: [line(teamA, shotsA, shotsB), line(teamB, shotsB, shotsA)] };
  }

  // Game 2 matches from Game 1 results and the rink table.
  function round2Matches(round1, results1, table) {
    const at = {};
    round1.forEach(m => { const r = results1[m.rink]; if (!r) throw new Error(`No score for rink ${m.rink}`);
      const t = table[m.rink];
      (at[t.winnersTo] = at[t.winnersTo] || []).push(r.goesWin);
      (at[t.losersTo] = at[t.losersTo] || []).push(r.goesLose); });
    return Object.keys(at).map(rink => ({ rink, teams: at[rink] }));
  }

  // ---------- Results ----------
  // Ranking: points, then score difference, then fewest shots against.
  // Prizes: winners, runners-up, best last game (when more than one game), booby = last place.
  const rankCmp = (a, b) => b.points - a.points || b.score - a.score || a.against - b.against;
  function standings(teams, rounds, opts) {
    opts = opts || {};
    const rows = teams.map(t => ({ team: t.id, name: t.name || '', rounds: [], played: 0, wins: 0, draws: 0, losses: 0, points: 0, for: 0, against: 0, score: 0, total: 0 }));
    const byId = {}; rows.forEach(r => byId[r.team] = r);
    rounds.forEach((res, ri) => Object.values(res).forEach(m => m.lines.forEach(l => {
      const r = byId[l.team]; if (!r) return; r.rounds[ri] = l; r.played++;
      if (l.won) r.wins++; else if (l.drawn) r.draws++; else r.losses++;
      r.points += l.points; r.for += l.for; r.against += l.against; r.score += l.score; r.total += l.total; })));
    rows.sort(rankCmp);
    rows.forEach((r, i) => { r.place = i > 0 && rankCmp(rows[i - 1], r) === 0 ? rows[i - 1].place : i + 1; });
    const prizes = []; let clash = null;
    const done = rows.filter(r => r.played);
    if (done[0]) prizes.push({ prize: 'Winners', team: done[0].team, row: done[0] });
    if (done[1]) prizes.push({ prize: 'Runners-up', team: done[1].team, row: done[1] });
    const last = rounds.length - 1;
    if (last >= 1) {
      const c = rows.filter(r => r.rounds[last]).sort((a, b) => rankCmp(a.rounds[last], b.rounds[last]));
      if (c[0]) prizes.push({ prize: `Best game ${last + 1}`, team: c[0].team, line: c[0].rounds[last] });
      // Clubs may not allow two prizes to one team. The app still awards the prize as normal,
      // but when the best-last-game team already has Winners or Runners-up it names the next best.
      const top = prizes.filter(x => x.prize === 'Winners' || x.prize === 'Runners-up');
      const dup = c[0] && top.find(x => x.team === c[0].team);
      if (dup) {
        const nx = c.find(r => !top.some(x => x.team === r.team));
        clash = { team: c[0].team, prize: dup.prize, game: last + 1, next: nx ? { team: nx.team, line: nx.rounds[last] } : null };
      }
    }
    if (opts.booby && done.length > 2) prizes.push({ prize: 'Booby', team: done[done.length - 1].team, row: done[done.length - 1] });
    return { rows, prizes, clash };
  }

  // ---------- Card-by-card entry ----------
  // scores[teamId] = [ {f, a}, {f, a} ]  (game 1, game 2) typed straight off each team's card.
  const okNum = v => Number.isInteger(v) && v >= 0;
  const gameDone = e => !!e && okNum(e.f) && okNum(e.a);
  function cardLine(team, e, winPoints) {
    const wp = winPoints || 0, won = e.f > e.a, drawn = e.f === e.a, pts = drawn ? wp / 2 : won ? wp : 0;
    return { team, for: e.f, against: e.a, score: e.f - e.a, points: pts, total: e.f - e.a + pts, won, drawn };
  }
  function standingsFromCards(teams, scores, rounds, winPoints, opts) {
    const rs = [];
    for (let g = 0; g < rounds; g++) {
      const obj = {};
      teams.forEach(t => { const e = (scores[t.id] || [])[g]; if (gameDone(e)) obj[t.id] = { lines: [cardLine(t.id, e, winPoints)] }; });
      rs.push(obj);
    }
    return standings(teams, rs, opts);
  }
  function cardsEntered(teams, scores, rounds) {
    return teams.filter(t => { for (let g = 0; g < rounds; g++) if (!gameDone((scores[t.id] || [])[g])) return false; return true; }).length;
  }
  // Warnings when the two cards of a match disagree. Game 1 opponents come from the draw.
  // Game 2 opponents are only certain when neither game-1 rink feeding that rink was level.
  function checkCards(round1, table, scores) {
    const warn = [], g = (id, k) => (scores[id] || [])[k];
    const mirror = (x, y, k) => { const ex = g(x, k), ey = g(y, k); return !(gameDone(ex) && gameDone(ey)) || (ex.f === ey.a && ex.a === ey.f); };
    const fed = {}; let g1ok = {};
    round1.forEach(m => {
      const [x, y] = m.teams;
      if (!mirror(x, y, 0)) warn.push({ game: 1, rink: m.rink, teams: [x, y] });
      const ex = g(x, 0), ey = g(y, 0);
      g1ok[m.rink] = gameDone(ex) && gameDone(ey) && mirror(x, y, 0) && ex.f !== ex.a;
      if (table && g1ok[m.rink]) {
        const w = ex.f > ex.a ? x : y, l = w === x ? y : x;
        (fed[table[m.rink].winnersTo] = fed[table[m.rink].winnersTo] || []).push(w);
        (fed[table[m.rink].losersTo] = fed[table[m.rink].losersTo] || []).push(l);
      }
    });
    Object.keys(fed).forEach(r => { const t = fed[r]; if (t.length === 2 && !mirror(t[0], t[1], 1)) warn.push({ game: 2, rink: r, teams: t }); });
    return warn;
  }

  // ---------- Skip cards ----------
  function skipCards(comp, teams, round1, table) {
    const cards = [];
    round1.forEach(m => m.teams.forEach(id => {
      const t = teams.find(x => x.id === id);
      cards.push({ title: comp.name, team: id, names: t.name || '', positions: FORMATS[comp.format].positions,
                   start: m.rink, losersTo: table ? table[m.rink].losersTo : '', winnersTo: table ? table[m.rink].winnersTo : '',
                   rounds: comp.rounds, showPoints: !!comp.bonusOn });
    }));
    return cards.sort((a, b) => a.team.length - b.team.length || (a.team < b.team ? -1 : 1));
  }

  // ---------- Club ladder ----------
  // ladder = { players: [id...] (top first), free: {id: n}, open: bool, challenges: [...] }
  // challenge = { id, challenger, defender, date (YYYY-MM-DD), status: 'open'|'played'|'walkover'|'cancelled',
  //               shotsC, shotsD, resultDate, moved }
  const LADDER_REACH = 3, LADDER_DAYS = 14, FREE_CHALLENGES = 2;
  function newLadder() { return { players: [], free: {}, open: false, challenges: [] }; }
  function addDays(d, n) { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function dueDate(ch) { return addDays(ch.date, LADDER_DAYS); }
  function isOverdue(ch, today) { return ch.status === 'open' && today > dueDate(ch); }
  function openChallengeOf(L, id) { return L.challenges.find(c => c.status === 'open' && (c.challenger === id || c.defender === id)); }
  // Add players to the bottom. newEntrant = true gives them the free challenges.
  function ladderAdd(L, ids, newEntrant) {
    ids.forEach(id => { if (!L.players.includes(id)) { L.players.push(id); L.free[id] = newEntrant ? FREE_CHALLENGES : 0; } });
    return L;
  }
  function ladderRemove(L, id) {
    L.players = L.players.filter(x => x !== id); delete L.free[id];
    L.challenges.forEach(c => { if (c.status === 'open' && (c.challenger === id || c.defender === id)) c.status = 'cancelled'; });
    return L;
  }
  function canChallenge(L, challenger, defender) {
    const ic = L.players.indexOf(challenger), id = L.players.indexOf(defender);
    if (ic < 0 || id < 0) return { ok: false, reason: 'Both players must be on the ladder.' };
    if (ic <= id) return { ok: false, reason: 'You can only challenge someone above you.' };
    if (openChallengeOf(L, challenger)) return { ok: false, reason: 'The challenger already has a challenge to play.' };
    if (openChallengeOf(L, defender)) return { ok: false, reason: 'That player already has a challenge to play.' };
    const within = ic - id <= LADDER_REACH, free = (L.free[challenger] || 0) > 0;
    if (L.open || within) return { ok: true, usesFree: false };
    if (free) return { ok: true, usesFree: true };
    return { ok: false, reason: `Only up to ${LADDER_REACH} places above (unless the ladder is open or a free challenge is left).` };
  }
  function eligibleDefenders(L, challenger) { return L.players.filter(d => canChallenge(L, challenger, d).ok); }
  function issueChallenge(L, challenger, defender, date, idGen) {
    const chk = canChallenge(L, challenger, defender); if (!chk.ok) throw new Error(chk.reason);
    // a new entrant's first two challenges are free ones, whoever they challenge
    const usedFree = (L.free[challenger] || 0) > 0; if (usedFree) L.free[challenger]--;
    const ch = { id: idGen ? idGen() : 'c' + (L.challenges.length + 1), challenger, defender, date, status: 'open', usedFree };
    L.challenges.push(ch); return ch;
  }
  // Winner of a challenge: if the challenger wins (and is still below), they take the defender's place
  // and everyone from there down to the challenger's old place moves down one.
  function moveUp(L, winner, loser) {
    const iw = L.players.indexOf(winner), il = L.players.indexOf(loser);
    if (iw < 0 || il < 0 || iw <= il) return false;
    L.players.splice(iw, 1); L.players.splice(il, 0, winner); return true;
  }
  function recordResult(L, chId, shotsC, shotsD, date) {
    const ch = L.challenges.find(c => c.id === chId); if (!ch || ch.status !== 'open') throw new Error('Not an open challenge');
    if (!(Number.isInteger(shotsC) && Number.isInteger(shotsD) && shotsC >= 0 && shotsD >= 0) || shotsC === shotsD) throw new Error('Enter both scores; one player must win');
    ch.status = 'played'; ch.shotsC = shotsC; ch.shotsD = shotsD; ch.resultDate = date;
    ch.winner = shotsC > shotsD ? ch.challenger : ch.defender;
    ch.moved = ch.winner === ch.challenger ? moveUp(L, ch.challenger, ch.defender) : false;
    return ch;
  }
  function recordWalkover(L, chId, date) {
    const ch = L.challenges.find(c => c.id === chId); if (!ch || ch.status !== 'open') throw new Error('Not an open challenge');
    ch.status = 'walkover'; ch.resultDate = date; ch.winner = ch.challenger; ch.moved = moveUp(L, ch.challenger, ch.defender);
    return ch;
  }
  function cancelChallenge(L, chId, refundFree) {
    const ch = L.challenges.find(c => c.id === chId); if (!ch || ch.status !== 'open') return null;
    ch.status = 'cancelled'; if (refundFree && ch.usedFree) L.free[ch.challenger] = (L.free[ch.challenger] || 0) + 1; return ch;
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
    scoreMatch, round2Matches, standings, standingsFromCards, cardsEntered, checkCards, gameDone, skipCards, STARTING, newCompetitionSettings, switchFormat, rememberSettings,
    LADDER_REACH, LADDER_DAYS, FREE_CHALLENGES, newLadder, addDays, dueDate, isOverdue, openChallengeOf, ladderAdd, ladderRemove,
    canChallenge, eligibleDefenders, issueChallenge, moveUp, recordResult, recordWalkover, cancelChallenge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BowlsEngine = api;
})(this);
