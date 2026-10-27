// Relatórios gerenciais — consome /api/relatorios (faturamento, CMV/margem, dia/canal/produto/entregador).
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);
  let dias = 30, rel = null, lojaEscolhida = null;

  /**
   * Seletor de loja: o balancete já mostrava a rede lado a lado, mas o relatório detalhado (dia,
   * canal, produto, entregador, margem) só saía da loja em que a sessão estava. Para ver a outra
   * unidade era preciso trocar o painel inteiro de contexto.
   */
  async function ligarSeletorDeLoja() {
    const sel = $('relLoja');
    if (!sel) return;
    let lojas = [];
    try { lojas = await Bora.minhasLojas() || []; } catch (e) { return; }
    if (lojas.length < 2) return;                       // loja única não precisa escolher
    const atual = lojas.find(l => l.atual) || lojas[0];
    lojaEscolhida = atual.id;
    sel.innerHTML = lojas.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('');
    sel.value = String(lojaEscolhida);
    sel.parentElement.style.display = '';
    sel.addEventListener('change', () => { lojaEscolhida = Number(sel.value); carregar(); });
  }

  // Quantas barras cabem antes de o grafico virar risco. Acima disto, agrupa por semana.
  const MAX_BARRAS = 31;

  /**
   * Agrupa a serie diaria em blocos de 7, do mais ANTIGO para o mais novo.
   *
   * Por que existe (26/10/2026): o servico mandava 30 dias mesmo quando o cabecalho dizia 90, e a
   * soma das barras nao fechava com o faturamento. Agora ele manda todos os dias da janela e quem
   * agrupa para caber na tela e aqui -- com os dados todos na mao, em vez de um pedaco do periodo
   * jogado fora no servidor.
   *
   * Os blocos sao contados DO FIM: a ultima barra tem de ser sempre a semana que acabou de passar,
   * e nao um resto de 2 dias no comeco empurrando tudo.
   */
  function agruparPorSemana(ent) {
    const fora = [];
    for (let fim = ent.length; fim > 0; fim -= 7) {
      const bloco = ent.slice(Math.max(0, fim - 7), fim);
      const soma = bloco.reduce((t, e) => t + Number(e[1]), 0);
      fora.unshift({ de: bloco[0][0], ate: bloco[bloco.length - 1][0], valor: soma, dias: bloco.length });
    }
    return fora;
  }

  const diaMes = d => d.slice(8) + '/' + d.slice(5, 7);

  function barras(porDia) {
    const ent = Object.entries(porDia);
    const semanal = ent.length > MAX_BARRAS;
    // A soma das barras tem de continuar sendo o faturamento, agrupadas ou nao.
    const blocos = semanal ? agruparPorSemana(ent)
      : ent.map(([d, v]) => ({ de: d, ate: d, valor: Number(v), dias: 1 }));
    const max = Math.max(1, ...blocos.map(b => b.valor));
    $('bars').innerHTML = blocos.map(b => {
      const pct = Math.round(b.valor / max * 100), peak = b.valor === max && b.valor > 0;
      const titulo = b.dias > 1
        ? diaMes(b.de) + ' a ' + diaMes(b.ate) + ' — ' + money(b.valor)
        : diaMes(b.de) + ' — ' + money(b.valor);
      // Na visao semanal a legenda e o dia de INICIO do bloco, com o mes: so o numero do dia
      // apareceria repetido tres vezes num grafico de 90 dias.
      const legenda = b.dias > 1 ? b.de.slice(8) + '/' + b.de.slice(5, 7) : b.de.slice(8);
      return `<div class="b ${peak ? 'peak' : ''}" title="${titulo}"><div class="fill" style="height:${b.valor > 0 ? Math.max(pct, 4) : 0}%"></div><div class="cap">${legenda}</div></div>`;
    }).join('');
    const nota = $('barsNota');
    if (nota) {
      nota.textContent = semanal
        ? 'Cada barra = uma semana. A soma das barras é o faturamento do período.'
        : '';
    }
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
      rel = await Bora.relatorios(dias, lojaEscolhida);
      const sub = $('relSub');
      // As datas exatas, e nao so "ultimos N dias": N dias contados de quando era justamente a
      // duvida de quem comparava o grafico com o numero grande.
      const periodo = rel.de && rel.ate
        ? ' · ' + rel.dias + ' dias (' + diaMes(rel.de) + ' a ' + diaMes(rel.ate) + ')'
        : ' · últimos ' + rel.dias + ' dias';
      if (sub && rel.loja) sub.textContent = rel.loja + periodo;
      $('kFat').textContent = money(rel.faturamento);
      // Item 5.8 da varredura: o faturamento e o BRUTO que o cliente pagou, taxa de entrega
      // incluida. Quando quem entrega e o marketplace, essa taxa e dele -- e estava somando aqui sem
      // ninguem saber. Nao descontei do numero de proposito (isso e decisao do dono); o que entrou e
      // dizer o tamanho embaixo. So aparece quando existe: loja sem marketplace nao ganha ruido.
      const taxaMkt = Number(rel.taxaDoMarketplace || 0);
      const slotTaxa = $('kTaxaMkt');
      if (slotTaxa) {
        slotTaxa.textContent = taxaMkt > 0
          ? ' · inclui ' + money(taxaMkt) + ' de taxa de entrega do marketplace'
          : '';
      }
      $('kPed').textContent = rel.pedidos;
      $('kTicket').textContent = money(rel.ticketMedio);
      $('kMargem').textContent = money(rel.margem) + (Number(rel.faturamento) ? ` · ${rel.margemPct}%` : '');
      $('kCmv').textContent = money(rel.cmv);
      // ITEM SEM CUSTO CADASTRADO (26/10/2026): ele entra no CMV como zero, porque nao ha nada
      // melhor a fazer com ele. O resultado e um CMV MENOR do que o real e uma margem MAIOR -- e a
      // tela nao dizia nada. Medido na producao em 26/10/2026: 26 dos 48 itens de pedido estao sem
      // custo. O numero continua aparecendo; o que muda e ele parar de parecer exato.
      const slotIncompleto = $('kMargemAviso');
      if (slotIncompleto) {
        const semCusto = Number(rel.itensSemCusto || 0);
        slotIncompleto.textContent = semCusto > 0
          ? ' · ' + semCusto + ' de ' + rel.itensVendidos + ' itens sem custo cadastrado: a margem '
            + 'real é menor'
          : '';
        slotIncompleto.style.color = semCusto > 0 ? '#b45309' : '';
      }
      $('kCanc').textContent = rel.cancelados;
      // Pedido com PIX gerado e nao pago entrava na conta de CANCELADO (era `todos - vendas`, e
      // `vendas` tira os dois). O lojista lia como venda perdida o pedido que ainda podia entrar.
      $('kAguard').textContent = rel.aguardandoPagamento != null ? rel.aguardandoPagamento : '—';
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
    ligarSeletorDeLoja().then(carregar);
    $('periodo').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return;
      document.querySelectorAll('#periodo .chip').forEach(x => x.classList.remove('active')); b.classList.add('active'); dias = Number(b.dataset.d); carregar(); });
    $('csv').addEventListener('click', exportarCsv);
  });
})();
