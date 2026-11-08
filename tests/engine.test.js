// Stage 1 test suite: random competitions checked against every rule.
const E = require('../engine.js');
const fs = require('fs');
const rng = E.makeRng(20261012);
const R = (a, b) => a + Math.floor(rng() * (b - a + 1));
const results = []; let failures = 0;
function suite(name, rule, fn) {
  let runs = 0, fails = 0, firstErr = null;
  const t0 = Date.now();
  try { fn((ok, msg) => { runs++; if (!ok) { fails++; if (!firstErr) firstErr = msg; } }); }
  catch (e) { fails++; firstErr = 'crash: ' + e.stack; }
  failures += fails;
  results.push({ name, rule, runs, fails, firstErr, ms: Date.now() - t0 });
  console.log(`${fails ? 'FAIL' : 'pass'}  ${name}: ${runs} checks${fails ? ' — ' + firstErr : ''}`);
}
const GK = Object.keys(E.GROUPS);
const CLUB2 = ['A', 'B'].flatMap(g => [1, 2, 3, 4, 5, 6].map(i => g + i));            // Queens: 2 greens x 6
const CLUB3 = ['A', 'B', 'C'].flatMap(g => [1, 2, 3, 4, 5, 6, 7].map(i => g + i));     // big club: 3 x 7
function randomPlayers(n, opts = {}) {
  const w = opts.weights || GK.map(() => rng());
  const sum = w.reduce((a, b) => a + b, 0);
  return Array.from({ length: n }, (_, i) => {
    let x = rng() * sum, g = GK[0]; for (let k = 0; k < GK.length; k++) { x -= w[k]; if (x <= 0) { g = GK[k]; break; } }
    return { id: 'p' + i, name: 'Player ' + (i + 1), group: g, seed: rng() < (opts.seedRate || 0) };
  });
}
// Independent check: can everyone play in position? (Hall's condition on contiguous position ranges)
function inPositionPossible(players, format) {
  const pos = E.FORMATS[format].positions, n = players.length / pos.length;
  for (let a = 0; a < pos.length; a++) for (let b = a; b < pos.length; b++) {
    const xs = pos.slice(a, b + 1).map(p => E.POS_X[p]);
    const supply = players.filter(p => xs.some(x => E.posCost(p.group, Object.keys(E.POS_X).find(k => E.POS_X[k] === x)) === 0)).length;
    if (supply < n * (b - a + 1)) return false;
  }
  return true;
}
// Independent brute force of the minimum total "distance out of position" (small cases)
function bruteMinCost(players, format) {
  const pos = E.FORMATS[format].positions, n = players.length / pos.length;
  const cnt = {}; GK.forEach(g => cnt[g] = players.filter(p => p.group === g).length);
  let best = Infinity; const left = pos.map(() => n);
  (function rec(gi, cost) {
    if (cost >= best) return;
    if (gi === GK.length) { if (left.every(x => x === 0)) best = cost; return; }
    const g = GK[gi];
    (function dist(k, rem, c) {
      if (k === pos.length) { if (rem === 0) rec(gi + 1, c); return; }
      for (let q = 0; q <= Math.min(rem, left[k]); q++) { left[k] -= q; dist(k + 1, rem - q, c + q * E.posCost(g, pos[k])); left[k] += q; }
    })(0, cnt[g], cost);
  })(0, 0);
  return best;
}

// 1. Entry checks
suite('Entry counts', 'Tabs-in: teams formed fill whole rinks; leftover players reported correctly.', check => {
  for (const f of Object.keys(E.FORMATS)) for (let p = 0; p <= 200; p++) {
    const c = E.tabsInCount(p, f), size = E.FORMATS[f].size;
    check(c.teams % 2 === 0 && c.used + c.leftover === p && c.leftover < 2 * size && c.leftover >= 0, `${f} ${p}`);
  }
  for (let t = 0; t <= 50; t++) { const c = E.checkEntries({ format: 'trips', mode: 'fixed', teamCount: t, rinksInUse: 12, rounds: 2 });
    check((t % 2 === 1) === c.msgs.some(m => m.code === 'oddTeams'), 'odd teams ' + t);
    check((Math.floor(t / 2) > 12) === c.msgs.some(m => m.code === 'rinksShort'), 'rinks short ' + t); }
  [1, 2].forEach(m => check(E.checkEntries({ format: 'pairs', mode: 'fixed', teamCount: m * 2, rinksInUse: m, rounds: 2 }).msgs.some(x => x.code === 'r2Impossible'), 'r2 warn ' + m));
});

// 2. Team forming
let oopStats = { comps: 0, withOop: 0 };
suite('Tabs-in teams', 'Every player used once; right team size; one player per position; skip listed first.', check => {
  for (let k = 0; k < 3000; k++) {
    const f = Object.keys(E.FORMATS)[k % 3], size = E.FORMATS[f].size, teams = 2 * R(1, 21);
    const pl = randomPlayers(teams * size, { seedRate: rng() * 0.4 });
    const { teams: T } = E.formTabsInTeams(pl, f, rng);
    const ids = T.flatMap(t => t.players.map(p => p.id));
    check(T.length === teams && new Set(ids).size === pl.length && ids.length === pl.length, 'players used once');
    check(T.every(t => t.players.length === size && t.players.map(p => p.position).join() === E.FORMATS[f].positions.join()), 'positions');
    check(T.every(t => t.name.startsWith(t.players[0].name) && t.players[0].position === 'Skip'), 'skip first');
  }
});
suite('Positions', 'Nobody plays out of position when it can be avoided; when it cannot, players move the shortest distance (nearest group).', check => {
  for (let k = 0; k < 3000; k++) {
    const f = Object.keys(E.FORMATS)[k % 3], size = E.FORMATS[f].size, teams = 2 * R(1, k < 1500 ? 2 : 21);
    const skew = GK.map(() => rng() < 0.3 ? 0.05 : rng());          // often starve a group
    const pl = randomPlayers(teams * size, { weights: skew });
    const res = E.formTabsInTeams(pl, f, rng);
    const oop = res.teams.flatMap(t => t.players).reduce((a, p) => a + E.posCost(p.group, p.position), 0);
    oopStats.comps++; if (oop > 0) oopStats.withOop++;
    check(oop === res.outOfPosition, 'reported cost');
    check((oop === 0) === inPositionPossible(pl, f), 'in position whenever possible');
    if (teams <= 4) check(oop === bruteMinCost(pl, f), 'shortest distance (brute force)');
  }
});
suite('Seeds', 'Seeded players spread across teams: no team has two seeds while another has none.', check => {
  for (let k = 0; k < 3000; k++) {
    const f = Object.keys(E.FORMATS)[k % 3], size = E.FORMATS[f].size, teams = 2 * R(1, 21);
    const pl = randomPlayers(teams * size, { seedRate: rng() * 0.5 });
    const { teams: T } = E.formTabsInTeams(pl, f, rng);
    const s = T.map(t => t.players.filter(p => p.seed).length);
    check(Math.max(...s) - Math.min(...s) <= 1, 'spread ' + s.join(','));
  }
});

// 3. Round 1
suite('Round 1 draw', 'Every team plays once; two teams per rink; only ticked rinks used, each once.', check => {
  for (let k = 0; k < 3000; k++) {
    const pool = k % 2 ? CLUB3 : CLUB2, n = R(1, pool.length), rinks = E.shuffle(pool, rng).slice(0, n);
    const teams = Array.from({ length: 2 * n }, (_, i) => ({ id: E.teamLetter(i) }));
    const d = E.drawRound1(teams, rinks, rng);
    const ids = d.flatMap(m => m.teams), rs = d.map(m => m.rink);
    check(new Set(ids).size === 2 * n && ids.length === 2 * n, 'teams once');
    check(new Set(rs).size === n && rs.every(r => rinks.includes(r)), 'rinks');
  }
});

// 4. Round 2 table
let greenStats = { tables: 0, cross: 0, moves: 0, allSame: 0 };
function checkTable(rinks, res, check) {
  const T = res.table, n = rinks.length, arrive = {}; rinks.forEach(r => arrive[r] = []);
  for (const r of rinks) {
    const c = T[r];
    check(c.winnersTo && c.losersTo && c.winnersTo !== r && c.losersTo !== r, 'same rink twice ' + r);
    check(c.winnersTo !== c.losersTo, 'W and L same rink ' + r);
    arrive[c.winnersTo].push([r, 'W']); arrive[c.losersTo].push([r, 'L']);
  }
  let mixed = 0;
  for (const r of rinks) {
    check(arrive[r].length === 2, 'rink used once ' + r);
    check(arrive[r][0] && arrive[r][1] && arrive[r][0][0] !== arrive[r][1][0], 'rematch ' + r);
    if (arrive[r][0] && arrive[r][1] && arrive[r][0][1] !== arrive[r][1][1]) mixed++;
  }
  check(mixed === n % 2, 'winner v loser count');
}
suite('Round 2 table', 'No team plays the same rink twice; every rink used once; no rematches; W v W and L v L, exactly one W v L when rinks are odd.', check => {
  for (let k = 0; k < 6000; k++) {
    const pool = k % 2 ? CLUB3 : CLUB2, n = R(3, pool.length), rinks = E.shuffle(pool, rng).slice(0, n);
    const res = E.round2Table(rinks, rng);
    checkTable(rinks, res, check);
    greenStats.tables++; greenStats.cross += res.crossGreenMoves; greenStats.moves += 2 * n; if (!res.crossGreenMoves) greenStats.allSame++;
  }
});
let sameGreenCheck = { tables: 0, ok: 0 };
suite('Round 2 same green', 'When the rinks in use on each green allow it, every team stays on its green.', check => {
  // even, >= 4 rinks on every green in use -> a same-green table exists (each green on its own)
  for (let k = 0; k < 2000; k++) {
    const per = [4, 6][k % 2], greens = ['A', 'B', 'C'].slice(0, R(1, 3));
    const rinks = greens.flatMap(g => Array.from({ length: per }, (_, i) => g + (i + 1)));
    const res = E.round2Table(rinks, rng);
    sameGreenCheck.tables++; if (res.crossGreenMoves === 0) sameGreenCheck.ok++;
    check(res.crossGreenMoves === 0, `${greens.length} greens x ${per}: ${res.crossGreenMoves} moves`);
  }
});

// 5. Scoring
suite('Scoring', 'Score = for minus against. A win earns the win points; a level game is a draw: points shared, difference 0, and the team that scored the last end goes to the winners\' rink.', check => {
  for (let k = 0; k < 20000; k++) {
    const a = R(0, 30), b = rng() < 0.15 ? a : R(0, 30), wp = rng() < 0.3 ? 0 : 2;
    const last = rng() < 0.5 ? 'X' : 'Y';
    const m = E.scoreMatch('X', 'Y', a, b, last, wp);
    const [x, y] = m.lines;
    if (a === b) {
      check(m.drawn && m.winner === null && !x.won && !y.won, 'level = draw');
      check(x.points === wp / 2 && y.points === wp / 2 && x.score === 0 && y.score === 0, 'draw shares points, diff 0');
      check(m.goesWin === last && m.goesLose === (last === 'X' ? 'Y' : 'X'), 'last end decides winners rink');
    } else {
      const w = a > b ? 'X' : 'Y';
      check(m.winner === w && m.goesWin === w && !m.drawn, 'winner');
      check((w === 'X' ? x.points === wp && y.points === 0 : y.points === wp && x.points === 0), 'win points');
    }
    check(x.score === a - b && y.score === b - a && x.for === y.against && y.for === x.against, 'symmetry');
    check(x.total === x.score + x.points && y.total === y.score + y.points, 'total');
  }
  let threw = false; try { E.scoreMatch('X', 'Y', 10, 10, null, 2); } catch (e) { threw = true; }
  check(threw, 'level score without last end is refused');
  check(E.scoreMatch('X', 'Y', 15, 10, null, 2).lines[0].points === 2 && E.scoreMatch('X', 'Y', 15, 10, null, 2).lines[0].score === 5, 'secretary example 15-10 = 2 points, +5');
});

// 6. Full competitions end to end
let fullComps = 0;
suite('Full competitions', 'Draw, Round 1 scores, Round 2 pairing, results: every team plays both games, never the same rink, winners meet winners; totals add up; ranking in order; prizes correct.', check => {
  for (let k = 0; k < 3000; k++) {
    const f = Object.keys(E.FORMATS)[k % 3], pool = k % 2 ? CLUB3 : CLUB2;
    const n = R(3, pool.length), rinks = E.shuffle(pool, rng).slice(0, n);
    const pl = randomPlayers(2 * n * E.FORMATS[f].size, { seedRate: 0.2 });
    const { teams } = E.formTabsInTeams(pl, f, rng);
    const wp = rng() < 0.8 ? 2 : 0;
    const r1 = E.drawRound1(teams, rinks, rng), tab = E.round2Table(rinks, rng);
    const res1 = {}; r1.forEach(m => { const a = R(0, 25), b = rng() < 0.1 ? a : R(0, 25); res1[m.rink] = E.scoreMatch(m.teams[0], m.teams[1], a, b, m.teams[R(0, 1)], wp); });
    const r2 = E.round2Matches(r1, res1, tab.table);
    const startOf = {}; r1.forEach(m => m.teams.forEach(t => startOf[t] = m.rink));
    const ids2 = r2.flatMap(m => m.teams);
    check(r2.length === n && new Set(ids2).size === 2 * n, 'every team plays game 2 once');
    check(r2.every(m => m.teams.every(t => startOf[t] !== m.rink)), 'never same rink');
    const won1 = {}; Object.values(res1).forEach(m => { won1[m.goesWin] = true; won1[m.goesLose] = false; });
    check(r2.filter(m => won1[m.teams[0]] !== won1[m.teams[1]]).length === n % 2, 'winners meet winners');
    const res2 = {}; r2.forEach(m => { const a = R(0, 25), b = rng() < 0.1 ? a : R(0, 25); res2[m.rink] = E.scoreMatch(m.teams[0], m.teams[1], a, b, m.teams[R(0, 1)], wp); });
    const st = E.standings(teams, [res1, res2], { booby: true });
    const rows = st.rows;
    check(rows.every(r => r.total === r.rounds[0].total + r.rounds[1].total && r.score === r.for - r.against), 'totals add up');
    check(rows.reduce((a, r) => a + r.score, 0) === 0, 'shots balance');
    check(rows.reduce((a, r) => a + r.points, 0) === 2 * n * wp, 'points per match = win points'); check(rows.reduce((a, r) => a + r.wins + r.draws / 2, 0) === 2 * n, 'one result per match');
    check(rows.every((r, i) => i === 0 || rows[i - 1].points > r.points || (rows[i - 1].points === r.points && (rows[i - 1].score > r.score || (rows[i - 1].score === r.score && rows[i - 1].against <= r.against)))), 'ranking: points, difference, fewest against');
    const P = Object.fromEntries(st.prizes.map(p => [p.prize, p]));
    check(P.Winners.team === rows[0].team && P['Runners-up'].team === rows[1].team, 'winners');
    check(!P['Best game 1'], 'no best game 1 prize');
    const g2 = rows.map(r => r.rounds[1]); const bestP = Math.max(...g2.map(l => l.points)); const bestS = Math.max(...g2.filter(l => l.points === bestP).map(l => l.score)); check(P['Best game 2'].line.points === bestP && P['Best game 2'].line.score === bestS, 'best game 2');
    check(P.Booby.team === rows[rows.length - 1].team, 'booby = last place'); const minP = Math.min(...rows.map(r => r.points)); const minS = Math.min(...rows.filter(r => r.points === minP).map(r => r.score)); check(P.Booby.row.points === minP && P.Booby.row.score === minS && P.Booby.row.against === Math.max(...rows.filter(r => r.points === minP && r.score === minS).map(r => r.against)), 'booby = fewest points, worst difference, most against');
    const cards = E.skipCards({ name: 'Test', format: f, rounds: 2, bonusOn: wp > 0 }, teams, r1, tab.table);
    check(cards.length === 2 * n && cards.every(c => c.start === startOf[c.team] && c.winnersTo === tab.table[c.start].winnersTo && c.losersTo === tab.table[c.start].losersTo), 'cards');
    const pairCards = {}; cards.forEach(c => (pairCards[c.start] = pairCards[c.start] || []).push(c));
    check(Object.values(pairCards).every(([x, y]) => x.winnersTo === y.winnersTo && x.losersTo === y.losersTo), 'both cards on a rink identical');
    fullComps++;
  }
});

// 6b. Card-by-card entry
suite('Card entry', 'Results worked out from each team\'s card match the rink-by-rink results; disagreeing cards are flagged (game 1 always, game 2 when the pair is certain); matching cards never are.', check => {
  for (let k = 0; k < 2000; k++) {
    const f = Object.keys(E.FORMATS)[k % 3], pool = k % 2 ? CLUB3 : CLUB2;
    const n = R(3, pool.length), rinks = E.shuffle(pool, rng).slice(0, n);
    const teams = Array.from({ length: 2 * n }, (_, i) => ({ id: E.teamLetter(i) }));
    const wp = 2, r1 = E.drawRound1(teams, rinks, rng), tab = E.round2Table(rinks, rng);
    const res1 = {}; r1.forEach(m => { const a = R(0, 25), b = rng() < 0.1 ? a : R(0, 25); res1[m.rink] = E.scoreMatch(m.teams[0], m.teams[1], a, b, m.teams[R(0, 1)], wp); });
    const r2 = E.round2Matches(r1, res1, tab.table);
    const res2 = {}; r2.forEach(m => { const a = R(0, 25), b = rng() < 0.1 ? a : R(0, 25); res2[m.rink] = E.scoreMatch(m.teams[0], m.teams[1], a, b, m.teams[R(0, 1)], wp); });
    const scores = {};
    [res1, res2].forEach((res, gi) => Object.values(res).forEach(m => m.lines.forEach(l => { (scores[l.team] = scores[l.team] || [])[gi] = { f: l.for, a: l.against }; })));
    const A = E.standings(teams, [res1, res2], { booby: true }), B = E.standingsFromCards(teams, scores, 2, wp, { booby: true });
    check(JSON.stringify(A.rows.map(r => [r.team, r.points, r.score, r.against, r.place])) === JSON.stringify(B.rows.map(r => [r.team, r.points, r.score, r.against, r.place])), 'same ranking');
    check(JSON.stringify(A.prizes.map(p => [p.prize, p.team])) === JSON.stringify(B.prizes.map(p => [p.prize, p.team])), 'same prizes');
    check(E.cardsEntered(teams, scores, 2) === 2 * n, 'all cards counted');
    check(E.checkCards(r1, tab.table, scores).length === 0, 'matching cards raise no warning');
    // corrupt one game-1 card
    const m = r1[R(0, r1.length - 1)], x = m.teams[0], bad = JSON.parse(JSON.stringify(scores));
    bad[x][0].f += 1;
    check(E.checkCards(r1, tab.table, bad).some(w => w.game === 1 && w.rink === m.rink), 'game 1 mismatch flagged');
    // corrupt one game-2 card where the pair is certain
    const certain = r2.filter(mm => mm.teams.every(t => { const rr = r1.find(q => q.teams.includes(t)); return !res1[rr.rink].drawn; }));
    if (certain.length) { const mm = certain[0], bad2 = JSON.parse(JSON.stringify(scores)); bad2[mm.teams[0]][1].a += 1;
      check(E.checkCards(r1, tab.table, bad2).some(w => w.game === 2 && w.rink === mm.rink), 'game 2 mismatch flagged'); }
    // partly entered: counts and no crash
    const part = {}; teams.slice(0, n).forEach(t => part[t.id] = scores[t.id]);
    check(E.cardsEntered(teams, part, 2) === n && E.standingsFromCards(teams, part, 2, wp, {}).rows.length === 2 * n, 'partial entry');
  }
});

// 7. Remembered settings
suite('Remembered settings', 'New competition opens on the last format with its last settings; each format keeps its own; first use starts from plain values.', check => {
  let mem = {};
  let s = E.newCompetitionSettings(mem); check(s.format === 'trips' && s.rounds === 2 && s.ends === 10, 'first ever');
  mem = E.rememberSettings(mem, { ...s, ends: 12, name: 'Sunday Mixed Trips' });
  s = E.newCompetitionSettings(mem); check(s.format === 'trips' && s.ends === 12 && s.name === 'Sunday Mixed Trips', 'trips remembered');
  let p = E.switchFormat(mem, 'pairs'); check(p.ends === 10 && p.name === '', 'pairs fresh');
  mem = E.rememberSettings(mem, { ...p, rounds: 1, ends: 8, name: 'Pairs Day' });
  s = E.newCompetitionSettings(mem); check(s.format === 'pairs' && s.ends === 8 && s.rounds === 1, 'last used = pairs');
  const t = E.switchFormat(mem, 'trips'); check(t.ends === 12 && t.rounds === 2 && t.name === 'Sunday Mixed Trips', 'trips kept');
});

// 8. Club ladder
suite('Club ladder', 'Points table: win 2, loss by 3 or fewer 1, else 0; points and shot difference add up over all games (difference may go below zero); ordered on points, then difference, then fewest against; anyone may play anyone; cancelled games count for nothing; a result needs one player on 21 and the other below.', check => {
  check(E.ladderPoints(21, 17) === 2 && E.ladderPoints(17, 21) === 0, '21-17: 2 and 0');
  check(E.ladderPoints(18, 21) === 1 && E.ladderPoints(19, 21) === 1 && E.ladderPoints(20, 21) === 1, 'loss within 3 gets 1');
  check(!E.validLadderScore(20, 18) && !E.validLadderScore(21, 21) && !E.validLadderScore(23, 21) && E.validLadderScore(23, 20) && E.validLadderScore(24, 19) && !E.validLadderScore(25, 20) && E.validLadderScore(0, 21), 'winner 21 to 24, loser under 21');
  check(E.ladderPoints(20, 23) === 1 && E.ladderPoints(19, 24) === 0, '23-20 gives the loser 1, 24-19 gives 0');
  for (let k = 0; k < 2000; k++) {
    const L = E.newLadder(), n = R(2, 25), ids = Array.from({ length: n }, (_, i) => 'p' + i);
    E.ladderAdd(L, ids);
    const exp = {}; ids.forEach(id => exp[id] = { pts: 0, diff: 0, ag: 0, pl: 0 });
    for (let step = 0; step < 40; step++) {
      const c = ids[R(0, n - 1)], d = ids[R(0, n - 1)];
      const res = E.canChallenge(L, c, d);
      check(res.ok === (c !== d && !E.openBetween(L, c, d)), 'anyone may play anyone');
      if (!res.ok) continue;
      const ch = E.issueChallenge(L, c, d, '2026-11-01', () => 'x' + k + '_' + step);
      if (rng() < 0.2) { E.cancelChallenge(L, ch.id); continue; }
      if (rng() < 0.2) continue; // left open
      const cw = rng() < 0.5, lose = R(0, 20), win = R(21, 24), a = cw ? win : lose, b = cw ? lose : win;
      E.recordResult(L, ch.id, a, b, '2026-11-05');
      [[c, a, b], [d, b, a]].forEach(([id, f, ag]) => { const e = exp[id]; e.pl++; e.pts += f > ag ? 2 : ag - f <= 3 ? 1 : 0; e.diff += f - ag; e.ag += ag; });
    }
    const t = E.ladderTable(L);
    check(t.length === n, 'everyone in the table');
    t.forEach(r => { const e = exp[r.id]; check(r.points === e.pts && r.diff === e.diff && r.against === e.ag && r.played === e.pl, `totals ${r.id}`); });
    for (let i = 1; i < t.length; i++) {
      const x = t[i - 1], y = t[i];
      check(x.points > y.points || (x.points === y.points && (x.diff > y.diff || (x.diff === y.diff && x.against <= y.against))), 'order: points, difference, fewest against');
    }
  }
  // the secretary's example: three narrow losses (3 pts, -3) rank above a single win and heavy losses
  const L = E.newLadder(); E.ladderAdd(L, ['a', 'b', 'w', 'x']);
  ['1', '2', '3'].forEach(i => { E.issueChallenge(L, 'a', 'x', '2026-11-01', () => 'a' + i); E.recordResult(L, 'a' + i, 20, 21, '2026-11-02'); });
  E.issueChallenge(L, 'b', 'w', '2026-11-01', () => 'b1'); E.recordResult(L, 'b1', 21, 19, '2026-11-02');
  E.issueChallenge(L, 'b', 'x', '2026-11-01', () => 'b2'); E.recordResult(L, 'b2', 5, 21, '2026-11-02');
  const t = E.ladderTable(L), A = t.find(r => r.id === 'a'), B = t.find(r => r.id === 'b');
  check(A.points === 3 && A.diff === -3 && B.points === 2 && B.diff === -14 && A.place < B.place, 'narrow losses rank above one win');
  let threw = false; try { E.recordResult(L, 'nope', 21, 3, 'x'); } catch (e) { threw = true; } check(threw, 'unknown challenge refused');
  E.issueChallenge(L, 'w', 'x', '2026-11-01', () => 'c1'); threw = false; try { E.recordResult(L, 'c1', 20, 18, 'x'); } catch (e) { threw = true; } check(threw, 'score without 21 refused');
  // deleting a result entered by mistake: the table is the same as if it had never been entered
  { const D = E.newLadder(); E.ladderAdd(D, ['lou', 'mar', 'jul']);
    E.issueChallenge(D, 'lou', 'mar', '2026-11-04', () => 'r1'); E.recordResult(D, 'r1', 21, 12, '2026-11-04');
    const before = JSON.stringify(E.ladderTable(D));
    E.issueChallenge(D, 'lou', 'jul', '2026-11-04', () => 'r2'); E.recordResult(D, 'r2', 21, 12, '2026-11-04');
    check(JSON.stringify(E.ladderTable(D)) !== before, 'wrong result counted');
    E.deleteGame(D, 'r2'); check(JSON.stringify(E.ladderTable(D)) === before && D.challenges.length === 1, 'deleted result removed from the table');
    check(E.deleteGame(D, 'nope') === null, 'unknown result ignored'); }
  // editing a wrong player: the table matches entering it correctly in the first place
  { const X = E.newLadder(), Y = E.newLadder(); [X, Y].forEach(Z => E.ladderAdd(Z, ['lou', 'mar', 'jul']));
    E.issueChallenge(X, 'lou', 'jul', '2026-11-04', () => 'e1'); E.recordResult(X, 'e1', 21, 12, '2026-11-04');
    E.issueChallenge(Y, 'lou', 'mar', '2026-11-04', () => 'e1'); E.recordResult(Y, 'e1', 21, 12, '2026-11-04');
    E.editResult(X, 'e1', 'lou', 'mar', 21, 12, '2026-11-04');
    check(JSON.stringify(E.ladderTable(X)) === JSON.stringify(E.ladderTable(Y)), 'edited result counts as if entered correctly');
    E.editResult(X, 'e1', 'mar', 'lou', 20, 23, '2026-11-05'); const m = E.ladderTable(X).find(r => r.id === 'mar');
    check(m.points === 1 && m.diff === -3 && X.challenges[0].winner === 'lou', 'edit scores: 20-23 loser gets 1');
    let t1 = false; try { E.editResult(X, 'e1', 'lou', 'lou', 21, 3); } catch (e) { t1 = true; }
    let t2 = false; try { E.editResult(X, 'e1', 'lou', 'mar', 20, 3); } catch (e) { t2 = true; }
    check(t1 && t2, 'edit keeps the checks'); }
  // new season: table saved, everyone back to 0, players kept, open games carried over
  { const S = E.newLadder(); E.ladderAdd(S, ['p', 'q', 'r']);
    E.issueChallenge(S, 'p', 'q', '2026-10-01', () => 's1'); E.recordResult(S, 's1', 21, 15, '2026-10-02');
    E.issueChallenge(S, 'q', 'r', '2026-10-05', () => 's2'); E.recordResult(S, 's2', 19, 21, '2026-10-06');
    E.issueChallenge(S, 'p', 'r', '2026-12-30', () => 's3');
    const before = E.ladderTable(S), season = E.newSeason(S, '2027-01-01', id => id.toUpperCase());
    check(season.start === '2026-10-02' && season.end === '2027-01-01', 'season dates');
    check(JSON.stringify(season.table.map(r => [r.id, r.points, r.diff])) === JSON.stringify(before.map(r => [r.id, r.points, r.diff])) && season.table[0].name === 'P', 'final table saved with names');
    check(season.results.length === 2 && season.results[0].date === '2026-10-06' && season.results[0].winner === 'R', 'results saved, newest first');
    check(E.ladderTable(S).every(r => r.points === 0 && r.played === 0) && S.players.length === 3, 'everyone back to 0, players kept');
    check(S.challenges.length === 1 && S.challenges[0].status === 'open', 'open game carried over');
    E.recordResult(S, 's3', 21, 20, '2027-01-03'); const t = E.ladderTable(S);
    check(t[0].id === 'p' && t[0].points === 2 && t.find(r => r.id === 'r').points === 1, 'carried game counts in the new season');
    const s2 = E.newSeason(S, '2027-06-30'); check(s2.start === '2027-01-01' && S.seasons.length === 2, 'second season starts where the first ended'); }
  E.ladderRemove(L, 'b'); check(!L.players.includes('b') && E.ladderTable(L).length === 3, 'player removed');
});

// ---------- Worked example for the report ----------
const ex = (() => {
  const r = E.makeRng(7);
  const names = ['Mike Naidoo','Sue Botha','Ann Coetzee','John Pillay','Mary van Wyk','Pete Harris','Dave Moodley','Lynn Smith','Ravi Govender','Joan Dlamini','Bill Evans','Kay Reddy',
    'Tom Fourie','Gail Jacobs','Ian Mkhize','Rose Pretorius','Ken Chetty','Pam Steyn','Neil Ross','Fay Khumalo','Alan Brown','Wendy Lee','Sam Ngcobo','Liz Venter'];
  const groups = ['S','S','S','S','S','STS','STS','STS','TS','TS','TS','SL','SL','SL','SL','L','L','L','L','L','L','S','TS','SL'];
  const pl = names.map((nm, i) => ({ id: 'm' + i, name: nm, group: groups[i], seed: i < 3 }));
  const { teams, outOfPosition } = E.formTabsInTeams(pl, 'trips', r);
  const rinks = ['A1','A2','A3','B1'];
  const r1 = E.drawRound1(teams, rinks, r), tab = E.round2Table(rinks, r);
  const sc1 = [[18,12],[9,16],[21,7],[14,14],[11,15],[17,10],[13,13],[19,8]];
  const res1 = {}; r1.forEach((m, i) => res1[m.rink] = E.scoreMatch(m.teams[0], m.teams[1], sc1[i][0], sc1[i][1], m.teams[0], 2));
  const r2 = E.round2Matches(r1, res1, tab.table);
  const sc2 = [[15,10],[12,16],[20,9],[10,13],[16,16],[8,14],[17,11],[12,12]];
  const res2 = {}; r2.forEach((m, i) => res2[m.rink] = E.scoreMatch(m.teams[0], m.teams[1], sc2[i][0], sc2[i][1], m.teams[1], 2));
  const st = E.standings(teams, [res1, res2], { booby: true });
  return { players: pl, teams, outOfPosition, rinks, r1, table: tab.table, crossGreen: tab.crossGreenMoves, res1, r2, res2, st };
})();

suite('Round 2 table, move to the other green', 'All table rules still hold; teams staying on their green are the fewest possible (none with an even number of rinks on each of two greens)', check => {
  const all2 = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'];
  for (let m = 0; m < (1 << 12); m++) {
    const rinks = all2.filter((_, i) => m >> i & 1); if (rinks.length < 3) continue;
    for (let seed = 1; seed <= 3; seed++) {
      const res = E.round2Table(rinks, E.makeRng(m * 7 + seed), undefined, { moveGreen: true });
      checkTable(rinks, res, check);
      const a = rinks.filter(r => r[0] === 'A').length, b = rinks.length - a;
      // minimum: the larger green keeps its surplus; with equal odd counts one W and one L pairing must mix greens
      const lb = Math.max(2 * a - 2 * b, 2 * b - 2 * a, a === b && a % 2 ? 2 : 0);
      check(res.sameGreenMoves === lb, `${a}+${b}: ${res.sameGreenMoves} stay, expected ${lb}`);
      let same = 0; rinks.forEach(r => ['winnersTo', 'losersTo'].forEach(k => { if (res.table[r][k][0] === r[0]) same++; }));
      check(same === res.sameGreenMoves, 'sameGreenMoves count wrong');
    }
  }
  // three greens: rules hold
  for (let k = 0; k < 2000; k++) {
    const n = R(3, CLUB3.length), rinks = E.shuffle(CLUB3, rng).slice(0, n);
    checkTable(rinks, E.round2Table(rinks, rng, undefined, { moveGreen: true }), check);
  }
});

suite('Prize clash note', 'Prizes are awarded as normal; when the best last-game team also won Winners or Runners-up, the next best last-game team without either prize is named', check => {
  const rng = E.makeRng(4242);
  let clashes = 0;
  for (let k = 0; k < 4000; k++) {
    const n = 6 + 2 * Math.floor(rng() * 10), teams = Array.from({ length: n }, (_, i) => ({ id: E.teamLetter(i), name: '' }));
    const sc = {}; teams.forEach(t => sc[t.id] = [0, 1].map(() => ({ f: Math.floor(rng() * 25), a: Math.floor(rng() * 25) })));
    const wp = rng() < 0.5 ? 2 : 0, st = E.standingsFromCards(teams, sc, 2, wp, { booby: true });
    const best = st.prizes.find(p => p.prize === 'Best game 2'), top = st.prizes.filter(p => p.prize === 'Winners' || p.prize === 'Runners-up').map(p => p.team);
    check(st.prizes.length === 4, 'four prizes still awarded');
    const shouldClash = top.includes(best.team);
    check(!!st.clash === shouldClash, `clash flag wrong (${best.team} vs ${top})`);
    if (st.clash) {
      clashes++;
      check(st.clash.team === best.team && st.clash.prize === st.prizes.find(p => p.team === best.team).prize, 'clash names the wrong team or prize');
      const g2 = st.rows.filter(r => r.rounds[1]).sort((a, b) => b.rounds[1].points - a.rounds[1].points || b.rounds[1].score - a.rounds[1].score || a.rounds[1].against - b.rounds[1].against);
      const want = g2.find(r => !top.includes(r.team));
      check(st.clash.next && st.clash.next.team === want.team, `next best wrong: ${st.clash.next && st.clash.next.team} vs ${want.team}`);
      check(!top.includes(st.clash.next.team), 'next best already has a prize');
    }
  }
  check(clashes > 100, 'too few clashes exercised: ' + clashes);
  // one game only: no clash possible
  const t1 = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }], s1 = { A: [{ f: 9, a: 2 }], B: [{ f: 2, a: 9 }], C: [{ f: 5, a: 4 }], D: [{ f: 4, a: 5 }] };
  check(E.standingsFromCards(t1, s1, 1, 2, {}).clash === null, 'clash on a 1-game competition');
});

fs.writeFileSync(require('os').tmpdir() + '/bowls_test_results.json', JSON.stringify({ results, failures, oopStats, greenStats, sameGreenCheck, fullComps, example: ex }, null, 1));
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
