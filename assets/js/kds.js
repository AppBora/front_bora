// KDS Cozinha — display de produção em tela cheia; toque no card avança o status.
(function () {
  if (!Bora.requireAuth()) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mins = iso => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : 0;
  const mmss = iso => { const s = iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 1000) : 0;
    const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };

  const PROXIMO = { RECEBIDO: 'EM_PREPARO', CONFIRMADO: 'EM_PREPARO', EM_PREPARO: 'PRONTO', PRONTO: 'SAIU_PARA_ENTREGA' };
  const ROTULO = { EM_PREPARO: 'Iniciar preparo', PRONTO: 'Marcar pronto', SAIU_PARA_ENTREGA: 'Despachar',
                   ENTREGUE: 'Cliente retirou' };

  window.__avancar = async (id, st) => {
    // O proximo vem do PEDIDO, nao so do status: retirada nao despacha (item 6.9).
    const p = (ultimoQuadro || []).find(x => x.id === id);
    const proximo = p ? proximoDe(p) : PROXIMO[st];
    try { await Bora.mudarStatus(id, proximo); carregar(); } catch (e) { alert(e.message); }
  };

  /** O ultimo quadro carregado, para o __avancar saber o tipo de entrega do pedido. */
  let ultimoQuadro = null;

  /**
   * O recado do pedido, destacado no card da cozinha.
   *
   * Item 7.1 da varredura: a observacao SEMPRE chegou neste navegador (o PedidoCard manda o campo),
   * e o card nunca a desenhava. "Sem cebola" nao chegava em quem monta o prato -- e o unico lugar
   * onde a equipe leria isso e aqui.
   *
   * Vem com fundo forte de proposito: numa cozinha, a pessoa olha o card por dois segundos. Recado
   * que se parece com o resto do texto nao e lido.
   */
  function recado(p) {
    const texto = (p.observacao || '').trim();
    if (!texto) return '';
    return `<div style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;`
      + `padding:5px 7px;margin:4px 0;font-weight:700;font-size:13px;white-space:pre-wrap">`
      + `📝 ${esc(texto)}</div>`;
  }

  /**
   * O proximo status deste pedido, respeitando retirada.
   *
   * Item 6.9 da varredura: a KDS oferecia "Despachar" para pedido de RETIRADA, e o cliente que estava
   * no balcao recebia "saiu para entrega! Ja ja chega ai" no WhatsApp. O card nao sabia o tipo de
   * entrega -- desde o item 6.2 ele sabe, e o servidor tambem recusa agora. Aqui a tela deixa de
   * oferecer o botao errado, que e melhor que oferecer e dar erro.
   */
  function proximoDe(p) {
    const seguinte = PROXIMO[p.status];
    if (seguinte === 'SAIU_PARA_ENTREGA' && ehRetirada(p)) return 'ENTREGUE';
    return seguinte;
  }

  /** Retirada no balcao. Pedido anterior a V48 nao tem a coluna e cai no texto, como no servidor. */
  function ehRetirada(p) {
    if (p.tipoEntrega) return String(p.tipoEntrega).toUpperCase() === 'RETIRADA';
    return !!p.observacao && p.observacao.toUpperCase().includes('RETIRADA NO BALC');
  }

  function card(p) {
    const m = mins(p.atualizadoEm || p.criadoEm);
    const sla = boraSla(p.origem);
    const cls = m >= sla ? 'late' : m >= sla * 0.7 ? 'warn' : '';
    const itens = (p.itens && p.itens.length)
      ? p.itens.map(i => `<li><b>${i.quantidade || 1}×</b>${esc(i.descricao)}</li>`).join('')
      : '<li style="color:#64748b">— sem itens —</li>';
    const proximo = proximoDe(p);
    return `<div class="kdscard ${cls}" onclick="__avancar(${p.id},'${p.status}')">
      <div class="kh"><span class="kcod">${esc(p.codigo) || '#' + p.id}</span><span class="ktime" data-t="${p.atualizadoEm || p.criadoEm}">${mmss(p.atualizadoEm || p.criadoEm)}</span></div>
      <div class="kcli">${esc(p.clienteNome) || 'Balcão'}${p.origem ? ' · ' + esc(p.origem) : ''} · SLA ${sla}min</div>
      ${ehRetirada(p) ? `<div style="background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:6px;padding:4px 6px;margin:4px 0;font-weight:800;font-size:12px">🛍️ RETIRADA NO BALCÃO — não é entrega</div>` : ''}
      ${p.aguardandoPagamento ? `<div style="background:#fffbeb;color:#92400e;border:1px solid #fde68a;border-radius:6px;padding:4px 6px;margin:4px 0;font-weight:700;font-size:12px">⏳ Esperando o PIX — não prepare ainda</div>` : ''}
      <ul>${itens}</ul>
      ${recado(p)}
      <div class="kgo">${ROTULO[proximo] || 'Avançar'} ▸</div>
    </div>`;
  }

  let conhecidos = null;
  function detectarNovos(board) {
    const ids = board.filter(p => ['RECEBIDO', 'CONFIRMADO'].includes(p.status)).map(p => p.id);
    if (conhecidos === null) { conhecidos = new Set(ids); return; }
    board.forEach(p => {
      if (['RECEBIDO', 'CONFIRMADO'].includes(p.status) && !conhecidos.has(p.id)) {
        boraBeep();
        boraToast(`🔔 Novo pedido na cozinha<small>${esc(p.codigo) || '#' + p.id} · ${esc(p.clienteNome) || 'Cliente'}</small>`, 'novo');
      }
    });
    conhecidos = new Set(ids);
  }

  async function carregar() {
    try {
      const board = await Bora.board();
      // Guardado para o __avancar saber o tipo de entrega do pedido (item 6.9).
      ultimoQuadro = board;
      detectarNovos(board);
      const fazer = board.filter(p => ['RECEBIDO', 'CONFIRMADO', 'EM_PREPARO'].includes(p.status))
        .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm)); // mais antigo primeiro
      const pronto = board.filter(p => p.status === 'PRONTO');
      document.getElementById('fazer').innerHTML = fazer.map(card).join('') || '<p style="color:#475569">Sem pedidos na fila 🎉</p>';
      document.getElementById('pronto').innerHTML = pronto.map(card).join('') || '<p style="color:#475569">Nada pronto</p>';
      document.getElementById('cFazer').textContent = fazer.length;
      document.getElementById('cPronto').textContent = pronto.length;
    } catch (e) {
      // O erro SOBE de proposito. Quem avisa e o Bora.repetir, com a faixa de "sem conexao": engolir
      // aqui era o que fazia a cozinha achar que nao tinha entrado pedido novo quando a API caia.
      // Na primeira carga ainda nao ha nada na tela, entao dizemos o que aconteceu no lugar da fila.
      if (!document.getElementById('fazer').innerHTML) {
        document.getElementById('fazer').innerHTML =
          '<p style="color:#b3341f;font-weight:700">Nao consegui falar com o servidor. '
          + 'Tentando de novo a cada 6 segundos.</p>';
      }
      throw e;
    }
  }

  function tick() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('.ktime').forEach(el => { const t = el.getAttribute('data-t'); if (t) el.textContent = mmss(t); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    carregar().catch(e => Bora._conexao(false, e)); tick();
    Bora.repetir(carregar, 6000); // recarrega dados, so com a aba a vista
    setInterval(tick, 1000);     // cronômetros vivos
  });
})();
