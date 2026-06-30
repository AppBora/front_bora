// Quadro de pedidos premium (kanban em tempo real) — busca, filtros, avanço de status, alerta de atraso por SLA.
(function () {
  if (!Bora.requireAuth()) return;

  // Colunas no estilo das grandes plataformas (Cozinha → Aguardando → Saiu → Entregue)
  const COLUNAS = [
    { key: 'COZINHA', titulo: 'Cozinha', icon: '🍳', cor: '#f59e0b', inclui: ['RECEBIDO', 'CONFIRMADO', 'EM_PREPARO'] },
    { key: 'AGUARDANDO', titulo: 'Aguardando entrega', icon: '📦', cor: '#3b82f6', inclui: ['PRONTO'] },
    { key: 'SAIU', titulo: 'Saiu para entrega', icon: '🛵', cor: '#8b5cf6', inclui: ['SAIU_PARA_ENTREGA'] },
    { key: 'ENTREGUE', titulo: 'Entregue', icon: '✓', cor: '#22c55e', inclui: ['ENTREGUE'] }
  ];
  const PROXIMO = { RECEBIDO: 'EM_PREPARO', CONFIRMADO: 'EM_PREPARO', EM_PREPARO: 'PRONTO',
    PRONTO: 'SAIU_PARA_ENTREGA', SAIU_PARA_ENTREGA: 'ENTREGUE' };
  const ROTULO_AVANCO = { EM_PREPARO: 'Preparar', PRONTO: 'Pronto', SAIU_PARA_ENTREGA: 'Despachar', ENTREGUE: 'Entregar' };

  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const minutosDesde = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : 0;
  const tempoTxt = m => m < 1 ? 'agora' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  const PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  const TEL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>';

  let cache = [];
  let filtro = 'ATIVOS';
  let termo = '';

  async function mudarStatus(id, status, motivo) {
    let url = `/api/pedidos/${id}/status?status=${status}`;
    if (motivo) url += '&motivo=' + encodeURIComponent(motivo);
    try { await Bora.api(url, { method: 'PATCH' }); carregar(); }
    catch (e) { alert(e.message); }
  }
  window.__avancar = (id, st) => mudarStatus(id, PROXIMO[st]);
  window.__cancelar = (id) => { const m = prompt('Motivo do cancelamento:'); if (m && m.trim()) mudarStatus(id, 'CANCELADO', m.trim()); };
  window.__aceitar = (id) => mudarStatus(id, 'CONFIRMADO');
  window.__recusar = (id) => { const m = prompt('Motivo da recusa do pedido:'); if (m && m.trim()) mudarStatus(id, 'CANCELADO', m.trim()); };
  window.__imprimir = (id) => { const p = cache.find(x => x.id === id); if (p && typeof boraPrintComanda === 'function') boraPrintComanda(p); };
  window.__refresh = () => carregar();

  // detecção de pedido novo → som + toast
  let conhecidos = null;
  function detectarNovos(board) {
    const idsRecebidos = board.filter(p => p.status === 'RECEBIDO').map(p => p.id);
    if (conhecidos === null) { conhecidos = new Set(idsRecebidos); return; } // 1ª carga: não alerta
    board.forEach(p => {
      if (p.status === 'RECEBIDO' && !conhecidos.has(p.id)) {
        if (typeof boraBeep === 'function') boraBeep();
        const canal = boraCanal(p.origem);
        if (typeof boraToast === 'function')
          boraToast(`${canal.ic} Novo pedido ${p.codigo ? '#' + p.codigo : ''}<small>${p.clienteNome || 'Cliente'} · ${money(p.valorTotal)} · ${canal.key}</small>`, 'novo');
      }
    });
    conhecidos = new Set(idsRecebidos);
  }

  function passaFiltro(p) {
    if (termo) {
      const alvo = `${p.codigo || ''} ${p.id} ${p.clienteNome || ''} ${p.clienteTelefone || ''}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    const origem = (p.origem || '').toUpperCase();
    if (filtro === 'CANCELADO') return p.status === 'CANCELADO';
    if (p.status === 'CANCELADO') return false; // cancelados só na aba própria
    if (filtro === 'DELIVERY') return origem.includes('DELIVERY') || origem.includes('ENTREGA') || (!origem.includes('BALC'));
    if (filtro === 'BALCAO') return origem.includes('BALC');
    return true; // ATIVOS / TODOS
  }

  function card(p, col) {
    const mins = minutosDesde(p.atualizadoEm || p.criadoEm);
    const sla = (typeof boraSla === 'function') ? boraSla(p.origem) : 30;
    const atrasado = ['COZINHA', 'AGUARDANDO'].includes(col.key) && mins >= sla;
    const avanca = PROXIMO[p.status];
    const itensTxt = (p.itens && p.itens.length)
      ? p.itens.slice(0, 4).map(i => `<b>${i.quantidade || 1}×</b> ${esc(i.descricao)}`).join('<br>') +
        (p.itens.length > 4 ? `<br><span style="color:#94a3b8">+${p.itens.length - 4} item(ns)</span>` : '')
      : '<span style="color:#94a3b8">Sem itens detalhados</span>';
    const endereco = [p.clienteEndereco, p.clienteBairro].filter(Boolean).join(' · ');
    const canal = boraCanal(p.origem);
    const novo = p.status === 'RECEBIDO';
    return `<div class="kcard ${atrasado ? 'late' : ''}" style="--col:${col.cor}">
      ${p.canalExterno ? `<span class="canaltag">${canal.ic} ${esc(canal.key)}</span>` : ''}
      <div class="kcard-top">
        <div class="num">${esc(p.codigo) || '#' + p.id} <small>#${p.id}</small></div>
        <div class="clock">⏱ ${tempoTxt(mins)}</div>
      </div>
      <div class="cli">${esc(p.clienteNome) || 'Cliente avulso'}</div>
      ${p.clienteTelefone ? `<div class="line">${TEL}${esc(p.clienteTelefone)}</div>` : ''}
      ${endereco ? `<div class="line">${PIN}${esc(endereco)}</div>` : ''}
      <div class="itens">${itensTxt}</div>
      ${p.observacao ? `<div class="obs">📝 ${esc(p.observacao)}</div>` : ''}
      ${atrasado ? `<div class="late-tag">⚠ Atrasado — SLA ${sla}min (${tempoTxt(mins)})</div>` : ''}
      <div class="kcard-foot">
        <span class="val">${money(p.valorTotal)}</span>
        <span class="pay">${esc(p.formaPagamento) || (p.origem ? esc(p.origem) : 'Pagamento —')}</span>
      </div>
      <div class="kacts">
        ${novo
          ? `<button class="ok" onclick="__aceitar(${p.id})">✓ Aceitar</button>
             <button class="no" title="Recusar" onclick="__recusar(${p.id})">Recusar</button>`
          : (avanca
              ? `<button class="adv" onclick="__avancar(${p.id},'${p.status}')">${ROTULO_AVANCO[avanca] || 'Avançar'} →</button>`
              : '<button class="adv" disabled style="opacity:.5;cursor:default">Concluído</button>')}
        <button class="prt" title="Imprimir comanda" onclick="__imprimir(${p.id})">🖨</button>
        ${!novo && p.status !== 'ENTREGUE' && p.status !== 'CANCELADO' ? `<button class="no" title="Cancelar" onclick="__cancelar(${p.id})">✕</button>` : ''}
      </div>
    </div>`;
  }

  function render() {
    const board = document.getElementById('kboard'); if (!board) return;
    const visiveis = cache.filter(passaFiltro);
    board.innerHTML = COLUNAS.map(col => {
      const lista = visiveis.filter(p => col.inclui.includes(p.status));
      const corpo = lista.length
        ? lista.map(p => card(p, col)).join('')
        : '<div class="kcol-empty">Nenhum pedido aqui</div>';
      return `<div class="kcol">
        <div class="kcol-head" style="--col:${col.cor}">
          <span class="ttl"><span class="ic">${col.icon}</span>${col.titulo}</span>
          <span class="pill">${lista.length}</span>
        </div>
        <div class="kcol-body">${corpo}</div>
      </div>`;
    }).join('');
  }

  async function carregar() {
    const board = document.getElementById('kboard'); if (!board) return;
    try {
      cache = await Bora.board();
      detectarNovos(cache);
      render();
      const lt = document.getElementById('liveTxt');
      if (lt) lt.textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      if (!cache.length) board.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const busca = document.getElementById('busca');
    if (busca) busca.addEventListener('input', () => { termo = busca.value.trim().toLowerCase(); render(); });
    const chips = document.getElementById('chips');
    if (chips) chips.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      chips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      b.classList.add('active'); filtro = b.dataset.f; render();
    });
    carregar();
    setInterval(carregar, 8000);
  });
})();
