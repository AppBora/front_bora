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

  function enviarWhatsapp() {
    const linhas = [], nome = document.getElementById('lojaNome').textContent;
    let total = 0;
    Object.entries(cart).forEach(([id, q]) => { const p = produtos.find(x => x.id == id);
      if (p) { linhas.push(`• ${q}x ${p.nome} — ${money(Number(p.preco) * q)}`); total += Number(p.preco) * q; } });
    const msg = `*Pedido — ${nome}*\n\n${linhas.join('\n')}\n\n*Total: ${money(total)}*\n\nMeu nome: \nEndereço: \nForma de pagamento: `;
    const base = wa ? `https://wa.me/${wa}?text=` : `https://wa.me/?text=`;
    window.open(base + encodeURIComponent(msg), '_blank');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('send').addEventListener('click', enviarWhatsapp);
    try {
      const data = await Bora.cardapioPublico(lojaId);
      document.getElementById('lojaNome').textContent = (data.loja && data.loja.nome) || 'Cardápio';
      document.title = (data.loja && data.loja.nome) || 'Cardápio Digital';
      produtos = data.produtos || [];
      if (!produtos.length) { document.getElementById('menu').innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px">Cardápio em montagem.</p>'; return; }
      render();
    } catch (e) { document.getElementById('menu').innerHTML = `<p style="text-align:center;color:var(--danger);padding:40px">${e.message}</p>`; }
  });
})();
