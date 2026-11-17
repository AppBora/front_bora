/**
 * Usuários da PLATAFORMA INTEIRA — listar, incluir, ativar, desativar e excluir.
 *
 * POR QUE ESTE ARQUIVO EXISTE, E SEPARADO
 * A tela de Usuários lista `daLoja(lojaId)`: quem tem `loja_id` daquela loja ou vínculo com ela. O
 * ADMINISTRADOR_BORA tem `loja_id` NULO por desenho (papel global), então:
 *   1. conta de plataforma não aparecia em lista de loja nenhuma -- "o usuário não existe";
 *   2. e a própria tela de Usuários era um beco sem saída para ele: ela pede /api/usuarios, que
 *      chama ctx.lojaId(), que responde 409 "Nenhuma loja selecionada". O dono clicava em Usuários,
 *      via uma mensagem de erro e concluía que o recurso não existia.
 *
 * A primeira entrega disto ficou SÓ dentro de Configurações > Plataforma, atrás de duas sanfonas
 * fechadas. O dono foi procurar em Usuários, que é onde faz sentido procurar, e não achou.
 *
 * ENTÃO POR QUE UM MÓDULO, E NÃO O CÓDIGO REPETIDO NAS DUAS TELAS
 * Porque aqui tem um botão que APAGA. Duas cópias de uma ação destrutiva divergem -- uma ganha uma
 * trava nova, a outra não, e ninguém percebe até alguém apagar o que não devia pela tela errada.
 * Uma fonte, dois lugares que a chamam.
 *
 * COMO USAR
 *   BoraUsuariosPlataforma.montar(document.getElementById('onde'));
 * Ele injeta o próprio HTML e cuida de tudo. Quem chama não precisa saber de nada.
 */
window.BoraUsuariosPlataforma = (function () {
  'use strict';

  // Nome e e-mail aqui foram escritos por OUTRA pessoa (o lojista cadastra a equipe dele). Indo cru
  // para innerHTML, um <img onerror=...> rodaria dentro da sessão que enxerga todos os clientes.
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const PAPEL = {
    OPERADOR: 'Operador',
    GERENTE: 'Gerente',
    ADMINISTRADOR_LOJA: 'Administrador da loja',
    ADMINISTRADOR_BORA: 'Administrador da plataforma'
  };

  const tag = (txt, fundo, cor) =>
    `<span style="background:${fundo};color:${cor};border-radius:999px;padding:2px 9px;`
    + `font-size:12px;white-space:nowrap">${esc(txt)}</span>`;

  const CAMPO = 'width:100%;padding:9px;border:1px solid #e2e8f0;border-radius:6px;margin-top:4px';

  function markup() {
    return `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
        <label style="font-size:13px">Buscar
          <input id="upBusca" placeholder="nome ou e-mail"
                 style="padding:9px;border:1px solid #e2e8f0;border-radius:6px;margin-top:4px;display:block"></label>
        <label style="font-size:13px">Loja
          <select id="upFiltroLoja"
                  style="padding:9px;border:1px solid #e2e8f0;border-radius:6px;margin-top:4px;display:block">
            <option value="">todas</option></select></label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px">
          <input type="checkbox" id="upSoAtivos"> só ativos</label>
      </div>
      <div id="upLista" style="font-size:14px">Carregando…</div>

      <h3 style="margin:22px 0 8px;font-size:15px">Incluir usuário</h3>
      <p style="color:var(--muted);font-size:13px;margin:0 0 10px">
        E-mail que já existe é <b>recusado</b>, nunca promovido — senão "cadastrei um colega" viraria
        escalar o operador de uma loja a dono da plataforma. Para criar conta <b>de plataforma</b>,
        deixe a loja em "— plataforma (sem loja) —".
      </p>
      <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));max-width:900px">
        <label style="font-size:13px">Nome
          <input id="upNome" placeholder="Ex.: Will (suporte)" style="${CAMPO}"></label>
        <label style="font-size:13px">E-mail
          <input id="upEmail" type="email" placeholder="pessoa@borahapp.com.br" style="${CAMPO}"></label>
        <label style="font-size:13px">Senha <span style="font-weight:400">· mínimo 8</span>
          <input id="upSenha" type="password" placeholder="ela troca no 1º acesso" style="${CAMPO}"></label>
        <label style="font-size:13px">Papel
          <select id="upPapel" style="${CAMPO}">
            <option value="OPERADOR">Operador</option>
            <option value="GERENTE">Gerente</option>
            <option value="ADMINISTRADOR_LOJA">Administrador da loja</option>
            <option value="ADMINISTRADOR_BORA">Administrador da plataforma</option>
          </select></label>
        <label style="font-size:13px">Loja
          <select id="upLoja" style="${CAMPO}">
            <option value="">— plataforma (sem loja) —</option></select></label>
      </div>
      <button class="btn" id="upCriar" style="margin-top:12px">Criar usuário</button>
      <span id="upMsg" style="font-size:13px;margin-left:10px"></span>`;
  }

  function montar(raiz) {
    if (!raiz) return;
    raiz.innerHTML = markup();
    const $ = id => raiz.querySelector('#' + id);
    let carregando = false;

    async function carregarLojasDoSeletor() {
      try {
        const lojas = await Bora.api('/admin-bora/clientes');
        const opcoes = lojas.slice()
          .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
          .map(l => `<option value="${l.id}">${esc(l.nome)} (#${l.id})</option>`).join('');
        $('upLoja').innerHTML = '<option value="">— plataforma (sem loja) —</option>' + opcoes;
        $('upFiltroLoja').innerHTML = '<option value="">todas</option>' + opcoes;
      } catch (e) {
        // Sem o seletor ainda dá para listar, desativar e excluir; só criar em loja fica indisponível.
        $('upMsg').textContent = 'Não consegui carregar as lojas: ' + e.message;
      }
    }

    async function carregar() {
      if (carregando) return;
      carregando = true;
      const box = $('upLista');
      const qs = new URLSearchParams();
      const q = $('upBusca').value.trim();
      if (q) qs.set('q', q);
      if ($('upFiltroLoja').value) qs.set('loja', $('upFiltroLoja').value);
      if ($('upSoAtivos').checked) qs.set('ativos', 'true');
      try {
        const lista = await Bora.api('/admin-bora/usuarios' + (qs.toString() ? '?' + qs : ''));
        if (!lista.length) {
          box.innerHTML = '<p style="color:var(--muted);margin:0">Nenhum usuário com esse filtro.</p>';
          return;
        }
        const inativos = lista.filter(x => !x.ativo).length;
        box.innerHTML = lista.map(x => {
          const papel = PAPEL[x.papel] || x.papel || '—';
          const selos = [
            x.papel === 'ADMINISTRADOR_BORA'
              ? tag(papel, '#f3e8ff', '#6b21a8') : tag(papel, '#eef2f9', '#334155'),
            x.lojaNome ? tag(x.lojaNome + ' #' + x.lojaId, '#e0f2fe', '#075985')
                       : tag('sem loja', '#fef3c7', '#92400e'),
            x.ativo ? tag('ativo', '#dcfce7', '#166534') : tag('desativado', '#e2e8f0', '#334155')
          ];
          if (x.outrasLojas && x.outrasLojas.length) {
            selos.push(tag('+ ' + x.outrasLojas.length + ' loja(s) por vínculo', '#f1f5f9', '#475569'));
          }
          const acoes = x.euMesmo
            ? '<span style="color:var(--muted);font-size:12px">sua conta</span>'
            : `<button class="btn" data-up-ativo="${x.id}" data-para="${x.ativo ? 'false' : 'true'}"
                   style="padding:5px 10px;font-size:12px;background:${x.ativo ? '#64748b' : 'var(--primary)'}"
                   >${x.ativo ? 'Desativar' : 'Ativar'}</button>
               <button class="btn" data-up-excluir="${x.id}"
                   style="padding:5px 10px;font-size:12px;background:#b91c1c;margin-left:6px">Excluir</button>`;
          return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 0;`
            + `border-bottom:1px solid #f1f5f9">`
            + `<b>${esc(x.nome) || '—'}</b>`
            + `<span style="color:var(--muted)">${esc(x.email)}</span>`
            + `${selos.join(' ')}`
            + `<span style="margin-left:auto;display:flex;align-items:center">${acoes}</span></div>`;
        }).join('')
          + `<p style="color:var(--muted);font-size:13px;margin:10px 0 0">${lista.length} conta(s)`
          + (inativos ? ', ' + inativos + ' desativada(s)' : '') + '.</p>';

        box.querySelectorAll('[data-up-ativo]').forEach(b => b.onclick = () => alternar(b));
        box.querySelectorAll('[data-up-excluir]').forEach(b => b.onclick = () => excluir(b));
      } catch (e) {
        box.textContent = 'Não consegui carregar: ' + e.message;
      } finally {
        carregando = false;
      }
    }

    async function alternar(b) {
      const ligar = b.dataset.para === 'true';
      if (!confirm((ligar ? 'Ativar' : 'Desativar') + ' esta conta?'
        + (ligar ? ' Ela volta a entrar no próximo login.'
                 : ' O acesso cai no próximo clique que ela der, sem esperar o login vencer.'))) return;
      b.disabled = true;
      try {
        await Bora.api('/admin-bora/usuarios/' + b.dataset.upAtivo + '/ativo',
          { method: 'PUT', body: JSON.stringify({ ativo: ligar }) });
        carregar();
      } catch (e) {
        b.disabled = false;
        alert('Erro: ' + e.message);
      }
    }

    /**
     * Excluir é irreversível, então pergunta ao servidor O QUE SE PERDE antes de perguntar ao dono.
     * `log_status.usuario_id` não tem FK: apagar a conta não apaga nem bloqueia o histórico do
     * pedido, só deixa o id órfão -- e aí o histórico mostra a troca de status sem o nome de quem a
     * fez. "Tem certeza?" não diz isso a ninguém; um número diz.
     */
    async function excluir(b) {
      const id = b.dataset.upExcluir;
      let p;
      try {
        p = await Bora.api('/admin-bora/usuarios/' + id + '/previa-exclusao');
      } catch (e) {
        alert('Não consegui conferir antes de excluir: ' + e.message);
        return;
      }
      if (!p.podeExcluir) {
        alert('Não dá para excluir esta conta:\n\n• ' + (p.impedimentos || []).join('\n• '));
        return;
      }
      const linhas = p.linhasDeHistoricoQuePerdemONome || 0;
      const texto = 'EXCLUIR DEFINITIVAMENTE ' + (p.nome || '') + ' (' + p.email + ')?\n\n'
        + (linhas > 0
            ? '⚠ ' + linhas + ' linha(s) do histórico de pedidos vão ficar SEM O NOME de quem mexeu. '
              + 'Isso não tem volta.\n\n'
            : 'Esta conta não tem histórico de pedidos.\n\n')
        + 'DESATIVAR corta o acesso do mesmo jeito, é reversível e mantém o histórico legível.\n\n'
        + 'Excluir mesmo assim?';
      if (!confirm(texto)) return;
      b.disabled = true;
      try {
        const r = await Bora.api('/admin-bora/usuarios/' + id, { method: 'DELETE' });
        carregar();
        $('upMsg').style.color = '#166534';
        $('upMsg').textContent = 'Excluído: ' + r.email
          + (r.vinculosRemovidos ? ' (' + r.vinculosRemovidos + ' vínculo(s) de loja removido(s))' : '');
      } catch (e) {
        b.disabled = false;
        alert('Erro: ' + e.message);
      }
    }

    $('upCriar').onclick = async () => {
      const btn = $('upCriar'), msg = $('upMsg');
      const nome = $('upNome').value.trim();
      const email = $('upEmail').value.trim();
      const senha = $('upSenha').value;
      const papel = $('upPapel').value;
      const lojaId = $('upLoja').value || null;
      msg.style.color = '#dc2626';
      if (!nome) { msg.textContent = 'Informe o nome.'; return; }
      if (!email.includes('@')) { msg.textContent = 'E-mail inválido.'; return; }
      if (senha.length < 8) { msg.textContent = 'A senha precisa de ao menos 8 caracteres.'; return; }
      if (papel === 'ADMINISTRADOR_BORA' && lojaId) {
        msg.textContent = 'Administrador da plataforma não tem loja — escolha "plataforma (sem loja)".';
        return;
      }
      if (papel !== 'ADMINISTRADOR_BORA' && !lojaId) {
        msg.textContent = 'Escolha a loja. Só o administrador da plataforma fica sem loja.';
        return;
      }
      btn.disabled = true;
      msg.style.color = 'var(--muted)';
      msg.textContent = 'Criando…';
      try {
        const r = await Bora.api('/admin-bora/usuarios',
          { method: 'POST', body: JSON.stringify({ nome, email, senha, papel, lojaId }) });
        msg.style.color = r.aviso ? '#b45309' : '#166534';
        msg.textContent = 'Criado: ' + r.email + ' — ' + (r.aviso || r.avisoSenha || '');
        ['upNome', 'upEmail', 'upSenha'].forEach(i => $(i).value = '');
        carregar();
      } catch (e) {
        msg.style.color = '#dc2626';
        msg.textContent = 'Erro: ' + e.message;
      } finally {
        btn.disabled = false;
      }
    };

    // Digitar filtra sozinho, com uma pausa: sem o atraso, cada tecla era uma consulta à API.
    let timer = null;
    $('upBusca').oninput = () => { clearTimeout(timer); timer = setTimeout(carregar, 350); };
    $('upFiltroLoja').onchange = carregar;
    $('upSoAtivos').onchange = carregar;

    carregarLojasDoSeletor().then(carregar);
  }

  return { montar };
})();
