// CRM & Fidelidade — segmenta clientes e ranqueia por valor gasto; cashback acumulado por pedido.
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const diasDesde = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
  const dataTxt = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

  function waLink(tel, nome) {
    const n = (tel || '').replace(/\D/g, ''); if (!n) return null;
    const num = n.length <= 11 ? '55' + n : n;
    const msg = `Oi ${nome ? nome.split(' ')[0] : ''}! Sentimos sua falta 💜 Tem novidade no cardápio — bora pedir?`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  async function carregar() {
    try {
      const clientes = await Bora.clientes();
      let novos = 0, rec = 0, sumidos = 0;
      clientes.forEach(c => {
        const qp = c.qtdPedidos || 0, d = diasDesde(c.ultimoPedido);
        if (qp <= 1) novos++;
        else if (d != null && d <= 30) rec++;
        else if (d != null && d > 30) sumidos++;
      });
      document.getElementById('segNovos').textContent = novos;
      document.getElementById('segRec').textContent = rec;
      document.getElementById('segSumidos').textContent = sumidos;

      const rank = [...clientes].sort((a, b) => Number(b.totalGasto || 0) - Number(a.totalGasto || 0));
      document.getElementById('rank').innerHTML = rank.length ? rank.map((c, i) => {
        const d = diasDesde(c.ultimoPedido);
        const sumido = d != null && d > 30;
        const wa = waLink(c.telefone, c.nome);
        return `<tr>
          <td><b>${i + 1}</b></td>
          <td>${esc(c.nome)}${sumido ? ' <span style="color:#ef4444;font-size:11px">⚠ sumido</span>' : ''}<br><small style="color:#94a3b8">${esc(c.telefone || '')}</small></td>
          <td>${c.qtdPedidos || 0}</td>
          <td><b>${money(c.totalGasto)}</b></td>
          <td><span class="cashtag">${money(c.cashback)}</span></td>
          <td>${dataTxt(c.ultimoPedido)}</td>
          <td style="text-align:right">${wa ? `<a class="btn" style="padding:7px 12px;background:#25d366" href="${wa}" target="_blank">📲 Chamar</a>` : ''}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="7" style="color:#94a3b8">Nenhum cliente cadastrado ainda.</td></tr>';
    } catch (e) { document.getElementById('rank').innerHTML = `<tr><td colspan="7" style="color:var(--danger)">${e.message}</td></tr>`; }
  }

  document.addEventListener('DOMContentLoaded', carregar);
})();
