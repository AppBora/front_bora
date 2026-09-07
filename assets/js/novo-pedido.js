// Novo pedido do balcão: produto + complementos, taxa do bairro e cashback, com o total já na tela.
//
// Nada aqui decide preço: o servidor recalcula tudo. O que a tela mostra é a mesma conta, para o
// balconista falar o valor com o cliente ainda no telefone, sem esperar o pedido salvar.
(function () {
  if (!Bora.requireAuth()) return;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const num = v => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; };

  let produtos = [], clientes = [], taxas = [], itens = [];
  const complementosPorProduto = {}; // cache: produtoId -> grupos (evita rebuscar a cada troca)
  let escolhaAtual = [];             // ids marcados no produto em foco

  /* ---------------- cliente ---------------- */

  function clienteSelecionado() {
    return clientes.find(c => String(c.id) === $('cliente').value) || null;
  }

  function aoTrocarCliente() {
    const c = clienteSelecionado();
    const box = $('cashbackBox');
    if (c && Number(c.cashback || 0) > 0) {
      box.style.display = 'flex';
      $('cashbackVal').textContent = money(c.cashback);
    } else {
      box.style.display = 'none';
      $('usarCashback').checked = false;
    }
    $('taxa').value = taxaDoBairro(c).toFixed(2);
    renderTotais();
  }

  /** Taxa cadastrada para o bairro do cliente. Balcão não tem frete. */
  function taxaDoBairro(c) {
    if (!c || !c.bairro) return 0;
    if (/BALC/i.test($('origem').value || '')) return 0;
    const t = taxas.find(x => x.ativo !== false && String(x.bairro || '').trim().toLowerCase() === String(c.bairro).trim().toLowerCase());
    return t ? Number(t.taxa || 0) : 0;
  }

  function alternarNovoCliente(abrir) {
    $('novoClienteBox').style.display = abrir ? 'grid' : 'none';
    $('cliente').disabled = abrir;
    $('btnNovoCliente').textContent = abrir ? 'Escolher da lista' : '+ Novo cliente';
    if (abrir) { $('cliente').value = ''; aoTrocarCliente(); $('ncNome').focus(); }
  }

  /** Cadastra na hora quem ligou pela primeira vez, sem sair da tela do pedido. */
  async function criarClienteInline() {
    const nome = $('ncNome').value.trim();
    if (!nome) throw new Error('Informe o nome do cliente novo (ou escolha um da lista)');
    const novo = await Bora.api('/api/clientes', {
      method: 'POST',
      body: JSON.stringify({
        nome,
        telefone: $('ncTelefone').value.trim(),
        endereco: $('ncEndereco').value.trim(),
        bairro: $('ncBairro').value.trim(),
        referencia: ''
      })
    });
    clientes.push(novo);
    return novo.id;
  }

  /* ---------------- complementos ---------------- */

  async function carregarComplementos(produtoId) {
    if (!complementosPorProduto[produtoId]) {
      try {
        complementosPorProduto[produtoId] = await Bora.api('/api/produtos/' + produtoId + '/complementos') || [];
      } catch (e) {
        complementosPorProduto[produtoId] = [];
      }
    }
    return complementosPorProduto[produtoId];
  }

  async function renderComplementos() {
    const pid = Number($('produto').value);
    const box = $('complementos');
    escolhaAtual = [];
    if (!pid) { box.innerHTML = ''; box.style.display = 'none'; return; }
    const grupos = await carregarComplementos(pid);
    if (!grupos.length) { box.innerHTML = ''; box.style.display = 'none'; return; }

    box.style.display = 'block';
    box.innerHTML = grupos.map(g => {
      const min = g.minimo || 0, max = g.maximo || 1;
      const unico = max === 1;
      const regra = min > 0 ? `escolha ${min === max ? min : min + ' a ' + max}` : `até ${max}, opcional`;
      const opcoes = (g.itens || []).map(i => `
        <label style="display:flex;align-items:center;gap:7px;padding:3px 0;cursor:pointer">
          <input type="${unico ? 'radio' : 'checkbox'}" name="g${g.id}" value="${i.id}"
                 data-grupo="${g.id}" data-max="${max}" data-preco="${Number(i.preco || 0)}">
          <span>${esc(i.nome)}${Number(i.preco || 0) > 0 ? ' <b>+' + money(i.preco) + '</b>' : ''}</span>
        </label>`).join('');
      return `<div style="margin-top:10px">
        <div style="font-size:13px;font-weight:800">${esc(g.nome)}
          <span style="font-weight:600;color:#94a3b8">(${regra})</span></div>${opcoes}</div>`;
    }).join('');

    box.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
      // teto por grupo: o servidor recusa acima do máximo, então a tela nem deixa marcar
      if (inp.type === 'checkbox' && inp.checked) {
        const marcados = box.querySelectorAll(`input[data-grupo="${inp.dataset.grupo}"]:checked`);
        if (marcados.length > Number(inp.dataset.max)) { inp.checked = false; return; }
      }
      escolhaAtual = Array.from(box.querySelectorAll('input:checked')).map(i => Number(i.value));
      $('precoProduto').textContent = money(precoComExtras(Number($('produto').value)));
    }));
    $('precoProduto').textContent = money(precoComExtras(pid));
  }

  function precoComExtras(pid) {
    const p = produtos.find(x => x.id === pid);
    if (!p) return 0;
    const box = $('complementos');
    const extra = Array.from(box.querySelectorAll('input:checked'))
      .reduce((s, i) => s + Number(i.dataset.preco || 0), 0);
    return Number(p.preco || 0) + extra;
  }

  /** Espelha a validação do servidor para o balconista não descobrir o erro só ao salvar. */
  function faltaEscolher(pid) {
    for (const g of (complementosPorProduto[pid] || [])) {
      const min = g.minimo || 0;
      if (!min) continue;
      const marcados = escolhaAtual.filter(id => (g.itens || []).some(i => i.id === id)).length;
      if (marcados < min) return `Escolha ${min} em "${g.nome}"`;
    }
    return null;
  }

  /* ---------------- itens e totais ---------------- */

  const subtotal = () => itens.reduce((s, i) => s + i.preco * i.qtd, 0);

  function renderTotais() {
    const sub = subtotal();
    const taxa = num($('taxa').value);
    const c = clienteSelecionado();
    // estimativa: o servidor tem a palavra final sobre quanto do saldo pode entrar neste pedido
    const cashback = $('usarCashback').checked && c ? Math.min(Number(c.cashback || 0), sub) : 0;
    $('linhaSub').textContent = money(sub);
    $('boxCashback').style.display = cashback > 0 ? 'flex' : 'none';
    $('linhaCashback').textContent = '- ' + money(cashback);
    $('total').textContent = money(Math.max(0, sub + taxa - cashback));
  }

  function render() {
    $('itens').innerHTML = itens.map((i, idx) => `
      <tr>
        <td>${esc(i.nome)}${i.extras ? `<br><small style="color:#64748b">${esc(i.extras)}</small>` : ''}</td>
        <td style="white-space:nowrap">${i.qtd} × ${money(i.preco)}</td>
        <td style="text-align:right">${money(i.preco * i.qtd)}</td>
        <td style="width:40px;text-align:right">
          <button type="button" class="btn ghost" onclick="__rem(${idx})"
                  style="background:#e5e7eb;color:#111;padding:4px 8px" title="Remover">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="4" style="color:#94a3b8">Nenhum item ainda.</td></tr>';
    renderTotais();
  }
  window.__rem = idx => { itens.splice(idx, 1); render(); };

  function adicionar() {
    const pid = Number($('produto').value);
    const p = produtos.find(x => x.id === pid);
    const msg = $('msg');
    msg.textContent = '';
    if (!p) { msg.textContent = 'Escolha um produto'; return; }
    const erro = faltaEscolher(pid);
    if (erro) { msg.textContent = erro; return; }

    const qtd = Math.max(1, parseInt($('qtd').value || '1', 10));
    const escolhidos = escolhaAtual.slice().sort((a, b) => a - b);
    const nomes = [];
    for (const g of (complementosPorProduto[pid] || [])) {
      for (const i of (g.itens || [])) if (escolhidos.includes(i.id)) nomes.push(i.nome);
    }
    const chave = pid + ':' + escolhidos.join(',');
    const existente = itens.find(i => i.chave === chave);
    if (existente) existente.qtd += qtd;
    else itens.push({ chave, id: pid, nome: p.nome, extras: nomes.join(', '), complementos: escolhidos, preco: precoComExtras(pid), qtd });

    render();
    // confirmação visível: sem isso o balconista clica duas vezes achando que não funcionou
    const b = $('add'), antes = b.textContent;
    b.textContent = '✓ Adicionado';
    setTimeout(() => { b.textContent = antes; }, 900);
    $('qtd').value = 1;
    $('complementos').querySelectorAll('input:checked').forEach(i => { i.checked = false; });
    escolhaAtual = [];
    $('precoProduto').textContent = money(precoComExtras(pid));
  }

  /* ---------------- carga ---------------- */

  async function init() {
    // allSettled: forma de pagamento ou taxa com problema não pode impedir de lançar o pedido
    const [rc, rp, rf, rt] = await Promise.allSettled([Bora.clientes(), Bora.produtos(), Bora.formasPagamento(), Bora.taxas()]);
    const avisos = [];

    clientes = rc.status === 'fulfilled' ? (rc.value || []) : [];
    if (rc.status === 'rejected') avisos.push('lista de clientes');
    produtos = (rp.status === 'fulfilled' ? (rp.value || []) : []).filter(p => p.ativo !== false);
    if (rp.status === 'rejected') avisos.push('cardápio');
    taxas = rt.status === 'fulfilled' ? (rt.value || []) : [];
    if (rt.status === 'rejected') avisos.push('taxas de entrega');

    const formas = (rf.status === 'fulfilled' ? (rf.value || []) : []).filter(f => f.ativo !== false);
    if (formas.length) $('pagamento').innerHTML = formas.map(f => `<option>${esc(f.descricao)}</option>`).join('');
    else if (rf.status === 'rejected') avisos.push('formas de pagamento');

    $('cliente').innerHTML = '<option value="">— Sem cadastro / balcão —</option>' +
      clientes.map(c => `<option value="${c.id}">${esc(c.nome)}${c.bairro ? ' — ' + esc(c.bairro) : ''}</option>`).join('');
    $('produto').innerHTML = produtos.length
      ? produtos.map(p => `<option value="${p.id}">${esc(p.nome)} — ${money(p.preco)}</option>`).join('')
      : '<option value="">Nenhum produto ativo</option>';
    $('origem').innerHTML = BORA_CANAIS.map(c => `<option value="${c.key}">${c.ic} ${c.key}</option>`).join('');

    if (!produtos.length) {
      $('msg').textContent = 'Esta loja não tem produto ativo — cadastre em Produtos antes de lançar pedidos.';
    } else if (avisos.length) {
      $('msg').textContent = 'Não consegui carregar: ' + avisos.join(', ') + '. Dá para seguir, mas confira depois.';
    }

    $('cliente').addEventListener('change', aoTrocarCliente);
    $('origem').addEventListener('change', () => { aoTrocarCliente(); });
    $('taxa').addEventListener('input', renderTotais);
    $('usarCashback').addEventListener('change', renderTotais);
    $('produto').addEventListener('change', renderComplementos);
    $('btnNovoCliente').addEventListener('click', () => alternarNovoCliente($('novoClienteBox').style.display === 'none'));
    await renderComplementos();
    render();
  }

  $('add').addEventListener('click', adicionar);

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('msg');
    msg.textContent = '';
    if (!itens.length) { msg.textContent = 'Adicione ao menos um item'; return; }

    const btn = $('salvar');
    btn.disabled = true; // dois cliques no "Salvar" viravam dois pedidos iguais
    const rotulo = btn.textContent;
    btn.textContent = 'Salvando…';
    try {
      let clienteId = $('cliente').value ? Number($('cliente').value) : null;
      if ($('novoClienteBox').style.display !== 'none') clienteId = await criarClienteInline();

      await Bora.api('/api/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          clienteId,
          codigo: '#' + Date.now().toString().slice(-6),
          formaPagamento: $('pagamento').value,
          origem: $('origem').value,
          observacao: $('obs').value.trim() || null,
          usarCashback: $('usarCashback').checked,
          taxaEntrega: num($('taxa').value),
          itens: itens.map(i => ({ produtoId: i.id, quantidade: i.qtd, complementos: i.complementos }))
        })
      });
      location.href = 'pedidos.html';
    } catch (ex) {
      msg.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = rotulo;
    }
  });

  document.addEventListener('DOMContentLoaded', init);
})();
