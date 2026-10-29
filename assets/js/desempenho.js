// Desempenho consolidado. A mesma tela serve a plataforma (todos os clientes) e o dono de rede
// (as lojas dele) — quem decide o escopo é o backend, pelo papel de quem está logado.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);

  const dinheiro = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // DATA NO FUSO DA LOJA, nao em UTC (pente fino de 29/10/2026).
  //
  // `toISOString()` converte para UTC. No Brasil (UTC-3), das 21h a meia-noite a data UTC JA e a de
  // amanha -- dentro do horario de jantar. O estrago era nos dois valores que esta tela usa:
  //
  //   - `hoje` virava amanha, e o botao "Hoje" devolvia ZERO (nenhuma venda no dia que ainda nao
  //     comecou), fazendo a tela parecer que a loja nao vendeu nada;
  //   - `primeiroDoMes` virava dia 2 no dia 1 as 21h, e o botao "Mes" PERDIA o dia 1 inteiro.
  //
  // Mesmo defeito que o backend ja proibe por teste (ver OfusoNaoPodeSerOdoSistemaTest): ele
  // aparece em tres das vinte e quatro horas, passa nas outras vinte e uma, e por isso sobrevive.
  // O `hojeISO` do pedidos.js ja fazia a conta certa; aqui ela faltava.
  const emISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const hoje = () => emISO(new Date());
  const primeiroDoMes = () => { const d = new Date(); d.setDate(1); return emISO(d); };

  function cartao(rotulo, valor, cor, nota) {
    return `<div class="card" style="padding:14px 16px">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:700">${esc(rotulo)}</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px;color:${cor || 'inherit'}">${esc(valor)}</div>
      ${nota ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(nota)}</div>` : ''}
    </div>`;
  }

  async function carregar() {
    const ini = $('ini').value, fim = $('fim').value;
    $('lista').innerHTML = '<tr><td colspan="12" style="color:#6b7280">Calculando…</td></tr>';
    try {
      const d = await Bora.api('/api/desempenho?inicio=' + ini + '&fim=' + fim);
      const t = d.total;

      $('sub').textContent = d.escopo === 'PLATAFORMA'
        ? 'Todos os clientes da plataforma · ' + d.dias + ' dia(s)'
        : 'Suas lojas · ' + d.dias + ' dia(s)';

      const lucroPositivo = Number(t.lucro) >= 0;
      $('cards').innerHTML =
        cartao('Faturamento', dinheiro(t.faturamento), null, t.pedidos + ' pedidos') +
        cartao('Ticket médio', dinheiro(t.ticketMedio)) +
        cartao('Custo total', dinheiro(t.custoTotal), '#b45309', 'CMV, entrega, cashback, imposto, fixo e mensalidade') +
        cartao('Lucro', dinheiro(t.lucro), lucroPositivo ? '#166534' : '#dc2626', Number(t.margemPct) + '% do faturamento');

      // Sem alíquota e custo fixo cadastrados, o número é margem operacional — dizer isso evita
      // o dono tomar decisão achando que já descontou imposto.
      const aviso = $('aviso');
      if (d.custosIncompletos) {
        aviso.style.display = 'block';
        aviso.innerHTML = '<b>Atenção:</b> há loja sem alíquota de imposto ou custo fixo cadastrados. '
          + 'Para essas, o valor mostrado é <b>margem</b>, não lucro — falta descontar o que não foi informado. '
          + 'Preencha em Configurações da loja.';
      } else {
        aviso.style.display = 'none';
      }

      // sem venda no período: o "prejuízo" é só o rateio de mensalidade e custo fixo
      const comVenda = d.lojas.filter(l => !l.semMovimento);
      const paradas = d.lojas.filter(l => l.semMovimento);
      $('lista').innerHTML = comVenda.map(l => {
        const cor = Number(l.lucro) >= 0 ? '#166534' : '#dc2626';
        const alerta = l.custosIncompletos
          ? ' <span title="Sem imposto ou custo fixo cadastrado" style="color:#b45309">⚠</span>' : '';
        const num = v => `<td style="text-align:right">${dinheiro(v)}</td>`;
        return `<tr>
          <td><b>${esc(l.loja)}</b>${alerta}</td>
          <td style="text-align:right">${l.pedidos}</td>
          ${num(l.faturamento)}${num(l.ticketMedio)}${num(l.cmv)}${num(l.entrega)}
          ${num(l.cashback)}${num(l.imposto)}${num(l.custoFixo)}${num(l.mensalidade)}
          <td style="text-align:right;font-weight:700;color:${cor}">${dinheiro(l.lucro)}</td>
          <td style="text-align:right;color:${cor}">${Number(l.margemPct)}%</td>
        </tr>`;
      }).join('') || '<tr><td colspan="12" style="color:#6b7280">Nenhuma loja vendeu no período.</td></tr>';
      if (paradas.length) {
        $('lista').innerHTML += `<tr><td colspan="12" style="color:#6b7280;font-size:13px;padding-top:12px">`
          + `<b>${paradas.length} loja(s) sem venda no período:</b> ` + paradas.map(l => esc(l.loja)).join(', ')
          + ` — o custo delas no período é só mensalidade e custo fixo.</td></tr>`;
      }
    } catch (e) {
      const m = /perfil|restrit|403/i.test(e.message) ? 'Esta tela é para administradores e gerentes.' : e.message;
      $('lista').innerHTML = `<tr><td colspan="12" style="color:var(--danger)">${esc(m)}</td></tr>`;
    }
  }

  $('buscar').onclick = carregar;
  $('mes').onclick = () => { $('ini').value = primeiroDoMes(); $('fim').value = hoje(); carregar(); };
  $('hoje').onclick = () => { $('ini').value = hoje(); $('fim').value = hoje(); carregar(); };

  document.addEventListener('DOMContentLoaded', () => {
    $('ini').value = primeiroDoMes();
    $('fim').value = hoje();
    carregar();
  });
})();
