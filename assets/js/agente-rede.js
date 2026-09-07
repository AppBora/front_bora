// Agente de estratégia da rede: lê as abas desta tela e devolve o que fazer, com o caminho pronto.
//
// A tela já dizia "como foi". O que faltava era "e agora?". Cada recomendação vira um cartão com o
// número que a sustenta e um botão que abre a tela certa — o agente propõe, o lojista aplica.
(function () {
  if (typeof Bora === 'undefined' || !Bora.token()) return;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CATEGORIA = {
    CANCELAMENTO: { ic: '⛔', cor: '#dc2626' },
    HORARIO:      { ic: '⏰', cor: '#b45309' },
    PRODUTO:      { ic: '🍧', cor: '#7c3aed' },
    ESTOQUE:      { ic: '📦', cor: '#0f766e' },
    CANAL:        { ic: '📡', cor: '#1d4ed8' },
    LOJA:         { ic: '🏪', cor: '#166534' },
    CLIENTE:      { ic: '💬', cor: '#059669' }
  };
  const IMPACTO = { ALTO: '#dc2626', MEDIO: '#b45309', BAIXO: '#64748b' };
  // Só telas do próprio painel viram link. O modelo escreve o destino, então a lista é fechada:
  // recomendação com destino desconhecido vira cartão sem botão, nunca um link para fora.
  const TELAS = ['promocoes.html', 'produtos.html', 'estoque.html', 'crm.html', 'pedidos.html',
                 'canais.html', 'relatorios.html', 'desempenho.html', 'ajustes.html'];

  let plano = null;

  const periodo = () => {
    const i = $('dtIni') && $('dtIni').value, f = $('dtFim') && $('dtFim').value;
    const q = [];
    if (i) q.push('inicio=' + i);
    if (f) q.push('fim=' + f);
    return q.length ? '?' + q.join('&') : '';
  };

  /** Destino de uma recomendação: tela do painel, WhatsApp do cliente, ou nada. */
  function destino(acao) {
    if (!acao) return null;
    if (acao.tela === 'whatsapp') {
      const fone = String(acao.telefone || '').replace(/\D/g, '');
      if (!fone) return null;
      const ddi = fone.length <= 11 ? '55' + fone : fone;
      // wa.me abre a conversa com o texto pronto — quem aperta "enviar" é o lojista, não o sistema
      return { href: 'https://wa.me/' + ddi + '?text=' + encodeURIComponent(acao.mensagem || ''),
               rotulo: acao.rotulo || 'Falar com o cliente' };
    }
    if (TELAS.indexOf(acao.tela) < 0) return null;
    return { href: acao.tela, rotulo: acao.rotulo || 'Abrir tela' };
  }

  function cartao(r, idx) {
    const cat = CATEGORIA[r.categoria] || { ic: '💡', cor: '#7c3aed' };
    const d = destino(r.acao);
    return `<div class="panel" style="margin:0;border-top:3px solid ${cat.cor}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <b style="font-size:15px;line-height:1.35">${cat.ic} ${esc(r.titulo)}</b>
        <span style="flex:0 0 auto;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;
              background:${IMPACTO[r.impacto] || '#64748b'};color:#fff">${esc(r.impacto || '')}</span>
      </div>
      <p style="margin:8px 0 0;font-size:13px;color:#475569;line-height:1.5">${esc(r.porque)}</p>
      ${r.ganhoEstimado ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;color:#166534">≈ ${esc(r.ganhoEstimado)}</p>` : ''}
      <button class="btn" style="margin-top:12px;width:100%" onclick="__iaAbrir(${idx})">
        ${d ? esc(d.rotulo) : 'Ver detalhe'}</button>
    </div>`;
  }

  window.__iaAbrir = idx => {
    const r = plano && plano.recomendacoes && plano.recomendacoes[idx];
    if (!r) return;
    const cat = CATEGORIA[r.categoria] || { ic: '💡', cor: '#7c3aed' };
    $('imTag').textContent = (r.categoria || 'SUGESTÃO') + ' · impacto ' + (r.impacto || '—');
    $('imTag').style.color = cat.cor;
    $('imTitulo').textContent = r.titulo || '';
    $('imPorque').textContent = r.porque || '';
    $('imComo').textContent = r.comoFazer || 'Sem passo a passo informado.';
    $('imGanho').textContent = r.ganhoEstimado ? 'Ganho estimado: ' + r.ganhoEstimado : '';
    const d = destino(r.acao);
    const ir = $('imIr');
    if (d) {
      ir.style.display = ''; ir.href = d.href; ir.textContent = d.rotulo;
      // tela do painel abre na mesma aba; WhatsApp abre fora
      if (d.href.indexOf('http') === 0) ir.target = '_blank'; else ir.removeAttribute('target');
    } else {
      ir.style.display = 'none';
    }
    $('iaModal').style.display = 'flex';
  };

  async function analisar() {
    const btn = $('iaAnalisar');
    btn.disabled = true;
    $('iaStatus').textContent = 'Lendo faturamento, canais, horários, tempos, cancelamentos e estoque…';
    $('iaCards').innerHTML = '';
    $('iaResumo').style.display = 'none';
    try {
      plano = await Bora.api('/api/ia/rede/analisar' + periodo(), { method: 'POST' });
      $('iaResumo').style.display = 'block';
      $('iaResumo').innerHTML = '<b>Leitura do período:</b> ' + esc(plano.resumo || '');
      const recs = plano.recomendacoes || [];
      $('iaCards').innerHTML = recs.length
        ? recs.map(cartao).join('')
        : '<p style="color:var(--muted)">Nenhuma recomendação para este período.</p>';
      $('iaStatus').textContent = recs.length + ' recomendação(ões) · ' + (plano.inicio || '') + ' a ' + (plano.fim || '');
    } catch (e) {
      // erro de IA precisa dizer o que fazer: chave, saldo ou add-on
      $('iaStatus').innerHTML = '<span style="color:var(--danger)">' + esc(e.message) + '</span>';
    } finally {
      btn.disabled = false;
    }
  }

  /** Os mesmos números que o agente leu — para conferir antes de acreditar nele. */
  async function verDossie() {
    const pre = $('iaDossie');
    if (pre.style.display === 'block') { pre.style.display = 'none'; return; }
    pre.style.display = 'block';
    pre.textContent = 'Carregando…';
    try {
      pre.textContent = JSON.stringify(await Bora.api('/api/ia/rede/dossie' + periodo()), null, 2);
    } catch (e) {
      pre.textContent = e.message;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('iaAnalisar')) return;
    $('iaAnalisar').addEventListener('click', analisar);
    $('iaDados').addEventListener('click', verDossie);
    $('imFechar').addEventListener('click', () => { $('iaModal').style.display = 'none'; });
    $('iaModal').addEventListener('click', e => { if (e.target === $('iaModal')) $('iaModal').style.display = 'none'; });
  });
})();
