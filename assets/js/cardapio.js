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

  // ---- Checkout online: pedido criado no sistema; PIX na conta Asaas do lojista ----
  let pixDisponivel = false, pollTimer = null, cupomOk = false;
  const $ = id => document.getElementById(id);

  function itensCarrinho() {
    return cart.filter(l => l.quantidade > 0)
      .map(l => ({ produtoId: l.produtoId, quantidade: l.quantidade, complementos: l.complementos }));
  }
  function totalCarrinho() {
    return cart.reduce((t, l) => t + l.unit * l.quantidade, 0);
  }

  function abrirCheckout() {
    if (!itensCarrinho().length) return;
    $('ckForm').hidden = false; $('ckPix').hidden = true; $('ckOk').hidden = true; $('ckErr').textContent = '';
    $('ckResumo').textContent = itensCarrinho().reduce((n, i) => n + i.quantidade, 0) + ' itens · ' + money(totalCarrinho());
    $('ckOpPix').hidden = !pixDisponivel;
    if (!pixDisponivel) document.querySelector('input[name="ckForma"][value="ENTREGA"]').checked = true;
    atualizarCpf();
    $('checkout').hidden = false;
  }
  function atualizarCpf() {
    const pix = document.querySelector('input[name="ckForma"]:checked')?.value === 'PIX';
    $('ckCpfWrap').hidden = !pix || !pixDisponivel;
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
        observacao: $('ckObs').value.trim(),
        cupom: cupomOk ? $('ckCupom').value.trim() : '',
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
        $('okMsg').textContent = 'Seu pedido ' + r.codigo + ' (' + money(r.valorTotal) + ') já está na cozinha. Pagamento na entrega/retirada.';
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
          const st = $('pxStatus'); st.textContent = '✅ Pagamento confirmado! Pedido na cozinha.'; st.style.color = '#15803d';
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
      } catch (e) { msg.textContent = '❌ ' + (e.message || 'Cupom inválido'); msg.style.color = '#dc2626'; }
    });
    document.querySelectorAll('input[name="ckForma"]').forEach(r => r.addEventListener('change', atualizarCpf));
    $('pxCopiar').addEventListener('click', () => { $('pxPayload').select(); document.execCommand('copy'); $('pxCopiar').textContent = 'Copiado ✓'; setTimeout(() => $('pxCopiar').textContent = 'Copiar código PIX', 2000); });
    try {
      const data = await Bora.cardapioPublico(lojaId);
      document.getElementById('lojaNome').textContent = (data.loja && data.loja.nome) || 'Cardápio';
      document.title = (data.loja && data.loja.nome) || 'Cardápio Digital';
      pixDisponivel = !!data.pixDisponivel;
      produtos = data.produtos || [];
      if (!produtos.length) { document.getElementById('menu').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px">Cardápio em montagem.</p>'; return; }
      render();
    } catch (e) { document.getElementById('menu').innerHTML = `<p style="text-align:center;color:var(--danger);padding:40px">${e.message}</p>`; }
  });
})();
