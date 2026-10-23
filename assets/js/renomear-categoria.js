/**
 * Renomear uma categoria inteira, de uma vez.
 *
 * POR QUE EXISTE
 * A categoria não é um cadastro: é um campo de texto dentro de CADA produto. Trocar
 * "Best Forever" por "Especialidades da Casa" era abrir produto por produto e redigitar o nome —
 * e bastava errar uma letra em um deles para esse produto virar uma categoria sozinha no cardápio
 * do cliente, separada dos irmãos. Quanto maior a loja, mais certo o erro.
 *
 * O QUE ELE MANDA, E O QUE NÃO MANDA
 * Cada produto é regravado com o que já estava nele, mudando só a categoria. Dois campos ficam de
 * FORA de propósito, e cada um já custou caro uma vez:
 *
 *  - `estoque`: o servidor ignora este campo na edição justamente para não apagar as baixas do
 *    dia (ProdutoService.atualizar). Mandar o número que a tela carregou é pedir para ele voltar
 *    um dia a ser gravado.
 *  - `imagemUrl`: o servidor grava quando vem preenchido. O que a lista devolve é o ENDEREÇO da
 *    foto, não a foto — devolver isso trocaria a foto por um link apontando para si mesma.
 *
 * Já `custo` e `estoqueMinimo` são gravados SEM CONDIÇÃO: mandar vazio no lugar do valor lido
 * apagaria os dois, e com o custo iriam junto o CMV e a margem de todos os relatórios. Por isso
 * eles voltam com o valor exato que vieram.
 *
 * JUNTAR DUAS CATEGORIAS É PERMITIDO, MAS NUNCA POR ENGANO
 * Renomear para um nome que já existe junta as duas — e isso não tem desfazer de um clique. A
 * tela diz isso com todas as letras e exige um segundo clique.
 */
(function () {
  if (!Bora.requireAuth()) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // A tela só existe na página de Produtos; em qualquer outra, o script não faz nada.
  if (!$('catDe')) return;

  let produtos = [];
  let confirmando = null;   // a renomeação que está esperando o segundo clique

  const limpo = (s) => String(s == null ? '' : s).trim();
  /** Categoria vazia aparece no cardápio como "Outros" — é o nome que o cliente lê. */
  const rotulo = (c) => (limpo(c) || '(sem categoria)');

  function categorias() {
    const mapa = new Map();
    for (const p of produtos) {
      const c = limpo(p.categoria);
      mapa.set(c, (mapa.get(c) || 0) + 1);
    }
    return [...mapa].sort((a, b) => rotulo(a[0]).localeCompare(rotulo(b[0]), 'pt-BR'));
  }

  function desenhar() {
    const sel = $('catDe');
    const lista = categorias();
    sel.innerHTML = '<option value="">— escolha —</option>' + lista.map(([c, n]) =>
      `<option value="${esc(c)}">${esc(rotulo(c))} (${n} produto${n > 1 ? 's' : ''})</option>`).join('');
    if (!lista.length) {
      $('catMsg').textContent = 'Esta loja ainda não tem produto nenhum.';
    }
  }

  function aviso(html, cor) {
    const el = $('catAviso');
    el.style.cssText = 'margin-top:10px;font-size:14px;line-height:1.5;padding:10px 12px;'
      + 'border-radius:8px;background:' + (cor === 'erro' ? '#fef2f2' : cor === 'ok' ? '#ecfdf5' : '#fffbeb')
      + ';border:1px solid ' + (cor === 'erro' ? '#fca5a5' : cor === 'ok' ? '#6ee7b7' : '#fcd34d')
      + ';color:' + (cor === 'erro' ? '#7f1d1d' : cor === 'ok' ? '#065f46' : '#78350f');
    el.innerHTML = html;
  }

  /** O corpo da edição: o que já estava no produto, mudando só a categoria. */
  function corpo(p, categoria) {
    return {
      nome: p.nome,
      categoria,
      preco: Number(p.preco),
      custo: p.custo,                  // cru: nulo continua nulo, número continua número
      estoqueMinimo: p.estoqueMinimo,  // idem
      ativo: p.ativo !== false,
      codigoExterno: p.codigoExterno || '',
      // estoque e imagemUrl ficam FORA: ver o cabeçalho deste arquivo.
    };
  }

  async function aplicar(de, para, alvos) {
    const btn = $('catRenomear');
    btn.disabled = true;
    const falhas = [];
    let feitos = 0;

    for (const p of alvos) {
      $('catMsg').textContent = 'Renomeando… ' + (feitos + falhas.length + 1) + ' de ' + alvos.length;
      try {
        await Bora.api('/api/produtos/' + p.id, {
          method: 'PUT', body: JSON.stringify(corpo(p, para)),
        });
        feitos += 1;
      } catch (e) {
        falhas.push(p.nome + ' — ' + (e && e.message || e));
      }
    }

    btn.disabled = false;
    $('catMsg').textContent = '';
    confirmando = null;

    if (!falhas.length) {
      aviso(`✅ Pronto: <b>${esc(rotulo(de))}</b> virou <b>${esc(para)}</b> em ${feitos} produto`
        + `${feitos > 1 ? 's' : ''}. Confira o cardápio digital.`, 'ok');
    } else {
      // Dizer "pronto" com falhas no meio deixaria a loja com DUAS categorias meio trocadas, e o
      // lojista achando que acabou.
      aviso(`⚠ Renomeei ${feitos} de ${alvos.length}. <b>Estes não mudaram</b>, e continuam na `
        + `categoria antiga:<br>&bull; ${falhas.map(esc).join('<br>&bull; ')}`
        + `<br><br>Rodar de novo refaz só o que falta.`, 'erro');
    }
    await recarregar();
  }

  async function recarregar() {
    try {
      produtos = await Bora.produtos();
      desenhar();
    } catch (e) {
      aviso('Não consegui recarregar a lista de produtos: ' + esc(e && e.message || e), 'erro');
    }
  }

  async function aoClicar() {
    const de = $('catDe').value;
    const para = limpo($('catPara').value);
    const temEscolha = $('catDe').selectedIndex > 0 || de !== '';

    if (!temEscolha) { aviso('Escolha a categoria que você quer renomear.', 'erro'); return; }
    if (!para) { aviso('Escreva o novo nome.', 'erro'); return; }
    if (para === limpo(de)) {
      aviso('O novo nome é igual ao atual — não há o que mudar.', 'erro');
      return;
    }

    const alvos = produtos.filter((p) => limpo(p.categoria) === limpo(de));
    if (!alvos.length) {
      aviso('Nenhum produto está nessa categoria agora. Recarreguei a lista.', 'erro');
      await recarregar();
      return;
    }

    const jaExiste = produtos.some((p) => limpo(p.categoria) === para);

    // Segundo clique: só aplica se for exatamente a mesma renomeação que a tela mostrou.
    if (confirmando && confirmando.de === limpo(de) && confirmando.para === para) {
      await aplicar(de, para, alvos);
      return;
    }

    confirmando = { de: limpo(de), para };
    const nomes = alvos.slice(0, 8).map((p) => esc(p.nome)).join(', ')
      + (alvos.length > 8 ? ` e mais ${alvos.length - 8}` : '');
    aviso(
      (jaExiste
        ? `<b>Atenção: "${esc(para)}" já existe.</b> Renomear vai <b>juntar as duas</b> numa só, `
          + `e isso não tem como desfazer num clique.<br><br>`
        : '')
      + `Vou trocar a categoria de <b>${alvos.length} produto${alvos.length > 1 ? 's' : ''}</b>: `
      + `${nomes}.<br><b>${esc(rotulo(de))}</b> → <b>${esc(para)}</b>`
      + `<br><br>Clique em <b>Renomear</b> de novo para confirmar.`,
      jaExiste ? 'erro' : 'aviso');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('catRenomear').addEventListener('click', aoClicar);
    // Mudar qualquer campo derruba a confirmação pendente: senão o segundo clique aplicaria uma
    // renomeação diferente da que a tela descreveu.
    $('catDe').addEventListener('change', () => { confirmando = null; $('catAviso').innerHTML = ''; });
    $('catPara').addEventListener('input', () => { confirmando = null; });
    await recarregar();
  });

  window.__renomearCategoria = aoClicar;   // para o teste e para a tela
})();
