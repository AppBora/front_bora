// Tema white-label + navegação lateral centralizada (1 só lugar para todas as telas).
function applyTheme(){const s=JSON.parse(localStorage.getItem('boraTheme')||'{}'); if(s.primary)document.documentElement.style.setProperty('--primary',s.primary); if(s.secondary)document.documentElement.style.setProperty('--secondary',s.secondary); if(s.name)document.querySelectorAll('[data-store]').forEach(e=>e.textContent=s.name); if(s.logo)document.querySelectorAll('.logo').forEach(e=>{e.style.backgroundImage=`url(${s.logo})`;e.style.backgroundSize='cover';e.textContent='';});}
function statusClass(st){return 'b-'+st.toLowerCase().replaceAll(' ','').replace('empreparo','preparo').replace('saiuparaentrega','entrega').replace('entregue','entregue').replace('recebido','recebido').replace('pronto','pronto')}

// Canais de venda (marketplaces + diretos). Cor/ícone p/ identificação visual.
const BORA_CANAIS = [
  { key:'iFood',     ic:'🔴', cor:'#EA1D2C', match:['IFOOD','I-FOOD'] },
  { key:'99Food',    ic:'🟡', cor:'#FFC400', match:['99FOOD','99 FOOD','99'] },
  { key:'Rappi',     ic:'🟠', cor:'#FF441F', match:['RAPPI'] },
  { key:'Uber Eats', ic:'🟢', cor:'#06C167', match:['UBER','UBEREATS','UBER EATS'] },
  { key:'WhatsApp',  ic:'💬', cor:'#25D366', match:['WHATS','ZAP'] },
  { key:'Instagram', ic:'📷', cor:'#C13584', match:['INSTA','IG'] },
  { key:'Telefone',  ic:'📞', cor:'#3b82f6', match:['FONE','TELEF'] },
  { key:'Site',      ic:'🌐', cor:'#0ea5e9', match:['SITE','CARDAP','WEB'] },
  { key:'Balcão',    ic:'🏪', cor:'#8b5cf6', match:['BALC','LOJA','CAIXA','PDV'] },
  { key:'Delivery',  ic:'🛵', cor:'#7c3aed', match:['DELIVERY','ENTREGA'] }
];
function boraCanal(origem){
  const o = (origem||'').toUpperCase();
  for (const c of BORA_CANAIS){ if (c.match.some(m=>o.includes(m))) return c; }
  return { key: origem || 'Outros', ic:'🧾', cor:'#94a3b8' };
}
// SLA de preparo (minutos prometidos) por canal — base do alerta de atraso.
const BORA_SLA = { 'Balcão':12, 'WhatsApp':25, 'Instagram':25, 'Telefone':25, 'Site':30, 'Delivery':35,
  'iFood':40, '99Food':40, 'Rappi':40, 'Uber Eats':40, 'aiqfome':40, 'Goomer':35 };
function boraSla(origem){ return BORA_SLA[boraCanal(origem).key] || 30; }

const BORA_NAV = [
  { href:'dashboard.html',     label:'Dashboard',       ic:'📊' },
  { href:'pedidos.html',       label:'Pedidos',         ic:'🧾' },
  { href:'pdv.html',           label:'Frente de Caixa', ic:'💳' },
  { href:'caixa.html',         label:'Fechar Caixa',    ic:'💰' },
  { href:'kds.html',           label:'KDS Cozinha',     ic:'🍳' },
  { href:'canais.html',        label:'Canais',          ic:'📡' },
  { href:'respostas-whatsapp.html', label:'Respostas WhatsApp', ic:'💬' },
  { href:'integracoes.html',   label:'Integrações',     ic:'🔌' },
  { href:'entregas.html',      label:'Entregas',        ic:'🛵' },
  { href:'entregadores.html',  label:'Entregadores',    ic:'🏍️' },
  { href:'acerto-entregadores.html', label:'Acerto Motoboy', ic:'💵', roles:['ADMINISTRADOR_LOJA','GERENTE'] },
  { href:'crm.html',           label:'CRM',             ic:'⭐' },
  { href:'clientes.html',      label:'Clientes',        ic:'👥' },
  { href:'produtos.html',      label:'Produtos',        ic:'📦' },
  { href:'estoque.html',       label:'Estoque',         ic:'🗃️' },
  { href:'insumos.html',       label:'Insumos',         ic:'🧂' },
  { href:'cardapio-qr.html',   label:'Cardápio QR',     ic:'📱' },
  { href:'promocoes.html',     label:'Promoções',       ic:'⚡' },
  { href:'relatorios.html',    label:'Relatórios',      ic:'📈' },
  { href:'desempenho.html',    label:'Desempenho',      ic:'💹', roles:['ADMINISTRADOR_LOJA','GERENTE'] },
  { href:'rede.html',          label:'Rede & Análise IA', ic:'🏪', roles:['ADMINISTRADOR_LOJA','GERENTE'] },
  { href:'configuracoes.html', label:'Configurações',   ic:'⚙️' },
  { href:'ajustes.html',       label:'Ajustes Operação',ic:'🛠️' },
  { href:'usuarios.html',      label:'Usuários',        ic:'🔑' },
  { href:'planos.html',        label:'Planos',          ic:'🏷️' },
  { href:'ajuda.html',         label:'Ajuda',           ic:'🆘' }
];

function renderNav(){
  const nav = document.querySelector('.nav'); if(!nav) return;
  const atual = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
  const papel = (typeof Bora!=='undefined' && Bora.user() && Bora.user().papel) || '';
  const pode = i => !i.roles || papel==='ADMINISTRADOR_BORA' || i.roles.includes(papel);
  nav.innerHTML = BORA_NAV.filter(pode).map(i =>
    `<a href="${i.href}" class="${i.href===atual?'active':''}"><span class="navic">${i.ic}</span><span class="navtx">${i.label}</span></a>`
  ).join('');
}

// ---- Alertas de pedido novo: som (WebAudio, sem asset) + toast ----
let _boraAudioCtx=null;
function boraBeep(){
  try{
    _boraAudioCtx=_boraAudioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const ctx=_boraAudioCtx; if(ctx.state==='suspended') ctx.resume(); const t=ctx.currentTime;
    [880,1320].forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();
      o.type='sine';o.frequency.value=f;o.connect(g);g.connect(ctx.destination);
      const s=t+i*0.18;g.gain.setValueAtTime(0.0001,s);g.gain.exponentialRampToValueAtTime(0.25,s+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,s+0.16);o.start(s);o.stop(s+0.17);});
  }catch(e){}
}
function boraToast(msg,tipo){
  let wrap=document.getElementById('boraToasts');
  if(!wrap){wrap=document.createElement('div');wrap.id='boraToasts';document.body.appendChild(wrap);}
  const el=document.createElement('div');el.className='btoast '+(tipo||'');el.innerHTML=msg;
  wrap.appendChild(el);setTimeout(()=>el.classList.add('show'),10);
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300);},6000);
}

// ---- Impressão de comanda/cupom (cozinha ou cliente) ----
function boraPrintComanda(p){
  const e=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',');
  const loja=e((JSON.parse(localStorage.getItem('boraTheme')||'{}').name)||'BoraHapp');
  const itens=(p.itens||[]).map(i=>`<tr><td>${e(i.quantidade||1)}x</td><td>${e(i.descricao)}</td></tr>`).join('')||'<tr><td colspan="2">—</td></tr>';
  const end=e([p.clienteEndereco,p.clienteBairro].filter(Boolean).join(' - '));
  const w=window.open('','_print','width=320,height=600');
  if(!w){ boraToast('O navegador bloqueou a janela de impressão. Libere pop-ups para este site e clique em imprimir de novo.','erro'); return; }
  w.document.write(`<html><head><title>Comanda ${e(p.codigo||p.id)}</title><style>
    *{font-family:'Courier New',monospace;font-size:13px;margin:0}body{padding:8px;width:280px}
    h2{text-align:center;font-size:16px;margin:4px 0}hr{border:none;border-top:1px dashed #000;margin:6px 0}
    table{width:100%}td{padding:2px 0;vertical-align:top}.r{text-align:right}.b{font-weight:bold}.c{text-align:center}
    .big{font-size:18px;font-weight:bold}</style></head><body>
    <h2>${loja}</h2>
    <div class="c">COMANDA ${p.canalExterno?('• '+e(p.origem)):''}</div>
    <hr><div class="big">#${e(p.codigo||p.id)}</div>
    ${p.idExterno?`<div class="c" style="font-size:11px">${e(p.origem||'Marketplace')}: ${e(p.idExterno)}</div>`:''}
    <div>${new Date(p.criadoEm||Date.now()).toLocaleString('pt-BR')}</div>
    <hr><div class="b">${e(p.clienteNome)||'Cliente avulso'}</div>
    ${p.clienteTelefone?`<div>${e(p.clienteTelefone)}</div>`:''}${end?`<div>${end}</div>`:''}
    <hr><table>${itens}</table><hr>
    ${p.observacao?`<div>OBS: ${e(p.observacao)}</div><hr>`:''}
    <table><tr><td class="b">TOTAL</td><td class="r big">${money(p.valorTotal)}</td></tr>
    <tr><td>Pagamento</td><td class="r">${e(p.formaPagamento)||'-'}</td></tr></table>
    <hr><div class="c">BoraHapp • ${e(p.origem)}</div>
    </body></html>`);
  w.document.close();w.focus();setTimeout(()=>{w.print();},250);
}

// ---- Rede multi-loja: seletor de loja no menu (aparece só para quem tem 2+ lojas vinculadas) ----
async function renderLojaSwitcher(){
  if(typeof Bora==='undefined' || !Bora.token()) return;
  try{
    const lojas = await Bora.minhasLojas();
    if(!Array.isArray(lojas) || !lojas.length) return;
    // A plataforma vê todos os clientes e precisa do seletor mesmo com uma loja só; o lojista com
    // uma loja apenas não precisa de seletor nenhum.
    const suporte = lojas.some(l => l.suporte);
    if(!suporte && lojas.length < 2) return;
    const brand = document.querySelector('.side .brand') || document.querySelector('.brand');
    if(!brand || document.getElementById('lojaSwitch')) return;
    const sel = document.createElement('select');
    sel.id = 'lojaSwitch';
    sel.title = 'Trocar de loja';
    sel.style.cssText = 'display:block;margin:8px 12px 4px;width:calc(100% - 24px);padding:7px 8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#111;font-weight:600;font-size:13px;cursor:pointer';
    sel.innerHTML =
      (suporte ? `<option value="" ${lojas.some(l=>l.atual) ? '' : 'selected'}>🏢 Plataforma (sem loja)</option>` : '') +
      lojas.map(l => `<option value="${l.id}" ${l.atual ? 'selected' : ''}>🏪 ${String(l.nome==null?'':l.nome).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}${l.ativo === false ? ' (inativa)' : ''}</option>`).join('');
    sel.onchange = async () => {
      try{
        // O suporte entra pela porta da plataforma (/acessar), que registra quem entrou em qual
        // loja; o lojista troca pelo vínculo dele.
        const r = !sel.value ? await Bora.api('/admin-bora/sair-da-loja', { method:'POST' })
                : suporte     ? await Bora.api('/admin-bora/lojas/' + Number(sel.value) + '/acessar', { method:'POST' })
                              : await Bora.trocarLoja(Number(sel.value));
        Bora.setSession(r);
        localStorage.removeItem('boraTheme');
        boraToast(r.lojaId ? ('Agora você está na loja <b>' + String(r.lojaNome || '').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) + '</b>')
                           : 'Você voltou para a <b>plataforma</b>');
        setTimeout(() => location.reload(), 400);
      }catch(e){
        alert('Erro ao trocar de loja: ' + (e.message || 'falha'));
        const atual = lojas.find(l => l.atual); if (atual) sel.value = atual.id;
      }
    };
    brand.insertAdjacentElement('afterend', sel);
  }catch(e){ /* sem rede ou sem permissão: segue sem seletor */ }
}

// ---- PWA do painel: manifesto + service worker (instalável na tela inicial) ----
(function(){
  if(!document.querySelector('link[rel="manifest"]')){
    const l=document.createElement('link');l.rel='manifest';l.href='/manifest.webmanifest';document.head.appendChild(l);
    const m=document.createElement('meta');m.name='theme-color';m.content='#7c3aed';document.head.appendChild(m);
  }
  if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}
})();

document.addEventListener('DOMContentLoaded',()=>{renderNav();applyTheme();renderLojaSwitcher();});

// ---- Plataforma sem loja: avisa em vez de deixar a tela vazia ou quebrada ----------------------
// O ADMINISTRADOR_BORA logado na plataforma não tem loja. As telas de operação dependem dela: umas
// mostravam lista vazia (parecia loja sem cadastro), outras estouravam 500 ao semear padrões.
(function avisoSemLoja(){
  if (typeof Bora === 'undefined' || !Bora.token()) return;
  var u = Bora.user();
  if (!u || u.papel !== 'ADMINISTRADOR_BORA' || u.lojaId) return;
  var telasDaPlataforma = ['configuracoes.html', 'desempenho.html', 'login.html', 'index.html', ''];
  var atual = location.pathname.split('/').pop();
  if (telasDaPlataforma.indexOf(atual) >= 0) return;
  document.addEventListener('DOMContentLoaded', function(){
    var faixa = document.createElement('div');
    faixa.style.cssText = 'background:#fdf0dc;border-left:4px solid #b45309;color:#7c2d12;padding:12px 16px;'
      + 'margin:0 0 14px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.5';
    faixa.innerHTML = '<b>Você está na plataforma, sem loja selecionada.</b> Esta tela é de operação da loja e '
      + 'não vai funcionar assim. Vá em <a href="configuracoes.html" style="color:#7c2d12"><b>Configurações → Plataforma</b></a> '
      + 'e clique em <b>Entrar na loja</b> do cliente.';
    var main = document.querySelector('.main');
    var header = main && main.querySelector('.top');
    if (header && header.nextSibling) main.insertBefore(faixa, header.nextSibling);
    else if (main) main.insertBefore(faixa, main.firstChild);
  });
})();

// ---- Aceite dos Termos de quem ja usava o sistema ---------------------------------------------
// O aceite nasceu junto com a tela de cadastro, entao so quem se cadastrou pelo site tem registro.
// As lojas que ja existiam -- e as que a plataforma cria pelo painel administrativo, que nao pede
// aceite -- ficaram sem contrato aceito nenhum, num texto que fala de pagamento, suspensao e
// reembolso. Com o corte por falta de pagamento ligado, suspender quem nunca aceitou nada e pior.
//
// Faixa fixa, sem botao de fechar: incomoda ate aceitar, mas NAO bloqueia o painel. Decisao do dono
// em 04/10 -- travar a tela no meio do movimento custaria venda da loja dele.
(function pedirAceiteDosTermos(){
  if (typeof Bora === 'undefined' || !Bora.token()) return;
  var u = Bora.user();
  // Sem loja no contexto, /api/termos responde 409: a plataforma ja tem a propria faixa de aviso.
  if (!u || !u.lojaId) return;

  // "2026-10-04" e identificador interno; o lojista le "4 de outubro de 2026".
  function dataLegivel(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    if (!m) return 'hoje';
    var meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro',
                 'outubro','novembro','dezembro'];
    return Number(m[3]) + ' de ' + meses[Number(m[2]) - 1] + ' de ' + m[1];
  }

  function faixa(html, cor) {
    var d = document.createElement('div');
    d.id = 'boraTermos';
    d.style.cssText = 'background:' + (cor || '#fdf0dc') + ';border-left:4px solid #b45309;color:#7c2d12;'
      + 'padding:12px 16px;margin:0 0 14px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.6';
    d.innerHTML = html;
    var main = document.querySelector('.main');
    if (!main) return null;
    var header = main.querySelector('.top');
    var antiga = document.getElementById('boraTermos');
    if (antiga) antiga.remove();
    if (header && header.nextSibling) main.insertBefore(d, header.nextSibling);
    else main.insertBefore(d, main.firstChild);
    return d;
  }

  async function aceitar(botao) {
    botao.disabled = true;
    var texto = botao.textContent;
    botao.textContent = 'Registrando...';
    try {
      var r = await Bora.aceitarTermos();
      var ok = faixa('<b>Termos aceitos.</b> Registramos o seu aceite da versão de '
        + dataLegivel(r && r.versaoVigente) + '. Obrigado!', '#ecfdf5');
      // faixa() devolve null em tela sem .main; sem esta guarda o sucesso estourava num null.
      if (ok) ok.style.cssText += ';border-left-color:#059669;color:#065f46';
    } catch (e) {
      botao.disabled = false;
      botao.textContent = texto;
      var aviso = document.getElementById('boraTermosErro');
      if (aviso) aviso.textContent = 'Não deu para registrar: ' + e.message + '. Tente de novo.';
    }
  }

  document.addEventListener('DOMContentLoaded', async function(){
    var s;
    try { s = await Bora.termos(); } catch (e) { return; } // nunca derrubar a tela por causa da faixa
    if (!s || !s.pendente) return;

    var oQue = s.primeiroAceite
      ? 'Ainda não temos o seu aceite dos Termos de Uso e da Política de Privacidade.'
      : 'Os Termos de Uso foram atualizados em ' + dataLegivel(s.versaoVigente)
        + ', depois do seu último aceite.';
    var links = '<a href="https://borahapp.com.br/termos.html" target="_blank" rel="noopener" style="color:#7c2d12">'
      + '<b>Ler os Termos de Uso</b></a> · <a href="https://borahapp.com.br/privacidade.html" target="_blank" '
      + 'rel="noopener" style="color:#7c2d12"><b>Política de Privacidade</b></a>';

    if (s.podeAceitar) {
      var d = faixa('<b>' + oQue + '</b><br>' + links
        + '<div style="margin-top:10px"><button id="boraAceitarTermos" class="btn" '
        + 'style="background:#b45309;color:#fff">Li e aceito os Termos</button>'
        + '<span id="boraTermosErro" style="margin-left:10px;color:#991b1b"></span></div>');
      if (d) d.querySelector('#boraAceitarTermos').addEventListener('click', function(){ aceitar(this); });
    } else {
      faixa('<b>' + oQue + '</b> ' + (s.recado || '') + '<br>' + links);
    }
  });
})();
