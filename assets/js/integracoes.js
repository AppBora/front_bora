// Integrações com marketplaces — conectar credenciais, webhook e simular recebimento de pedido.
(function () {
  if (!Bora.requireAuth()) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const MP = {
    IFOOD:     { ic: '🔴', cor: '#EA1D2C' },
    NOVE_NOVE: { ic: '🟡', cor: '#FFC400' },
    RAPPI:     { ic: '🟠', cor: '#FF441F' },
    UBER_EATS: { ic: '🟢', cor: '#06C167' },
    AIQFOME:   { ic: '🔵', cor: '#0ea5e9' },
    GOOMER:    { ic: '🟣', cor: '#8b5cf6' }
  };

  // Payloads de exemplo no formato de cada marketplace (prova que os adaptadores funcionam).
  function amostra(canal) {
    const v = (9 + Math.floor(Math.random() * 40)) + '.90';
    switch (canal) {
      case 'IFOOD': return { id: 'IF-' + Date.now(), customer: { name: 'Ana (iFood)', phone: { number: '11955550001' } },
        delivery: { deliveryAddress: { streetName: 'Rua das Flores', streetNumber: '120', neighborhood: 'Centro' } },
        items: [{ name: 'Combo Açaí 700ml', quantity: 1, unitPrice: v }], total: { orderAmount: { value: v } }, payments: { methods: [{ method: 'CREDIT' }] } };
      case 'NOVE_NOVE': return { order_id: '99-' + Date.now(), consumer: { name: 'Bruno (99Food)', phone: '11955550002' },
        address: { street: 'Av. Brasil', number: '500', district: 'Jardim' }, products: [{ name: 'Milk Shake', qty: 2, price: v }], total_amount: v, payment_method: 'Pago no app' };
      case 'RAPPI': return { order_id: 'RP-' + Date.now(), client: { first_name: 'Carla (Rappi)', phone: '11955550003' },
        delivery_address: { address: 'Rua Verde, 88', neighborhood: 'Vila Nova' }, items: [{ name: 'Sorvete 1L', units: 1, unit_price: v }], total_value: v, payment_method: 'Pago no app' };
      case 'UBER_EATS': return { id: 'UE-' + Date.now(), eater: { firstName: 'Diego (Uber)', phone: '11955550004' },
        deliveryLocation: { streetAddress: 'Alameda Sul, 33', neighborhood: 'Centro' },
        cart: { items: [{ title: 'Picolé Gourmet', quantity: 3, price: { unitPrice: { amount: v } } }] }, payment: { charges: { total: { amount: v } } } };
      default: return { externalId: 'EXT-' + Date.now(), clienteNome: 'Cliente teste', clienteTelefone: '11955550009',
        endereco: 'Rua Teste, 1', bairro: 'Centro', pagamento: 'Pago no app', total: v, itens: [{ nome: 'Item demonstração', quantidade: 1, precoUnitario: v }] };
    }
  }

  let dados = [];

  function card(i) {
    const mp = MP[i.canal] || { ic: '🧾', cor: '#94a3b8' };
    const open = i._open ? 'open' : '';
    const webhookFull = i.webhookPath ? (Bora.apiBase() + i.webhookPath) : '';
    return `<div class="intcard" style="--c:${mp.cor}">
      <div class="ih">
        <div class="logo-mp">${mp.ic}</div>
        <div class="nm"><b>${esc(i.label)}</b><small>${i.configurado ? 'Conexão criada' : 'Não configurado'}</small></div>
        <span class="intstatus is-${i.status}">${i.status}</span>
      </div>
      <div class="toggle-row" onclick="__toggleOpen('${i.canal}')">
        <span style="font-weight:700;font-size:13px">${i.ativo ? '🟢 Recebendo pedidos' : 'Configurar conexão'}</span>
        <span style="color:#94a3b8;font-size:12px">${i._open ? 'fechar ▲' : 'abrir ▼'}</span>
      </div>
      <div class="intbody ${open}" id="body-${i.canal}">
        <div class="field"><label>Merchant ID (ID da loja no ${esc(i.label)})</label><input id="m-${i.canal}" value="${esc(i.merchantId || '')}" placeholder="ex.: 123e4567-..."></div>
        <div class="field"><label>Client ID</label><input id="c-${i.canal}" value="${esc(i.clientId || '')}" placeholder="chave de aplicação"></div>
        <div class="field"><label>Client Secret / Token ${i.temSecret ? '<span style="color:#059669">· salvo ✓</span>' : ''}</label><input id="s-${i.canal}" type="password" placeholder="${i.temSecret ? '•••••• (deixe em branco p/ manter)' : 'cole o segredo aqui'}"></div>
        <div class="toggle-row" style="padding:6px 0" onclick="__switch('${i.canal}',this)">
          <span style="font-weight:700;font-size:13px">Ativar recebimento</span>
          <span class="switch ${i.ativo ? 'on' : ''}" data-on="${i.ativo}"></span>
        </div>
        <div class="intfoot">
          <button class="btn" onclick="__salvar('${i.canal}')">💾 Salvar conexão</button>
          <button class="btn secondary" onclick="__simular('${i.canal}')" ${i.webhookPath ? '' : 'disabled title="Salve a conexão primeiro"'}>🧪 Simular pedido</button>
        </div>
        ${webhookFull ? `<div class="webhook-box"><label style="font-size:12px;color:#64748b;font-weight:700">URL de Webhook (cole no painel do ${esc(i.label)})</label>
          <div class="wl"><input readonly value="${esc(webhookFull)}"><button class="btn" style="padding:8px 12px" onclick="__copy(this)">Copiar</button></div></div>` : ''}
      </div>
      <div class="intmini"><span>Pedidos recebidos: <b>${i.pedidosRecebidos || 0}</b></span><span>Última sync: <b>${i.ultimaSync ? new Date(i.ultimaSync).toLocaleString('pt-BR') : '—'}</b></span></div>
    </div>`;
  }

  function render() { document.getElementById('grid').innerHTML = dados.map(card).join(''); }

  window.__toggleOpen = canal => { const i = dados.find(x => x.canal === canal); i._open = !i._open; render(); };
  window.__switch = (canal, el) => { const sw = el.querySelector('.switch'); sw.classList.toggle('on'); sw.dataset.on = sw.classList.contains('on'); };
  window.__copy = btn => { const i = btn.parentElement.querySelector('input'); i.select(); navigator.clipboard?.writeText(i.value);
    const t = btn.textContent; btn.textContent = '✓'; setTimeout(() => btn.textContent = t, 1000); };

  window.__salvar = async canal => {
    const body = {
      merchantId: document.getElementById('m-' + canal).value.trim(),
      clientId: document.getElementById('c-' + canal).value.trim(),
      ativo: document.querySelector(`#body-${canal} .switch`).dataset.on === 'true'
    };
    const secret = document.getElementById('s-' + canal).value.trim();
    if (secret) body.clientSecret = secret;
    try { await Bora.salvarIntegracao(canal, body); await carregar(canal); }
    catch (e) { alert('Erro ao salvar: ' + e.message); }
  };

  window.__simular = async canal => {
    const i = dados.find(x => x.canal === canal); if (!i || !i.webhookPath) return;
    try {
      const res = await fetch(Bora.apiBase() + i.webhookPath, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(amostra(canal))
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const r = await res.json();
      await carregar(canal);
      alert(`✓ Pedido de teste recebido do ${i.label}!\nPedido #${r.pedidoId} criado — veja em Pedidos / KDS / Canais.`);
    } catch (e) { alert('Falha na simulação: ' + e.message); }
  };

  async function carregar(manterAberto) {
    try {
      const nova = await Bora.integracoes();
      if (manterAberto) { const a = dados.find(x => x.canal === manterAberto); if (a && a._open) { const n = nova.find(x => x.canal === manterAberto); if (n) n._open = true; } }
      // preserva estado aberto dos demais
      dados.forEach(o => { if (o._open) { const n = nova.find(x => x.canal === o.canal); if (n) n._open = true; } });
      dados = nova; render();
    } catch (e) { document.getElementById('grid').innerHTML = `<p style="color:var(--danger)">${e.message}</p>`; }
  }

  document.addEventListener('DOMContentLoaded', () => carregar());
})();
