// Cardápio digital público (acessível por QR Code) — sem login. Monta pedido e envia pelo WhatsApp.
(function () {
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const params = new URLSearchParams(location.search);
  const lojaId = params.get('loja') || '1';
  const wa = (params.get('wa') || '').replace(/\D/g, '');

  let produtos = [], cart = {};

  function render() {
    const grupos = {};
    produtos.forEach(p => { const c = p.categoria || 'Outros'; (grupos[c] = grupos[c] || []).push(p); });
    document.getElementById('menu').innerHTML = Object.entries(grupos).map(([cat, itens]) =>
      `<div class="menu-cat"><h3>${esc(cat)}</h3></div>` +
      itens.map(p => `<div class="menu-item">
        <div class="mi"><div class="mn">${esc(p.nome)}</div><div class="mp">${money(p.preco)}</div></div>
        <button class="madd" onclick="__add(${p.id})">+</button>
      </div>`).join('')
    ).join('');
    atualizarBarra();
  }

  function atualizarBarra() {
    const bar = document.getElementById('bar');
    let qtd = 0, total = 0;
    Object.entries(cart).forEach(([id, q]) => { const p = produtos.find(x => x.id == id); if (p) { qtd += q; total += Number(p.preco || 0) * q; } });
    if (qtd > 0) { bar.classList.remove('hidden'); document.getElementById('barTotal').textContent = money(total);
      document.getElementById('barQtd').textContent = qtd + (qtd === 1 ? ' item' : ' itens'); }
    else bar.classList.add('hidden');
  }

  window.__add = id => { cart[id] = (cart[id] || 0) + 1; atualizarBarra();
    const b = document.getElementById('bar'); b.style.transform = 'scale(1.02)'; setTimeout(() => b.style.transform = '', 120); };

  // ---- Checkout online: pedido criado no sistema; PIX na conta Asaas do lojista ----
  let pixDisponivel = false, pollTimer = null;
  const $ = id => document.getElementById(id);

  function itensCarrinho() {
    return Object.entries(cart).filter(([, q]) => q > 0)
      .map(([produtoId, quantidade]) => ({ produtoId: Number(produtoId), quantidade }));
  }
  function totalCarrinho() {
    return Object.entries(cart).reduce((t, [id, q]) => { const p = produtos.find(x => x.id == id); return t + (p ? Number(p.preco || 0) * q : 0); }, 0);
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
        formaPagamento: forma,
        cpf: $('ckCpf').value.trim()
      })});
      cart = {}; atualizarBarra();
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
