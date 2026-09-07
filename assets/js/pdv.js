// Frente de Caixa (PDV) — venda rápida no balcão; cria pedido via API.
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let produtos = [], clientes = [], cart = [], cat = 'TODAS', termo = '', pagamento = 'Dinheiro';
  const complementosPorProduto = {}; // cache por produto, para o toque no tile abrir na hora

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
    const total = cart.reduce((s, i) => s + i.preco * i.qtd, 0);
    $('qtdItens').textContent = qtd;
    $('total').textContent = money(total);
    $('finish').disabled = !cart.length;
  }

  /** Produto sem complemento entra direto; com complemento abre a escolha antes. */
  window.__add = async id => {
    const p = produtos.find(x => x.id === id);
    if (!p) return;
    const grupos = await carregarComplementos(id);
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
      catch (e) { complementosPorProduto[produtoId] = []; }
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
      usarCashback: $('usarCashback').checked,
      itens: cart.map(i => ({ produtoId: i.id, quantidade: i.qtd, complementos: i.complementos || [] }))
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
      // allSettled: forma de pagamento com problema não pode fechar o caixa da loja
      const [rp, rc, rf] = await Promise.allSettled([Bora.produtos(), Bora.clientes(), Bora.formasPagamento()]);
      if (rp.status === 'rejected') throw new Error(rp.reason.message);
      produtos = rp.value || [];
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
