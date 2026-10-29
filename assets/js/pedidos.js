// Quadro de pedidos premium (kanban em tempo real) — busca, filtros, avanço de status, alerta de atraso por SLA.
(function () {
  if (!Bora.requireAuth()) return;

  // Colunas no estilo das grandes plataformas (Cozinha → Aguardando → Saiu → Entregue)
  const COLUNAS = [
    { key: 'COZINHA', titulo: 'Cozinha', icon: '🍳', cor: '#f59e0b', inclui: ['RECEBIDO', 'CONFIRMADO', 'EM_PREPARO'] },
    { key: 'AGUARDANDO', titulo: 'Aguardando entrega', icon: '📦', cor: '#3b82f6', inclui: ['PRONTO'] },
    { key: 'SAIU', titulo: 'Saiu para entrega', icon: '🛵', cor: '#a855f7', inclui: ['SAIU_PARA_ENTREGA'] },
    { key: 'ENTREGUE', titulo: 'Entregue', icon: '✓', cor: '#22c55e', inclui: ['ENTREGUE'] },
    // Sem esta coluna a aba "Cancelados" existia e NUNCA mostrava nada: o filtro deixava o
    // cancelado passar, e o render so emite card para quem cabe numa coluna. Quem cancelou por
    // engano nao tinha onde conferir. Ela so aparece na aba propria -- ver `passaFiltro`.
    { key: 'CANCELADO', titulo: 'Cancelados', icon: '✕', cor: '#94a3b8', inclui: ['CANCELADO'] }
  ];
  const PROXIMO = { RECEBIDO: 'EM_PREPARO', CONFIRMADO: 'EM_PREPARO', EM_PREPARO: 'PRONTO',
    PRONTO: 'SAIU_PARA_ENTREGA', SAIU_PARA_ENTREGA: 'ENTREGUE' };
  const ROTULO_AVANCO = { EM_PREPARO: 'Preparar', PRONTO: 'Pronto', SAIU_PARA_ENTREGA: 'Despachar', ENTREGUE: 'Entregar' };

  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const minutosDesde = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : 0;
  const tempoTxt = m => m < 1 ? 'agora' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  const PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  const TEL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>';

  let cache = [];
  let filtro = 'ATIVOS';

  // O quadro é do dia. Sem isso a coluna "Entregue" empilhava dia após dia e o balcão abria a manhã
  // com a tela do dia anterior. Pedido em andamento de outro dia o servidor manda junto de qualquer
  // forma — quem entrou 23h50 e está em preparo à meia-noite não pode sumir da cozinha.
  const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const diaEscolhido = () => { const el = document.getElementById('dia'); return el && el.value ? el.value : hojeISO(); };
  let termo = '';

  async function mudarStatus(id, status, motivo) {
    let url = `/api/pedidos/${id}/status?status=${status}`;
    if (motivo) url += '&motivo=' + encodeURIComponent(motivo);
    try { await Bora.api(url, { method: 'PATCH' }); carregar(); }
    catch (e) { alert(e.message); }
  }
  window.__avancar = (id, st) => mudarStatus(id, PROXIMO[st]);
  // Item 6.8 da varredura: este texto vai INTEIRO para o cliente, no WhatsApp e na tela de
  // acompanhar ("seu pedido foi cancelado (MOTIVO)"). Quem digita tem que saber -- "acabou o acai,
  // esse cliente sempre reclama" era escrito achando que ficava interno.
  const AVISO_MOTIVO = 'Motivo do cancelamento:\n\n'
    + '⚠️ Este texto é enviado AO CLIENTE no WhatsApp e aparece na tela de acompanhar o pedido.\n'
    + 'Escreva o que você diria a ele.';

  window.__cancelar = (id) => { const m = prompt(AVISO_MOTIVO); if (m && m.trim()) mudarStatus(id, 'CANCELADO', m.trim()); };
  window.__aceitar = (id) => mudarStatus(id, 'CONFIRMADO');
  window.__recusar = (id) => { const m = prompt(AVISO_MOTIVO.replace('cancelamento', 'recusa')); if (m && m.trim()) mudarStatus(id, 'CANCELADO', m.trim()); };
  window.__imprimir = (id) => { const p = cache.find(x => x.id === id); if (p && typeof boraPrintComanda === 'function') boraPrintComanda(p); };
  window.__refresh = () => carregar().catch(e => Bora._conexao(false, e));

  // Excluir some com o pedido de vez (inclusive das vendas). Só gerente e dono, e só para teste ou
  // pedido lançado errado — o de verdade que não vai sair se cancela, e fica no histórico.
  const papel = (Bora.user() && Bora.user().papel) || '';
  const podeExcluir = ['GERENTE', 'ADMINISTRADOR_LOJA', 'ADMINISTRADOR_BORA'].includes(papel);
  window.__excluir = async (id) => {
    const p = cache.find(x => x.id === id);
    const nome = p ? (p.codigo || '#' + p.id) : '#' + id;
    // O que acontece com o estoque e o cashback está escrito aqui de propósito. Até 20/10/2026 o
    // excluir NÃO devolvia nada, e o lojista não tinha como saber — o cliente perdia o saldo que
    // gastou numa venda que o próprio lojista acabou de apagar.
    const volta = p && p.status === 'CANCELADO'
      ? 'O estoque e o cashback já voltaram quando você cancelou.'
      : 'O estoque e o cashback deste pedido VOLTAM.';
    if (!confirm(`Excluir o pedido ${nome} de vez?\n\nUse só para pedido de TESTE ou lançado errado: ele some das vendas e dos relatórios e não dá para desfazer.\n\n${volta}\n\nPedido de verdade que não vai sair: use Cancelar.`)) return;
    try { await Bora.api('/api/pedidos/' + id, { method: 'DELETE' }); await carregar(); }
    catch (e) { alert('Não foi possível excluir: ' + e.message); }
  };

  // detecção de pedido novo → som + toast
  let conhecidos = null;
  // De QUAL dia é o conjunto acima. Sem isto, trocar de dia fazia o quadro inteiro parecer novo:
  // cada pedido RECEBIDO do dia que entrou apitava e, com a impressão automática ligada, saía na
  // impressora — uma pilha de comandas repetidas de uma vez (achado pelo QA em 26/10/2026).
  //
  // Acontecia em dois momentos: ao clicar "Hoje" depois de olhar um dia fechado, e na virada da
  // meia-noite, que é quando a açaiteria ainda está aberta e a impressora fica ao lado do cliente.
  let diaDosConhecidos = null;
  function detectarNovos(board, dia) {
    const idsRecebidos = board.filter(p => p.status === 'RECEBIDO').map(p => p.id);
    if (dia !== diaDosConhecidos) {
      // Primeira carga DESTE dia: vale a mesma regra da primeira carga da tela. O que já estava
      // aberto não é novidade, é o que ele vai encontrar quando chegar.
      diaDosConhecidos = dia;
      conhecidos = new Set(idsRecebidos);
      return;
    }
    if (conhecidos === null) { conhecidos = new Set(idsRecebidos); return; } // 1ª carga: não alerta
    board.forEach(p => {
      if (p.status === 'RECEBIDO' && !conhecidos.has(p.id)) {
        if (typeof boraBeep === 'function') boraBeep();
        const canal = boraCanal(p.origem);
        if (typeof boraToast === 'function')
          boraToast(`${canal.ic} Novo pedido ${p.codigo ? '#' + esc(p.codigo) : ''}<small>${esc(p.clienteNome) || 'Cliente'} · ${money(p.valorTotal)} · ${esc(canal.key)}</small>`, 'novo');
        // impressão automática da comanda (liga/desliga no botão 🖨️ do topo)
        if (localStorage.getItem('boraAutoPrint') === '1' && typeof boraPrintComanda === 'function') {
          setTimeout(() => boraPrintComanda(p), 400);
        }
      }
    });
    conhecidos = new Set(idsRecebidos);
  }

  function passaFiltro(p) {
    if (termo) {
      const alvo = `${p.codigo || ''} ${p.id} ${p.clienteNome || ''} ${p.clienteTelefone || ''}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    const origem = (p.origem || '').toUpperCase();
    if (filtro === 'CANCELADO') return p.status === 'CANCELADO';
    if (p.status === 'CANCELADO') return false; // cancelados só na aba própria
    // Delivery e quem vai ser ENTREGUE, e isso esta no tipoEntrega -- nao no canal. O teste era
    // "tudo que nao e balcao", e com isso pedido de RETIRADA feito por telefone contava como
    // entrega: o lojista via delivery onde nao houve nenhum, e a conta por canal saia errada.
    // Pedido antigo pode nao ter tipoEntrega; nesse caso cai no canal, como antes.
    if (filtro === 'DELIVERY') {
      if (p.tipoEntrega) return p.tipoEntrega === 'ENTREGA';
      return origem.includes('DELIVERY') || origem.includes('ENTREGA');
    }
    if (filtro === 'BALCAO') {
      if (p.tipoEntrega) return p.tipoEntrega === 'RETIRADA' || origem.includes('BALC');
      return origem.includes('BALC');
    }
    return true; // ATIVOS / TODOS
  }

  // SOBRE A LINHA DE PAGAMENTO DO CARTÃO (a <span class="pay">, mais abaixo)
  //
  // Dois defeitos moravam ali, achados pelo QA em 24/10/2026:
  //
  // 1) Mostrava o texto CRU da forma de pagamento. O marketplace grava "CREDIT", e era isso que
  //    aparecia na cara do operador. Agora passa pelo boraFormaPagamento (app.js), a mesma
  //    normalização do Fechar Caixa — as duas telas falando do mesmo dinheiro com as mesmas
  //    palavras.
  //
  // 2) O "||" ESCONDIA O CANAL: com a forma preenchida, a origem nunca era mostrada. Um pedido do
  //    iFood pago em crédito dizia só "Crédito", e o operador não tinha como saber de onde veio. E
  //    isso muda o que ele faz — pedido de marketplace não se liga para o cliente, e o
  //    cancelamento é por lá. Agora os dois aparecem.
  //
  // Este comentário vive FORA do template literal de propósito. Eu o escrevi dentro, como
  // comentário de HTML, e as crases de `boraFormaPagamento` fecharam a template: o arquivo parou de
  // compilar com "Unexpected identifier 'CREDIT'". É a terceira vez que eu faço isso no mesmo dia
  // (acerto-entregadores.js e importar-insumos.js foram as outras duas).

  /**
   * A forma de pagamento, com guarda — mesmo padrão do `boraSla` logo abaixo, e pela mesma razão.
   *
   * `boraFormaPagamento` mora no `app.js`, que é outro arquivo com outro cache. Se o navegador do
   * lojista estiver com uma versão velha do app.js, chamar a função direto derrubaria o QUADRO
   * INTEIRO — a tela onde a cozinha trabalha — por causa de um rótulo de pagamento. Com a guarda,
   * o pior caso é o texto cru voltar a aparecer naquele cartão.
   */
  const forma = (p) => (typeof boraFormaPagamento === 'function'
    ? boraFormaPagamento(p.formaPagamento)
    : (p.formaPagamento || 'Pagamento —'));

  function card(p, col) {
    const mins = minutosDesde(p.atualizadoEm || p.criadoEm);
    const sla = (typeof boraSla === 'function') ? boraSla(p.origem) : 30;
    const atrasado = ['COZINHA', 'AGUARDANDO'].includes(col.key) && mins >= sla;
    const avanca = PROXIMO[p.status];
    const itensTxt = (p.itens && p.itens.length)
      ? p.itens.slice(0, 4).map(i => `<b>${i.quantidade || 1}×</b> ${esc(i.descricao)}`).join('<br>') +
        (p.itens.length > 4 ? `<br><span style="color:#94a3b8">+${p.itens.length - 4} item(ns)</span>` : '')
      : '<span style="color:#94a3b8">Sem itens detalhados</span>';
    // O endereco DESTE pedido vem primeiro. `clienteEndereco` e o do CADASTRO: no cliente recorrente
    // que se mudou, era o endereco antigo — e era isso que o card mostrava para quem entrega.
    const retirada = p.tipoEntrega ? p.tipoEntrega === 'RETIRADA'
                                   : /RETIRADA NO BALC/i.test(p.observacao || '');
    const endereco = retirada ? '' : [p.enderecoEntrega || p.clienteEndereco,
                                      p.bairroEntrega || p.clienteBairro].filter(Boolean).join(' · ');
    const canal = boraCanal(p.origem);
    const novo = p.status === 'RECEBIDO';
    return `<div class="kcard ${atrasado ? 'late' : ''}" style="--col:${col.cor}">
      ${p.canalExterno ? `<span class="canaltag">${canal.ic} ${esc(canal.key)}</span>` : ''}
      <div class="kcard-top">
        <div class="num">${esc(p.codigo) || '#' + p.id} <small>#${p.id}</small></div>
        <div class="clock">⏱ ${tempoTxt(mins)}</div>
      </div>
      <div class="cli">${esc(p.clienteNome) || 'Cliente avulso'}</div>
      ${p.clienteTelefone ? `<div class="line">${TEL}${esc(p.clienteTelefone)}</div>` : ''}
      ${retirada ? `<div class="line">🛍️ <b>Retirada no balcão</b></div>` : ''}
      ${endereco ? `<div class="line">${PIN}${esc(endereco)}</div>` : ''}
      ${p.aguardandoPagamento ? `<div class="late-tag" style="background:#fffbeb;color:#92400e;border-color:#fde68a">⏳ Esperando o PIX — não prepare ainda</div>` : ''}
      <div class="itens">${itensTxt}</div>
      ${p.observacao ? `<div class="obs">📝 ${esc(p.observacao)}</div>` : ''}
      ${atrasado ? `<div class="late-tag">⚠ Atrasado — SLA ${sla}min (${tempoTxt(mins)})</div>` : ''}
      <div class="kcard-foot">
        <span class="val">${money(p.valorTotal)}</span>
        <span class="pay">${esc(forma(p))}${p.origem
          ? ' · ' + boraCanal(p.origem).ic + ' ' + esc(boraCanal(p.origem).key) : ''}</span>
      </div>
      <div class="kacts">
        ${novo
          ? `<button class="ok" onclick="__aceitar(${p.id})">✓ Aceitar</button>
             <button class="no" title="Recusar" onclick="__recusar(${p.id})">Recusar</button>`
          : (avanca
              ? `<button class="adv" onclick="__avancar(${p.id},'${p.status}')">${ROTULO_AVANCO[avanca] || 'Avançar'} →</button>`
              : '<button class="adv" disabled style="opacity:.5;cursor:default">Concluído</button>')}
        <button class="prt" title="Imprimir comanda" onclick="__imprimir(${p.id})">🖨</button>
        ${!novo && p.status !== 'ENTREGUE' && p.status !== 'CANCELADO' ? `<button class="no" title="Cancelar" onclick="__cancelar(${p.id})">✕</button>` : ''}
        ${podeExcluir ? `<button class="no" title="Excluir pedido de teste (não dá para desfazer)" onclick="__excluir(${p.id})">🗑</button>` : ''}
      </div>
    </div>`;
  }

  function render() {
    const board = document.getElementById('kboard'); if (!board) return;
    const visiveis = cache.filter(passaFiltro);
    board.innerHTML = COLUNAS.map(col => {
      const lista = visiveis.filter(p => col.inclui.includes(p.status));
      const corpo = lista.length
        ? lista.map(p => card(p, col)).join('')
        : '<div class="kcol-empty">Nenhum pedido aqui</div>';
      return `<div class="kcol">
        <div class="kcol-head" style="--col:${col.cor}">
          <span class="ttl"><span class="ic">${col.icon}</span>${col.titulo}</span>
          <span class="pill">${lista.length}</span>
        </div>
        <div class="kcol-body">${corpo}</div>
      </div>`;
    }).join('');
  }

  async function carregar() {
    const board = document.getElementById('kboard'); if (!board) return;
    try {
      const dia = diaEscolhido();
      cache = await Bora.board(dia);
      detectarNovos(cache, dia);
      render();
      // O ROTULO DIZ A VERDADE SOBRE O DIA, e nao so a hora (achado medindo a virada, 26/10/2026).
      //
      // Antes era sempre "Atualizado hh:mm". O `aoTrocarDia` escrevia "Dia fechado" e chamava o
      // recarregamento na linha seguinte, que sobrescrevia o aviso: em dia fechado a tela dizia
      // "Atualizado 09:00", como se estivesse ao vivo, e o lojista perdia o unico sinal de que o
      // quadro NAO esta mais se atualizando. Olhar um dia fechado e achar que e hoje e ver pedido
      // que ja foi entregue como se estivesse esperando.
      const lt = document.getElementById('liveTxt');
      if (lt) {
        lt.textContent = dia === hojeISO()
          ? 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : 'Dia fechado';
      }
    } catch (e) {
      // Com o quadro ja carregado, o erro ficava invisivel: os cards antigos continuavam na tela e o
      // "Atualizado hh:mm" congelava sem ninguem notar. O erro SOBE para o Bora.repetir, que mostra a
      // faixa de "sem conexao". Na primeira carga nao ha o que mostrar, entao o aviso vai no quadro.
      if (!cache.length) board.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`;
      throw e;
    }
  }

  // O quadro esta SEGUINDO o dia corrente, ou parado num dia escolhido?
  //
  // Isto existe por causa da meia-noite (achado pelo QA em 26/10/2026). O campo `#dia` e preenchido
  // com a data NO CARREGAMENTO da pagina, e o recarregamento automatico so roda enquanto o valor do
  // campo e igual a hoje. Numa loja que fica aberta depois da meia-noite -- acaiteria, pizzaria --,
  // o quadro deixado aberto PARAVA DE ATUALIZAR na virada: pedido novo nunca aparecia, nao apitava,
  // nao imprimia, e o "Atualizado 23:59" ficava congelado dizendo que estava tudo bem. A cozinha nao
  // via o pedido e o cliente esperava.
  //
  // A regra: se o dia mostrado era HOJE na hora em que foi escolhido, o quadro acompanha o relogio.
  // Se o lojista foi olhar um dia fechado, fica parado nele -- que e o que ele pediu.
  let seguindoHoje = true;

  /** Virou o dia com a tela aberta? Então o quadro anda junto. Devolve true se mexeu. */
  function acompanharViradaDoDia() {
    const el = document.getElementById('dia');
    if (!el || !seguindoHoje || el.value === hojeISO()) return false;
    el.value = hojeISO();
    if (window.__aoTrocarDia) window.__aoTrocarDia();
    return true;
  }

  /** Troca o dia do quadro; "Hoje" volta ao ao vivo. */
  function ligarControlesDeDia() {
    const el = document.getElementById('dia');
    if (!el) return;
    el.value = hojeISO();
    const mover = (passo) => {
      const d = new Date(el.value + 'T12:00:00');
      d.setDate(d.getDate() + passo);
      el.value = d.toISOString().slice(0, 10);
      aoTrocarDia();
    };
    const aoTrocarDia = () => {
      const ehHoje = el.value === hojeISO();
      // Quem decide se o quadro acompanha a virada e o proprio valor escolhido: dia que E hoje
      // segue o relogio; dia fechado fica onde esta.
      seguindoHoje = ehHoje;
      const tag = document.getElementById('liveTxt');
      if (tag) tag.textContent = ehHoje ? 'Ao vivo' : 'Dia fechado';
      document.getElementById('diaSeguinte').disabled = ehHoje;
      if (window.__refresh) window.__refresh();
    };
    window.__aoTrocarDia = aoTrocarDia;
    el.addEventListener('change', aoTrocarDia);
    document.getElementById('diaAnterior').addEventListener('click', () => mover(-1));
    document.getElementById('diaSeguinte').addEventListener('click', () => mover(1));
    document.getElementById('diaHoje').addEventListener('click', () => { el.value = hojeISO(); aoTrocarDia(); });
    aoTrocarDia();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const busca = document.getElementById('busca');
    if (busca) busca.addEventListener('input', () => { termo = busca.value.trim().toLowerCase(); render(); });
    const chips = document.getElementById('chips');
    if (chips) chips.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      chips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      b.classList.add('active'); filtro = b.dataset.f; render();
    });
    ligarControlesDeDia();
    carregar().catch(e => Bora._conexao(false, e));
    // dia fechado não muda mais: só o dia corrente fica se atualizando sozinho
    // `return` e obrigatorio: sem ele o repetir nao recebe a promessa e nunca ve a falha de rede.
    Bora.repetir(() => {
      // A virada vem ANTES do teste: era aqui que o quadro parava para sempre a meia-noite.
      // `acompanharViradaDoDia` ja recarrega quando mexe, por isso o `null`.
      if (acompanharViradaDoDia()) return null;
      return diaEscolhido() === hojeISO() ? carregar() : null;
    }, 8000);
  });
})();
