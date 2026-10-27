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
    // Item 7.10: sem esta linha, pop-up bloqueado fazia `w.document` estourar e a tela nao fazia
    // NADA -- o lojista clicava em imprimir o fechamento do caixa e nada acontecia. A funcao
    // compartilhada da comanda (app.js) ja tratava; estas duas ficaram de fora.
    if (!w) { alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e clique de novo.'); return; }
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
      // PIX que ninguem pagou nao e venda. O fechamento contava como faturamento do dia: o lojista
      // fechava o caixa com um dinheiro que nunca entrou, e so descobria conferindo a conta do banco.
      // O servidor ja ignorava esse pedido na receita; aqui nao, e os dois numeros nao fechavam.
      // A regra desta tela estava CERTA e era a unica certa das tres. Agora ela mora em app.js
      // (boraEhVenda) e as tres usam a mesma -- a copia e que deixava o Dashboard divergir.
      const vendas = hoje.filter(boraEhVenda);
      const esperandoPix = hoje.filter(boraEsperandoPix);
      const fat = vendas.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
      const ticket = vendas.length ? fat / vendas.length : 0;
      const canc = hoje.filter(p => p.status === 'CANCELADO').length;

      const pag = {}, can = {};
      vendas.forEach(p => {
        // Agrupa pela forma NORMALIZADA (boraFormaPagamento, em app.js). Com o texto cru, `Pix` e
        // `PIX (pago)` eram duas linhas, `Dinheiro` e `Dinheiro (atualizado)` outras duas, e uma
        // frase inteira com valores dentro virava rótulo de barra. Dez linhas na tela em que o
        // lojista confere o dinheiro do dia -- e ele somando PIX de cabeça.
        //
        // O total NÃO muda: só a chave do agrupamento. O teste cobra essa invariante, porque esta é
        // a tela do dinheiro e um agrupamento que perde centavos é pior que dez linhas.
        const fp = boraFormaPagamento(p.formaPagamento);
        pag[fp] = (pag[fp] || 0) + Number(p.valorTotal || 0);
        const ck = boraCanal(p.origem); const nm = ck.ic + ' ' + ck.key;
        can[nm] = (can[nm] || 0) + Number(p.valorTotal || 0);
      });

      resumo = { fat, ped: vendas.length, ticket, canc, pag, can };
      // Tirar o PIX pendente da conta sem dizer nada deixaria o lojista procurando o dinheiro que
      // "sumiu" do fechamento. Melhor mostrar, separado, que aquilo ainda nao entrou.
      const aviso = esperandoPix.length
        ? ' · ' + esperandoPix.length + ' pedido(s) esperando PIX ('
          + money(esperandoPix.reduce((t, p) => t + Number(p.valorTotal || 0), 0)) + ') fora desta conta'
        : '';
      $('sub').textContent = 'Resumo de ' + new Date().toLocaleDateString('pt-BR') + aviso;
      $('kFat').textContent = money(fat);
      $('kPed').textContent = vendas.length;
      $('kTicket').textContent = money(ticket);
      $('kCanc').textContent = canc;
      barras('pagamentos', pag, '#22c55e');
      barras('canais', can);
    } catch (e) {
      // Esta e a tela de FECHAR O CAIXA. Deixar os totais antigos na tela com um "Erro:"
      // pequeno no subtitulo e o pior resultado possivel: o lojista fecha o caixa contra
      // numeros que nao sao mais os de agora.
      $('sub').textContent = 'Erro ao atualizar: ' + e.message + ' — os números abaixo podem '
        + 'estar velhos.';
      // O erro SOBE de proposito, e isto era o defeito (achado pelo QA em 26/10/2026):
      // engolir aqui faz o `Bora.repetir` chamar `_conexao(true)` como se a carga tivesse
      // dado certo -- a faixa de "sem conexao" nunca aparece e, se estava na tela, e
      // REMOVIDA. O proprio comentario do `Bora._conexao` afirma cobrir esta tela.
      throw e;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('imprimir').addEventListener('click', () => window.__imprimirFechamento());
    // A PRIMEIRA carga tambem avisa. Desde que o `carregar` passou a relancar (26/10/2026),
    // deixar esta chamada sem `catch` virava rejeicao nao tratada -- e, pior, a falha da
    // primeira carga ficava sem faixa nenhuma ate o primeiro tique do repetir. E o que o
    // `pedidos.js` ja fazia.
    carregar().catch(e => Bora._conexao(false, e));
    Bora.repetir(carregar, 15000);
  });
})();
