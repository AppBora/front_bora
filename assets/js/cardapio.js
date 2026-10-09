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
      itens.map(p => `<div class="menu-item">
        ${p.imagem ? `<img src="${p.imagem}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:10px;margin-right:10px;flex-shrink:0">` : ''}
        <div class="mi"><div class="mn">${esc(p.nome)}</div><div class="mp">${money(p.preco)}</div></div>
        <button class="madd" onclick="__add(${p.id})">+</button>
      </div>`).join('')
    ).join('');
    atualizarBarra();
  }

  function atualizarBarra() {
    const bar = document.getElementById('bar');
    const qtd = cart.reduce((n, l) => n + l.quantidade, 0);
    const total = cart.reduce((t, l) => t + l.unit * l.quantidade, 0);
    if (qtd > 0) { bar.classList.remove('hidden'); document.getElementById('barTotal').textContent = money(total);
      document.getElementById('barQtd').textContent = qtd + (qtd === 1 ? ' item' : ' itens'); }
    else bar.classList.add('hidden');
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
  let bairros = [], descontoCupom = 0;
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
      const raiz = document.documentElement.style;
      if (marca.corPrimaria) raiz.setProperty('--primary', marca.corPrimaria);
      if (marca.corSecundaria) raiz.setProperty('--secondary', marca.corSecundaria);

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
    $('ckResumo').textContent = itensCarrinho().reduce((n, i) => n + i.quantidade, 0) + ' itens · ' + money(totalCarrinho());
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
  function atualizarEntrega() {
    const retira = ehRetirada();
    $('ckBairroWrap').hidden = !bairros.length || retira;
    $('ckEndWrap').hidden = retira;
    const itens = totalCarrinho() - descontoCupom;
    const frete = freteEscolhido();
    $('ctItens').textContent = money(itens);
    $('ctFrete').textContent = retira ? 'Retirada' : money(frete);
    $('ctTotal').textContent = money(Math.max(0, itens) + frete);
  }
  function atualizarCpf() {
    const pix = document.querySelector('input[name="ckForma"]:checked')?.value === 'PIX';
    $('ckCpfWrap').hidden = !pix || !pixDisponivel;
  }

  // Cashback: o cliente do cardapio nao tem login, entao o telefone e a identificacao.
  async function verCashback() {
    const caixa = $('ckCashback');
    if (!caixa) return;
    const tel = ($('ckTel').value || '').replace(/\D/g, '');
    const nome = ($('ckNome').value || '').trim();
    // O servidor so revela o saldo para quem informa o telefone E o nome do cadastro: telefone de
    // cliente nao e segredo, e so com ele dava para consultar e gastar o cashback dos outros.
    if (tel.length < 10 || !nome) { caixa.hidden = true; saldoCashback = 0; return; }
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
  }

  async function confirmarPedido() {
    const btn = $('ckEnviar'), err = $('ckErr');
    const forma = document.querySelector('input[name="ckForma"]:checked')?.value === 'PIX' && pixDisponivel ? 'PIX' : 'ENTREGA';
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Enviando…';
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
        formaPagamento: forma,
        cpf: $('ckCpf').value.trim()
      })});
      cart = []; atualizarBarra();
      if (r.pix && r.pix.payload) {
        $('ckForm').hidden = true; $('ckPix').hidden = false;
        $('pxCodigo').textContent = r.codigo; $('pxValor').textContent = money(r.valorTotal);
        if (r.pix.encodedImage) $('pxQr').src = 'data:image/png;base64,' + r.pix.encodedImage;
        $('pxPayload').value = r.pix.payload;
        acompanharPagamento(r.pedidoId);
      } else {
        $('ckForm').hidden = true; $('ckOk').hidden = false;
        $('okMsg').innerHTML = 'Seu pedido ' + r.codigo + ' (' + money(r.valorTotal) + ') já está na cozinha. Pagamento na entrega/retirada.<br><br>' +
          '<a href="acompanhar.html?loja=' + lojaId + '&pedido=' + r.pedidoId + '" style="color:#7c3aed;font-weight:800">📍 Acompanhar meu pedido ao vivo</a>';
      }
    } catch (e) { err.textContent = e.message || 'Falha ao enviar o pedido'; }
    btn.disabled = false; btn.textContent = 'Confirmar pedido';
  }

  function acompanharPagamento(pedidoId) {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      try {
        const s = await Bora.api('/public/loja/' + lojaId + '/pedido/' + pedidoId + '/status');
        if (s.pago) {
          clearInterval(pollTimer);
          const st = $('pxStatus');
          st.innerHTML = '✅ Pagamento confirmado! Pedido na cozinha.<br><br>' +
            '<a href="acompanhar.html?loja=' + lojaId + '&pedido=' + pedidoId + '" style="color:#7c3aed;font-weight:800">📍 Acompanhar meu pedido ao vivo</a>';
          st.style.color = '#15803d';
        }
      } catch (e) { /* segue tentando */ }
    }, 5000);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('send').addEventListener('click', abrirCheckout);
    $('ckFechar').addEventListener('click', () => { clearInterval(pollTimer); $('checkout').hidden = true; });
    $('ckEnviar').addEventListener('click', confirmarPedido);
    $('ckAplicarCupom').addEventListener('click', async () => {
      const cod = $('ckCupom').value.trim(), msg = $('ckCupomMsg');
      cupomOk = false; if (!cod) { msg.textContent = ''; return; }
      try {
        const c = await Bora.api('/public/loja/' + lojaId + '/cupom/' + encodeURIComponent(cod));
        const d = c.tipo === 'VALOR' ? money(c.valor) : Number(c.valor) + '%';
        cupomOk = true; msg.textContent = '✅ Cupom aplicado: ' + d + ' de desconto'; msg.style.color = '#15803d';
        // Quem manda no desconto e o servidor; aqui so refletimos na conta da tela para o cliente
        // nao confirmar achando um valor e ver outro.
        descontoCupom = c.tipo === 'VALOR' ? (Number(c.valor) || 0)
                                           : totalCarrinho() * ((Number(c.valor) || 0) / 100);
        atualizarEntrega();
      } catch (e) { descontoCupom = 0; atualizarEntrega();
        msg.textContent = '❌ ' + (e.message || 'Cupom inválido'); msg.style.color = '#dc2626'; }
    });
    document.querySelectorAll('input[name="ckForma"]').forEach(r => r.addEventListener('change', atualizarCpf));
    document.querySelectorAll('input[name="ckTipo"]').forEach(r => r.addEventListener('change', atualizarEntrega));
    $('ckBairro').addEventListener('change', atualizarEntrega);
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
