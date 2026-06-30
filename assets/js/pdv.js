// Frente de Caixa (PDV) — venda rápida no balcão; cria pedido via API.
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let produtos = [], clientes = [], cart = [], cat = 'TODAS', termo = '', pagamento = 'Dinheiro';

  const $ = id => document.getElementById(id);

  function atualizarCashback() {
    const c = clientes.find(x => String(x.id) === $('cliente').value);
    const box = $('cashbackBox');
    if (c && Number(c.cashback || 0) > 0) {
      box.style.display = 'flex'; $('cashbackVal').textContent = money(c.cashback);
    } else { box.style.display = 'none'; $('usarCashback').checked = false; }
  }

  function cats() {
    const set = new Set(produtos.map(p => (p.categoria || 'Outros')));
    const lista = ['TODAS', ...[...set].sort()];
    $('cats').innerHTML = lista.map(c =>
      `<button class="chip ${c === cat ? 'active' : ''}" data-c="${esc(c)}">${c === 'TODAS' ? 'Todos' : esc(c)}</button>`).join('');
  }

  function grid() {
    const vis = produtos.filter(p => p.ativo !== false)
      .filter(p => cat === 'TODAS' || (p.categoria || 'Outros') === cat)
      .filter(p => !termo || (p.nome || '').toLowerCase().includes(termo));
    $('grid').innerHTML = vis.length ? vis.map(p =>
      `<button class="prodtile" onclick="__add(${p.id})">
        <div class="pc">${esc(p.categoria || 'Outros')}</div>
        <div class="pn">${esc(p.nome)}</div>
        <div class="pp">${money(p.preco)}</div>
      </button>`).join('') : '<p style="color:#94a3b8">Nenhum produto. Cadastre em Produtos.</p>';
  }

  function renderCart() {
    const box = $('items');
    if (!cart.length) { box.innerHTML = '<div class="cart-empty">Toque em um produto para começar</div>'; }
    else {
      box.innerHTML = cart.map(i =>
        `<div class="citem">
          <div class="cn">${esc(i.nome)}<small>${money(i.preco)} un</small></div>
          <div class="qty">
            <button onclick="__dec(${i.id})">−</button><span>${i.qtd}</span><button onclick="__inc(${i.id})">+</button>
          </div>
          <div style="width:74px;text-align:right;font-weight:800">${money(i.preco * i.qtd)}</div>
        </div>`).join('');
    }
    const qtd = cart.reduce((s, i) => s + i.qtd, 0);
    const total = cart.reduce((s, i) => s + i.preco * i.qtd, 0);
    $('qtdItens').textContent = qtd;
    $('total').textContent = money(total);
    $('finish').disabled = !cart.length;
  }

  window.__add = id => { const p = produtos.find(x => x.id === id); if (!p) return;
    const it = cart.find(x => x.id === id); if (it) it.qtd++; else cart.push({ id, nome: p.nome, preco: Number(p.preco || 0), qtd: 1 }); renderCart(); };
  window.__inc = id => { const it = cart.find(x => x.id === id); if (it) it.qtd++; renderCart(); };
  window.__dec = id => { const it = cart.find(x => x.id === id); if (it) { it.qtd--; if (it.qtd <= 0) cart = cart.filter(x => x.id !== id); } renderCart(); };

  async function finalizar() {
    if (!cart.length) return;
    const body = {
      clienteId: $('cliente').value ? Number($('cliente').value) : null,
      formaPagamento: pagamento, origem: 'Balcão',
      usarCashback: $('usarCashback').checked,
      itens: cart.map(i => ({ produtoId: i.id, quantidade: i.qtd }))
    };
    $('finish').disabled = true; $('finish').textContent = 'Processando…';
    try {
      const ped = await Bora.criarPedido(body);
      // venda de balcão já entregue na hora
      try { await Bora.mudarStatus(ped.id, 'ENTREGUE'); } catch (e) {}
      cart = []; renderCart();
      try { clientes = await Bora.clientes(); atualizarCashback(); } catch (e) {} // saldo de cashback atualizado
      $('finish').textContent = '✓ Venda registrada!';
      setTimeout(() => { $('finish').textContent = 'Finalizar venda'; }, 1500);
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
    try {
      const [prods, cls, formas] = await Promise.all([Bora.produtos(), Bora.clientes(), Bora.formasPagamento()]);
      produtos = prods; clientes = cls;
      const ativas = (formas || []).filter(f => f.ativo !== false);
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
