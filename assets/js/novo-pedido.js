// Novo pedido com seleção de produtos e total automático.
(function () {
  if (!Bora.requireAuth()) return;

  let produtos = [], itens = [], clientes = [];
  const money = v => 'R$ ' + Number(v || 0).toFixed(2);

  function atualizarCashback() {
    const c = clientes.find(x => String(x.id) === document.getElementById('cliente').value);
    const box = document.getElementById('cashbackBox');
    if (c && Number(c.cashback || 0) > 0) { box.style.display = 'flex'; document.getElementById('cashbackVal').textContent = money(c.cashback); }
    else { box.style.display = 'none'; document.getElementById('usarCashback').checked = false; }
  }

  function total() { return itens.reduce((s, i) => s + i.preco * i.qtd, 0); }

  function render() {
    const tb = document.getElementById('itens');
    tb.innerHTML = itens.map((i, idx) =>
      `<tr><td>${i.nome}</td><td>${i.qtd} × ${money(i.preco)}</td><td style="text-align:right">${money(i.preco * i.qtd)}</td>` +
      `<td style="width:40px;text-align:right"><button type="button" class="btn ghost" onclick="__rem(${idx})" style="background:#e5e7eb;color:#111;padding:4px 8px">✕</button></td></tr>`
    ).join('') || '<tr><td colspan="4" style="color:#94a3b8">Nenhum item ainda.</td></tr>';
    document.getElementById('total').textContent = money(total());
  }
  window.__rem = (idx) => { itens.splice(idx, 1); render(); };

  async function init() {
    try {
      const [cls, prods, formas] = await Promise.all([Bora.clientes(), Bora.produtos(), Bora.formasPagamento()]);
      produtos = prods; clientes = cls;
      const ativas = (formas || []).filter(f => f.ativo !== false);
      if (ativas.length) document.getElementById('pagamento').innerHTML = ativas.map(f => `<option>${f.descricao}</option>`).join('');
      const sel = document.getElementById('cliente');
      sel.innerHTML = '<option value="">— Selecione —</option>' + cls.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
      sel.addEventListener('change', atualizarCashback);
      document.getElementById('produto').innerHTML =
        prods.map(p => `<option value="${p.id}">${p.nome} — ${money(p.preco)}</option>`).join('');
      document.getElementById('origem').innerHTML =
        BORA_CANAIS.map(c => `<option value="${c.key}">${c.ic} ${c.key}</option>`).join('');
      render();
    } catch (e) { document.getElementById('msg').textContent = e.message; }
  }

  document.getElementById('add').addEventListener('click', () => {
    const pid = Number(document.getElementById('produto').value);
    const qtd = Math.max(1, parseInt(document.getElementById('qtd').value || '1', 10));
    const p = produtos.find(x => x.id === pid); if (!p) return;
    const existente = itens.find(i => i.id === pid);
    if (existente) existente.qtd += qtd; else itens.push({ id: pid, nome: p.nome, preco: Number(p.preco), qtd });
    render();
  });

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg'); msg.textContent = '';
    if (itens.length === 0) { msg.textContent = 'Adicione ao menos um item'; return; }
    const obs = document.getElementById('obs').value.trim();
    const req = {
      clienteId: document.getElementById('cliente').value ? Number(document.getElementById('cliente').value) : null,
      codigo: '#' + Date.now().toString().slice(-6),
      formaPagamento: document.getElementById('pagamento').value,
      origem: document.getElementById('origem').value,
      observacao: obs || null,
      usarCashback: document.getElementById('usarCashback').checked,
      itens: itens.map(i => ({ produtoId: i.id, quantidade: i.qtd })) // total é calculado no servidor
    };
    try { await Bora.api('/api/pedidos', { method: 'POST', body: JSON.stringify(req) }); location.href = 'pedidos.html'; }
    catch (ex) { msg.textContent = ex.message; }
  });

  document.addEventListener('DOMContentLoaded', init);
})();
