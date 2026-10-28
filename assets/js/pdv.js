// Frente de Caixa (PDV) — venda rápida no balcão; cria pedido via API.
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let produtos = [], clientes = [], cart = [], cat = 'TODAS', termo = '', pagamento = 'Dinheiro';
  // A ordem das secoes escolhida pela loja (nome -> posicao). Vazio = ordem alfabetica, como antes.
  let posicaoDaSecao = {};
  const complementosPorProduto = {}; // cache por produto, para o toque no tile abrir na hora

  const $ = id => document.getElementById(id);

  function atualizarCashback() {
    const c = clientes.find(x => String(x.id) === $('cliente').value);
    const box = $('cashbackBox');
    if (c && Number(c.cashback || 0) > 0) {
      box.style.display = 'flex'; $('cashbackVal').textContent = money(c.cashback);
    } else { box.style.display = 'none'; $('usarCashback').checked = false; }
    renderCart();   // trocar de cliente muda o desconto, logo muda o TOTAL
  }

  /**
   * Quanto do saldo entra NESTE pedido.
   *
   * Mesma regra do servidor (`FidelidadeService.resgatePossivel`): o resgate nunca zera o pedido,
   * sempre fica pelo menos um centavo a pagar. Repetir a regra aqui e de proposito -- a tela tem
   * que mostrar o MESMO numero que vai ser gravado. Quem decide de verdade continua sendo o
   * servidor; isto e a previsao, e ela precisa bater.
   */
  function descontoDoCashback(subtotal) {
    if (!$('usarCashback').checked) return 0;
    const c = clientes.find(x => String(x.id) === $('cliente').value);
    if (!c) return 0;
    const saldo = Number(c.cashback || 0);
    if (saldo <= 0 || subtotal <= 0) return 0;
    const teto = subtotal - 0.01;
    if (teto <= 0) return 0;
    return Math.round(Math.min(saldo, teto) * 100) / 100;
  }

  /** O mesmo rotulo que o servidor usa: categoria vazia e "Outros" -- ver CategoriaOrdemService. */
  function rotuloDaSecao(c) { return String(c == null ? '' : c).trim() || 'Outros'; }

  function cats() {
    const set = new Set(produtos.map(p => rotuloDaSecao(p.categoria)));
    // A MESMA ordem do cardapio do cliente: quem tem posicao gravada vem primeiro, na posicao
    // escolhida; quem nao tem sai no fim, em A-Z. O `localeCompare('pt-BR')` existe porque
    // `.sort()` seco compara por codigo de caractere e joga "Agua" (com acento) depois do Z --
    // o balconista procuraria a secao onde ela nao esta.
    const ordenadas = [...set].sort((a, b) => {
      const pa = posicaoDaSecao[a], pb = posicaoDaSecao[b];
      if (pa != null && pb != null) return pa - pb;
      if (pa != null) return -1;
      if (pb != null) return 1;
      return a.localeCompare(b, 'pt-BR');
    });
    const lista = ['TODAS', ...ordenadas];
    $('cats').innerHTML = lista.map(c =>
      `<button class="chip ${c === cat ? 'active' : ''}" data-c="${esc(c)}">${c === 'TODAS' ? 'Todos' : esc(c)}</button>`).join('');
  }

  function grid() {
    const vis = produtos.filter(p => p.ativo !== false)
      .filter(p => cat === 'TODAS' || rotuloDaSecao(p.categoria) === cat)
      .filter(p => !termo || (p.nome || '').toLowerCase().includes(termo));
    // No balcão se vende pelo olho: a foto acha o produto mais rápido que ler o nome.
    // Quem não tem foto mostra a inicial, para os cartões não ficarem de alturas diferentes.
    $('grid').innerHTML = vis.length ? vis.map(p =>
      `<button class="prodtile" onclick="__add(${p.id})">
        ${p.imagemUrl
          ? `<img class="pf" src="${p.imagemUrl}" alt="" loading="lazy">`
          : `<div class="pf pf-vazia">${esc((p.nome || '?').trim().charAt(0).toUpperCase())}</div>`}
        <div class="pc">${esc(p.categoria || 'Outros')}</div>
        <div class="pn">${esc(p.nome)}</div>
        <div class="pp">${money(p.preco)}</div>
      </button>`).join('') : '<p style="color:#94a3b8">Nenhum produto. Cadastre em Produtos.</p>';
  }

  function renderCart() {
    const box = $('items');
    if (!cart.length) { box.innerHTML = '<div class="cart-empty">Toque em um produto para começar</div>'; }
    else {
      box.innerHTML = cart.map((i, ix) =>
        `<div class="citem">
          <div class="cn">${esc(i.nome)}${i.extras ? ' <em style="font-style:normal;color:#64748b">' + esc(i.extras) + '</em>' : ''}<small>${money(i.preco)} un</small></div>
          <div class="qty">
            <button onclick="__dec(${ix})">−</button><span>${i.qtd}</span><button onclick="__inc(${ix})">+</button>
          </div>
          <div style="width:74px;text-align:right;font-weight:800">${money(i.preco * i.qtd)}</div>
        </div>`).join('');
    }
    const qtd = cart.reduce((s, i) => s + i.qtd, 0);
    const subtotal = cart.reduce((s, i) => s + i.preco * i.qtd, 0);
    const desconto = descontoDoCashback(subtotal);
    $('qtdItens').textContent = qtd;
    $('linhaCashbackBox').hidden = desconto <= 0;
    $('linhaCashback').textContent = '- ' + money(desconto);
    $('total').textContent = money(Math.max(0, subtotal - desconto));
    $('finish').disabled = !cart.length;
  }

  /** Produto sem complemento entra direto; com complemento abre a escolha antes. */
  window.__add = async id => {
    const p = produtos.find(x => x.id === id);
    if (!p) return;
    let grupos;
    try {
      grupos = await carregarComplementos(id);
    } catch (e) {
      // Nao coloca no carrinho: produto com adicional entrando pelo preco base e prejuizo silencioso.
      alert('Não consegui carregar os adicionais de "' + p.nome + '". Tente de novo — '
        + 'se eu colocasse agora, ele entraria sem os adicionais e pelo preço base.');
      return;
    }
    if (!grupos.length) { colocar(p, [], [], 0); return; }
    abrirEscolha(p, grupos);
  };
  window.__inc = ix => { if (cart[ix]) cart[ix].qtd++; renderCart(); };
  window.__dec = ix => { if (!cart[ix]) return; cart[ix].qtd--; if (cart[ix].qtd <= 0) cart.splice(ix, 1); renderCart(); };

  function colocar(p, ids, nomes, extra) {
    const chave = p.id + ':' + ids.slice().sort((a, b) => a - b).join(',');
    const it = cart.find(x => x.chave === chave);
    if (it) it.qtd++;
    else cart.push({ chave, id: p.id, nome: p.nome, extras: nomes.join(', '), complementos: ids,
                     preco: Number(p.preco || 0) + extra, qtd: 1 });
    renderCart();
  }

  /* ---- complementos: sem isso o balcão vendia açaí sem adicional e pelo preço errado ---- */

  async function carregarComplementos(produtoId) {
    if (!complementosPorProduto[produtoId]) {
      try { complementosPorProduto[produtoId] = await Bora.api('/api/produtos/' + produtoId + '/complementos') || []; }
      catch (e) {
        // Item 7.5 da varredura: aqui gravava `[]` no cache. Uma falha de rede de um segundo fazia o
        // produto entrar no carrinho SEM os adicionais e pelo PRECO BASE, para o resto da sessao --
        // numa acaiteria, metade do valor da venda. E nada na tela dizia nada.
        //
        // Nao cachear e avisar: a proxima tentativa busca de novo, e o operador sabe que nao deve
        // fechar essa venda ainda.
        throw e;
      }
    }
    return complementosPorProduto[produtoId];
  }

  function abrirEscolha(p, grupos) {
    const modal = $('modalComp');
    $('mcTitulo').textContent = p.nome;
    $('mcErro').textContent = '';
    $('mcCorpo').innerHTML = grupos.map(g => {
      const min = g.minimo || 0, max = g.maximo || 1;
      const regra = min > 0 ? `escolha ${min === max ? min : min + ' a ' + max}` : `até ${max}, opcional`;
      return `<div class="mc-grupo">
        <div class="mc-gnome">${esc(g.nome)} <span>(${regra})</span></div>
        ${(g.itens || []).map(i => `<label class="mc-op">
          <input type="${max === 1 ? 'radio' : 'checkbox'}" name="g${g.id}" value="${i.id}"
                 data-grupo="${g.id}" data-max="${max}" data-preco="${Number(i.preco || 0)}" data-nome="${esc(i.nome)}">
          <span>${esc(i.nome)}</span>
          <b>${Number(i.preco || 0) > 0 ? '+' + money(i.preco) : ''}</b></label>`).join('')}
      </div>`;
    }).join('');

    const atualizarPreco = () => {
      const extra = Array.from($('mcCorpo').querySelectorAll('input:checked'))
        .reduce((s, i) => s + Number(i.dataset.preco || 0), 0);
      $('mcPreco').textContent = money(Number(p.preco || 0) + extra);
    };
    $('mcCorpo').querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
      if (inp.type === 'checkbox' && inp.checked
          && $('mcCorpo').querySelectorAll(`input[data-grupo="${inp.dataset.grupo}"]:checked`).length > Number(inp.dataset.max)) {
        inp.checked = false; return;
      }
      atualizarPreco();
    }));
    atualizarPreco();

    $('mcOk').onclick = () => {
      const marcados = Array.from($('mcCorpo').querySelectorAll('input:checked'));
      for (const g of grupos) {
        const min = g.minimo || 0;
        if (min && marcados.filter(i => i.dataset.grupo === String(g.id)).length < min) {
          $('mcErro').textContent = `Escolha ${min} em "${g.nome}"`;
          return;
        }
      }
      colocar(p, marcados.map(i => Number(i.value)), marcados.map(i => i.dataset.nome),
              marcados.reduce((s, i) => s + Number(i.dataset.preco || 0), 0));
      modal.style.display = 'none';
    };
    $('mcCancelar').onclick = () => { modal.style.display = 'none'; };
    modal.style.display = 'flex';
  }

  async function finalizar() {
    if (!cart.length) return;
    const body = {
      clienteId: $('cliente').value ? Number($('cliente').value) : null,
      formaPagamento: pagamento, origem: 'Balcão',
      // Venda de balcao e RETIRADA por definicao: o cliente esta na loja, com o produto na mao -- e
      // esta tela ja marca o pedido como entregue na hora, logo abaixo. Sem o tipo, o pedido nascia
      // ENTREGA e aparecia na tela de Entregas esperando motoboy (item 6.2 da varredura).
      tipoEntrega: 'RETIRADA',
      usarCashback: $('usarCashback').checked,
      itens: cart.map(i => ({ produtoId: i.id, quantidade: i.qtd, complementos: i.complementos || [] }))
    };
    $('finish').disabled = true; $('finish').textContent = 'Processando…';
    try {
      const ped = await Bora.criarPedido(body);
      // venda de balcão já entregue na hora
      let aviso = '';
      try { await Bora.mudarStatus(ped.id, 'ENTREGUE'); } catch (e) { aviso = 'Venda registrada, mas não consegui marcá-la como entregue (' + e.message + '). Finalize o pedido em Pedidos para ele sair da cozinha.'; }
      cart = [];
      // Cada venda de balcao e uma pessoa diferente. Sem zerar o cliente aqui, o seletor continuava
      // no anterior e `atualizarCashback()` logo abaixo voltava a oferecer o saldo DELE -- e, como
      // ele so desmarca quando o saldo e zero, com saldo sobrando a marcacao ficava ligada para a
      // venda seguinte. A proxima pessoa atendida gastava, ou acumulava, no nome errado.
      // Zerar e DEPOIS de gravar: o pedido acima ja saiu com o cliente certo.
      $('cliente').value = '';
      $('usarCashback').checked = false;
      renderCart();
      try { clientes = await Bora.clientes(); atualizarCashback(); } catch (e) {} // saldo de cashback atualizado
      $('finish').textContent = '✓ Venda registrada!';
      setTimeout(() => { $('finish').textContent = 'Finalizar venda'; }, 1500);
      if (aviso) alert(aviso);
    } catch (e) {
      alert('Erro ao finalizar: ' + e.message);
      $('finish').textContent = 'Finalizar venda'; $('finish').disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('busca').addEventListener('input', e => { termo = e.target.value.trim().toLowerCase(); grid(); });
    $('cats').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; cat = b.dataset.c; cats(); grid(); });
    $('pays').addEventListener('click', e => { const b = e.target.closest('.pay-btn'); if (!b) return;
      pagamento = b.dataset.p; document.querySelectorAll('.pay-btn').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); });
    $('finish').addEventListener('click', finalizar);
    $('cliente').addEventListener('change', atualizarCashback);
    // Sem este ouvinte, marcar o visto nao mexia no total: a tela seguia no preco cheio.
    $('usarCashback').addEventListener('change', renderCart);
    try {
      // allSettled: forma de pagamento com problema não pode fechar o caixa da loja
      // `Bora.categorias &&` nao e paranoia: as telas carregam o api.js com `?v=`, e um navegador
      // com o api.js VELHO em cache e o pdv.js novo nao teria essa funcao. Chamar o que nao existe
      // estoura ANTES do allSettled, cai no catch de baixo e a Frente de Caixa inteira some --
      // trocar a ordem dos chips por "nao da para vender" seria um negocio pessimo.
      const [rp, rc, rf, ro] = await Promise.allSettled([
        Bora.produtos(), Bora.clientes(), Bora.formasPagamento(),
        Bora.categorias ? Bora.categorias() : Promise.resolve([])]);
      if (rp.status === 'rejected') throw new Error(rp.reason.message);
      produtos = rp.value || [];
      // allSettled tambem aqui: a ordem das secoes e conforto, nao pode impedir de vender. Se a
      // chamada falhar, os chips voltam para o alfabeto e o balcao continua funcionando.
      if (ro.status === 'fulfilled') {
        (ro.value || []).forEach(c => { if (c && c.gravada) posicaoDaSecao[c.nome] = c.posicao; });
      }
      clientes = rc.status === 'fulfilled' ? (rc.value || []) : [];
      const ativas = (rf.status === 'fulfilled' ? (rf.value || []) : []).filter(f => f.ativo !== false);
      if (ativas.length) {
        pagamento = ativas[0].descricao;
        $('pays').innerHTML = ativas.map((f, i) => `<button class="pay-btn ${i === 0 ? 'sel' : ''}" data-p="${esc(f.descricao)}">${esc(f.descricao)}</button>`).join('');
      }
      $('cliente').innerHTML = '<option value="">Cliente avulso (balcão)</option>' +
        clientes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
      cats(); grid(); renderCart();
    } catch (e) { $('grid').innerHTML = `<p style="color:var(--danger)">${e.message}</p>`; }
  });
})();
