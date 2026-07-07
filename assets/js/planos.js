// Mostra o plano atual da loja + uso (pedidos do mês / usuários) e destaca o card.
(function () {
  if (!Bora.requireAuth()) return;
  const NOME = { UNICO: 'BoraHapp', START: 'BoraHapp', PRO: 'BoraHapp', PREMIUM: 'BoraHapp' };

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
      const pedidos = p.maxPedidosMes
        ? `<p style="margin:0"><b>Pedidos no mês:</b> ${p.pedidosMesUsados} de ${p.maxPedidosMes}</p>${barra(p.pedidosMesUsados, p.maxPedidosMes)}`
        : `<p style="margin:0 0 10px"><b>Pedidos no mês:</b> ${p.pedidosMesUsados} — ilimitados ∞</p>`;
      el.innerHTML =
        `<p style="font-size:18px;margin:0 0 12px"><b>${NOME[p.plano] || p.plano}</b></p>
         ${pedidos}
         <p style="margin:0"><b>Usuários:</b> ${p.usuariosUsados} de ${p.maxUsuarios}</p>${barra(p.usuariosUsados, p.maxUsuarios)}`;
      const card = document.getElementById('card-UNICO');
      if (card) { card.style.outline = '3px solid var(--primary)'; card.insertAdjacentHTML('afterbegin', '<div class="badge b-entregue" style="margin-bottom:8px">Seu plano</div>'); }
    } catch (e) { el.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`; }
  }
  const ST = { PENDENTE: 'Pendente (aguardando 1º pagamento)', ATIVA: 'Ativa ✅', INADIMPLENTE: 'Em atraso ⚠️', CANCELADA: 'Cancelada' };

  async function ativarAssinatura() {
    const btn = document.getElementById('btnAssinar'), err = document.getElementById('assErr');
    btn.disabled = true; btn.textContent = 'Ativando…'; err.textContent = '';
    try {
      await Bora.assinar((document.getElementById('cpf').value || '').trim());
      carregarAssinatura();
    } catch (e) {
      err.textContent = e.message || 'Falha ao ativar';
      btn.disabled = false; btn.textContent = 'Ativar assinatura';
    }
  }

  async function carregarAssinatura() {
    const el = document.getElementById('assinatura');
    try {
      const a = await Bora.assinatura();
      if (!a) {
        el.innerHTML =
          `<p style="margin:0 0 10px">Sua cobrança ainda não está ativa. Ative para manter o plano após o período de cortesia.</p>
           <label style="font-size:13px">CPF/CNPJ do responsável<br>
             <input id="cpf" placeholder="Somente números" style="padding:9px 10px;border:1px solid #e2e8f0;border-radius:6px;min-width:220px"></label>
           <button class="btn" id="btnAssinar" style="margin-left:8px">Ativar assinatura</button>
           <div id="assErr" style="color:var(--danger);font-size:13px;margin-top:8px"></div>`;
        document.getElementById('btnAssinar').onclick = ativarAssinatura;
      } else {
        const valor = a.valor != null ? Number(a.valor).toFixed(2).replace('.', ',') : '—';
        el.innerHTML =
          `<p style="margin:0"><b>Status:</b> ${ST[a.status] || a.status}</p>
           <p style="margin:6px 0 0"><b>Plano:</b> ${NOME[a.plano] || a.plano} — R$ ${valor}/mês</p>
           <p style="margin:6px 0 0;color:var(--muted);font-size:13px">A cobrança (PIX/boleto/cartão) é enviada pelo Asaas ao responsável.</p>`;
      }
    } catch (e) {
      el.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => { carregar(); carregarAssinatura(); });
})();
