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
  /**
   * Credencial que vale SO para esta loja, vencendo a da plataforma.
   *
   * Os campos ja existiam (oc-/os-, lidos pelo __salvar), mas so eram desenhados quando a credencial
   * da plataforma estava AUSENTE. Com ela configurada, nao havia onde pôr credencial de uma loja so —
   * e quem precisasse disso acabava salvando no bloco da plataforma, que vale para TODAS. Foi o que
   * aconteceu em 06/10/2026: a credencial de producao de um cliente derrubou a loja de teste, que
   * ficou minutos fora do ar com "User is forbidden to access".
   */
  function boxCredencialDaLoja(i) {
    const [rotId, rotSec] = ROTULOS_APP[i.canal] || ['Client ID', 'Client Secret'];
    const tem = i.clientId && String(i.clientId).trim();
    return `<details class="oficial-box" style="border:1px dashed #cbd5e1;background:#fff" ${tem ? 'open' : ''}>
      <summary style="cursor:pointer;font-weight:700">🏪 Credencial só desta loja ${tem ? '<span style="color:#059669">· em uso ✓</span>' : '<span style="color:#64748b">· usando a da plataforma</span>'}</summary>
      <p style="font-size:12px;color:#64748b;margin:6px 0 8px">Preencha <b>só</b> quando esta loja precisar de um aplicativo diferente do da plataforma —
      por exemplo, uma loja real num aplicativo de produção enquanto as outras seguem no de teste.
      Em branco, ela usa a credencial da plataforma. <b>O que você salvar aqui não afeta nenhuma outra loja.</b></p>
      <div class="field"><label>${rotId} desta loja</label>
        <input id="oc-${i.canal}" value="${esc(i.clientId || '')}" autocomplete="off" placeholder="em branco = usa o da plataforma">
        <small style="color:#64748b">Só o ${esc(rotId)}. O código da loja é juntado automaticamente — não precisa escrever o sublinhado.</small></div>
      <div class="field"><label>${rotSec} desta loja ${i.temSecret ? '<span style="color:#059669">· salvo ✓</span>' : ''}</label>
        <input id="os-${i.canal}" type="password" autocomplete="new-password" placeholder="${i.temSecret ? '•••••• salvo (em branco mantém)' : 'cole o segredo aqui'}"></div>
      <p style="font-size:12px;color:#64748b">Depois de salvar, clique em <b>Conectar</b> para validar com o ${esc(i.label)}.</p>
    </details>`;
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

    // PERGUNTA ANTES, e diz a consequência — a segunda porta que eu deixei aberta.
    //
    // Em 25/10 eu construí a tela de credencial da plataforma em Configurações com confirmação e
    // com o aviso dos tokens esquecidos. Não verifiquei se o controle já existia em outro lugar.
    // Existia: aqui, chamando o MESMO `PUT /admin-bora/credenciais/{canal}`, sem perguntar nada —
    // grava e só depois avisa. O `__removerApp`, logo abaixo, pergunta.
    //
    // O efeito é o que a outra tela diz em voz alta: no 99Food o token é pedido com o App ID/Secret
    // a cada vez, então salvar FAZ O SERVIDOR ESQUECER os tokens de TODAS as lojas daquele canal.
    // Elas se reconectam no próximo ciclo se a credencial nova estiver certa, e ficam fora se
    // estiver errada. Um clique derrubava o recebimento de todas as lojas sem app próprio.
    const recado = canal === 'NOVE_NOVE'
      ? '\n\nIsto vale para TODAS as lojas que usam o app da plataforma neste canal, e o servidor '
        + 'vai esquecer os tokens atuais delas. Se a credencial nova estiver certa, elas se '
        + 'reconectam sozinhas; se estiver errada, param de receber pedido.'
      : '\n\nIsto vale para TODAS as lojas que usam o app da plataforma neste canal.';
    if (!confirm('Salvar a credencial do app da plataforma no ' + canal + '?' + recado)) return;

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
        ${/* so quando a credencial da plataforma EXISTE: sem ela, o corpoOficial ja desenha os
             mesmos campos oc-/os-, e dois elementos com o mesmo id fariam o __salvar ler o errado */
          i.oficial && ehPlataforma && i.appConfigurado ? boxCredencialDaLoja(i) : ''}
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
          ${zap ? '' : `<button class="btn secondary" onclick="__diagnosticar('${i.canal}')">🩺 Diagnosticar conexão</button>`}
        </div>
        <div id="diag-${i.canal}" hidden style="margin-top:10px;font-size:13px;line-height:1.5;
             background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px"></div>
        ${zap ? boxMeta(i) : ''}
        ${i.canal === 'NOVE_NOVE' ? boxOpenDelivery() : ''}
        ${webhookFull && !zap && !i.oficial ? `<div class="webhook-box"><label style="font-size:12px;color:#64748b;font-weight:700">URL de Webhook (cole no painel do ${esc(i.label)})</label>
          <div class="wl"><input readonly value="${esc(webhookFull)}"><button class="btn" style="padding:8px 12px" onclick="__copy(this)">Copiar</button></div></div>` : ''}
      </div>
      <div class="intmini"><span>Pedidos recebidos: <b>${i.pedidosRecebidos || 0}</b></span><span>Última sync: <b>${i.ultimaSync ? new Date(i.ultimaSync).toLocaleString('pt-BR') : '—'}</b></span></div>
    </div>`;
  }


  /**
   * Diagnóstico da conexão com o marketplace.
   *
   * O endpoint existia desde sempre e NENHUMA tela chamava (item 25). Quando o iFood parava de
   * mandar pedido, o lojista via só "Pedidos recebidos: 0" e não tinha como saber se o problema
   * era credencial, loja fechada do lado de lá, ou a nossa busca parada. Isso vira ligação para o
   * suporte, e o suporte também não tinha onde olhar sem abrir o banco.
   *
   * O que ele responde, em português: se está online agora, quando foi a última busca, qual foi o
   * último erro e quando o token expira.
   */
  window.__diagnosticar = async (canal) => {
    const cx = document.getElementById('diag-' + canal);
    cx.hidden = false;
    cx.innerHTML = 'Perguntando ao servidor…';
    try {
      const d = await Bora.diagnosticoDoCanal(canal);
      const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR') : '—');
      const sim = (v) => (v ? '✅ sim' : '❌ não');

      // O "online" do iFood depende da nossa busca estar rodando: sem ela a loja aparece FECHADA
      // para o cliente do marketplace, mesmo com tudo certo aqui.
      const linhas = [
        ['Recebendo agora', d.onlineNoMarketplace ? '🟢 sim' : '🔴 não'],
        ['Conexão ativa', sim(d.ativo)],
        ['Situação', esc(d.status || '—')],
        ['Código da loja lá', esc(d.merchantId || '— (sem ele, nenhum pedido casa com esta loja)')],
        ['Última busca', quando(d.ultimoPollingEm)],
        ['Última sincronização', quando(d.ultimaSync)],
        ['Pedidos recebidos', String(d.pedidosRecebidos || 0)],
        // A linha dizia só a data, e o leitor tinha de fazer a conta de cabeça. Medido em 25/10: a
        // Pizzaria estava com "Token expira em 07/10/2026" — dezoito dias no passado — e nada na
        // tela usava a palavra VENCIDO. Este é o diagnóstico que o suporte abre quando o lojista
        // liga dizendo "não chega pedido": a resposta estava aqui e não era legível.
        ['Autorização (token)', (() => {
          if (!d.tokenExpiraEm) return '—';
          const v = new Date(d.tokenExpiraEm);
          const dia = esc(v.toLocaleDateString('pt-BR'));
          if (v.getTime() < Date.now()) {
            return '<span style="color:#b91c1c">⛔ VENCIDA em ' + dia
              + ' — nenhum pedido novo entra</span>';
          }
          // Avisar ANTES de vencer é o que evita a ligação. 3 dias dá tempo de refazer o vínculo.
          const faltam = Math.ceil((v.getTime() - Date.now()) / 86400000);
          return faltam <= 3
            ? '<span style="color:#b45309">⚠ vence em ' + faltam + ' dia(s), ' + dia + '</span>'
            : 'válida até ' + dia;
        })()],
      ];
      if (d.integracaoOficial) linhas.push(['App do BoraHapp configurado', sim(d.appDaPlataformaConfigurado)]);

      cx.innerHTML = '<b>' + esc(d.label || canal) + '</b>'
        + '<table style="width:100%;margin-top:6px;border-collapse:collapse">'
        + linhas.map(([k, v]) => '<tr><td style="padding:2px 8px 2px 0;color:#64748b;'
          + 'white-space:nowrap">' + esc(k) + '</td><td style="padding:2px 0"><b>' + v + '</b></td></tr>').join('')
        + '</table>'
        + (d.ultimoErro
          ? '<div style="margin-top:8px;padding:8px;border-radius:6px;background:#fef2f2;'
            + 'border:1px solid #fca5a5;color:#7f1d1d"><b>Último erro:</b><br>'
            + esc(d.ultimoErro) + '</div>'
          : '<div style="margin-top:8px;color:#15803d">Nenhum erro registrado.</div>')
        // O recado entra AQUI também, e não é detalhe: este é o diagnóstico que o lojista abre
        // quando "não chega pedido". Sem esta linha ele lia "Nenhum erro registrado" enquanto um
        // pedido dele estava parado no marketplace -- a tela afirmando que está tudo bem é pior
        // que a tela calada.
        + (d.ultimoAviso
          ? '<div style="margin-top:8px;padding:8px;border-radius:6px;background:#fffbeb;'
            + 'border:1px solid #fde68a;color:#92400e"><b>⚠️ Um pedido ficou parado lá dentro:</b><br>'
            + esc(d.ultimoAviso)
            + (d.ultimoAvisoEm ? '<br><small>Em ' + esc(new Date(d.ultimoAvisoEm)
                .toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))
              + '</small>' : '')
            + '</div>'
          : '');
    } catch (e) {
      cx.innerHTML = '<span style="color:#b91c1c">Não consegui diagnosticar: '
        + esc(e && e.message || e) + '</span>';
    }
  };

  // Canais com integração oficial (iFood, 99Food): a credencial é da plataforma, não do lojista.
  /**
   * As duas linhas que a integração pode ter para o lojista — e elas NÃO são a mesma coisa.
   *
   * **Último erro** = a integração está com problema (polling caiu, credencial recusada). Some
   * sozinho quando volta a funcionar, e tem de sumir: erro de uma integração que já está boa só
   * ensina o lojista a ignorar a tela.
   *
   * **Recado** = a integração está boa, mas **um pedido seu ficou parado lá dentro**. Isso não
   * deixa de ser verdade porque a consulta seguinte funcionou, então nada o apaga sozinho — só o
   * botão "Já vi".
   *
   * O defeito que isto fecha (achado pelo QA em 24/10/2026): os dois moravam no mesmo campo, e a
   * consulta ao marketplace — que acontece a cada 30 segundos — apagava o recado junto com o erro.
   * O lojista tinha até meio minuto para ver, e só se estivesse com esta tela aberta naquele
   * instante. Na prática, nunca via. E o recado é o que explica por que o cliente final continua
   * vendo "em preparo" no aplicativo depois de ter recebido a comida.
   */
  function recados(i) {
    const erro = i.ultimoErro ? `<p class="err">Último erro: ${esc(i.ultimoErro)}</p>` : '';
    if (!i.ultimoAviso) return erro;
    const q = i.ultimoAvisoEm ? new Date(i.ultimoAvisoEm) : null;
    const quando = q ? q.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }) : '';
    return erro + `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-top:8px">
      <b>⚠️ Um pedido seu ficou parado no ${esc(i.label)}</b>
      <p style="margin:6px 0">${esc(i.ultimoAviso)}</p>
      ${quando ? `<small style="color:#92400e">Em ${esc(quando)}</small>` : ''}
      <p style="margin:6px 0 0"><button class="btn secondary" style="padding:4px 10px;font-size:12px"
        onclick="__avisoLido('${i.canal}')">Já vi, tirar da tela</button></p>
    </div>`;
  }

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
        ${recados(i)}
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

      // TOKEN VENCIDO: a tela precisa DIZER, e não mostrar uma data para o lojista comparar.
      //
      // Achado em 25/10/2026, atacando o item 24: a Pizzaria (loja 17) está com o iFood em
      // `CONECTADO` e o token venceu em 07/10 — dezoito dias antes. O cartão dizia que estava tudo
      // certo, e o único lugar que falava do token era uma linha do diagnóstico escrita
      // "Token expira em 07/10/2026" — sem a palavra "vencido", e só para quem abrisse o
      // diagnóstico e fizesse a conta de cabeça.
      //
      // Quando a integração é da PLATAFORMA, o token se renova sozinho e um vencimento no passado
      // costuma ser falha de renovação; quando a credencial é da LOJA e ela não está mais salva,
      // não há como renovar e o vínculo tem de ser refeito. A mensagem muda nos dois casos porque a
      // ação do lojista é diferente.
      const venc = i.tokenExpiraEm ? new Date(i.tokenExpiraEm) : null;
      const tokenVencido = venc && venc.getTime() < Date.now();
      const avisoToken = !tokenVencido ? '' : `
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px;margin-top:8px;color:#7f1d1d">
          <b>⛔ A autorização do ${esc(i.label)} venceu</b> em
          ${esc(venc.toLocaleDateString('pt-BR'))}.
          <p style="margin:6px 0 0">Enquanto não for renovada, <b>nenhum pedido novo entra</b> por
          este canal — mesmo com o cartão dizendo conectado.
          ${i.oficial && i.appConfigurado
            ? 'A renovação é automática; se a data já passou, ela está falhando. Clique em Conectar para refazer.'
            : 'Refaça a conexão: clique em <b>Conectar</b> e autorize no portal outra vez.'}</p>
          <button class="btn" style="margin-top:8px" onclick="__vincular('${i.canal}')">🔗 Reconectar ao ${esc(i.label)}</button>
        </div>`;
      // Conectado NAO e o mesmo que recebendo. Sem o ID da loja no marketplace, a busca de pedidos
      // sai na primeira linha e nunca traz nada -- sem erro e sem log. O card ficava verde dizendo
      // "os pedidos chegam sozinhos" com a Ultima sync em branco para sempre, e o lojista ficaria
      // esperando pedido que nunca vem. Quando falta esse ID, a tela diz isso em vez de prometer.
      if (!i.merchantId) {
        return `<div class="oficial-box" style="background:#fffbeb;border-color:#fde68a">
          <b>🟡 Autorizado, mas ainda não recebendo</b>
          <p>A conexão com o ${esc(i.label)} foi autorizada, só falta dizer <b>qual é a sua loja lá</b>.
          Informe o <b>${esc(i.label === 'iFood' ? 'Merchant ID' : 'ID da loja')}</b> no campo abaixo e salve —
          sem ele os pedidos não chegam.</p>
          ${avisoToken}
          ${recados(i)}
        </div>`;
      }
      // Com o token vencido a caixa NAO pode ser a verde que diz "os pedidos chegam sozinhos":
      // essa frase e a promessa exata que deixou de ser verdade.
      return `<div class="oficial-box ${tokenVencido ? '' : 'ok'}" ${tokenVencido ? 'style="background:#fffbeb;border-color:#fde68a"' : ''}>
        <b>${tokenVencido ? '🟡 Conectado, mas a autorização venceu' : '🟢 Conectado — os pedidos chegam sozinhos'}</b>
        <p>Última consulta ao ${esc(i.label)}: ${quando}.${tokenVencido ? ''
          : ' A loja fica online no aplicativo enquanto esta consulta acontecer.'}</p>
        ${avisoToken}
        ${recados(i)}
      </div>`;
    }
    return `<div class="oficial-box passo">
      <b>Passo 1 — conectar a loja</b>
      <p>Salve o ${i.canal === 'NOVE_NOVE' ? 'App Shop ID' : 'Merchant ID'} abaixo e clique em conectar. Você não precisa de senha do ${esc(i.label)}: quem se identifica é o BoraHapp.</p>
      <button class="btn" onclick="__vincular('${i.canal}')">🔗 Conectar ao ${esc(i.label)}</button>
      ${recados(i)}
    </div>`;
  }

  /**
   * O lojista leu o recado e mandou tirar da tela.
   *
   * Pergunta antes porque o recado é o único aviso que ele vai receber sobre aquele pedido: depois
   * de dispensado não há de onde recuperá-lo, e o pedido pode continuar parado no marketplace.
   */
  window.__avisoLido = async canal => {
    if (!confirm('Tirar este recado da tela?\n\nEle não volta. Se o pedido ainda estiver parado no '
      + 'marketplace, confira lá dentro antes de dispensar.')) return;
    try {
      await Bora.api('/api/integracoes/' + encodeURIComponent(canal) + '/aviso-lido',
        { method: 'POST' });
      await carregar(canal);
    } catch (e) { alert('Não foi possível tirar o recado: ' + e.message); }
  };

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
    try {
      await Bora.salvarIntegracao(canal, body);
      await carregar(canal);
      // Sem aviso de sucesso o lojista clicava e nao sabia se tinha salvado (o botao so falava no erro).
      const nome = (dados.find(x => x.canal === canal) || {}).label || canal;
      const recado = 'Conexão do <b>' + esc(nome) + '</b> salva ✓'
        + (body.ativo ? ' — recebendo pedidos' : ' — recebimento desligado');
      if (typeof boraToast === 'function') boraToast(recado, 'ok');
      else alert(recado.replace(/<[^>]+>/g, ''));
    } catch (e) { alert('Erro ao salvar: ' + e.message); }
  };

  window.__simular = async canal => {
    const i = dados.find(x => x.canal === canal); if (!i || !i.webhookPath) return;
    if (!confirm('Isto cria um PEDIDO DE TESTE de verdade: ele aparece na cozinha (KDS), soma nas vendas e nos relatórios. Depois exclua em Pedidos (🗑). Continuar?')) return;
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
