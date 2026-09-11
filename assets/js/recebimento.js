// Recebimento PIX direto na conta do lojista (subconta Asaas white-label).
// Substitui o "cole sua API key": aqui o lojista ativa e manda documento e selfie pela
// propria tela — o arquivo e repassado ao Asaas e nao fica guardado em lugar nenhum.
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
  .rc-doc{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-top:8px}
  .rc-doc b{font-size:14px}
  .rc-recusa{background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;margin-top:8px;font-size:13px;color:#b91c1c}
  `;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  function card(inner) { mount.innerHTML = `<div class="rc-card">${inner}</div>`; }

  // O Asaas devolve rotulo tecnico ("Documentos de identificacao"); o lojista precisa saber o que
  // apontar a camera. O terceiro item diz qual camera abrir no celular: traseira para o documento,
  // frontal para a selfie.
  const ROTULOS = {
    IDENTIFICATION: ['Documento com foto', 'RG ou CNH do titular — frente e verso', 'environment'],
    IDENTIFICATION_SELFIE: ['Selfie do titular', 'foto do rosto de quem é o dono do CNPJ', 'user']
  };
  const SIT = {
    APPROVED: ['aprovado', 'rc-ok'],
    NOT_SENT: ['falta enviar', 'rc-pend'],
    PENDING: ['em análise', 'rc-pend'],
    AWAITING_APPROVAL: ['em análise', 'rc-pend'],
    REJECTED: ['recusado — envie de novo', 'rc-pend']
  };
  // So o APROVADO perde o botao. Em analise ele CONTINUA, porque o Asaas aceita mais de um arquivo
  // no mesmo item - CNH e RG tem frente e verso, e sem isso o lojista mandaria um lado so e ficaria
  // sem como mandar o outro.
  // O Asaas RECUSA identidade e selfie por API: "Esse tipo de documento nao pode ser enviado via
  // API" (invalid_object, visto em producao na loja 18 em 11/09/2026). Faz sentido do lado dele -
  // e o nucleo do KYC, e ele quer capturar no app, com prova de vida. A doc dele diz "quando o
  // documento nao possuir onboardingUrl E PERMITIR envio pela API"; a segunda condicao e esta.
  // Se um dia liberarem para a nossa integracao, e so tirar o tipo desta lista.
  const SO_PELO_APP = ['IDENTIFICATION', 'IDENTIFICATION_SELFIE'];
  const APROVADO = 'APPROVED';
  const EM_ANALISE = ['PENDING', 'AWAITING_APPROVAL'];

  function listaDocs(itens, recusas, d) {
    const titular = (itens.find(i => i.responsible && i.responsible.name) || {}).responsible;
    const linhas = itens.map(i => {
      const [rot, dica, cam] = ROTULOS[i.type] || [i.title || 'Documento', '', 'environment'];
      const [txt, cls] = SIT[i.status] || [String(i.status || '').toLowerCase(), 'rc-pend'];
      const aprovado = i.status === APROVADO;
      const analisando = EM_ANALISE.includes(i.status);
      return `<div class="rc-doc">
        <div><b>${esc(rot)}</b> <span class="rc-badge ${cls}">${esc(txt)}</span>
          ${dica ? `<div class="rc-sub" style="margin:2px 0 0">${esc(dica)}</div>` : ''}</div>
        ${aprovado ? '<span style="font-size:20px">✓</span>'
          : SO_PELO_APP.includes(i.type)
            ? '<span class="rc-sub" style="margin:0">foto tirada na hora ↓</span>'
            : `<button class="btn rc-envia" data-doc="${esc(i.id)}" data-tipo="${esc(i.type)}" data-cam="${cam}"
                 ${analisando ? 'style="background:#64748b"' : ''}>📷 ${analisando ? 'Enviar outra foto' : 'Enviar foto'}</button>`}
      </div>`;
    }).join('');
    const motivos = Array.isArray(recusas) && recusas.length
      ? `<div class="rc-recusa"><b>O que foi recusado:</b><br>${recusas.map(r => esc(r.description || r.reason || r)).join('<br>')}</div>`
      : '';
    return `${titular ? `<p class="rc-sub">Titular da conta: <b>${esc(titular.name)}</b> — as fotos precisam ser dessa pessoa.</p>` : ''}
      ${linhas}${motivos}
      ${itens.some(i => SO_PELO_APP.includes(i.type) && i.status !== APROVADO) ? `
      <div style="margin-top:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px">
        <b>Documento e selfie só pelo aplicativo do Asaas</b>
        <p class="rc-sub" style="margin:6px 0 0">Não dá para enviar por aqui nem pelo site do Asaas: a
        própria tela de documentos dele diz "acesse nosso aplicativo". É por causa da verificação ao vivo —
        a foto do documento e a do rosto têm que ser tiradas na hora, pela câmera.</p>
        <ol class="rc-sub" style="margin:8px 0 0;padding-left:18px">
          <li>No celular <b>do titular</b>, baixe o aplicativo <b>Asaas</b></li>
          <li>Entre com o e-mail <b>${esc((d && d.email) || 'da conta')}</b> — na primeira vez use "Esqueci minha senha"</li>
          <li>Abra <b>Documentos</b> e siga o passo a passo com a câmera</li>
        </ol>
        <p class="rc-sub" style="margin:8px 0 0">A análise leva até 48 horas. Assim que o Asaas aprovar,
        o PIX aparece sozinho no seu cardápio — você não precisa avisar ninguém.</p>
      </div>` : `
      <p class="rc-sub" style="margin-top:10px">Documento com frente e verso? Envie um lado, depois clique de novo
      em "Enviar outra foto" no mesmo item. A foto vai direto para o banco que processa o pagamento; nós não
      guardamos nenhuma cópia. A análise leva até 48 horas.</p>`}
      <p id="rcDocMsg" style="font-size:13px;margin:6px 0 0"></p>`;
  }

  // Upload com FormData: o navegador precisa montar o boundary do multipart sozinho, entao aqui
  // NAO da para usar o Bora.api (ele forca Content-Type: application/json).
  function ligarEnvios() {
    mount.querySelectorAll('.rc-envia').forEach(btn => {
      btn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.capture = btn.dataset.cam;
        input.onchange = async () => {
          const f = input.files && input.files[0];
          if (!f) return;
          const msg = document.getElementById('rcDocMsg');
          btn.disabled = true;
          msg.style.color = '#475569'; msg.textContent = 'Enviando ' + f.name + '…';
          try {
            const fd = new FormData();
            fd.append('arquivo', f);
            fd.append('tipo', btn.dataset.tipo || '');
            const res = await fetch(Bora.apiBase() + '/api/recebimento/documentos/' + encodeURIComponent(btn.dataset.doc),
              { method: 'POST', headers: { Authorization: 'Bearer ' + Bora.token() }, body: fd });
            if (!res.ok) {
              let m = 'Erro ' + res.status;
              try { const b = await res.json(); m = b.message || b.error || m; } catch (e) {}
              throw new Error(m);
            }
            msg.style.color = '#166534'; msg.textContent = 'Enviado ✓';
            render();
          } catch (e) {
            btn.disabled = false;
            msg.style.color = '#dc2626'; msg.textContent = e.message || 'Não consegui enviar.';
          }
        };
        input.click();
      };
    });
  }

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
      // A subconta criada por API vem SEM link de onboarding (conferido em producao): o Asaas manda
      // "acesse nosso aplicativo", e o lojista fica sem saber por onde enviar. Como a regra dele so
      // proibe o envio por API quando existe onboardingUrl, aqui podemos - e devemos - pedir a foto
      // na nossa propria tela. O lojista nunca precisa saber que o Asaas existe.
      let itens = null, recusas = null;
      try {
        const r = await Bora.api('/api/recebimento/documentos');
        itens = r && r.asaas && r.asaas.data;
        recusas = r && r.asaas && r.asaas.rejectReasons;
      } catch (e) { itens = null; }

      const corpo = (itens && itens.length)
        ? listaDocs(itens, recusas, d)
        : `<p class="rc-sub">Para liberar o dinheiro, entre no Asaas com o e-mail
             <b>${esc(d.email || 'da conta')}</b>, defina a senha em "Esqueci minha senha" e conclua o
             cadastro.</p>
           <a class="rc-link" href="https://www.asaas.com/login" target="_blank" rel="noopener">Abrir o Asaas</a>`;

      card(`<h2>💸 Recebimento por PIX <span class="rc-badge rc-pend">falta confirmar identidade</span></h2>
        <p class="rc-sub">Sua conta de recebimento já está criada. Falta confirmar quem é o titular —
        é a mesma conferência que um banco faz quando você abre conta pelo aplicativo.</p>
        ${corpo}${blocoWebhook(d)}`);
      ligarBotaoWebhook();
      if (itens && itens.length) ligarEnvios();
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
