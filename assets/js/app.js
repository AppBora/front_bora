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
  { href:'integracoes.html',   label:'Integrações',     ic:'🔌' },
  { href:'entregas.html',      label:'Entregas',        ic:'🛵' },
  { href:'entregadores.html',  label:'Entregadores',    ic:'🏍️' },
  { href:'crm.html',           label:'CRM',             ic:'⭐' },
  { href:'clientes.html',      label:'Clientes',        ic:'👥' },
  { href:'produtos.html',      label:'Produtos',        ic:'📦' },
  { href:'estoque.html',       label:'Estoque',         ic:'🗃️' },
  { href:'insumos.html',       label:'Insumos',         ic:'🧂' },
  { href:'cardapio-qr.html',   label:'Cardápio QR',     ic:'📱' },
  { href:'promocoes.html',     label:'Promoções',       ic:'⚡' },
  { href:'relatorios.html',    label:'Relatórios',      ic:'📈' },
  { href:'configuracoes.html', label:'Configurações',   ic:'⚙️' },
  { href:'ajustes.html',       label:'Ajustes Operação',ic:'🛠️' },
  { href:'usuarios.html',      label:'Usuários',        ic:'🔑' },
  { href:'planos.html',        label:'Planos',          ic:'🏷️' },
  { href:'ajuda.html',         label:'Ajuda',           ic:'🆘' }
];

function renderNav(){
  const nav = document.querySelector('.nav'); if(!nav) return;
  const atual = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
  nav.innerHTML = BORA_NAV.map(i =>
    `<a href="${i.href}" class="${i.href===atual?'active':''}"><span class="navic">${i.ic}</span><span class="navtx">${i.label}</span></a>`
  ).join('');
}

// ---- Alertas de pedido novo: som (WebAudio, sem asset) + toast ----
let _boraAudioCtx=null;
function boraBeep(){
  try{
    _boraAudioCtx=_boraAudioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const ctx=_boraAudioCtx; const t=ctx.currentTime;
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
  const money=v=>'R$ '+Number(v||0).toFixed(2).replace('.',',');
  const loja=(JSON.parse(localStorage.getItem('boraTheme')||'{}').name)||'BoraHapp';
  const itens=(p.itens||[]).map(i=>`<tr><td>${i.quantidade||1}x</td><td>${i.descricao||''}</td></tr>`).join('')||'<tr><td colspan="2">—</td></tr>';
  const end=[p.clienteEndereco,p.clienteBairro].filter(Boolean).join(' - ');
  const w=window.open('','_print','width=320,height=600');
  w.document.write(`<html><head><title>Comanda ${p.codigo||p.id}</title><style>
    *{font-family:'Courier New',monospace;font-size:13px;margin:0}body{padding:8px;width:280px}
    h2{text-align:center;font-size:16px;margin:4px 0}hr{border:none;border-top:1px dashed #000;margin:6px 0}
    table{width:100%}td{padding:2px 0;vertical-align:top}.r{text-align:right}.b{font-weight:bold}.c{text-align:center}
    .big{font-size:18px;font-weight:bold}</style></head><body>
    <h2>${loja}</h2>
    <div class="c">COMANDA ${p.canalExterno?('• '+(p.origem||'')):''}</div>
    <hr><div class="big">#${p.codigo||p.id}</div>
    <div>${new Date(p.criadoEm||Date.now()).toLocaleString('pt-BR')}</div>
    <hr><div class="b">${p.clienteNome||'Cliente avulso'}</div>
    ${p.clienteTelefone?`<div>${p.clienteTelefone}</div>`:''}${end?`<div>${end}</div>`:''}
    <hr><table>${itens}</table><hr>
    ${p.observacao?`<div>OBS: ${p.observacao}</div><hr>`:''}
    <table><tr><td class="b">TOTAL</td><td class="r big">${money(p.valorTotal)}</td></tr>
    <tr><td>Pagamento</td><td class="r">${p.formaPagamento||'-'}</td></tr></table>
    <hr><div class="c">BoraHapp • ${p.origem||''}</div>
    </body></html>`);
  w.document.close();w.focus();setTimeout(()=>{w.print();},250);
}

// ---- Rede multi-loja: seletor de loja no menu (aparece só para quem tem 2+ lojas vinculadas) ----
async function renderLojaSwitcher(){
  if(typeof Bora==='undefined' || !Bora.token()) return;
  try{
    const lojas = await Bora.minhasLojas();
    if(!Array.isArray(lojas) || lojas.length < 2) return;
    const brand = document.querySelector('.side .brand') || document.querySelector('.brand');
    if(!brand || document.getElementById('lojaSwitch')) return;
    const sel = document.createElement('select');
    sel.id = 'lojaSwitch';
    sel.title = 'Trocar de loja';
    sel.style.cssText = 'display:block;margin:8px 12px 4px;width:calc(100% - 24px);padding:7px 8px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#111;font-weight:600;font-size:13px;cursor:pointer';
    sel.innerHTML = lojas.map(l => `<option value="${l.id}" ${l.atual ? 'selected' : ''}>🏪 ${l.nome}${l.ativo === false ? ' (inativa)' : ''}</option>`).join('');
    sel.onchange = async () => {
      try{
        const r = await Bora.trocarLoja(Number(sel.value));
        Bora.setSession(r);
        localStorage.removeItem('boraTheme');
        boraToast('Agora você está na loja <b>' + (r.lojaNome || '') + '</b>');
        setTimeout(() => location.reload(), 400);
      }catch(e){
        alert('Erro ao trocar de loja: ' + (e.message || 'falha'));
        const atual = lojas.find(l => l.atual); if (atual) sel.value = atual.id;
      }
    };
    brand.insertAdjacentElement('afterend', sel);
  }catch(e){ /* sem rede ou sem permissão: segue sem seletor */ }
}

document.addEventListener('DOMContentLoaded',()=>{renderNav();applyTheme();renderLojaSwitcher();});
