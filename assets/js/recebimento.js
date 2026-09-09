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

  // O aviso de pagamento e uma segunda chamada ao Asaas, que ja falhou em producao. Se ele nao
  // estiver de pe, o PIX do cliente cai na conta do lojista e o pedido fica "aguardando" para sempre.
  function blocoWebhook(d) {
    if (d.webhookOk) return '';
    return `<div style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px">
      <b style="color:#b91c1c">O aviso de pagamento nao esta ligado.</b>
      <p class="rc-sub" style="margin:6px 0 8px">Sem ele o dinheiro entra na sua conta mas o pedido continua
      marcado como "aguardando pagamento" no painel. Religue com um clique.</p>
      <button class="btn" id="rcWebhook">Religar aviso de pagamento</button>
      <span id="rcWebhookMsg" style="font-size:13px;margin-left:8px"></span></div>`;
  }

  function ligarBotaoWebhook() {
    const b = document.getElementById('rcWebhook');
    if (!b) return;
    b.onclick = async () => {
      const m = document.getElementById('rcWebhookMsg');
      b.disabled = true; m.style.color = '#475569'; m.textContent = 'Religando...';
      try { await Bora.api('/api/recebimento/webhook', { method: 'POST' }); render(); }
      catch (e) { b.disabled = false; m.style.color = '#dc2626'; m.textContent = e.message || 'Falhou.'; }
    };
  }

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
        <p class="rc-sub">O dinheiro dos pedidos pagos por PIX no seu cardápio cai <b>direto na sua conta</b>. Nada passa pela plataforma.</p>${blocoWebhook(d)}`);
      ligarBotaoWebhook();
      return;
    }

    if (d.provisionada) {
      // Sem onboardingUrl (o Asaas nem sempre devolve) nao existe "aguardar": ninguem vai avisar.
      // O caminho real e entrar no Asaas com o e-mail da conta e concluir o cadastro por la.
      const link = d.onboardingUrl
        ? `<a class="rc-link" href="${esc(d.onboardingUrl)}" target="_blank" rel="noopener">Concluir meu cadastro (documentos + selfie)</a>`
        : `<p class="rc-sub">Para liberar o dinheiro, entre no Asaas com o e-mail
             <b>${esc(d.email || 'da conta')}</b>, defina a senha em "Esqueci minha senha" e conclua o
             cadastro (documentos e dados da empresa). É lá também que você corrige endereço e telefone.</p>
           <a class="rc-link" href="https://www.asaas.com/login" target="_blank" rel="noopener">Abrir o Asaas</a>`;
      card(`<h2>💸 Recebimento por PIX <span class="rc-badge rc-pend">falta o KYC</span></h2>
        <p class="rc-sub">Sua conta de recebimento foi criada. Falta só confirmar seus documentos para liberar o dinheiro.</p>${link}${blocoWebhook(d)}`);
      ligarBotaoWebhook();
      return;
    }

    // ainda não provisionada → formulário de ativação
    // Os campos abaixo são os que o Asaas exige para abrir a conta: faltando qualquer um,
    // ele recusa com 400 e o lojista fica sem entender o que fazer.
    card(`<h2>💸 Ative o recebimento por PIX</h2>
      <p class="rc-sub">Crie sua conta de recebimento. O PIX do cliente cai <b>direto na sua conta</b> — depois você confirma seus documentos.</p>
      <div class="rc-row">
        <div><label>CPF ou CNPJ *</label><input id="rcDoc" placeholder="Somente números"></div>
        <div id="rcBoxTipo" style="display:none"><label>Tipo de empresa *</label>
          <select id="rcTipo">
            <option value="MEI">MEI</option>
            <option value="LIMITED">Ltda / Limitada</option>
            <option value="INDIVIDUAL">Empresário individual</option>
            <option value="ASSOCIATION">Associação</option>
          </select></div>
        <div id="rcBoxNasc" style="display:none"><label>Data de nascimento *</label><input id="rcNasc" type="date"></div>
        <div><label>Celular *</label><input id="rcFone" placeholder="(11) 90000-0000"></div>
        <div><label>Faturamento mensal *</label><input id="rcRenda" type="number" min="0" step="100" placeholder="Ex.: 30000"></div>
        <div><label>CEP *</label><input id="rcCep" placeholder="00000-000"></div>
        <div><label>Endereço *</label><input id="rcEnd" placeholder="Rua / avenida"></div>
        <div><label>Número *</label><input id="rcNum" placeholder="751"></div>
        <div><label>Bairro *</label><input id="rcBairro" placeholder="Centro"></div>
        <div><label>Complemento</label><input id="rcCompl" placeholder="opcional"></div>
        <button class="btn" id="rcAtivar" style="height:40px">Ativar recebimento</button>
      </div>
      <p id="rcMsg" style="margin:10px 0 0;font-size:13px"></p>`);

    // CNPJ pede tipo de empresa; CPF pede data de nascimento. Alterna conforme o documento.
    const alternaDoc = () => {
      const n = (document.getElementById('rcDoc').value || '').replace(/\D/g, '').length;
      document.getElementById('rcBoxTipo').style.display = n > 11 ? '' : 'none';
      document.getElementById('rcBoxNasc').style.display = n > 0 && n <= 11 ? '' : 'none';
    };
    document.getElementById('rcDoc').oninput = alternaDoc;
    alternaDoc();

    document.getElementById('rcAtivar').onclick = async () => {
      const doc = (document.getElementById('rcDoc').value || '').replace(/\D/g, '');
      const msg = document.getElementById('rcMsg');
      if (doc.length < 11) { msg.style.color = '#dc2626'; msg.textContent = 'Informe um CPF ou CNPJ válido.'; return; }
      const btn = document.getElementById('rcAtivar'); btn.disabled = true; btn.textContent = 'Ativando…';
      msg.style.color = '#475569'; msg.textContent = 'Criando sua conta de recebimento…';
      try {
        const v = id => (document.getElementById(id).value || '').trim();
        const corpo = {
          cpfCnpj: doc,
          mobilePhone: v('rcFone').replace(/\D/g, ''),
          postalCode: v('rcCep').replace(/\D/g, ''),
          address: v('rcEnd'),
          addressNumber: v('rcNum'),
          province: v('rcBairro'),
          complement: v('rcCompl'),
          incomeValue: Number(v('rcRenda') || 0)
        };
        if (doc.length > 11) corpo.companyType = v('rcTipo');
        else if (v('rcNasc')) corpo.birthDate = v('rcNasc');
        await Bora.api('/api/recebimento/ativar', { method: 'POST', body: JSON.stringify(corpo) });
        render();
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Ativar recebimento';
        msg.style.color = '#dc2626'; msg.textContent = e.message || 'Falha ao ativar. Tente novamente.';
      }
    };
  }

  document.addEventListener('DOMContentLoaded', render);
})();
