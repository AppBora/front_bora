// KDS Cozinha — display de produção em tela cheia; toque no card avança o status.
(function () {
  if (!Bora.requireAuth()) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mins = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : 0;
  const mmss = iso => { const s = iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 1000) : 0;
    const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };

  const PROXIMO = { RECEBIDO: 'EM_PREPARO', CONFIRMADO: 'EM_PREPARO', EM_PREPARO: 'PRONTO', PRONTO: 'SAIU_PARA_ENTREGA' };
  const ROTULO = { EM_PREPARO: 'Iniciar preparo', PRONTO: 'Marcar pronto', SAIU_PARA_ENTREGA: 'Despachar' };

  window.__avancar = async (id, st) => {
    try { await Bora.mudarStatus(id, PROXIMO[st]); carregar(); } catch (e) { alert(e.message); }
  };

  function card(p) {
    const m = mins(p.atualizadoEm || p.criadoEm);
    const sla = boraSla(p.origem);
    const cls = m >= sla ? 'late' : m >= sla * 0.7 ? 'warn' : '';
    const itens = (p.itens && p.itens.length)
      ? p.itens.map(i => `<li><b>${i.quantidade || 1}×</b>${esc(i.descricao)}</li>`).join('')
      : '<li style="color:#64748b">— sem itens —</li>';
    return `<div class="kdscard ${cls}" onclick="__avancar(${p.id},'${p.status}')">
      <div class="kh"><span class="kcod">${esc(p.codigo) || '#' + p.id}</span><span class="ktime" data-t="${p.atualizadoEm || p.criadoEm}">${mmss(p.atualizadoEm || p.criadoEm)}</span></div>
      <div class="kcli">${esc(p.clienteNome) || 'Balcão'}${p.origem ? ' · ' + esc(p.origem) : ''} · SLA ${sla}min</div>
      <ul>${itens}</ul>
      <div class="kgo">${ROTULO[PROXIMO[p.status]] || 'Avançar'} ▸</div>
    </div>`;
  }

  let conhecidos = null;
  function detectarNovos(board) {
    const ids = board.filter(p => ['RECEBIDO', 'CONFIRMADO'].includes(p.status)).map(p => p.id);
    if (conhecidos === null) { conhecidos = new Set(ids); return; }
    board.forEach(p => {
      if (['RECEBIDO', 'CONFIRMADO'].includes(p.status) && !conhecidos.has(p.id)) {
        boraBeep();
        boraToast(`🔔 Novo pedido na cozinha<small>${esc(p.codigo) || '#' + p.id} · ${p.clienteNome || 'Cliente'}</small>`, 'novo');
      }
    });
    conhecidos = new Set(ids);
  }

  async function carregar() {
    try {
      const board = await Bora.board();
      detectarNovos(board);
      const fazer = board.filter(p => ['RECEBIDO', 'CONFIRMADO', 'EM_PREPARO'].includes(p.status))
        .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm)); // mais antigo primeiro
      const pronto = board.filter(p => p.status === 'PRONTO');
      document.getElementById('fazer').innerHTML = fazer.map(card).join('') || '<p style="color:#475569">Sem pedidos na fila 🎉</p>';
      document.getElementById('pronto').innerHTML = pronto.map(card).join('') || '<p style="color:#475569">Nada pronto</p>';
      document.getElementById('cFazer').textContent = fazer.length;
      document.getElementById('cPronto').textContent = pronto.length;
    } catch (e) { console.warn(e.message); }
  }

  function tick() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('.ktime').forEach(el => { const t = el.getAttribute('data-t'); if (t) el.textContent = mmss(t); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    carregar(); tick();
    setInterval(carregar, 6000); // recarrega dados
    setInterval(tick, 1000);     // cronômetros vivos
  });
})();
