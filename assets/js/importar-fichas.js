/**
 * Importar fichas técnicas em lote.
 *
 * POR QUE EXISTE
 * A ficha se monta produto a produto, no 🧪, marcando insumo por insumo. Uma açaiteria com 35
 * produtos e 43 insumos são centenas de cliques — e enquanto a ficha não existe, **vender não
 * baixa nada do estoque**: o sistema cai no estoque do próprio produto, que numa loja assim não
 * é controlado.
 *
 * O FORMATO
 * Uma linha por ingrediente: `Produto ; Insumo ; Quantidade`. As linhas do mesmo produto formam
 * a ficha dele.
 *
 *   Copo de Açaí 300ml ; Polpa de Açaí ; 0,3
 *   Copo de Açaí 300ml ; Copo 300ml ; 1
 *   Copo de Açaí 300ml ; Tampa 300ml ; 1
 *
 * A QUANTIDADE É POR UMA UNIDADE DO PRODUTO, na unidade do insumo. Polpa em kg, copo em peça.
 * Vender 2 copos baixa o dobro — essa conta é do servidor.
 *
 * O QUE MAIS IMPORTA AQUI: O PUT SUBSTITUI A FICHA INTEIRA
 * `salvarFicha` apaga a ficha atual e grava a nova (`InsumoService.java:152`). Então um produto
 * que já tem ficha e aparece na lista com menos linhas **perde o resto, em silêncio**. Por isso
 * a conferência mostra, para cada produto que já tem ficha, quantas linhas ele tem hoje e
 * quantas vai passar a ter — e exige um segundo clique.
 *
 * NOME, NÃO ID
 * O lojista escreve o nome que vê na tela. Nome que não existe é RECUSADO na conferência, e não
 * ignorado: uma linha engolida vira um ingrediente que nunca baixa do estoque, e isso só aparece
 * no inventário do fim do mês.
 */
(function () {
  if (!Bora.requireAuth()) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  if (!$('fiTexto')) return;   // só existe na tela de Produtos

  let produtos = [], insumos = [], fichasAtuais = new Map(), confirmando = false;

  const chave = (s) => String(s == null ? '' : s).trim().toLowerCase();

  /** Quantidade como o lojista escreve: vírgula é o separador decimal em pt-BR. */
  function quantidade(bruto) {
    const limpo = String(bruto == null ? '' : bruto).trim().replace(',', '.');
    if (!/^\d*\.?\d+$/.test(limpo)) return NaN;
    return Number(limpo);
  }

  function parse(texto) {
    // Linha que começa com # é COMENTÁRIO, e não linha recusada. Serve para o rascunho vir com a
    // parte certa pronta para colar e a parte que depende da loja marcada ao lado — quem preenche
    // tira o #. Sem isso, colar o rascunho só geraria uma lista de erros.
    const cruas = String(texto || '').split('\n');
    const linhas = [];
    const numeros = [];
    cruas.forEach((l, i) => {
      const t = l.trim();
      // O número que aparece no erro é o da linha NO TEXTO COLADO, contando comentário e linha em
      // branco: apontar "linha 1" quando o lojista conta 3 no editor manda ele procurar no lugar
      // errado.
      if (t && !t.startsWith('#')) { linhas.push(t); numeros.push(i + 1); }
    });

    const porProduto = new Map();
    const erros = [];

    linhas.forEach((linha, n) => {
      const num = numeros[n];
      const p = linha.split(/[;|\t]/).map((x) => x.trim());
      if (p.length < 3) { erros.push('linha ' + num + ': faltou campo — use Produto ; Insumo ; Quantidade'); return; }

      const prod = produtos.find((x) => chave(x.nome) === chave(p[0]));
      if (!prod) { erros.push('linha ' + num + ': não existe o produto "' + p[0] + '"'); return; }

      const ins = insumos.find((x) => chave(x.nome) === chave(p[1]));
      if (!ins) { erros.push('linha ' + num + ': não existe o insumo "' + p[1] + '"'); return; }

      const q = quantidade(p[2]);
      if (!isFinite(q) || q <= 0) {
        erros.push('linha ' + num + ': quantidade inválida "' + p[2] + '"');
        return;
      }

      if (!porProduto.has(prod.id)) porProduto.set(prod.id, { produto: prod, itens: [] });
      const alvo = porProduto.get(prod.id);
      // O mesmo insumo duas vezes no mesmo produto: SOMA, em vez de uma linha vencer a outra em
      // silêncio. "Leite Condensado 1" e "Leite Condensado 2" viram 3, que é o que o lojista quis
      // dizer ao escrever as duas.
      const jaTem = alvo.itens.find((i) => i.insumoId === ins.id);
      if (jaTem) jaTem.quantidade += q;
      else alvo.itens.push({ insumoId: ins.id, nome: ins.nome, unidade: ins.unidade, quantidade: q });
    });

    return { porProduto, erros };
  }

  function aviso(html, cor) {
    const el = $('fiPreview');
    el.style.display = 'block';
    el.innerHTML = html;
    el.style.borderLeft = '4px solid ' + (cor === 'erro' ? '#dc2626' : cor === 'ok' ? '#059669' : '#f59e0b');
  }

  /**
   * So a conta, sem mexer na tela.
   *
   * Separado do `conferir` porque o `gravar` precisa dos mesmos grupos -- e quando ele chamava o
   * `conferir`, este zerava o `confirmando` logo na primeira linha: o segundo clique voltava a
   * pedir confirmacao, e a ficha NUNCA era gravada. O teste pegou isso.
   */
  function calcular() {
    const r = parse($('fiTexto').value);
    return { grupos: [...r.porProduto.values()], erros: r.erros };
  }

  function conferir() {
    confirmando = false;
    const r = calcular();
    const grupos = r.grupos;
    $('fiCriar').disabled = false;

    const substituidos = grupos.filter((g) => (fichasAtuais.get(g.produto.id) || 0) > 0);

    aviso(
      '<b>' + grupos.length + ' produto(s) vão ficar com ficha técnica</b>'
      + (r.erros.length
        ? '<div style="color:#dc2626;margin-top:6px"><b>' + r.erros.length
          + ' linha(s) recusada(s):</b><br>' + r.erros.map(esc).join('<br>')
          + '<br><i>Linha recusada não entra. Corrija antes, senão o ingrediente nunca baixa do '
          + 'estoque — e isso só aparece no inventário do fim do mês.</i></div>'
        : '')
      + (substituidos.length
        ? '<div style="color:#b45309;margin-top:8px"><b>Atenção:</b> estes já têm ficha, e a ficha '
          + 'atual será <b>substituída inteira</b>:<br>'
          + substituidos.map((g) => '&bull; ' + esc(g.produto.nome) + ' — tem '
            + fichasAtuais.get(g.produto.id) + ' ingrediente(s) hoje, vai ficar com '
            + g.itens.length).join('<br>')
          + '</div>'
        : '')
      + '<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0">'
      + grupos.map((g) => '<div style="margin-bottom:6px"><b>' + esc(g.produto.nome) + '</b><br>'
        + g.itens.map((i) => '&nbsp;&nbsp;' + esc(i.nome) + ' — <b>'
          + String(i.quantidade).replace('.', ',') + ' ' + esc(i.unidade) + '</b>').join('<br>')
        + '</div>').join(''),
      r.erros.length ? 'erro' : 'aviso');

    $('fiMsg').textContent = grupos.length ? 'Confira e clique em Gravar fichas.' : '';
    return { grupos, erros: r.erros };
  }

  async function gravar() {
    const { grupos } = calcular();
    if (!grupos.length) {
      $('fiMsg').style.color = '#b45309';
      $('fiMsg').textContent = 'Nada para gravar: cole a lista acima.';
      return;
    }
    if (!confirmando) {
      confirmando = true;
      $('fiMsg').style.color = '#b45309';
      $('fiMsg').textContent = 'Clique em Gravar fichas de novo para confirmar.';
      return;
    }

    $('fiCriar').disabled = true;
    let ok = 0; const falhas = [];
    for (const g of grupos) {
      try {
        await Bora.salvarFicha(g.produto.id,
          g.itens.map((i) => ({ insumoId: i.insumoId, quantidade: i.quantidade })));
        ok++;
      } catch (e) { falhas.push(g.produto.nome + ': ' + (e && e.message || e)); }
      $('fiMsg').style.color = 'var(--muted)';
      $('fiMsg').textContent = 'gravando… ' + (ok + falhas.length) + '/' + grupos.length;
    }

    confirmando = false;
    $('fiCriar').disabled = false;
    $('fiMsg').style.color = falhas.length ? '#b45309' : '#166534';
    $('fiMsg').textContent = ok + ' de ' + grupos.length + ' ficha(s) gravada(s)'
      + (falhas.length ? ' · ' + falhas.length + ' falharam' : ' ✓');
    if (falhas.length) {
      // Dizer "pronto" com falha no meio deixaria parte do cardapio vendendo sem baixar insumo.
      aviso('<span style="color:#dc2626"><b>Estas não gravaram:</b><br>'
        + falhas.map(esc).join('<br>')
        + '<br><br>Conferir e gravar de novo refaz só o que falta.</span>', 'erro');
    } else {
      $('fiPreview').style.display = 'none';
      $('fiTexto').value = '';
    }
    await recarregar();
  }

  async function recarregar() {
    try {
      [produtos, insumos] = await Promise.all([Bora.produtos(), Bora.insumos()]);
      // Quantos ingredientes cada produto tem HOJE: é o que deixa a conferência avisar que a
      // ficha vai ser substituída, em vez de o lojista descobrir depois.
      fichasAtuais = new Map();
      for (const p of produtos) {
        try {
          const f = await Bora.ficha(p.id);
          if (f && f.length) fichasAtuais.set(p.id, f.length);
        } catch (e) { /* produto sem ficha, ou sem permissão: segue */ }
      }
      $('fiResumo').textContent = produtos.length + ' produtos · ' + insumos.length
        + ' insumos · ' + fichasAtuais.size + ' com ficha hoje';
    } catch (e) {
      $('fiMsg').style.color = '#b91c1c';
      $('fiMsg').textContent = 'Não consegui carregar produtos e insumos: ' + (e && e.message || e);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('fiConferir').addEventListener('click', conferir);
    $('fiCriar').addEventListener('click', gravar);
    $('fiTexto').addEventListener('input', () => { confirmando = false; });
    await recarregar();
  });
})();
