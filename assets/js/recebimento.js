// Recebimento PIX direto na conta do lojista (subconta Asaas white-label).
// Substitui o "cole sua API key": aqui o lojista só ativa e conclui o KYC por link.
(function () {
  if (typeof Bora === 'undefined' || !Bora.token()) return;
  const mount = document.getElementById('recebimentoMount');
  if (!mount) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CSS = `
  .rc-card{background:linear-gradient(135deg,#ecfdf5,#eff6ff);border:1px solid #a7f3d0;border-radius:16px;padding:18px 20px;margin-bottom:16px}
  .rc-card h2{margin:0 0 4px;font-size:18px;color:#065f46}
  .rc-sub{color:#475569;font-size:13px;margin:0 0 12px}
  .rc-row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
  .rc-row label{font-size:12px;color:#475569;display:block;margin-bottom:4px}
  .rc-row input{padding:10px;border:1px solid #cbd5e1;border-radius:10px;font-size:15px;min-width:180px}
  .rc-badge{display:inline-block;font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px}
  .rc-ok{background:#dcfce7;color:#166534}.rc-pend{background:#fef3c7;color:#92400e}.rc-off{background:#e5e7eb;color:#475569}
  .rc-link{display:inline-block;margin-top:10px;background:#7c3aed;color:#fff;padding:10px 14px;border-radius:10px;font-weight:700;text-decoration:none}
  `;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  function card(inner) { mount.innerHTML = `<div class="rc-card">${inner}</div>`; }

  async function render() {
    let d;
    try { d = await Bora.recebimento(); } catch (e) { return; }
    if (!d) return;

    if (!d.configuradoPlataforma) {
      card(`<h2>💸 Recebimento por PIX</h2><p class="rc-sub">O recebimento online direto na sua conta será liberado em breve. Fale com o suporte para ativar.</p><span class="rc-badge rc-off">indisponível</span>`);
      return;
    }

    if (d.status === 'ATIVO') {
      card(`<h2>💸 Recebimento por PIX <span class="rc-badge rc-ok">ativo</span></h2>
        <p class="rc-sub">O dinheiro dos pedidos pagos por PIX no seu cardápio cai <b>direto na sua conta</b>. Nada passa pela plataforma.</p>`);
      return;
    }

    if (d.provisionada) {
      const link = d.onboardingUrl
        ? `<a class="rc-link" href="${esc(d.onboardingUrl)}" target="_blank" rel="noopener">Concluir meu cadastro (documentos + selfie)</a>`
        : `<p class="rc-sub">Estamos finalizando a verificação da sua conta. Você será avisado quando estiver liberado.</p>`;
      card(`<h2>💸 Recebimento por PIX <span class="rc-badge rc-pend">falta o KYC</span></h2>
        <p class="rc-sub">Sua conta de recebimento foi criada. Falta só confirmar seus documentos para liberar o dinheiro.</p>${link}`);
      return;
    }

    // ainda não provisionada → formulário de ativação
    card(`<h2>💸 Ative o recebimento por PIX</h2>
      <p class="rc-sub">Crie sua conta de recebimento em 1 clique. O PIX do cliente cai <b>direto na sua conta</b> — você só confirma seus dados depois.</p>
      <div class="rc-row">
        <div><label>CPF ou CNPJ *</label><input id="rcDoc" placeholder="Somente números"></div>
        <div><label>Celular</label><input id="rcFone" placeholder="(11) 90000-0000"></div>
        <div><label>CEP</label><input id="rcCep" placeholder="00000-000"></div>
        <button class="btn" id="rcAtivar" style="height:40px">Ativar recebimento</button>
      </div>
      <p id="rcMsg" style="margin:10px 0 0;font-size:13px"></p>`);

    document.getElementById('rcAtivar').onclick = async () => {
      const doc = (document.getElementById('rcDoc').value || '').replace(/\D/g, '');
      const msg = document.getElementById('rcMsg');
      if (doc.length < 11) { msg.style.color = '#dc2626'; msg.textContent = 'Informe um CPF ou CNPJ válido.'; return; }
      const btn = document.getElementById('rcAtivar'); btn.disabled = true; btn.textContent = 'Ativando…';
      msg.style.color = '#475569'; msg.textContent = 'Criando sua conta de recebimento…';
      try {
        await Bora.api('/api/recebimento/ativar', { method: 'POST', body: JSON.stringify({
          cpfCnpj: doc,
          mobilePhone: (document.getElementById('rcFone').value || '').replace(/\D/g, ''),
          postalCode: (document.getElementById('rcCep').value || '').replace(/\D/g, '')
        }) });
        render();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Ativar recebimento';
        msg.style.color = '#dc2626'; msg.textContent = e.message || 'Falha ao ativar. Tente novamente.';
      }
    };
  }

  document.addEventListener('DOMContentLoaded', render);
})();
