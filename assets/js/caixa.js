// Fechamento de caixa do dia — totais por forma de pagamento e por canal, com impressão.
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ehHoje = iso => { if (!iso) return false; const d = new Date(iso), h = new Date(); return d.toDateString() === h.toDateString(); };
  const $ = id => document.getElementById(id);

  let resumo = null;

  function barras(elId, agg, cor) {
    const linhas = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...linhas.map(l => l[1]));
    $(elId).innerHTML = linhas.length ? linhas.map(([nm, v]) => `<div class="row2">
      <div class="nm">${esc(nm)}</div>
      <div class="track"><div class="barfill" style="width:${Math.round((v / max) * 100)}%${cor ? ';background:' + cor : ''}"></div></div>
      <div class="vl">${money(v)}</div></div>`).join('') : '<p style="color:#94a3b8;font-size:13px">Sem vendas hoje.</p>';
  }

  window.__imprimirFechamento = () => {
    if (!resumo) return;
    const loja = (JSON.parse(localStorage.getItem('boraTheme') || '{}').name) || 'Bora';
    const linha = (k, v) => `<tr><td>${esc(k)}</td><td class="r">${money(v)}</td></tr>`;
    const w = window.open('', '_print', 'width=320,height=640');
    w.document.write(`<html><head><title>Fechamento</title><style>
      *{font-family:'Courier New',monospace;font-size:13px;margin:0}body{padding:8px;width:280px}
      h2{text-align:center;font-size:16px;margin:4px 0}hr{border:none;border-top:1px dashed #000;margin:6px 0}
      table{width:100%}td{padding:2px 0}.r{text-align:right}.b{font-weight:bold}.big{font-size:18px;font-weight:bold}.c{text-align:center}</style></head><body>
      <h2>${loja}</h2><div class="c">FECHAMENTO DE CAIXA</div><div class="c">${new Date().toLocaleString('pt-BR')}</div><hr>
      <table><tr><td class="b">Faturamento</td><td class="r big">${money(resumo.fat)}</td></tr>
      <tr><td>Pedidos</td><td class="r">${resumo.ped}</td></tr>
      <tr><td>Ticket médio</td><td class="r">${money(resumo.ticket)}</td></tr>
      <tr><td>Cancelados</td><td class="r">${resumo.canc}</td></tr></table>
      <hr><div class="b">POR PAGAMENTO</div><table>${Object.entries(resumo.pag).map(([k, v]) => linha(k, v)).join('')}</table>
      <hr><div class="b">POR CANAL</div><table>${Object.entries(resumo.can).map(([k, v]) => linha(k, v)).join('')}</table>
      <hr><div class="c">BoraHapp • caixa do dia</div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  };

  async function carregar() {
    try {
      const board = await Bora.board();
      const hoje = board.filter(p => ehHoje(p.criadoEm));
      const vendas = hoje.filter(p => p.status !== 'CANCELADO');
      const fat = vendas.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
      const ticket = vendas.length ? fat / vendas.length : 0;
      const canc = hoje.filter(p => p.status === 'CANCELADO').length;

      const pag = {}, can = {};
      vendas.forEach(p => {
        const fp = p.formaPagamento || 'Não informado';
        pag[fp] = (pag[fp] || 0) + Number(p.valorTotal || 0);
        const ck = boraCanal(p.origem); const nm = ck.ic + ' ' + ck.key;
        can[nm] = (can[nm] || 0) + Number(p.valorTotal || 0);
      });

      resumo = { fat, ped: vendas.length, ticket, canc, pag, can };
      $('sub').textContent = 'Resumo de ' + new Date().toLocaleDateString('pt-BR');
      $('kFat').textContent = money(fat);
      $('kPed').textContent = vendas.length;
      $('kTicket').textContent = money(ticket);
      $('kCanc').textContent = canc;
      barras('pagamentos', pag, '#22c55e');
      barras('canais', can);
    } catch (e) { $('sub').textContent = 'Erro: ' + e.message; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('imprimir').addEventListener('click', () => window.__imprimirFechamento());
    carregar(); setInterval(carregar, 15000);
  });
})();
