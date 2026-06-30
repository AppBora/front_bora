// Relatórios gerenciais — consome /api/relatorios (faturamento, CMV/margem, dia/canal/produto/entregador).
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);
  let dias = 30, rel = null;

  function barras(porDia) {
    const ent = Object.entries(porDia);
    const max = Math.max(1, ...ent.map(e => Number(e[1])));
    $('bars').innerHTML = ent.map(([d, v]) => {
      const val = Number(v), pct = Math.round(val / max * 100), peak = val === max && val > 0;
      const dia = d.slice(8) + '/' + d.slice(5, 7);
      return `<div class="b ${peak ? 'peak' : ''}" title="${dia} — ${money(val)}"><div class="fill" style="height:${val > 0 ? Math.max(pct, 4) : 0}%"></div><div class="cap">${d.slice(8)}</div></div>`;
    }).join('');
  }

  function canalBarras(porCanal) {
    const ent = Object.entries(porCanal).sort((a, b) => Number(b[1].faturamento) - Number(a[1].faturamento));
    const max = Math.max(1, ...ent.map(e => Number(e[1].faturamento)));
    $('porCanal').innerHTML = ent.length ? ent.map(([nm, o]) => {
      const c = boraCanal(nm);
      return `<div class="row2"><div class="nm">${c.ic} ${esc(c.key)}</div>
        <div class="track"><div class="barfill" style="width:${Math.round(Number(o.faturamento) / max * 100)}%;background:${c.cor}"></div></div>
        <div class="vl">${money(o.faturamento)}</div></div>`;
    }).join('') : '<p style="color:#94a3b8;font-size:13px">Sem dados.</p>';
  }

  function entregadores(porEnt) {
    const ent = Object.entries(porEnt).sort((a, b) => Number(b[1].entregas) - Number(a[1].entregas));
    $('porEntregador').innerHTML = ent.length ? ent.map(([nm, o], i) =>
      `<div class="topitem"><div class="rk ${i === 0 ? 'gold' : ''}">${i + 1}</div>
        <div class="nm">${esc(nm)}</div><div class="qt">${o.entregas} entregas · ${money(o.valor)}</div></div>`).join('')
      : '<p style="color:#94a3b8;font-size:13px">Sem entregas com motoboy atribuído.</p>';
  }

  function produtos(porProd) {
    const ent = Object.entries(porProd).sort((a, b) => Number(b[1].faturamento) - Number(a[1].faturamento)).slice(0, 15);
    $('porProduto').innerHTML = ent.length ? ent.map(([nm, o], i) => {
      const fat = Number(o.faturamento), cmv = Number(o.cmv), mg = fat - cmv;
      const pct = fat ? (mg / fat * 100) : 0;
      const cor = pct < 20 ? '#dc2626' : pct < 40 ? '#f59e0b' : '#059669';
      return `<tr><td><b>${i + 1}</b></td><td>${esc(nm)}</td><td>${o.quantidade}</td><td>${money(fat)}</td>
        <td>${cmv > 0 ? money(cmv) : '—'}</td><td><b style="color:${cor}">${money(mg)}${fat ? ` (${pct.toFixed(0)}%)` : ''}</b></td></tr>`;
    }).join('') : '<tr><td colspan="6" style="color:#94a3b8">Sem vendas no período.</td></tr>';
  }

  async function carregar() {
    try {
      rel = await Bora.relatorios(dias);
      $('kFat').textContent = money(rel.faturamento);
      $('kPed').textContent = rel.pedidos;
      $('kTicket').textContent = money(rel.ticketMedio);
      $('kMargem').textContent = money(rel.margem) + (Number(rel.faturamento) ? ` · ${rel.margemPct}%` : '');
      $('kCmv').textContent = money(rel.cmv);
      $('kCanc').textContent = rel.cancelados;
      barras(rel.porDia); canalBarras(rel.porCanal); entregadores(rel.porEntregador); produtos(rel.porProduto);
    } catch (e) { $('kFat').textContent = '!'; console.warn(e.message); }
  }

  function exportarCsv() {
    if (!rel) return;
    const linhas = [['Produto', 'Qtd', 'Faturamento', 'CMV', 'Margem'].join(';')];
    Object.entries(rel.porProduto).forEach(([nm, o]) => {
      const fat = Number(o.faturamento), cmv = Number(o.cmv);
      linhas.push([nm, o.quantidade, fat.toFixed(2), cmv.toFixed(2), (fat - cmv).toFixed(2)].map(v => `"${v}"`).join(';'));
    });
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `relatorio-bora-${dias}d.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('periodo').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return;
      document.querySelectorAll('#periodo .chip').forEach(x => x.classList.remove('active')); b.classList.add('active'); dias = Number(b.dataset.d); carregar(); });
    $('csv').addEventListener('click', exportarCsv);
    carregar();
  });
})();
