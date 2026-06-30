// Canais de venda — ranking por origem (iFood, 99Food, Rappi, WhatsApp…), com período.
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let board = [], periodo = 'hoje';

  const dentroPeriodo = iso => {
    if (periodo === 'tudo' || !iso) return periodo === 'tudo';
    const d = new Date(iso);
    if (periodo === 'hoje') { const h = new Date(); return d.toDateString() === h.toDateString(); }
    return (Date.now() - d.getTime()) <= 7 * 86400000; // 7 dias
  };

  function render() {
    const vendas = board.filter(p => p.status !== 'CANCELADO' && dentroPeriodo(p.criadoEm));
    const agg = {};
    vendas.forEach(p => {
      const c = boraCanal(p.origem);
      const a = agg[c.key] = agg[c.key] || { ic: c.ic, cor: c.cor, pedidos: 0, fat: 0 };
      a.pedidos++; a.fat += Number(p.valorTotal || 0);
    });
    const linhas = Object.entries(agg).sort((a, b) => b[1].fat - a[1].fat);
    const totalFat = linhas.reduce((s, l) => s + l[1].fat, 0);

    const champ = document.getElementById('champ');
    if (linhas.length) {
      const [nm, o] = linhas[0];
      champ.style.display = 'flex';
      document.getElementById('champIc').textContent = o.ic;
      document.getElementById('champNm').textContent = nm;
      document.getElementById('champVl').textContent = money(o.fat);
    } else champ.style.display = 'none';

    document.getElementById('rank').innerHTML = linhas.length ? linhas.map(([nm, o]) => {
      const share = totalFat ? Math.round((o.fat / totalFat) * 100) : 0;
      const ticket = o.pedidos ? o.fat / o.pedidos : 0;
      return `<tr>
        <td><span class="canalbadge"><span class="cd" style="background:${o.cor}"></span>${o.ic} ${esc(nm)}</span></td>
        <td>${o.pedidos}</td>
        <td><b>${money(o.fat)}</b></td>
        <td>${money(ticket)}</td>
        <td><div style="display:flex;align-items:center;gap:10px">
          <div class="share-track"><div class="share-fill" style="width:${share}%;background:${o.cor}"></div></div>
          <b style="width:42px;text-align:right">${share}%</b></div></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" style="color:#94a3b8">Sem vendas no período.</td></tr>';
  }

  async function carregar() { try { board = await Bora.board(); render(); } catch (e) {
    document.getElementById('rank').innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${e.message}</td></tr>`; } }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('periodo').addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      document.querySelectorAll('#periodo .chip').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); periodo = b.dataset.d; render();
    });
    carregar(); setInterval(carregar, 12000);
  });
})();
