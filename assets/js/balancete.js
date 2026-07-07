// Balancete da rede (multi-loja): faturamento por loja + consolidado. Só aparece com 2+ lojas vinculadas.
(function () {
  if (typeof Bora === 'undefined' || !Bora.token()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  let dados = null;

  async function init() {
    const sec = document.getElementById('secBalancete');
    if (!sec) return;
    try {
      const lojas = await Bora.minhasLojas();
      if (!Array.isArray(lojas) || lojas.length < 2) return; // recurso de rede
    } catch (e) { return; }
    sec.hidden = false;
    const hoje = new Date();
    document.getElementById('balIni').value = fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    document.getElementById('balFim').value = fmt(hoje);
    document.getElementById('balAtualizar').onclick = carregar;
    document.getElementById('balCsv').onclick = exportar;
    carregar();
  }

  async function carregar() {
    const corpo = document.getElementById('balCorpo'), rodape = document.getElementById('balTotal');
    corpo.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">Carregando…</td></tr>';
    rodape.innerHTML = '';
    try {
      dados = await Bora.balancete(document.getElementById('balIni').value, document.getElementById('balFim').value);
      corpo.innerHTML = (dados.lojas || []).map(l =>
        `<tr><td>${l.loja}${l.ativa === false ? ' <span style="color:var(--muted);font-size:12px">(inativa)</span>' : ''}</td>
         <td>${l.pedidos}</td><td>${l.cancelados}</td><td>${money(l.ticketMedio)}</td><td><b>${money(l.faturamento)}</b></td></tr>`).join('')
        || '<tr><td colspan="5" style="color:var(--muted)">Sem lojas vinculadas</td></tr>';
      const t = dados.total || {};
      rodape.innerHTML =
        `<tr style="border-top:2px solid var(--primary);font-weight:800">
         <td>TOTAL DA REDE</td><td>${t.pedidos ?? 0}</td><td>${t.cancelados ?? 0}</td>
         <td>${money(t.ticketMedio)}</td><td>${money(t.faturamento)}</td></tr>`;
    } catch (e) {
      corpo.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${e.message || 'Erro ao carregar'}</td></tr>`;
    }
  }

  function exportar() {
    if (!dados) return;
    const linhas = [['Loja', 'Pedidos', 'Cancelados', 'Ticket medio', 'Faturamento']];
    (dados.lojas || []).forEach(l => linhas.push([l.loja, l.pedidos, l.cancelados, l.ticketMedio, l.faturamento]));
    const t = dados.total || {};
    linhas.push(['TOTAL DA REDE', t.pedidos, t.cancelados, t.ticketMedio, t.faturamento]);
    const csv = linhas.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `balancete-rede-${dados.inicio}-a-${dados.fim}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
