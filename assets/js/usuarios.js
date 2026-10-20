// Gestão de usuários (admin da loja). Backend exige papel ADMINISTRADOR_LOJA.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const PAPEL = { OPERADOR: 'Operador', GERENTE: 'Gerente', ADMINISTRADOR_LOJA: 'Admin da loja', ADMINISTRADOR_BORA: 'Admin BoraHapp' };

  window.__ativo = async (id, ativo) => { try { await Bora.api(`/api/usuarios/${id}/ativo?ativo=${ativo}`, { method: 'PUT' }); lista(); } catch (e) { alert(e.message); } };

  // Lojas da empresa: só faz sentido falar em "rede" quando existe mais de uma unidade.
  let lojasEmpresa = [];

  window.__vincular = async (usuarioId, select) => {
    const lojaId = Number(select.value);
    if (!lojaId) return;
    try {
      await Bora.api(`/api/rede/usuarios/${usuarioId}/lojas`, { method: 'POST', body: JSON.stringify({ lojaId }) });
      lista();
    } catch (e) { alert(e.message); select.value = ''; }
  };

  window.__desvincular = async (usuarioId, lojaId, nomeLoja) => {
    if (!confirm(`Tirar o acesso desta pessoa à loja ${nomeLoja}?

O efeito é imediato: se ela estiver `
      + 'usando o painel dessa loja agora, cai na próxima ação.')) return;
    try {
      await Bora.api(`/api/rede/usuarios/${usuarioId}/lojas/${lojaId}`, { method: 'DELETE' });
      lista();
    } catch (e) { alert(e.message); }
  };

  // Uma pessoa, N lojas: chips do que ela já acessa + o que dá para somar.
  function celulaLojas(u) {
    if (lojasEmpresa.length < 2) return '<span style="color:#94a3b8">—</span>';
    const dela = u.lojas || [];
    const chips = dela.map(l => {
      const x = l.principal ? '' :
        `<a href="#" title="Tirar acesso" onclick="__desvincular(${u.id},${l.id},'${esc((l.nome || '').replace(/'/g, ""))}');return false"
            style="margin-left:4px;color:#991b1b;text-decoration:none">×</a>`;
      return `<span style="display:inline-block;background:#f1f5f9;border-radius:999px;padding:2px 8px;margin:2px 3px 2px 0;font-size:12px">`
        + `${esc(l.nome)}${l.principal ? ' <b title="Loja principal">•</b>' : ''}${x}</span>`;
    }).join('');
    const faltam = lojasEmpresa.filter(l => !dela.some(d => d.id === l.id));
    const add = faltam.length === 0 ? '' :
      `<select onchange="__vincular(${u.id}, this)" style="font-size:12px;padding:3px;border:1px solid #e2e8f0;border-radius:6px;margin-top:2px">
         <option value="">+ dar acesso a…</option>
         ${faltam.map(l => `<option value="${l.id}">${esc(l.nome)}</option>`).join('')}
       </select>`;
    return chips + '<br>' + add;
  }

  /** Redefine a senha de alguem da equipe. O admin escolhe a nova e combina com a pessoa. */
  window.__senha = async (id, nome) => {
    const nova = prompt('Nova senha para ' + nome + ' (mínimo 8 caracteres). Combine com a pessoa e peça para ela trocar depois, na tela de login, em "Trocar minha senha".');
    if (nova === null) return;
    if (nova.trim().length < 8) { alert('A senha precisa ter ao menos 8 caracteres.'); return; }
    try {
      await Bora.api('/api/usuarios/' + id + '/senha', { method: 'PUT', body: JSON.stringify({ novaSenha: nova.trim() }) });
      if (typeof boraToast === 'function') boraToast('Senha de <b>' + esc(nome) + '</b> redefinida ✓', 'ok');
      else alert('Senha redefinida.');
    } catch (e) { alert('Nao foi possivel redefinir: ' + e.message); }
  };

  /**
   * Quem pediu ajuda com a senha e ainda nao foi atendido.
   *
   * Isto existe porque nao ha outro canal: o sistema nao manda e-mail, e o envio por WhatsApp
   * depende da Cloud API da Meta -- conferido em 18/10/2026, nenhuma loja tem credencial valida.
   * Entao o aviso vive aqui, onde esta o botao que resolve. Some sozinho quando a senha e redefinida.
   */
  async function pedidosDeSenha() {
    const caixa = document.getElementById('pedidosSenha');
    if (!caixa) return;
    let itens = [];
    try { itens = await Bora.api('/api/usuarios/pedidos-de-senha'); } catch (e) { itens = []; }
    if (!Array.isArray(itens) || !itens.length) { caixa.hidden = true; return; }
    const quando = iso => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };
    caixa.innerHTML = '<b style="color:#92400e">🔑 ' + itens.length + (itens.length > 1 ? ' pessoas pediram' : ' pessoa pediu')
      + ' para trocar a senha</b>'
      + '<p style="margin:6px 0 10px;font-size:13px;color:#78350f">Use <b>Redefinir senha</b> na linha da pessoa, '
      + 'aqui embaixo, e combine a senha nova com ela. O aviso some sozinho depois disso.</p>'
      + itens.map(i => '<div style="font-size:13px;padding:4px 0">• <b>' + esc(i.nome) + '</b> '
        + '<span style="color:#78350f">' + esc(i.email || '') + '</span> · pediu em ' + quando(i.criadoEm)
        // Nao dizer "avisado" sem ter avisado: hoje isto e sempre falso, e e isso que o dono precisa saber.
        + (i.avisadoPorWhatsapp ? ' · avisado por WhatsApp' : '') + '</div>').join('');
    caixa.hidden = false;
  }

  async function lista() {
    const tb = $('lista');
    pedidosDeSenha();
    try {
      // A equipe traz as lojas de cada um; a lista de lojas da empresa diz o que dá para somar.
      const [us, equipe, daEmpresa] = await Promise.all([
        Bora.api('/api/usuarios'),
        Bora.api('/api/rede/equipe').catch(() => []),
        Bora.api('/api/rede/lojas-da-empresa').catch(() => [])
      ]);
      lojasEmpresa = Array.isArray(daEmpresa) ? daEmpresa : [];
      const porId = {};
      (Array.isArray(equipe) ? equipe : []).forEach(e => porId[e.id] = e);
      const aviso = document.getElementById('avisoRede');
      if (aviso) aviso.style.display = lojasEmpresa.length > 1 ? 'block' : 'none';

      tb.innerHTML = us.map(u => {
        const badge = u.ativo ? '<span class="badge b-entregue">Ativo</span>' : '<span class="badge b-cancelado">Inativo</span>';
        const toggle = `<button class="btn ghost" style="background:#e5e7eb;color:#111;padding:4px 8px;margin-left:6px" onclick="__ativo(${u.id},${!u.ativo})">${u.ativo ? 'Desativar' : 'Ativar'}</button>`;
        // O botao faltava: a funcao e o endpoint existiam, ninguem chamava. A tela de login manda a
        // pessoa procurar justamente isto, e nao havia nada para clicar -- todo esquecimento de senha
        // virava chamado no WhatsApp. Vai por data-attribute, nao por onclick com o nome dentro: nome
        // com aspas quebraria a tela, e foi assim que o XSS entrou nas outras telas.
        const novaSenha = `<button class="btn ghost" data-senha="${u.id}" data-nome="${esc(u.nome || u.email)}"
            style="background:#eef2ff;color:#3730a3;padding:4px 8px;margin-left:6px"
            title="Definir uma nova senha para esta pessoa">Nova senha</button>`;
        const comLojas = Object.assign({}, u, porId[u.id] || {});
        return `<tr data-abrir="${u.id}" title="Abrir no formulário acima">`
          + `<td>${esc(u.nome) || '—'}</td><td>${esc(u.email)}</td><td>${PAPEL[u.papel] || esc(u.papel)}</td>`
          + `<td>${celulaLojas(comLojas)}</td><td>${badge}${toggle}${novaSenha}</td></tr>`;
      }).join('') || '<tr><td colspan="5" style="color:#94a3b8">Nenhum usuário.</td></tr>';
      tb.querySelectorAll('button[data-senha]').forEach(b =>
        b.onclick = () => window.__senha(Number(b.dataset.senha), b.dataset.nome));
      // A linha inteira abre a pessoa, MENOS os botoes dela: clicar em "Desativar" nao pode virar
      // "abrir para editar", e clicar num link de loja tambem nao.
      tb.querySelectorAll('tr[data-abrir]').forEach(tr => tr.addEventListener('click', ev => {
        if (ev.target.closest('button, a, select, input')) return;
        const u = us.find(x => x.id === Number(tr.dataset.abrir));
        if (u) modoEditar(u);
      }));
    } catch (e) {
      const m = e.message.includes('403') || /perfil|restrita/i.test(e.message) ? 'Apenas administradores da loja acessam esta tela.' : e.message;
      tb.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${esc(m)}</td></tr>`;
    }
  }

  /**
   * Clicar em alguem da lista abre essa pessoa no formulario de cima.
   *
   * <b>A SENHA NAO VEM PREENCHIDA, e nao tem como vir.</b> Ela e guardada como hash BCrypt
   * (`UsuarioService.java:60`, `encoder.encode`): da para conferir se uma senha confere, nunca para
   * ler qual e. O `UsuarioView` devolve id, nome, e-mail, papel, ativo e loja -- senha nao sai de
   * endpoint nenhum, e nem adiantaria sair. Entao o campo vira "nova senha, em branco mantem".
   *
   * Nome e e-mail abrem preenchidos mas travados: a API tem endpoint para papel, senha e ativo
   * (`UsuarioController`), e nenhum para nome ou e-mail. Campo editavel que nao salva e pior que
   * campo travado. O e-mail, em especial, e o login da pessoa.
   */
  let editando = null;

  function modoCriar() {
    editando = null;
    $('form').reset();
    document.dispatchEvent(new Event('bora:usuario-criado'));   // a senha nao fica a mostra
    $('tituloForm').textContent = 'Novo usuário';
    $('avisoEdicao').hidden = true;
    $('nome').disabled = false;
    $('email').disabled = false;
    $('senha').required = true;
    $('rotuloSenha').innerHTML = 'Senha <span style="font-weight:400;font-size:12px">· mínimo 8 caracteres</span>';
    $('btnSalvar').textContent = 'Criar usuário';
    $('btnCancelar').hidden = true;
    $('msg').textContent = '';
  }

  function modoEditar(u) {
    editando = u;
    document.dispatchEvent(new Event('bora:usuario-criado'));   // esconde senha de quem foi editado antes
    $('tituloForm').textContent = 'Editando ' + (u.nome || u.email);
    $('avisoEdicao').hidden = false;
    $('avisoEdicao').innerHTML = '<b>Nome e e-mail não mudam por aqui</b> — o e-mail é o login da '
      + 'pessoa. Dá para trocar o <b>papel</b> e definir uma <b>nova senha</b>.';
    $('nome').value = u.nome || '';
    $('email').value = u.email || '';
    $('papel').value = u.papel || 'OPERADOR';
    $('nome').disabled = true;
    $('email').disabled = true;
    $('senha').value = '';
    $('senha').required = false;
    $('rotuloSenha').innerHTML = 'Nova senha <span style="font-weight:400;font-size:12px">'
      + '· deixe em branco para manter a atual</span>';
    $('btnSalvar').textContent = 'Salvar alterações';
    $('btnCancelar').hidden = false;
    $('msg').textContent = '';
    $('tituloForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('btnCancelar').addEventListener('click', modoCriar);

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('msg').textContent = '';
    const btn = $('btnSalvar');
    btn.disabled = true;
    try {
      if (editando) {
        const novaSenha = $('senha').value;
        const trocaPapel = $('papel').value !== editando.papel;
        if (novaSenha && novaSenha.length < 8) {
          throw new Error('A nova senha precisa ter ao menos 8 caracteres.');
        }
        // Rebaixar o proprio administrador tranca a pessoa para fora desta tela, e nada no servidor
        // impede (so o "desativar" tem guarda contra alvo proprio). Pelo menos pergunta.
        if (trocaPapel && editando.papel === 'ADMINISTRADOR_LOJA'
            && !confirm('Esta pessoa deixa de ser administradora da loja.\n\nSe esta for a SUA conta, '
                        + 'você perde o acesso à tela de Usuários na hora. Continuar?')) {
          btn.disabled = false; return;
        }
        if (!trocaPapel && !novaSenha) {
          $('msg').style.color = 'var(--muted)';
          $('msg').textContent = 'Nada para salvar: nem o papel mudou, nem há senha nova.';
          btn.disabled = false; return;
        }
        if (trocaPapel) {
          await Bora.api('/api/usuarios/' + editando.id + '/papel?papel='
            + encodeURIComponent($('papel').value), { method: 'PUT' });
        }
        if (novaSenha) {
          await Bora.api('/api/usuarios/' + editando.id + '/senha',
            { method: 'PUT', body: JSON.stringify({ novaSenha }) });
        }
        const quem = editando.nome || editando.email;
        modoCriar();
        if (typeof boraToast === 'function') {
          boraToast('<b>' + esc(quem) + '</b> atualizado ✓'
            + (novaSenha ? ' — combine a senha nova com a pessoa.' : ''), 'ok');
        }
      } else {
        await Bora.api('/api/usuarios', { method: 'POST', body: JSON.stringify({
          nome: $('nome').value.trim(), email: $('email').value.trim(),
          senha: $('senha').value, papel: $('papel').value
        }) });
        modoCriar();
      }
      lista();
    } catch (ex) {
      $('msg').style.color = 'var(--danger)'; $('msg').textContent = ex.message;
    } finally { btn.disabled = false; }
  });

  /**
   * Olhinho para conferir a senha digitada.
   *
   * Quem cadastra alguem da equipe digita a senha aqui e combina com a pessoa depois. Sem poder ver
   * o que digitou, erro de digitacao so aparece quando a pessoa tenta entrar e nao consegue -- e aí
   * ninguem sabe se a senha foi cadastrada errada ou passada errada.
   *
   * Ela volta a ficar escondida sozinha em 15 segundos, e tambem quando o usuario e criado: esta e a
   * tela do balcao, e senha aberta no monitor e lida por quem passa atras.
   */
  (function () {
    const campo = $('senha'), botao = $('verSenha');
    if (!campo || !botao) return;
    let relogio = null;
    function esconder() {
      clearTimeout(relogio);
      campo.type = 'password';
      botao.textContent = '\u{1F441}';
      botao.setAttribute('aria-pressed', 'false');
      botao.title = 'Mostrar a senha';
    }
    botao.addEventListener('click', () => {
      if (campo.type !== 'password') { esconder(); campo.focus(); return; }
      campo.type = 'text';
      botao.textContent = '\u{1F648}';
      botao.setAttribute('aria-pressed', 'true');
      botao.title = 'Esconder a senha';
      clearTimeout(relogio);
      relogio = setTimeout(esconder, 15000);
      campo.focus();
    });
    document.addEventListener('bora:usuario-criado', esconder);
  })();

  document.addEventListener('DOMContentLoaded', lista);
})();
