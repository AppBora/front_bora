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
      case 'NOVE_NOVE': {
        // Formato Open Delivery v1.7.1 (o mesmo que a 99 devolve em GET /v1/orders/{id}).
        const un = Number(v), tot = un * 2, brl = x => ({ value: Number(x.toFixed(2)), currency: 'BRL' });
        return { id: '99-' + Date.now(), displayId: String(1000 + Math.floor(Math.random() * 9000)),
          customer: { name: 'Bruno (99Food)', phone: { number: '11955550002' } },
          delivery: { deliveredBy: 'MARKETPLACE',
            deliveryAddress: { street: 'Av. Brasil', number: '500', complement: 'casa 2', district: 'Jardim' } },
          items: [{ name: 'Milk Shake', quantity: 2, unitPrice: brl(un), totalPrice: brl(tot) }],
          total: { itemsPrice: brl(tot), otherFees: brl(0), discount: brl(0), orderAmount: brl(tot) },
          payments: { prepaid: tot, pending: 0, methods: [{ value: tot, currency: 'BRL', type: 'PREPAID', method: 'CREDIT' }] },
          extraInfo: 'Pedido de demonstracao' };
      }
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

  // Credenciais do aplicativo do BoraHapp nos marketplaces oficiais (iFood, 99). Valem para TODAS as
  // lojas: se o lojista visse, poderia trocar a chave de todo mundo. Só o administrador da plataforma
  // vê e edita — o segredo nunca volta do servidor, o campo nasce vazio e em branco mantém o salvo.
  const ehPlataforma = (Bora.user() || {}).papel === 'ADMINISTRADOR_BORA';
  let credApp = {};
  const ROTULOS_APP = {
    IFOOD: ['Client ID', 'Client Secret', 'Copie no portal do iFood: Meus aplicativos → aplicativo distribuído (D) → Credenciais.'],
    NOVE_NOVE: ['App ID', 'App Secret', 'Copie no portal da 99: Gerenciamento de aplicativo → aplicativo do BoraHapp.']
  };
  async function carregarCredApp() {
    if (!ehPlataforma) return;
    try {
      const lista = await Bora.api('/admin-bora/credenciais');
      credApp = {};
      lista.forEach(c => { credApp[c.canal] = c; });
    } catch (e) { credApp = {}; }
  }
  function boxCredencialApp(i) {
    const c = credApp[i.canal];
    if (!c) return '';
    const [rotId, rotSec, onde] = ROTULOS_APP[i.canal] || ['Client ID', 'Client Secret', ''];
    const estado = c.origem === 'TELA' ? '<span style="color:#059669">· salvo ✓</span>'
      : c.origem === 'SERVIDOR' ? '<span style="color:#075985">· configurado no servidor</span>'
      : '<span style="color:#b91c1c">· não configurado</span>';
    return `<div class="oficial-box" style="border:1px dashed #94a3b8;background:#f8fafc">
      <b>🔑 Credenciais do aplicativo BoraHapp ${estado}</b>
      <p style="font-size:12px;color:#64748b;margin:4px 0 8px">Valem para todas as lojas — só o administrador da plataforma vê este bloco. ${esc(onde)}</p>
      <div class="field"><label>${rotId}</label><input id="app-id-${i.canal}" value="${esc(c.clientId || '')}" autocomplete="off"></div>
      <div class="field"><label>${rotSec}</label><input id="app-sec-${i.canal}" type="password" autocomplete="new-password"
        placeholder="${c.temSecret ? '•••••• salvo (em branco mantém)' : 'cole o segredo aqui'}"></div>
      <button class="btn" onclick="__salvarApp('${i.canal}')">Salvar credenciais</button>
      ${c.origem === 'TELA' ? `<button class="btn secondary" onclick="__removerApp('${i.canal}')">Remover</button>` : ''}
    </div>`;
  }
  window.__salvarApp = async canal => {
    const v = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
    const clientId = v('app-id-' + canal), clientSecret = v('app-sec-' + canal);
    if (!clientId) { alert('Cole o ' + (ROTULOS_APP[canal] || ['Client ID'])[0] + '.'); return; }
    try {
      await Bora.api('/admin-bora/credenciais/' + canal, { method: 'PUT', body: JSON.stringify({ clientId, clientSecret }) });
      await carregarCredApp();
      await carregar(canal);
      alert('Credenciais salvas. Já valem para todas as lojas.');
    } catch (e) { alert('Erro ao salvar: ' + e.message); }
  };
  window.__removerApp = async canal => {
    if (!confirm('Remover as credenciais do aplicativo?\n\nAs lojas conectadas a este marketplace param de receber pedidos, '
      + 'a não ser que exista uma credencial configurada no servidor.')) return;
    try {
      await Bora.api('/admin-bora/credenciais/' + canal, { method: 'DELETE' });
      await carregarCredApp();
      await carregar(canal);
    } catch (e) { alert('Erro: ' + e.message); }
  };

  // A Meta chama o webhook do robo em /public/whatsapp-webhook/{loja} e valida o hub.verify_token
  // contra o nosso webhookToken. Ele so existe depois de salvar a conexao uma vez.
  function boxMeta(i) {
    if (!i.webhookPath) return `<div class="webhook-box"><label style="font-size:12px;color:#64748b;font-weight:700">Salve a conexão para gerar o verify token da Meta.</label></div>`;
    const q = new URLSearchParams(i.webhookPath.split('?')[1] || '');
    const loja = q.get('loja') || '';
    const verify = q.get('token') || '';
    const url = Bora.apiBase() + '/public/whatsapp-webhook/' + loja;
    return `<div class="webhook-box">
      <label style="font-size:12px;color:#64748b;font-weight:700">Callback URL (cole em WhatsApp → Configuração, no painel da Meta)</label>
      <div class="wl"><input readonly value="${esc(url)}"><button class="btn" style="padding:8px 12px" onclick="__copy(this)">Copiar</button></div>
      <label style="font-size:12px;color:#64748b;font-weight:700;margin-top:10px;display:block">Verify token (o campo logo abaixo da URL, no mesmo painel)</label>
      <div class="wl"><input readonly value="${esc(verify)}"><button class="btn" style="padding:8px 12px" onclick="__copy(this)">Copiar</button></div>
      <p style="font-size:12px;color:#64748b;margin:8px 0 0">Depois de verificar, assine o campo <b>messages</b> na mesma tela da Meta.</p>
    </div>`;
  }

  // A 99 manda os avisos para um endereço só, cadastrado no aplicativo do BoraHapp no portal dela, e
  // descobre a loja pelo App Shop ID. O endereço /webhooks/nove_nove?loja=&token= que o card mostrava
  // antes nunca seria chamado pela 99.
  function boxOpenDelivery() {
    const url = Bora.apiBase() + '/public/opendelivery/v1/newEvent';
    return `<div class="webhook-box"><label style="font-size:12px;color:#64748b;font-weight:700">Endereço de avisos da 99 (URL de callback)</label>
      <div class="wl"><input readonly value="${esc(url)}"><button class="btn" style="padding:8px 12px" onclick="__copy(this)">Copiar</button></div>
      <p style="font-size:12px;color:#64748b;margin:8px 0 0">É cadastrado uma vez só, no aplicativo do BoraHapp no portal de desenvolvedores da 99, e vale para todas as lojas. A loja não precisa colar em lugar nenhum.</p></div>`;
  }

  function card(i) {
    const mp = MP[i.canal] || { ic: '🧾', cor: '#94a3b8' };
    const zap = i.canal === 'WHATSAPP';
    const open = i._open ? 'open' : '';
    const webhookFull = i.webhookPath ? (Bora.apiBase() + i.webhookPath) : '';
    return `<div class="intcard" style="--c:${mp.cor}">
      <div class="ih">
        <div class="logo-mp">${mp.ic}</div>
        <div class="nm"><b>${esc(i.label)}</b><small>${i.configurado ? 'Conexão criada' : 'Não configurado'}</small></div>
        <span class="intstatus is-${i.status}">${i.status}</span>
      </div>
      <div class="toggle-row" onclick="__toggleOpen('${i.canal}')">
        <span style="font-weight:700;font-size:13px">${i.recebendo ? '🟢 Recebendo pedidos' : 'Configurar conexão'}</span>
        <span style="color:#94a3b8;font-size:12px">${i._open ? 'fechar ▲' : 'abrir ▼'}</span>
      </div>
      <div class="intbody ${open}" id="body-${i.canal}">
        ${i.oficial && ehPlataforma ? boxCredencialApp(i) : ''}
        ${i.oficial ? corpoOficial(i) : ''}
        ${zap ? '' : `<div class="field"><label>${i.canal === 'NOVE_NOVE' ? 'App Shop ID (o código desta loja que você cadastrou no portal da 99)' : 'Merchant ID (ID da loja no ' + esc(i.label) + ')'}</label><input id="m-${i.canal}" value="${esc(i.merchantId || '')}" placeholder="${i.canal === 'NOVE_NOVE' ? 'ex.: zira-acaiteria' : 'ex.: 123e4567-...'}" ${i.oficial && !ehPlataforma ? 'readonly style="background:#f1f5f9"' : ''}>${i.oficial && !ehPlataforma ? '<small style="color:#64748b">Definido pelo suporte do BoraHapp — é o código que liga esta loja aos pedidos dela no ' + esc(i.label) + '.</small>' : ''}</div>`}
        ${i.oficial ? '' : `<div class="field"><label>${zap ? 'Phone Number ID (Meta)' : 'Client ID'}</label><input id="c-${i.canal}" value="${esc(i.clientId || '')}" placeholder="${zap ? 'ex.: 123456789012345' : 'chave de aplicação'}"></div>
        <div class="field"><label>${zap ? 'Token permanente do System User' : 'Client Secret / Token'} ${i.temSecret ? '<span style="color:#059669">· salvo ✓</span>' : ''}</label><input id="s-${i.canal}" type="password" placeholder="${i.temSecret ? '•••••• (deixe em branco p/ manter)' : 'cole o segredo aqui'}"></div>`}
        <div class="toggle-row" style="padding:6px 0" onclick="__switch('${i.canal}',this)">
          <span style="font-weight:700;font-size:13px">Ativar recebimento</span>
          <span class="switch ${i.ativo ? 'on' : ''}" data-on="${i.ativo}"></span>
        </div>
        <div class="intfoot">
          <button class="btn" onclick="__salvar('${i.canal}')">💾 Salvar conexão</button>
          ${zap ? '' : `<button class="btn secondary" onclick="__simular('${i.canal}')" ${i.webhookPath ? '' : 'disabled title="Salve a conexão primeiro"'}>🧪 Simular pedido</button>`}
        </div>
        ${zap ? boxMeta(i) : ''}
        ${i.canal === 'NOVE_NOVE' ? boxOpenDelivery() : ''}
        ${webhookFull && !zap && !i.oficial ? `<div class="webhook-box"><label style="font-size:12px;color:#64748b;font-weight:700">URL de Webhook (cole no painel do ${esc(i.label)})</label>
          <div class="wl"><input readonly value="${esc(webhookFull)}"><button class="btn" style="padding:8px 12px" onclick="__copy(this)">Copiar</button></div></div>` : ''}
      </div>
      <div class="intmini"><span>Pedidos recebidos: <b>${i.pedidosRecebidos || 0}</b></span><span>Última sync: <b>${i.ultimaSync ? new Date(i.ultimaSync).toLocaleString('pt-BR') : '—'}</b></span></div>
    </div>`;
  }


  // Canais com integração oficial (iFood, 99Food): a credencial é da plataforma, não do lojista.
  // O que o lojista faz aqui é autorizar a nossa aplicação a operar a loja dele.
  function corpoOficial(i) {
    if (!i.appConfigurado) {
      return `<div class="oficial-box aviso">
        <b>Integração oficial ainda não liberada</b>
        <p>A ${esc(i.label)} precisa aprovar a aplicação do BoraHapp antes de conectar lojas pela credencial da plataforma. Assim que sair, esta tela habilita sozinha — e nada do que você configurar aqui se perde.</p>
        ${i.canal !== 'NOVE_NOVE' ? '' : `<p><b>Não quer esperar?</b> Se a sua loja já tem um aplicativo próprio no portal de desenvolvedores da ${esc(i.label)}, informe a credencial dele abaixo e conecte agora. ${i.temSecret ? '<b style="color:#059669">Credencial própria salva ✓</b>' : ''}</p>
        <div class="field"><label>Client ID do aplicativo da sua loja</label>
          <input id="oc-${i.canal}" value="${esc(i.clientId || '')}" placeholder="opcional — só se você tiver o seu"></div>
        <div class="field"><label>Client Secret ${i.temSecret ? '<span style="color:#059669">· salvo ✓</span>' : ''}</label>
          <input id="os-${i.canal}" type="password" placeholder="${i.temSecret ? '•••••• (em branco mantém o atual)' : 'cole o segredo aqui'}"></div>
        <p style="font-size:12px;color:#64748b">Salve o App Shop ID e a credencial, ative o recebimento e clique em Conectar.</p>
        <button class="btn" onclick="__vincular('${i.canal}')">🔗 Conectar ao ${esc(i.label)}</button>`}
        ${i.ultimoErro ? `<p class="err">Último erro: ${esc(i.ultimoErro)}</p>` : ''}
      </div>`;
    }
    if (i.userCode) {
      // O código de vínculo vence em poucos minutos (10 no iFood). Sem este botão o card ficava preso
      // num código morto e não havia como pedir outro pela tela.
      const vence = i.vinculoExpiraEm ? new Date(i.vinculoExpiraEm) : null;
      const vencido = vence && vence.getTime() < Date.now();
      return `<div class="oficial-box passo">
        <b>Passo 2 — autorize no ${esc(i.label)}</b>
        <p>Entre no portal do parceiro e informe este código:</p>
        <div class="usercode" ${vencido ? 'style="opacity:.45;text-decoration:line-through"' : ''}>${esc(i.userCode)}</div>
        <p style="font-size:12px;margin:6px 0">${vencido
          ? '<b style="color:#b91c1c">Este código venceu.</b> Gere um novo e autorize em seguida.'
          : (vence ? 'Vale até <b>' + vence.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</b>.' : '')}
          <button class="btn secondary" style="padding:4px 10px;font-size:12px;margin-left:6px" onclick="__vincular('${i.canal}')">🔄 Gerar novo código</button></p>
        ${i.verificationUrl ? `<p><a href="${esc(i.verificationUrl)}" target="_blank" rel="noopener">Abrir o portal do ${esc(i.label)} ↗</a></p>` : ''}
        <div class="field"><label>Código de autorização devolvido pelo portal</label>
          <input id="auth-${i.canal}" placeholder="cole aqui"></div>
        <button class="btn" onclick="__confirmar('${i.canal}')">Concluir conexão</button>
      </div>`;
    }
    if (i.status === 'CONECTADO') {
      const quando = i.ultimoPollingEm ? new Date(i.ultimoPollingEm).toLocaleTimeString('pt-BR') : '—';
      return `<div class="oficial-box ok">
        <b>🟢 Conectado — os pedidos chegam sozinhos</b>
        <p>Última consulta ao ${esc(i.label)}: ${quando}. A loja fica online no aplicativo enquanto esta consulta acontecer.</p>
        ${i.ultimoErro ? `<p class="err">Último erro: ${esc(i.ultimoErro)}</p>` : ''}
      </div>`;
    }
    return `<div class="oficial-box passo">
      <b>Passo 1 — conectar a loja</b>
      <p>Salve o ${i.canal === 'NOVE_NOVE' ? 'App Shop ID' : 'Merchant ID'} abaixo e clique em conectar. Você não precisa de senha do ${esc(i.label)}: quem se identifica é o BoraHapp.</p>
      <button class="btn" onclick="__vincular('${i.canal}')">🔗 Conectar ao ${esc(i.label)}</button>
      ${i.ultimoErro ? `<p class="err">Último erro: ${esc(i.ultimoErro)}</p>` : ''}
    </div>`;
  }

  window.__vincular = async canal => {
    try {
      await __salvar(canal);
      const r = await Bora.api('/api/integracoes/' + canal + '/vincular', { method: 'POST' });
      await carregar(canal);
      if (r && r.userCode) alert('Código para autorizar no portal: ' + r.userCode);
    } catch (e) { alert('Não foi possível conectar: ' + e.message); }
  };

  window.__confirmar = async canal => {
    const el = document.getElementById('auth-' + canal);
    const codigo = el ? el.value.trim() : '';
    if (!codigo) { alert('Cole o código de autorização que o portal mostrou.'); return; }
    try {
      await Bora.api('/api/integracoes/' + canal + '/confirmar',
        { method: 'POST', body: JSON.stringify({ authorizationCode: codigo }) });
      await carregar(canal);
    } catch (e) { alert('O marketplace recusou: ' + e.message); }
  };

  function render() { document.getElementById('grid').innerHTML = dados.map(card).join(''); }

  window.__toggleOpen = canal => { const i = dados.find(x => x.canal === canal); i._open = !i._open; render(); };
  window.__switch = (canal, el) => { const sw = el.querySelector('.switch'); sw.classList.toggle('on'); sw.dataset.on = sw.classList.contains('on'); };
  window.__copy = btn => { const i = btn.parentElement.querySelector('input'); i.select(); navigator.clipboard?.writeText(i.value);
    const t = btn.textContent; btn.textContent = '✓'; setTimeout(() => btn.textContent = t, 1000); };

  window.__salvar = async canal => {
    // Canal oficial não renderiza Client ID/Secret no corpo principal: ler direto quebraria a tela.
    const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
    const body = {
      merchantId: val('m-' + canal),
      ativo: document.querySelector(`#body-${canal} .switch`).dataset.on === 'true'
    };
    const cid = val('c-' + canal) || val('oc-' + canal);
    if (cid) body.clientId = cid;
    const secret = val('s-' + canal) || val('os-' + canal);
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

  document.addEventListener('DOMContentLoaded', () => carregarCredApp().then(() => carregar()));
})();
