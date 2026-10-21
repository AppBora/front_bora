// Cardápio digital público (acessível por QR Code) — sem login. Monta pedido e envia pelo WhatsApp.
(function () {
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const params = new URLSearchParams(location.search);
  const lojaId = params.get('loja') || '1';
  const wa = (params.get('wa') || '').replace(/\D/g, '');

  let produtos = [], cart = []; // cart = linhas {produtoId, quantidade, complementos:[ids], rotulo, unit}

  function render() {
    const grupos = {};
    produtos.forEach(p => { const c = p.categoria || 'Outros'; (grupos[c] = grupos[c] || []).push(p); });
    document.getElementById('menu').innerHTML = Object.entries(grupos).map(([cat, itens]) =>
      `<div class="menu-cat"><h3>${esc(cat)}</h3></div>` +
      // Esgotado fica VISIVEL e nao clicavel. Antes o produto sem estoque aparecia normal, o cliente
      // montava o carrinho inteiro e so levava o "acabou" no confirmar -- a pior forma de contar isso
      // a ele. Mesma ideia do aviso de loja fechada, que ja aparece antes.
      //
      // O servidor e quem decide de verdade, na hora de gravar: entre carregar o cardapio e confirmar,
      // alguem pode comprar o ultimo. Isto aqui e so para o cliente nao tomar o susto no fim.
      itens.map(p => `<div class="menu-item"${p.esgotado ? ' style="opacity:.55"' : ''}>
        ${p.imagem ? `<img src="${p.imagem}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:10px;margin-right:10px;flex-shrink:0${p.esgotado ? ';filter:grayscale(1)' : ''}">` : ''}
        <div class="mi"><div class="mn">${esc(p.nome)}</div><div class="mp">${p.esgotado
          ? '<span style="color:#dc2626;font-weight:700">Esgotado</span>'
          : money(p.preco)}</div></div>
        ${p.esgotado
          ? '<button class="madd" disabled title="Esgotado" style="opacity:.4;cursor:not-allowed">+</button>'
          : `<button class="madd" onclick="__add(${p.id})">+</button>`}
      </div>`).join('')
    ).join('');
    atualizarBarra();
  }

  function atualizarBarra() {
    const bar = document.getElementById('bar');
    const qtd = cart.reduce((n, l) => n + l.quantidade, 0);
    const total = cart.reduce((t, l) => t + l.unit * l.quantidade, 0);
    if (qtd > 0) { bar.classList.remove('hidden'); document.getElementById('barTotal').textContent = money(total);
      document.getElementById('barQtd').textContent = qtd + (qtd === 1 ? ' item' : ' itens')
        + ' · toque para ver'; }
    else { bar.classList.add('hidden'); fecharCarrinho(); }
    desenharCarrinho();
  }

  /**
   * A lista do carrinho, com − e remover.
   *
   * Nao existia: a tela so somava. Quem tocasse no produto errado, ou duas vezes sem querer, tinha que
   * RECARREGAR A PAGINA para corrigir — e perdia tudo o que ja havia escolhido.
   */
  function desenharCarrinho() {
    const caixa = document.getElementById('carrinhoItens');
    if (!caixa) return;
    caixa.innerHTML = cart.map((l, i) => `
      <div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #f1f5f9">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${esc(l.rotulo)}</div>
          <div style="color:#64748b;font-size:13px">${money(l.unit)} cada</div>
        </div>
        <button data-menos="${i}" aria-label="Tirar um"
          style="min-width:44px;min-height:44px;border:1px solid #e2e8f0;background:#fff;border-radius:10px;
                 font-size:18px;font-weight:800;cursor:pointer">−</button>
        <b style="min-width:26px;text-align:center;font-variant-numeric:tabular-nums">${l.quantidade}</b>
        <button data-mais="${i}" aria-label="Somar um"
          style="min-width:44px;min-height:44px;border:1px solid #e2e8f0;background:#fff;border-radius:10px;
                 font-size:18px;font-weight:800;cursor:pointer">+</button>
        <button data-tira="${i}" aria-label="Remover do pedido"
          style="min-width:44px;min-height:44px;border:0;background:#fbeae6;color:#b3341f;border-radius:10px;
                 font-size:16px;cursor:pointer">✕</button>
      </div>`).join('') || '<p style="color:#64748b;margin:6px 0">Seu pedido está vazio.</p>';
  }

  function abrirCarrinho() {
    if (!cart.length) return;
    desenharCarrinho();
    document.getElementById('carrinhoLista').hidden = false;
  }

  function fecharCarrinho() {
    const el = document.getElementById('carrinhoLista');
    if (el) el.hidden = true;
  }

  function addLinha(p, complementos, extra, rotulo) {
    const chave = p.id + ':' + complementos.slice().sort().join(',');
    const ex = cart.find(l => l.chave === chave);
    if (ex) ex.quantidade++;
    else cart.push({ chave, produtoId: p.id, quantidade: 1, complementos, rotulo, unit: Number(p.preco || 0) + extra });
    atualizarBarra();
    const b = document.getElementById('bar'); b.style.transform = 'scale(1.02)'; setTimeout(() => b.style.transform = '', 120);
  }

  window.__add = id => {
    const p = produtos.find(x => x.id == id); if (!p) return;
    // O botao do esgotado ja vem desabilitado; esta trava e para o OUTRO caminho, o "repetir pedido",
    // que monta o carrinho por codigo. Sem ela o cliente repetia um pedido com item que acabou e so
    // descobria no confirmar.
    if (p.esgotado) return;
    if (p.complementos && p.complementos.length) abrirComplementos(p);
    else addLinha(p, [], 0, p.nome);
  };

  // ---- Modal de complementos (tamanho, borda, extras) ----
  function abrirComplementos(p) {
    const wrap = document.getElementById('comp');
    document.getElementById('compTitulo').textContent = p.nome;
    document.getElementById('compGrupos').innerHTML = p.complementos.map(g => {
      const tipo = g.maximo === 1 ? 'radio' : 'checkbox';
      const regra = g.minimo > 0 ? `escolha ${g.minimo === g.maximo ? g.minimo : g.minimo + ' a ' + g.maximo}` : `até ${g.maximo} (opcional)`;
      return `<div style="margin:12px 0" data-grupo="${g.id}" data-min="${g.minimo}" data-max="${g.maximo}" data-nome="${esc(g.nome)}">
        <div style="font-weight:800">${esc(g.nome)} <small style="color:#94a3b8;font-weight:600">· ${regra}</small></div>
        ${g.itens.map(i => `<label style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px dashed #e2e8f0;cursor:pointer">
          <span><input type="${tipo}" name="g${g.id}" value="${i.id}" data-preco="${i.preco || 0}" data-nome="${esc(i.nome)}" style="margin-right:8px">${esc(i.nome)}</span>
          <small style="color:#64748b">${Number(i.preco) > 0 ? '+ ' + money(i.preco) : ''}</small>
        </label>`).join('')}
      </div>`;
    }).join('');
    document.getElementById('compErr').textContent = '';
    wrap.hidden = false;
    document.getElementById('compOk').onclick = () => {
      const escolhidos = [], nomes = []; let extra = 0;
      for (const gDiv of document.querySelectorAll('#compGrupos [data-grupo]')) {
        const sel = gDiv.querySelectorAll('input:checked');
        if (sel.length < Number(gDiv.dataset.min) || sel.length > Number(gDiv.dataset.max)) {
          document.getElementById('compErr').textContent = 'Confira as escolhas de "' + gDiv.dataset.nome + '"';
          return;
        }
        sel.forEach(i => { escolhidos.push(Number(i.value)); nomes.push(i.dataset.nome); extra += Number(i.dataset.preco || 0); });
      }
      wrap.hidden = true;
      addLinha(p, escolhidos, extra, p.nome + (nomes.length ? ' (' + nomes.join(', ') + ')' : ''));
    };
    document.getElementById('compCancelar').onclick = () => { wrap.hidden = true; };
  }

  // ---- Repetir o último pedido (link assinado que a loja manda no WhatsApp) ----
  //
  // O servidor já filtrou o que não existe mais e devolveu os avisos prontos. Aqui só remontamos o
  // carrinho e contamos ao cliente o que mudou — carrinho diferente do que ele pediu, sem avisar,
  // seria pior que não repetir nada.
  async function repetirPedidoAnterior() {
    const pedidoId = params.get('repetir'), assinatura = params.get('t');
    if (!pedidoId || !assinatura) return;
    try {
      const r = await Bora.api('/public/loja/' + lojaId + '/pedido/' + encodeURIComponent(pedidoId)
        + '/repetir?t=' + encodeURIComponent(assinatura));

      const avisos = (r.avisos || []).slice();
      (r.itens || []).forEach(it => {
        const p = produtos.find(x => x.id == it.produtoId);
        // Some entre a resposta e o cardápio carregado (corrida, ou produto que o servidor aceita e
        // a lista não traz). Ficar em silêncio faria o cliente levar menos do que pediu sem saber.
        if (!p) { avisos.push((it.nome || 'Um item') + ' não está disponível agora'); return; }
        // Acabou desde o pedido anterior. Contamos, igual ao item que saiu do cardápio — repetir um
        // carrinho com item esgotado só adiaria o "acabou" para o confirmar.
        if (p.esgotado) { avisos.push((p.nome || 'Um item') + ' está esgotado agora'); return; }
        const ids = (it.complementos || []).map(Number);
        // Preço e rótulo saem do cardápio de HOJE, não do pedido antigo: é o que o cliente vai pagar.
        let extra = 0; const nomes = [];
        (p.complementos || []).forEach(g => (g.itens || []).forEach(i => {
          if (ids.indexOf(Number(i.id)) >= 0) { extra += Number(i.preco || 0); nomes.push(i.nome); }
        }));
        const rotulo = p.nome + (nomes.length ? ' (' + nomes.join(', ') + ')' : '');
        // Teto de 99 porque o cardapio recusa mais que isso no fim: repetir um pedido de balcao
        // de 120 unidades montaria um carrinho impossivel de fechar.
        const vezes = Math.min(99, Math.max(1, Number(it.quantidade) || 1));
        for (let n = 0; n < vezes; n++) addLinha(p, ids, extra, rotulo);
      });

      const quantos = cart.reduce((n, l) => n + l.quantidade, 0);
      const cx = document.createElement('div');
      cx.setAttribute('role', 'status');
      // Verde só quando deu tudo certo. Com qualquer aviso a caixa fica âmbar: verde com um item
      // faltando lá embaixo faz o cliente ler o título e ignorar o que importa.
      const tudoCerto = quantos > 0 && avisos.length === 0;
      cx.style.cssText = 'border-radius:10px;padding:12px;margin:12px 16px;font-size:14px;'
        + (tudoCerto ? 'background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46'
                     : 'background:#fef3c7;border:1px solid #fcd34d;color:#92400e');
      cx.innerHTML = (quantos
          ? (tudoCerto ? '<b>🔁 Seu pedido de antes já está no carrinho.</b> Confira e finalize.'
                       : '<b>⚠ Seu pedido está quase igual ao de antes, mas algo mudou:</b>')
          : '<b>Não deu para repetir o pedido automaticamente.</b> Monte pelo cardápio abaixo.')
        + (avisos.length ? '<ul style="margin:8px 0 0;padding-left:20px">'
            + avisos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '');
      document.getElementById('menu').insertAdjacentElement('beforebegin', cx);
    } catch (e) {
      // Dizer "não encontrei o pedido" quando foi a internet que caiu faz o cliente achar que o
      // pedido dele sumiu. São problemas diferentes e merecem recados diferentes.
      console.warn('repetir pedido:', e);
      const semRede = /failed to fetch|networkerror|load failed/i.test(String(e && e.message));
      const cx = document.createElement('div');
      cx.setAttribute('role', 'status');
      cx.style.cssText = 'background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:10px;padding:12px;margin:12px 16px;font-size:14px';
      cx.textContent = semRede
        ? 'Sem conexão para montar o seu pedido de antes. Atualize a página ou monte pelo cardápio abaixo.'
        : 'Esse link de pedido não vale mais. Sem problema: escolha o que quiser no cardápio abaixo.';
      document.getElementById('menu').insertAdjacentElement('beforebegin', cx);
    }
  }

  // ---- Checkout online: pedido criado no sistema; PIX na conta Asaas do lojista ----
  let pixDisponivel = false, pollTimer = null, cupomOk = false, saldoCashback = 0;
  // Guardamos o cupom APLICADO, nao o valor em reais: cupom percentual calculado uma vez, na hora
  // do "Aplicar", ficava velho se o cliente voltasse e somasse item. O desconto e recalculado a
  // cada atualizacao da conta, e o servidor recalcula de novo na criacao do pedido.
  let bairros = [], cupomAplicado = null;
  const $ = id => document.getElementById(id);

  function itensCarrinho() {
    return cart.filter(l => l.quantidade > 0)
      .map(l => ({ produtoId: l.produtoId, quantidade: l.quantidade, complementos: l.complementos }));
  }
  function totalCarrinho() {
    return cart.reduce((t, l) => t + l.unit * l.quantidade, 0);
  }


  /**
   * Veste o cardapio com a marca da LOJA.
   *
   * O site promete em dois lugares que o cliente final ve a marca do lojista, e ate agora via o roxo
   * do Bora e um sorvete fixo em qualquer loja - fosse pizzaria, acaiteria ou marmitaria. Como o CSS
   * inteiro ja usa --primary e --secondary, trocar as duas variaveis veste a tela toda: capa, botoes,
   * caixa de PIX. Loja sem cor cadastrada continua no roxo de antes, entao ninguem fica sem cara.
   */
  function aplicarMarca(marca, loja) {
    const nome = (marca && marca.nome) || (loja && loja.nome) || 'Cardápio';
    document.getElementById('lojaNome').textContent = nome;
    document.title = nome;

    if (marca) {
      // As cores da loja entram por aqui, e junto com elas as derivadas de contraste. O preco de cada
      // item e pintado com a secundaria: a Zira escolheu amarelo #FFD100, que sobre branco da 1,46:1 e
      // deixava o preco ilegivel. Quem decide a cor do TEXTO e a conta, nao a escolha do lojista.
      // Ver assets/js/cores.js.
      BoraCores.aplicar(document.documentElement.style, marca);

      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta && marca.corPrimaria) meta.setAttribute('content', marca.corPrimaria);

      if (marca.logoUrl) {
        const caixa = document.getElementById('lojaLogo');
        if (caixa) {
          caixa.textContent = '';
          const img = document.createElement('img');
          img.src = marca.logoUrl;
          img.alt = nome;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
          caixa.appendChild(img);
        }
        const icone = document.querySelector('link[rel="icon"]');
        if (icone) icone.setAttribute('href', marca.logoUrl);
      }

      // O rodape "feito com BoraHapp" so aparece se o lojista deixou. E decisao dele, nao nossa.
      const rodape = document.getElementById('rodapeMarca');
      if (rodape) rodape.hidden = marca.mostrarMarcaBora === false;
    }

    // O "app" que o cliente instala no celular tambem e da loja.
    const man = document.querySelector('link[rel="manifest"]');
    if (man && loja && loja.id) man.setAttribute('href', '/public/loja/' + loja.id + '/manifest');
  }

  function abrirCheckout() {
    if (!itensCarrinho().length) return;
    $('ckForm').hidden = false; $('ckPix').hidden = true; $('ckOk').hidden = true; $('ckErr').textContent = '';
    const qtdItens = itensCarrinho().reduce((n, i) => n + i.quantidade, 0);
    $('ckResumo').textContent = qtdItens + (qtdItens === 1 ? ' item · ' : ' itens · ') + money(totalCarrinho());
    $('ckOpPix').hidden = !pixDisponivel;
    if (!pixDisponivel) document.querySelector('input[name="ckForma"][value="ENTREGA"]').checked = true;
    // A escolha entre entrega e retirada so aparece quando a loja cadastrou bairro: sem tabela de
    // frete, perguntar o bairro so atrapalharia e nao mudaria preco nenhum.
    $('ckTipoWrap').hidden = !bairros.length;
    atualizarEntrega();
    atualizarCpf();
    $('checkout').hidden = false;
  }

  function ehRetirada() {
    return document.querySelector('input[name="ckTipo"]:checked')?.value === 'RETIRADA';
  }
  function freteEscolhido() {
    if (!bairros.length || ehRetirada()) return 0;
    const b = bairros.find(x => x.bairro === $('ckBairro').value);
    return b ? (Number(b.taxa) || 0) : 0;
  }
  /** Mostra bairro e endereco so quando fazem sentido, e refaz a conta na tela. */
  /** Quanto o cupom aplicado abate do carrinho AGORA. Zero se nao ha cupom. */
  function descontoDoCupom() {
    if (!cupomAplicado) return 0;
    const v = Number(cupomAplicado.valor) || 0;
    const bruto = cupomAplicado.tipo === 'VALOR' ? v : totalCarrinho() * (v / 100);
    return Math.min(bruto, totalCarrinho());
  }

  /**
   * Quanto do cashback entra NESTE pedido.
   *
   * Mesma regra do servidor, e a ordem importa: ele calcula o resgate DEPOIS do cupom e ANTES do
   * frete (`PublicController`, no trecho do `usarCashback`), com
   * `resgatePossivel = min(saldo, base - 0,01)` -- o resgate nunca zera o pedido, sempre fica pelo
   * menos um centavo a pagar. Repetir a regra aqui e de proposito: a tela tem que mostrar o MESMO
   * numero que vai ser cobrado. Quem decide continua sendo o servidor; isto e a previsao, e ela
   * precisa bater.
   */
  function descontoDoCashback(base) {
    const marcado = $('ckUsarCashback') && $('ckUsarCashback').checked;
    if (!marcado || saldoCashback <= 0 || base <= 0) return 0;
    const teto = base - 0.01;
    if (teto <= 0) return 0;
    return Math.round(Math.min(saldoCashback, teto) * 100) / 100;
  }

  function atualizarEntrega() {
    const retira = ehRetirada();
    $('ckBairroWrap').hidden = !bairros.length || retira;
    $('ckEndWrap').hidden = retira;
    const itens = totalCarrinho() - descontoDoCupom();
    const cashback = descontoDoCashback(itens);
    const frete = freteEscolhido();
    $('ctItens').textContent = money(itens);
    $('ctCashbackLinha').hidden = cashback <= 0;
    $('ctCashback').textContent = '- ' + money(cashback);
    $('ctFrete').textContent = retira ? 'Retirada' : money(frete);
    $('ctTotal').textContent = money(Math.max(0, itens - cashback) + frete);
  }
  function atualizarCpf() {
    const pix = document.querySelector('input[name="ckForma"]:checked')?.value === 'PIX';
    $('ckCpfWrap').hidden = !pix || !pixDisponivel;
    // "Dinheiro ou cartao" so faz sentido para quem vai pagar na entrega (item 6.7).
    if ($('ckEntregaComoWrap')) $('ckEntregaComoWrap').hidden = pix && pixDisponivel;
  }

  // Cashback: o cliente do cardapio nao tem login, entao o telefone e a identificacao.
  async function verCashback() {
    const caixa = $('ckCashback');
    if (!caixa) return;
    const tel = ($('ckTel').value || '').replace(/\D/g, '');
    const nome = ($('ckNome').value || '').trim();
    // O servidor so revela o saldo para quem informa o telefone E o nome do cadastro: telefone de
    // cliente nao e segredo, e so com ele dava para consultar e gastar o cashback dos outros.
    if (tel.length < 10 || !nome) { caixa.hidden = true; saldoCashback = 0; atualizarEntrega(); return; }
    try {
      const r = await Bora.api('/public/loja/' + lojaId + '/cashback?telefone=' + encodeURIComponent(tel)
        + '&nome=' + encodeURIComponent(nome));
      saldoCashback = Number(r && r.saldo) || 0;
      if (saldoCashback > 0) {
        $('ckSaldo').textContent = money(saldoCashback);
        caixa.hidden = false;
      } else {
        caixa.hidden = true;
        if ($('ckUsarCashback')) $('ckUsarCashback').checked = false;
      }
    } catch (e) {
      caixa.hidden = true; saldoCashback = 0;
    }
    // Saldo novo = desconto novo = TOTAL novo. Sem isto, o saldo chegava depois de o cliente marcar o
    // visto e a conta ficava no valor antigo -- e era o mesmo descuido que o PDV tinha (v118).
    atualizarEntrega();
  }

  /**
   * O que a tela confere ANTES de enviar.
   *
   * As mesmas regras do servidor, so para o cliente nao ter que esperar a resposta para descobrir que
   * faltou o endereco. Quem recusa de verdade e o servidor — isto aqui e cortesia, nao seguranca.
   *
   * Entrega sem endereco e sem telefone passava: so o nome era exigido, e o endereco nem tinha
   * asterisco. A loja recebia um pedido para entregar e nao tinha para onde ir nem como ligar.
   */
  function oQueFaltaNoCheckout() {
    const faltas = [];
    if (!$('ckNome').value.trim()) faltas.push('seu nome');
    const tel = ($('ckTel').value || '').replace(/\D/g, '');
    if (tel.length < 10 || tel.length > 13) faltas.push('um telefone com DDD');
    if (!ehRetirada()) {
      if ($('ckEnd').value.trim().length < 8) faltas.push('o endereço com rua e número');
      if (bairros.length && !$('ckBairro').value) faltas.push('o bairro da entrega');
    }
    const pix = document.querySelector('input[name="ckForma"]:checked')?.value === 'PIX' && pixDisponivel;
    if (pix && ($('ckCpf').value || '').replace(/\D/g, '').length < 11) faltas.push('o CPF para o PIX');
    return faltas;
  }

  async function confirmarPedido() {
    const btn = $('ckEnviar'), err = $('ckErr');
    const forma = document.querySelector('input[name="ckForma"]:checked')?.value === 'PIX' && pixDisponivel ? 'PIX' : 'ENTREGA';
    err.textContent = '';

    const faltas = oQueFaltaNoCheckout();
    if (faltas.length) {
      err.textContent = 'Falta ' + (faltas.length === 1 ? faltas[0]
        : faltas.slice(0, -1).join(', ') + ' e ' + faltas[faltas.length - 1]) + '.';
      err.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }

    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await Bora.api('/public/loja/' + lojaId + '/pedido', { method: 'POST', body: JSON.stringify({
        itens: itensCarrinho(),
        clienteNome: $('ckNome').value.trim(),
        telefone: $('ckTel').value.trim(),
        endereco: $('ckEnd').value.trim(),
        tipoEntrega: ehRetirada() ? 'RETIRADA' : 'ENTREGA',
        bairro: ehRetirada() ? '' : $('ckBairro').value,
        observacao: $('ckObs').value.trim(),
        cupom: cupomOk ? $('ckCupom').value.trim() : '',
        usarCashback: !!($('ckUsarCashback') && $('ckUsarCashback').checked && saldoCashback > 0),
        formaPagamento: forma === 'PIX' ? 'PIX' : formaNaEntrega(),
        cpf: $('ckCpf').value.trim()
      })});
      cart = []; atualizarBarra();
      if (r.pix && r.pix.payload) {
        $('ckForm').hidden = true; $('ckPix').hidden = false;
        $('pxCodigo').textContent = r.codigo; $('pxValor').textContent = money(r.valorTotal);
        if (r.pix.encodedImage) $('pxQr').src = 'data:image/png;base64,' + r.pix.encodedImage;
        $('pxPayload').value = r.pix.payload;
        acompanharPagamento(r.pedidoId, r.acompanharToken);
      } else {
        $('ckForm').hidden = true; $('ckOk').hidden = false;
        $('okMsg').innerHTML = 'Seu pedido ' + r.codigo + ' (' + money(r.valorTotal) + ') já está na cozinha. Pagamento na entrega/retirada.<br><br>' +
          linkDeAcompanhar(r.pedidoId, r.acompanharToken);
      }
    } catch (e) { err.textContent = e.message || 'Falha ao enviar o pedido'; }
    btn.disabled = false; btn.textContent = 'Confirmar pedido';
  }

  /**
   * O link de acompanhar leva a assinatura do pedido.
   *
   * O endpoint de status passou a exigir o `t`: sem ele, qualquer um varria os pedidos de qualquer
   * loja pelo id, que e sequencial, e lia codigo, status, horario e motivo de cancelamento.
   */
  function linkDeAcompanhar(pedidoId, token) {
    const url = 'acompanhar.html?loja=' + lojaId + '&pedido=' + pedidoId
      + (token ? '&t=' + encodeURIComponent(token) : '');
    return '<a href="' + url + '" style="color:#7c3aed;font-weight:800">📍 Acompanhar meu pedido ao vivo</a>';
  }

  /**
   * Como o cliente vai pagar na entrega: DINHEIRO ou CARTAO.
   *
   * Item 6.7 da varredura: o cardapio nunca perguntou, e o servidor gravava o texto "Na entrega"
   * para tudo. O acerto do entregador procura a palavra DINHEIRO para saber quanto de dinheiro vivo
   * o motoboy traz de volta -- entao "recebeu dinheiro" era R$ 0,00 para todo pedido do cardapio, e
   * o acerto fechava errado em toda loja que vende pelo link.
   *
   * Sem escolha marcada volta vazio, e o servidor cai em "Na entrega" -- o comportamento de antes.
   */
  function formaNaEntrega() {
    const m = document.querySelector('input[name="pgEntrega"]:checked');
    return m ? m.value : '';
  }

  function acompanharPagamento(pedidoId, token) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const s = await Bora.api('/public/loja/' + lojaId + '/pedido/' + pedidoId + '/status'
          + '?t=' + encodeURIComponent(token || ''));
        if (s.pago) {
          clearInterval(pollTimer);
          const st = $('pxStatus');
          st.innerHTML = '✅ Pagamento confirmado! Pedido na cozinha.<br><br>' + linkDeAcompanhar(pedidoId, token);
          st.style.color = '#15803d';
        }
      } catch (e) { /* segue tentando */ }
    }, 5000);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('send').addEventListener('click', abrirCheckout);
    // Delegacao: a lista e redesenhada a cada mudanca, entao o ouvinte fica no container.
    document.getElementById('carrinhoItens').addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      const i = Number(b.dataset.menos ?? b.dataset.mais ?? b.dataset.tira);
      if (!cart[i]) return;
      if (b.dataset.tira !== undefined) cart.splice(i, 1);
      else if (b.dataset.menos !== undefined) {
        cart[i].quantidade -= 1;
        if (cart[i].quantidade <= 0) cart.splice(i, 1);
      } else if (cart[i].quantidade < 99) cart[i].quantidade += 1;
      atualizarBarra();
      if (!cart.length) fecharCarrinho();
    });
    document.getElementById('carrinhoFechar').addEventListener('click', fecharCarrinho);
    document.getElementById('barInfo').addEventListener('click', () => {
      const el = document.getElementById('carrinhoLista');
      if (el.hidden) abrirCarrinho(); else fecharCarrinho();
    });
    $('ckFechar').addEventListener('click', () => { clearInterval(pollTimer); $('checkout').hidden = true; });
    $('ckEnviar').addEventListener('click', confirmarPedido);
    $('ckAplicarCupom').addEventListener('click', async () => {
      const cod = $('ckCupom').value.trim(), msg = $('ckCupomMsg');
      cupomOk = false; cupomAplicado = null;
      if (!cod) { msg.textContent = ''; atualizarEntrega(); return; }
      try {
        // O total vai na consulta: promocao e cupom percentual dependem dele, e o servidor devolve o
        // valor ja abatido. O endpoint atende cupom E promocao (o codigo do botao de promocao
        // relampago do painel caia aqui e recebia "cupom invalido").
        const c = await Bora.api('/public/loja/' + lojaId + '/cupom/' + encodeURIComponent(cod)
          + '?total=' + encodeURIComponent(totalCarrinho().toFixed(2)));
        cupomOk = true;
        cupomAplicado = { codigo: c.codigo, tipo: c.tipo, valor: c.valor };
        const d = c.desconto != null ? money(Number(c.desconto)) : (c.tipo === 'VALOR' ? money(c.valor) : Number(c.valor) + '%');
        msg.textContent = '✅ Cupom aplicado: ' + d + ' de desconto'; msg.style.color = '#15803d';
        atualizarEntrega();
      } catch (e) { cupomAplicado = null; atualizarEntrega();
        msg.textContent = '❌ ' + (e.message || 'Cupom inválido'); msg.style.color = '#dc2626'; }
    });
    document.querySelectorAll('input[name="ckForma"]').forEach(r => r.addEventListener('change', atualizarCpf));
    document.querySelectorAll('input[name="ckTipo"]').forEach(r => r.addEventListener('change', atualizarEntrega));
    $('ckBairro').addEventListener('change', atualizarEntrega);
    // Sem este ouvinte, marcar o visto nao mexia no total: a conta seguia no preco cheio.
    if ($('ckUsarCashback')) $('ckUsarCashback').addEventListener('change', atualizarEntrega);
    $('ckTel').addEventListener('blur', verCashback);
    $('ckTel').addEventListener('change', verCashback);
    // O nome agora faz parte da identificacao, entao mudar o nome refaz a consulta.
    $('ckNome').addEventListener('blur', verCashback);
    $('ckNome').addEventListener('change', verCashback);
    $('pxCopiar').addEventListener('click', () => { $('pxPayload').select(); document.execCommand('copy'); $('pxCopiar').textContent = 'Copiado ✓'; setTimeout(() => $('pxCopiar').textContent = 'Copiar código PIX', 2000); });
    try {
      const data = await Bora.cardapioPublico(lojaId);
      aplicarMarca(data.marca, data.loja);
      pixDisponivel = !!data.pixDisponivel;
      bairros = data.bairros || [];
      // Loja fechada: avisa no topo e desliga o botao de finalizar, em vez de deixar o cliente
      // montar o pedido inteiro para levar um erro no fim.
      if (data.aberta === false) {
        const barra = document.createElement('div');
        barra.style.cssText = 'background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:10px;padding:12px;margin:12px 0;text-align:center;font-weight:600';
        barra.textContent = '🕒 Estamos fechados agora. Você pode ver o cardápio, mas o pedido só entra no horário de funcionamento.';
        document.getElementById('menu').insertAdjacentElement('beforebegin', barra);
        const b = document.getElementById('send');
        if (b) { b.disabled = true; b.style.opacity = '.55'; b.textContent = 'Fechado agora'; }
      }
      if (bairros.length) {
        $('ckBairro').innerHTML = '<option value="">Escolha o bairro…</option>' +
          bairros.map(b => `<option value="${esc(b.bairro)}">${esc(b.bairro)} — ${money(Number(b.taxa) || 0)}`
            + `${b.tempoMin ? ' · ~' + b.tempoMin + ' min' : ''}</option>`).join('');
      }
      produtos = data.produtos || [];
      if (!produtos.length) { document.getElementById('menu').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px">Cardápio em montagem.</p>'; return; }
      render();
      await repetirPedidoAnterior(); // depois do render: precisa dos produtos carregados
    } catch (e) { document.getElementById('menu').innerHTML = `<p style="text-align:center;color:var(--danger);padding:40px">${e.message}</p>`; }
  });
})();
