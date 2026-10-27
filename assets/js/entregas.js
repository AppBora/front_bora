// Entregas & Roteirização — agrupa pedidos prontos/em rota por bairro, atribui entregador e despacha.
(function () {
  /** Retirada no balcao: le a coluna do pedido; pedido anterior a V48 cai no texto da observacao. */
  const ehRetirada = (p) => p.tipoEntrega ? p.tipoEntrega === 'RETIRADA'
                                          : /RETIRADA NO BALC/i.test(p.observacao || '');
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mins = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : 0;

  let entregadores = [];
  const optsEntregador = sel => '<option value="">— motoboy —</option>' +
    entregadores.filter(e => e.ativo !== false).map(e => `<option ${e.nome === sel ? 'selected' : ''}>${esc(e.nome)}</option>`).join('');

  window.__despachar = async (id) => { try { await Bora.mudarStatus(id, 'SAIU_PARA_ENTREGA'); carregar(); } catch (e) { alert(e.message); } };
  window.__entregue = async (id) => { try { await Bora.mudarStatus(id, 'ENTREGUE'); carregar(); } catch (e) { alert(e.message); } };
  window.__setEntregador = async (id, nome) => { try { await Bora.definirEntregador(id, nome); } catch (e) { alert(e.message); } };
  window.__despacharBairro = async (ids) => {
    // Item 7.4: despachava o bairro inteiro sem perguntar, e um catch VAZIO engolia TODA
    // falha -- o lojista achava que os cinco pedidos sairam e um deles nao tinha saido. Cada
    // despacho avisa o cliente no WhatsApp, entao errar aqui fala com gente de fora.
    if (!confirm('Despachar ' + ids.length + ' pedido(s) deste bairro?\n\n'
      + 'Cada um avisa o cliente no WhatsApp que o pedido saiu para entrega.')) return;
    const falhas = [];
    for (const id of ids) {
      try { await Bora.mudarStatus(id, 'SAIU_PARA_ENTREGA'); }
      catch (e) { falhas.push('#' + id + ': ' + e.message); }
    }
    // Aqui a falha ja e contada no `falhas` logo abaixo; o catch evita a rejeicao nao tratada
    // sem esconder nada de quem esta olhando.
    carregar().catch(e => Bora._conexao(false, e));
    if (falhas.length) {
      alert('Despachei ' + (ids.length - falhas.length) + ' de ' + ids.length + '.\n\n'
        + 'NÃO saiu:\n' + falhas.join('\n'));
    }
  };

  function linha(p, emRota) {
    const tempo = mins(p.atualizadoEm || p.criadoEm);
    const acao = emRota
      ? `<button class="btn" style="padding:7px 12px" onclick="__entregue(${p.id})">✓ Entregue</button>`
      : `<button class="btn" style="padding:7px 12px" onclick="__despachar(${p.id})">🛵 Despachar</button>`;
    return `<tr>
      <td><b>${esc(p.codigo) || '#' + p.id}</b></td>
      <td>${esc(p.clienteNome) || '—'}<br><small style="color:#94a3b8">${esc(p.enderecoEntrega || p.clienteEndereco || '')}</small></td>
      <td>${money(p.valorTotal)}</td>
      <td><select style="width:140px;padding:7px;border:1px solid #e5e7eb;border-radius:8px"
            onchange="__setEntregador(${p.id}, this.value)">${optsEntregador(p.entregador)}</select></td>
      <td>${tempo} min</td>
      <td style="text-align:right">${acao}</td>
    </tr>`;
  }

  function grupoBairro(bairro, prontos) {
    const ids = prontos.map(p => p.id).join(',');
    return `<div class="panel" style="margin-bottom:14px">
      <h2 style="display:flex;justify-content:space-between;align-items:center">
        <span>📍 ${esc(bairro)} <span style="color:#94a3b8;font-weight:600;font-size:13px">· ${prontos.length} pedido(s)</span></span>
        <button class="btn" style="padding:8px 14px" onclick="__despacharBairro([${ids}])">🛵 Despachar rota</button>
      </h2>
      <table class="table"><thead><tr><th>Cód.</th><th>Cliente / Endereço</th><th>Valor</th><th>Entregador</th><th>Espera</th><th></th></tr></thead>
        <tbody>${prontos.map(p => linha(p, false)).join('')}</tbody></table>
    </div>`;
  }

  async function carregar() {
    try {
      const [board, resumo, ents] = await Promise.all([Bora.board(), Bora.resumo(), Bora.entregadores()]);
      entregadores = ents || [];
      const prontos = board.filter(p => p.status === 'PRONTO');
      const emRota = board.filter(p => p.status === 'SAIU_PARA_ENTREGA');

      // kpiProntos e kpiSaiu saem do MESMO board que a tabela logo abaixo. kpiSaiu vinha do
      // /api/dashboard/resumo, e os dois discordavam na tela: o KPI dizia 0 com a tabela
      // mostrando "Em rota (1)". O `emRota` ja era calculado aqui e jogado fora.
      document.getElementById('kpiProntos').textContent = prontos.length;
      document.getElementById('kpiSaiu').textContent = emRota.length;
      // "Entregues na ultima hora" o board nao sabe dizer (nao traz entregueEm), entao continua
      // vindo do resumo. Mas campo ausente escrevia "undefined" na tela, e o lojista nao
      // distinguia "nenhuma entrega" de "a tela quebrou".
      document.getElementById('kpiHora').textContent = resumo.entreguesUltimaHora ?? 0;

      // agrupa prontos por bairro
      const grupos = {};
      // Retirada no balcao NAO e entrega: a tela oferecia "Despachar" para quem ia buscar na loja.
      // E o bairro vem do PEDIDO; pelo cadastro do cliente, todo pedido do cardapio caia em
      // "Sem bairro", porque o bairro escolhido no checkout nao era gravado em lugar nenhum.
      const paraEntregar = prontos.filter(p => !ehRetirada(p));
      const paraRetirar = prontos.filter(ehRetirada);
      paraEntregar.forEach(p => {
        const b = (p.bairroEntrega || p.clienteBairro || 'Sem bairro');
        (grupos[b] = grupos[b] || []).push(p);
      });
      const blocos = Object.entries(grupos).sort((a, b) => b[1].length - a[1].length)
        .map(([b, lst]) => grupoBairro(b, lst)).join('');

      const rotaTabela = `<div class="panel">
        <h2>🛵 Em rota (${emRota.length})</h2>
        <table class="table"><thead><tr><th>Cód.</th><th>Cliente / Endereço</th><th>Valor</th><th>Entregador</th><th>Saiu há</th><th></th></tr></thead>
          <tbody>${emRota.map(p => linha(p, true)).join('') || '<tr><td colspan="6" style="color:#94a3b8">Ninguém em rota.</td></tr>'}</tbody></table>
      </div>`;

      // Os de retirada aparecem em bloco proprio, SEM botao de despachar: eles nao saem da loja.
      const blocoRetirada = paraRetirar.length ? `<div class="panel" style="margin-bottom:14px">
        <h2>🛍️ Retirada no balcão (${paraRetirar.length})</h2>
        <p class="mini" style="color:#64748b;margin:0 0 10px">O cliente vem buscar. Avise quando ele chegar e marque como entregue na tela de Pedidos.</p>
        <table class="table"><thead><tr><th>Cód.</th><th>Cliente</th><th>Valor</th><th>Pronto há</th></tr></thead>
          <tbody>${paraRetirar.map(p => `<tr><td>${esc(p.codigo || p.id)}</td><td>${esc(p.clienteNome || '—')}</td><td>${money(p.valorTotal)}</td><td>${mins(p.atualizadoEm || p.criadoEm)} min</td></tr>`).join('')}</tbody></table>
      </div>` : '';

      document.getElementById('rotas').innerHTML = blocoRetirada +
        (blocos || (paraRetirar.length ? '' : '<div class="panel" style="margin-bottom:14px"><p style="color:#94a3b8">Nenhum pedido pronto aguardando rota.</p></div>')) + rotaTabela;
    } catch (e) {
      document.getElementById('rotas').innerHTML =
        `<div class="panel"><p style="color:var(--danger)">${e.message}</p></div>`;
      // O erro SOBE de proposito, e isto era o defeito (achado pelo QA em 26/10/2026):
      // engolir aqui faz o `Bora.repetir` chamar `_conexao(true)` como se a carga tivesse
      // dado certo -- a faixa de "sem conexao" nunca aparece e, se estava na tela, e
      // REMOVIDA. O proprio comentario do `Bora._conexao` afirma cobrir esta tela.
      throw e;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // A PRIMEIRA carga tambem avisa. Desde que o `carregar` passou a relancar (26/10/2026),
    // deixar esta chamada sem `catch` virava rejeicao nao tratada -- e, pior, a falha da
    // primeira carga ficava sem faixa nenhuma ate o primeiro tique do repetir. E o que o
    // `pedidos.js` ja fazia.
    carregar().catch(e => Bora._conexao(false, e));
    Bora.repetir(carregar, 10000);
  });
})();
