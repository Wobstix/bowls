/* Bowls Competition Manager — skip cards (Stage 3)
 * One layout, drawn two ways: SVG (screen + printing) and PDF (sharing).
 * A4 portrait, 2 x 3 cards, each 105 x 99 mm.
 */
(function (root) {
  'use strict';
  const PAGE_W = 210, PAGE_H = 297, CW = 105, CH = 99;
  const PT = 0.3528; // mm per point

  // Rough text width in mm (Helvetica-like), used to shrink long names to fit.
  function textW(str, size, bold) { return String(str).length * size * PT * (bold ? 0.58 : 0.52); }
  function fit(str, size, maxW, bold, min) { let s = size; while (s > (min || 7) && textW(str, s, bold) > maxW) s -= 0.5; return s; }

  // Drawing operations for one card, in mm relative to the card's top-left corner.
  function cardOps(c) {
    const ops = [], grey = '#888888';
    const T = (x, y, s, size, o = {}) => ops.push({ t: 'text', x, y, s: String(s), size, bold: !!o.bold, align: o.align || 'left', color: o.color || '#000000' });
    const L = (x1, y1, x2, y2, w, color) => ops.push({ t: 'line', x1, y1, x2, y2, w: w || 0.25, color: color || '#000000' });
    const R = (x, y, w, h, lw) => ops.push({ t: 'rect', x, y, w, h, lw: lw || 0.3 });
    const left = 7, right = 98, mid = (left + right) / 2;

    // Title
    T(mid, 11, c.title, fit(c.title, 15, right - left, true, 9), { bold: true, align: 'center' });
    // Team letter and names
    T(left, 20, 'Team', 10);
    T(left + 10.5, 20.5, c.team, 20, { bold: true });
    const nx = left + 11 + textW(c.team, 20, true) + 3, nameW = right - nx;
    if (c.names) T(nx, 19.5, c.names, fit(c.names, 11, nameW, false, 6.5));
    else T(nx, 19.5, 'TEAM NAME', 11, { bold: true, color: '#bbbbbb' });
    // Position lines (filled in by the team)
    const rows = c.positions.length, gap = rows > 3 ? 5.3 : 6.2;
    c.positions.forEach((p, i) => { const y = 27 + i * gap; T(left + 26, y, p + ' :', 9.5, { align: 'right' }); L(left + 28, y + 0.6, right - 12, y + 0.6, 0.2, grey); });
    // Rink boxes
    const by = 27 + rows * gap + 0.5, bh = 13;
    if (c.rounds === 2) {
      const xs = [left, left + 27, left + 59, right];
      R(xs[0], by, xs[1] - xs[0], bh, 0.9); R(xs[1], by, xs[2] - xs[1], bh); R(xs[2], by, xs[3] - xs[2], bh);
      [['Start', c.start], ['Losers to', c.losersTo], ['Winners to', c.winnersTo]].forEach(([lbl, v], i) => {
        const cx = (xs[i] + xs[i + 1]) / 2; T(cx, by + 4.3, lbl, 9, { align: 'center' }); T(cx, by + 11, v, 15, { bold: true, align: 'center' }); });
    } else {
      R(left, by, 34, bh, 0.9); T(left + 17, by + 4.3, 'Rink', 9, { align: 'center' }); T(left + 17, by + 11, c.start, 15, { bold: true, align: 'center' });
    }
    // Score table
    const ty = by + bh + 3, rh = c.rounds === 2 ? (rows > 3 ? 7.3 : 8) : 9;
    const heads = c.showPoints ? ['', 'For', 'Against', 'Score', '+', 'Total'] : ['', 'For', 'Against', 'Score', 'Total'];
    const widths = c.showPoints ? [15, 15, 16, 15, 9, 21] : [16, 18, 19, 18, 20];
    const rowLabels = c.rounds === 2 ? ['Rnd 1', 'Rnd 2', 'Total'] : ['Rnd 1'];
    const tw = widths.reduce((a, b) => a + b, 0), th = rh * (rowLabels.length + 1);
    R(left, ty, tw, th, 0.3);
    let x = left;
    widths.forEach((w, i) => { if (i) L(x, ty, x, ty + th, 0.25); T(x + w / 2, ty + rh - 2.3, heads[i], heads[i] === '+' ? 11 : 8.5, { bold: true, align: 'center' }); x += w; });
    rowLabels.forEach((lbl, i) => { const y = ty + rh * (i + 1); L(left, y, left + tw, y, i === 0 ? 0.35 : 0.25); T(left + 1.5, y + rh - 2.3, lbl, 9); });
    return ops;
  }

  // Cards ordered by rink so the two cards for a rink sit side by side.
  function sheets(cards) { const out = []; for (let i = 0; i < cards.length; i += 6) out.push(cards.slice(i, i + 6)); return out; }
  function slot(i) { return { x: (i % 2) * CW, y: Math.floor(i / 2) * CH }; }

  // ---------- SVG ----------
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function opsToSvg(ops, ox, oy) {
    return ops.map(o => {
      if (o.t === 'text') return `<text x="${(ox + o.x).toFixed(2)}" y="${(oy + o.y).toFixed(2)}" font-size="${(o.size * PT).toFixed(2)}" font-family="Helvetica, Arial, sans-serif" ${o.bold ? 'font-weight="700"' : ''} fill="${o.color}" text-anchor="${o.align === 'center' ? 'middle' : o.align === 'right' ? 'end' : 'start'}">${esc(o.s)}</text>`;
      if (o.t === 'line') return `<line x1="${(ox + o.x1).toFixed(2)}" y1="${(oy + o.y1).toFixed(2)}" x2="${(ox + o.x2).toFixed(2)}" y2="${(oy + o.y2).toFixed(2)}" stroke="${o.color}" stroke-width="${o.w}"/>`;
      return `<rect x="${(ox + o.x).toFixed(2)}" y="${(oy + o.y).toFixed(2)}" width="${o.w.toFixed(2)}" height="${o.h.toFixed(2)}" fill="none" stroke="#000" stroke-width="${o.lw}"/>`;
    }).join('');
  }
  function sheetSvg(sheet) {
    let body = '';
    sheet.forEach((c, i) => { const s = slot(i); body += opsToSvg(cardOps(c), s.x, s.y); });
    // cutting guides
    body += `<line x1="105" y1="3" x2="105" y2="294" stroke="#999" stroke-width="0.2" stroke-dasharray="1.5 1.5"/>`;
    [99, 198].forEach(y => body += `<line x1="3" y1="${y}" x2="207" y2="${y}" stroke="#999" stroke-width="0.2" stroke-dasharray="1.5 1.5"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}mm" height="${PAGE_H}mm" class="sheet"><rect width="210" height="297" fill="#fff"/>${body}</svg>`;
  }

  // ---------- PDF ----------
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function pdf(cards) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    sheets(cards).forEach((sheet, pi) => {
      if (pi) doc.addPage();
      sheet.forEach((c, i) => {
        const s = slot(i);
        cardOps(c).forEach(o => {
          if (o.t === 'text') { doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size); doc.setTextColor(...hex(o.color)); doc.text(o.s, s.x + o.x, s.y + o.y, { align: o.align }); }
          else if (o.t === 'line') { doc.setLineWidth(o.w); doc.setDrawColor(...hex(o.color)); doc.line(s.x + o.x1, s.y + o.y1, s.x + o.x2, s.y + o.y2); }
          else { doc.setLineWidth(o.lw); doc.setDrawColor(0, 0, 0); doc.rect(s.x + o.x, s.y + o.y, o.w, o.h); }
        });
      });
      doc.setLineWidth(0.2); doc.setDrawColor(150, 150, 150); doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(105, 3, 105, 294); doc.line(3, 99, 207, 99); doc.line(3, 198, 207, 198); doc.setLineDashPattern([], 0);
    });
    return doc.output('blob');
  }

  root.BowlsCards = { cardOps, sheets, sheetSvg, pdf };
})(typeof window !== 'undefined' ? window : this);
