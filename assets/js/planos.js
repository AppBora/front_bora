// Mostra o plano atual da loja + uso (pedidos do mês / usuários) e destaca o card.
(function () {
  if (!Bora.requireAuth()) return;
  const NOME = { START: 'Start', PRO: 'Pro', PREMIUM: 'Premium' };

  function barra(usado, max) {
    const pct = max ? Math.min(100, Math.round((usado / max) * 100)) : 0;
    const cor = pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warn)' : 'var(--secondary)';
    return `<div style="background:#e5e7eb;border-radius:999px;height:10px;overflow:hidden;margin:4px 0 10px">
      <div style="width:${pct}%;height:100%;background:${cor}"></div></div>`;
  }

  async function carregar() {
    const el = document.getElementById('meuPlano');
    try {
      const p = await Bora.plano();
      el.innerHTML =
        `<p style="font-size:18px;margin:0 0 12px"><b>${NOME[p.plano] || p.plano}</b></p>
         <p style="margin:0"><b>Pedidos no mês:</b> ${p.pedidosMesUsados} de ${p.maxPedidosMes}</p>${barra(p.pedidosMesUsados, p.maxPedidosMes)}
         <p style="margin:0"><b>Usuários:</b> ${p.usuariosUsados} de ${p.maxUsuarios}</p>${barra(p.usuariosUsados, p.maxUsuarios)}`;
      const card = document.getElementById('card-' + p.plano);
      if (card) { card.style.outline = '3px solid var(--primary)'; card.insertAdjacentHTML('afterbegin', '<div class="badge b-entregue" style="margin-bottom:8px">Seu plano</div>'); }
    } catch (e) { el.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`; }
  }
  document.addEventListener('DOMContentLoaded', carregar);
})();
