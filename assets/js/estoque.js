// Controle de estoque — produtos E insumos, alertas de ruptura/mínimo e ajuste rápido.
//
// ANTES reusava o PUT /api/produtos, mandando o cadastro inteiro de volta a cada ajuste. Dois
// defeitos nisso: (1) o cadastro que esta tela conhece não tem todos os campos, então cada ajuste
// apagava o que ela não sabe que existe — o código do marketplace, por exemplo; (2) o "+1" era
// calculado no NAVEGADOR, a partir da lista carregada minutos antes, e gravado como valor absoluto:
// clicar "+1" às 21h com a lista de 18h gravava o saldo de 18h mais um, e as vendas da noite sumiam.
//
// Agora usa o PUT /api/{produtos|insumos}/{id}/estoque, que mexe NUMA coluna e soma no banco.
//
// POR QUE O INSUMO ENTROU AQUI (24/10/2026)
// Esta tela lia só produtos. Numa açaiteria, porém, o que se estoca é copo, água, leite
// condensado e polpa — e isso são INSUMOS. A tela chamada "Estoque" mostrava justamente o que a
// loja NÃO estoca, e o lojista cadastrava 43 insumos para não ver nenhum deles aqui.
//
// As duas coisas convivem na mesma lista, marcadas, porque a pergunta do lojista é uma só: o que
// está acabando? Separar em duas telas faz ele ter de lembrar em qual procurar.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let linhas = [];

  /**
   * Insumo tem casa decimal; produto não.
   *
   * O insumo é medido em kg e L — 2,5 kg de granola é um número legítimo. Mostrar e gravar isso
   * como inteiro truncaria meio quilo a cada contagem. Já o produto é contado em peça.
   */
  const ehInsumo = l => l.tipo === 'insumo';
  const numero = l => ehInsumo(l) ? Number(l.estoque) : parseInt(l.estoque, 10);

  /**
   * NÃO CONTADO não é ZERO — e a tela tratava os dois como a mesma coisa.
   *
   * No banco são estados diferentes, e o cardápio depende da diferença:
   * `estoque = 0` é "não tem nenhum" e **bloqueia a venda** (o produto sai `esgotado` no cardápio
   * público assim que existe ficha); `estoque = NULL` é "esta loja não controla o estoque deste
   * item" e **não bloqueia nada** — o `fichaDaParaFazer` pula a linha de propósito.
   *
   * Medido na Zirá em 24/10/2026: 43 insumos cadastrados, 42 com `estoque = 0` porque o importador
   * gravava zero fixo. Eram 42 itens que a loja TEM na prateleira, marcados como "não tem nenhum".
   * Enquanto não havia ficha, inofensivo. Na hora de montar as fichas, isso apagaria o cardápio
   * inteiro para o cliente final — sem nenhum erro na tela do lojista.
   *
   * E os `NULL` nem apareciam aqui: a lista filtrava `estoque != null`, então o caminho honesto
   * ("não contei ainda") era invisível, e o único estado visível era a mentira.
   */
  const semContagem = l => l.estoque == null;
  const mostra = (l) => {
    if (semContagem(l)) return '';
    const n = Number(l.estoque);
    if (!ehInsumo(l)) return String(n);
    // 3 casas é o que a coluna aceita; corta o zero à direita para não poluir ("2,5" e não "2,500")
    return n.toFixed(3).replace(/\.?0+$/, '').replace('.', ',') || '0';
  };

  window.__ajustar = async (tipo, id, delta) => {
    // O delta vai para o servidor; a conta é do banco. Antes era `(p.estoque || 0) + delta` aqui, com
    // o `p` de uma lista que pode ter minutos de idade.
    try {
      if (tipo === 'insumo') await Bora.ajustarEstoqueInsumo(id, delta);
      else await Bora.ajustarEstoqueProduto(id, delta);
      carregar();
    } catch (e) { alert(e.message); carregar(); }
  };

  window.__definir = async (tipo, id, valor) => {
    // Campo APAGADO = "para de controlar o estoque deste insumo". O servidor já entende isso
    // (`MexerNoEstoqueRequest`: "quantidade null quer dizer para de controlar estoque, que é o
    // 'vazio = não controla' da tela"), mas nenhuma tela conseguia mandar: aqui o `Math.max(0, v)`
    // e o `isNaN` barravam, então o vazio só era descartado em silêncio. Era uma capacidade
    // documentada e inalcançável.
    //
    // É o caminho de saída do zero mentiroso: o lojista apaga o campo e o item passa a dizer
    // "não contei" em vez de "não tenho" — e para de apagar o produto do cardápio.
    //
    // Só para insumo. Produto com estoque nulo some desta lista (são 123 na produção, a maioria
    // não controla estoque), e apagar o campo faria a linha desaparecer sem explicação.
    if (tipo === 'insumo' && String(valor).trim() === '') {
      try { await Bora.definirEstoqueInsumo(id, null); carregar(); }
      catch (e) { alert(e.message); carregar(); }
      return;
    }
    // Vírgula é como o lojista escreve, e é o que o teclado do celular oferece em pt-BR.
    const v = tipo === 'insumo'
      ? parseFloat(String(valor).replace(',', '.'))
      : parseInt(valor, 10);
    if (isNaN(v)) return;
    // Valor absoluto: o lojista está dizendo quanto tem. Vence mesmo que tenha havido venda entre a
    // leitura da tela e o clique — ele olhou a prateleira.
    try {
      if (tipo === 'insumo') await Bora.definirEstoqueInsumo(id, Math.max(0, v));
      else await Bora.definirEstoqueProduto(id, Math.max(0, v));
      carregar();
    } catch (e) { alert(e.message); carregar(); }
  };

  function status(l) {
    if (semContagem(l)) {
      return '<span class="st" style="background:#f1f5f9;color:#475569">SEM CONTAGEM</span>';
    }
    const n = Number(l.estoque);
    if (n <= 0) return '<span class="st off">RUPTURA</span>';
    if (l.estoqueMinimo != null && n <= Number(l.estoqueMinimo)) {
      return '<span class="st" style="background:#fef3c7;color:#92400e">BAIXO</span>';
    }
    return '<span class="st on">OK</span>';
  }

  const selo = l => ehInsumo(l)
    ? '<span style="background:#eef2ff;color:#4338ca;border-radius:4px;padding:1px 5px;font-size:11px;font-weight:700">INSUMO</span>'
    : '<span style="background:#f1f5f9;color:#475569;border-radius:4px;padding:1px 5px;font-size:11px;font-weight:700">PRODUTO</span>';

  async function carregar() {
    try {
      // As duas chamadas juntas: a tela não serve para nada com metade da resposta, e em série
      // ela demoraria o dobro no celular da loja.
      const [produtos, insumos] = await Promise.all([
        Bora.produtos(),
        // Insumo é tela de GERENTE para cima. Se a conta não puder ver, a tela segue mostrando os
        // produtos em vez de morrer inteira.
        Bora.insumos().catch(() => []),
      ]);

      linhas = [
        ...produtos.filter(p => p.estoque != null).map(p => ({
          tipo: 'produto', id: p.id, nome: p.nome, sub: p.categoria || '',
          estoque: p.estoque, estoqueMinimo: p.estoqueMinimo, custo: p.custo,
        })),
        // Insumo entra MESMO sem contagem (estoque nulo). O filtro `estoque != null` que estava
        // aqui escondia exatamente os itens que faltam contar — e era isso que o lojista vinha
        // procurar nesta tela. Produto segue filtrado: produto sem controle de estoque é o caso
        // normal (123 na produção), e listar todos afogaria a tela.
        ...(insumos || []).map(i => ({
          tipo: 'insumo', id: i.id, nome: i.nome, sub: i.unidade || 'un',
          estoque: i.estoque, estoqueMinimo: i.estoqueMinimo, custo: i.custo,
        })),
      ];

      // Os três números só falam de quem TEM contagem. Somar o nulo como zero diria que o estoque
      // vale R$ 0,00 e que há 42 rupturas numa loja cheia de mercadoria.
      const contados = linhas.filter(l => !semContagem(l));
      const valor = contados.reduce((s, l) => s + Number(l.estoque || 0) * Number(l.custo || 0), 0);
      const baixo = contados.filter(l => Number(l.estoque) > 0 && l.estoqueMinimo != null
        && Number(l.estoque) <= Number(l.estoqueMinimo)).length;
      const ruptura = contados.filter(l => Number(l.estoque) <= 0).length;
      const semContar = linhas.length - contados.length;
      $('kValor').textContent = money(valor);
      $('kBaixo').textContent = baixo;
      $('kRuptura').textContent = ruptura;
      if ($('kSemContagem')) $('kSemContagem').textContent = semContar;

      // ordena: ruptura e baixo primeiro
      const ord = [...linhas].sort((a, b) => peso(a) - peso(b)
        || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

      $('lista').innerHTML = ord.length ? ord.map(l => {
        const passo = ehInsumo(l) ? 1 : 1;
        // Sem contagem, os botões +/− não têm de onde somar: o servidor recusa com 409 ("não
        // controla estoque. Informe uma quantidade inicial antes de usar os botões de ajuste").
        // Mostrá-los seria convidar o lojista a levar um erro. O caminho é digitar a contagem no
        // campo, que é o que o texto do campo pede.
        const ajuste = semContagem(l) ? '' : `
            <button onclick="__ajustar('${l.tipo}',${l.id},-${passo})">−</button>`;
        const mais = semContagem(l) ? '' : `
            <button onclick="__ajustar('${l.tipo}',${l.id},${passo})">+</button>
            <button onclick="__ajustar('${l.tipo}',${l.id},10)" style="background:#ecfdf5;color:#059669">+10</button>`;
        return `<tr><td>${selo(l)} <b>${esc(l.nome)}</b><br><small style="color:#94a3b8">${esc(l.sub)}</small></td>
          <td>${semContagem(l)
            ? '<span style="color:#94a3b8">não contado</span>'
            : '<b style="font-size:16px">' + mostra(l) + '</b>'
              + (ehInsumo(l) ? ' <small style="color:#94a3b8">' + esc(l.sub) + '</small>' : '')}</td>
          <td>${l.estoqueMinimo == null ? '—' : mostra({ tipo: l.tipo, estoque: l.estoqueMinimo, sub: l.sub })}</td>
          <td>${status(l)}</td>
          <td><div class="qty">${ajuste}
            <input style="width:70px;text-align:center;padding:6px;border:1px solid #e5e7eb;border-radius:8px"
              value="${mostra(l)}" placeholder="${semContagem(l) ? 'contar' : 'apagar p/ não controlar'}"
              title="${ehInsumo(l) ? 'Digite a contagem. Deixar VAZIO = este insumo não controla estoque.' : 'Digite a contagem.'}"
              onchange="__definir('${l.tipo}',${l.id},this.value)">${mais}
          </div></td></tr>`;
      }).join('')
        : '<tr><td colspan="5" style="color:#94a3b8">Nenhum insumo cadastrado e nenhum produto com '
          + 'estoque controlado. Cadastre os <b>Insumos</b> (copo, polpa, leite condensado) ou '
          + 'defina o estoque em <b>Produtos</b>.</td></tr>';
    } catch (e) { $('lista').innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${e.message}</td></tr>`; }
  }
  // Ordem do que precisa de ação: ruptura de verdade primeiro (está bloqueando venda), depois o
  // que falta contar (é a lista de tarefas da loja), depois o que está baixo, e o resto por último.
  // Sem a linha do `semContagem`, o nulo cairia no `Number(null) <= 0` e se misturaria à ruptura —
  // a mesma confusão que esta tela tinha.
  const peso = l => semContagem(l) ? 1
    : (Number(l.estoque) <= 0 ? 0
      : (l.estoqueMinimo != null && Number(l.estoque) <= Number(l.estoqueMinimo) ? 2 : 3));

  document.addEventListener('DOMContentLoaded', carregar);
})();
