// Credencial do app BoraHapp em cada marketplace — a tela que faltava.
//
// O DEFEITO (25/10/2026): os três endpoints existiam desde antes
// (GET/PUT/DELETE /admin-bora/credenciais), com auditoria, só para administrador, e o segredo nunca
// voltando na resposta. NENHUMA tela os chamava. A única forma de corrigir uma credencial errada era
// escrever direto no banco.
//
// O QUE ISSO CUSTOU, medido: o 99Food da loja 1 passou dias devolvendo 401 porque o `client_secret`
// da plataforma tem 13 caracteres, quando o do único app de 99Food que funciona neste sistema tem
// 32. O diagnóstico só apareceu comparando tamanhos no banco — e não havia caminho no painel para
// trocar o valor.
//
// É a terceira vez num dia que eu encontro endpoint pronto sem tela que o chame (a cifragem em
// repouso e o "vazio = não controla" do estoque foram as outras). Capacidade que ninguém alcança é
// capacidade que não existe.
//
// POR QUE ESTE ARQUIVO E NÃO SCRIPT DENTRO DO HTML: o `configuracoes.html` tem ~700 linhas de script
// embutido, e foi isso que escondeu a migração por foto de mim hoje — procurei em `assets/js/*` e
// não achei o que estava no HTML. Código novo entra aqui.
(function () {
  if (typeof Bora === 'undefined' || !Bora.user) return;
  const u = Bora.user();
  // Só o administrador da plataforma. O servidor confere de novo (`requireAdminBora`); isto é para
  // não desenhar na tela de quem não pode usar.
  if (!u || u.papel !== 'ADMINISTRADOR_BORA') return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lista = () => $('credLista');
  const msg = () => $('credMsg');

  function aviso(texto, cor) {
    if (!msg()) return;
    msg().style.color = cor || 'var(--muted)';
    msg().textContent = texto;
  }

  const dataBR = (iso) => (iso
    ? new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : null);

  /**
   * De onde a credencial em uso vem, em português.
   *
   * O servidor devolve TELA (salva aqui), SERVIDOR (variável no `api.env`) ou null. A diferença
   * importa: o que está salvo aqui GANHA do servidor, então ver "do servidor" com um valor errado
   * salvo aqui seria mentira — e é por isso que o botão de apagar existe.
   */
  function origemTexto(c) {
    if (c.origem === 'TELA') return 'salva aqui no painel';
    if (c.origem === 'SERVIDOR') return 'vem do servidor (api.env)';
    return 'nenhuma credencial configurada';
  }

  function cartao(c) {
    const quando = dataBR(c.secretAtualizadoEm);
    // O TAMANHO do segredo é mostrado de propósito, e o valor nunca. Foi esse número que
    // transformou "não chega pedido" em "o segredo está errado": sem ele a tela diz "salvo ✓" e não
    // há como desconfiar do que está guardado.
    const sobreSecret = c.temSecret
      ? '<b style="color:#166534">salvo ✓</b> · <b>' + Number(c.tamanhoSecret || 0)
        + '</b> caracteres' + (quando ? ' · gravado em ' + esc(quando) : '')
      : '<b style="color:#b91c1c">não salvo</b>';

    return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <b>${esc(c.label || c.canal)}</b>
        <small style="color:#64748b">${esc(origemTexto(c))}</small>
      </div>
      <div class="field" style="margin-top:8px">
        <label style="font-size:13px">Client ID / App ID</label>
        <input id="credId-${esc(c.canal)}" value="${esc(c.clientId || '')}"
               placeholder="cole o que está no portal deles"
               style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px">
      </div>
      <div class="field" style="margin-top:8px">
        <label style="font-size:13px">Client Secret / App Secret · ${sobreSecret}</label>
        <input id="credSecret-${esc(c.canal)}" type="password" autocomplete="new-password"
               placeholder="${c.temSecret ? 'deixe em branco para manter o atual' : 'cole o segredo aqui'}"
               style="width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px">
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-salvar="${esc(c.canal)}">Salvar</button>
        ${c.origem === 'TELA'
          ? `<button class="btn secondary" data-apagar="${esc(c.canal)}"
               style="background:#64748b">Apagar a salva aqui</button>` : ''}
      </div>
    </div>`;
  }

  async function carregar() {
    if (!lista()) return;
    try {
      const cs = (await Bora.api('/admin-bora/credenciais')) || [];
      if (!cs.length) { lista().innerHTML = '<span style="color:#94a3b8">Nenhum canal com credencial de plataforma.</span>'; return; }
      lista().innerHTML = cs.map(cartao).join('');
      ligar();
    } catch (e) {
      lista().innerHTML = '<span style="color:var(--danger)">' + esc(e.message) + '</span>';
    }
  }

  function ligar() {
    lista().querySelectorAll('button[data-salvar]').forEach((b) => {
      b.onclick = () => salvar(b.dataset.salvar, b);
    });
    lista().querySelectorAll('button[data-apagar]').forEach((b) => {
      b.onclick = () => apagar(b.dataset.apagar, b);
    });
  }

  async function salvar(canal, botao) {
    const id = ($('credId-' + canal) || {}).value || '';
    const segredo = ($('credSecret-' + canal) || {}).value || '';
    if (!id.trim()) { aviso('Informe o Client ID.', '#b45309'); return; }

    // A CONSEQUÊNCIA DITA ANTES, e não depois. No 99Food (Open Delivery) o token é pedido com o
    // App ID/Secret a cada vez, então trocar a credencial FAZ O SERVIDOR ESQUECER os tokens de
    // todas as lojas daquele canal (`esquecerTokens`). Elas se reconectam no próximo ciclo se a
    // credencial nova estiver certa — e ficam fora se estiver errada. Quem aperta o botão merece
    // saber disso antes.
    const recado = canal === 'NOVE_NOVE'
      ? '\n\nIsto vale para TODAS as lojas que usam o app da plataforma neste canal, e o servidor '
        + 'vai esquecer os tokens atuais delas. Se a credencial nova estiver certa, elas se '
        + 'reconectam sozinhas; se estiver errada, param de receber pedido.'
      : '\n\nIsto vale para TODAS as lojas que usam o app da plataforma neste canal.';
    if (!confirm('Salvar a credencial do app da plataforma no ' + canal + '?' + recado)) return;

    botao.disabled = true;
    aviso('Salvando…');
    try {
      const corpo = { clientId: id.trim() };
      // Segredo em branco MANTÉM o que já está salvo — é o que o servidor faz, e o campo diz isso.
      // Mandar string vazia seria pedir ao servidor para recusar.
      if (segredo.trim()) corpo.clientSecret = segredo.trim();
      await Bora.api('/admin-bora/credenciais/' + encodeURIComponent(canal),
        { method: 'PUT', body: JSON.stringify(corpo) });
      aviso('Salvo ✓ — o segredo não é mostrado de volta, por isso o campo volta vazio.', '#166534');
      await carregar();
    } catch (e) {
      aviso('Não salvei: ' + e.message, '#dc2626');
      botao.disabled = false;
    }
  }

  async function apagar(canal, botao) {
    if (!confirm('Apagar a credencial do ' + canal + ' salva aqui?\n\nVolta a valer a do servidor '
      + '(api.env), se houver. Se não houver nenhuma, as lojas sem app próprio param de receber '
      + 'pedido neste canal.')) return;
    botao.disabled = true;
    aviso('Apagando…');
    try {
      await Bora.api('/admin-bora/credenciais/' + encodeURIComponent(canal), { method: 'DELETE' });
      aviso('Apagada ✓', '#166534');
      await carregar();
    } catch (e) {
      aviso('Não apaguei: ' + e.message, '#dc2626');
      botao.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', carregar);
  window.__recarregarCredenciais = carregar;
})();
