/**
 * Importar insumos em lote.
 *
 * POR QUE EXISTE
 * A tela cadastra um insumo por vez. Uma açaiteria tem copo de 300, 500 e 770, pote, barca,
 * roleta, polpa, granola, leite condensado, leite em pó e mais vinte adicionais — perto de
 * quarenta linhas. Na mão é meia hora de clique, e o erro de digitação não aparece: ele vira um
 * insumo repetido com nome quase igual, e a ficha técnica do produto aponta para o errado.
 *
 * O FORMATO
 * `nome ; unidade ; custo` — custo é opcional. A unidade tem de ser uma das que o cadastro aceita
 * (un, kg, g, L, ml); qualquer outra coisa é recusada na conferência, porque o servidor aceitaria
 * calado e o insumo ficaria com uma unidade que nenhuma tela entende.
 *
 * O ESTOQUE NASCE SEM CONTAGEM (nulo), E ANTES NASCIA EM ZERO
 * O pedido foi "deixa com zero mas deixa cadastrado", e eu gravava `estoque: 0`. Estava errado, e
 * o cabeçalho antigo deste arquivo já descrevia o motivo sem que eu tirasse a conclusão:
 *
 * `0` significa "não tem nenhum" e **bloqueia a venda** — assim que o insumo entra numa ficha, o
 * cardápio marca o produto como esgotado (`InsumoService.fichaDaParaFazer`). `NULL` significa
 * "esta loja não controla o estoque deste item" e não bloqueia nada: a ficha pula a linha.
 *
 * Na importação, a verdade é NULL. A loja tem a mercadoria na prateleira; o que ela não tem é a
 * contagem. Gravar zero afirma o contrário, e a afirmação fica inofensiva só até a primeira ficha
 * ser salva — aí apaga o cardápio inteiro para o cliente final, sem erro nenhum na tela.
 *
 * Medido na Zirá em 24/10/2026: 43 insumos, 42 em zero por causa desta linha.
 *
 * O item aparece na tela de Estoque como SEM CONTAGEM, que é a lista de tarefas da loja; digitar a
 * contagem lá liga o controle, e apagar o campo desliga.
 *
 * O QUE JÁ EXISTE NÃO É TOCADO
 * Insumo repetido quebra a ficha técnica, e custo é dado de dono: se o nome já está lá, esta tela
 * não cria de novo nem regrava o custo — ela diz que pulou, e você decide na mão.
 */
(function () {
  if (!Bora.requireAuth()) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

  if (!$('insImpTexto')) return;   // só existe na tela de Insumos

  const UNIDADES = ['un', 'kg', 'g', 'L', 'ml'];
  let lote = [];

  /**
   * O preço como o lojista escreveu.
   *
   * Mesma regra do import de cardápio (item 7.6): o ÚLTIMO separador é o decimal. Sem isso
   * "12.50" entrava como R$ 1.250,00 — cem vezes mais caro — e o import roda justamente quando
   * alguém cola uma planilha, que pode vir em qualquer um dos dois padrões.
   */
  function preco(bruto) {
    const limpo = String(bruto == null ? '' : bruto).replace(/[R$\s]/g, '');
    if (!limpo) return 0;
    const corte = Math.max(limpo.lastIndexOf(','), limpo.lastIndexOf('.'));
    if (corte < 0) return Number(limpo);
    const depois = limpo.slice(corte + 1);
    const tipos = new Set(limpo.match(/[.,]/g) || []);
    if (tipos.size === 1 && depois.length === 3) return Number(limpo.replace(/[.,]/g, ''));
    return Number(limpo.slice(0, corte).replace(/[.,]/g, '') + '.' + depois);
  }

  function parse(texto) {
    const itens = [], erros = [];
    String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((linha, n) => {
      const p = linha.split(/[;|\t]/).map((x) => x.trim());
      const nome = p[0];
      if (!nome) { erros.push('linha ' + (n + 1) + ': faltou o nome'); return; }

      const unidade = (p[1] || 'un');
      // A unidade errada o servidor aceitaria calado, e o insumo ficaria com uma unidade que
      // nenhuma tela sabe mostrar nem somar.
      const casa = UNIDADES.find((u) => u.toLowerCase() === unidade.toLowerCase());
      if (!casa) {
        erros.push('linha ' + (n + 1) + ': unidade "' + unidade + '" não existe — use '
          + UNIDADES.join(', '));
        return;
      }

      const custo = p.length >= 3 ? preco(p[2]) : 0;
      if (!isFinite(custo) || custo < 0) {
        erros.push('linha ' + (n + 1) + ': custo inválido "' + p[2] + '"');
        return;
      }
      itens.push({ nome, unidade: casa, custo, estoque: null, estoqueMinimo: null });
    });
    return { itens, erros };
  }

  let existentes = [];
  const jaExiste = (nome) => existentes.find(
    (i) => String(i.nome || '').trim().toLowerCase() === String(nome).trim().toLowerCase()) || null;

  function separar(itens) {
    const novos = [], pulados = [], repetidosNaLista = [];
    const vistos = new Set();
    for (const i of itens) {
      const chave = i.nome.trim().toLowerCase();
      if (vistos.has(chave)) { repetidosNaLista.push(i); continue; }
      vistos.add(chave);
      if (jaExiste(i.nome)) pulados.push(i); else novos.push(i);
    }
    return { novos, pulados, repetidosNaLista };
  }

  async function recarregar() {
    try { existentes = (await Bora.api('/api/insumos')) || []; } catch (e) { existentes = []; }
  }

  function conferir() {
    const r = parse($('insImpTexto').value);
    lote = r.itens;
    const s = separar(lote);
    $('insImpPreview').style.display = 'block';
    $('insImpPreview').innerHTML =
      '<b>' + s.novos.length + ' a cadastrar · ' + s.pulados.length + ' já existe'
      + (s.repetidosNaLista.length ? ' · ' + s.repetidosNaLista.length + ' repetido na lista' : '')
      + '</b>'
      + (r.erros.length ? '<div style="color:#dc2626;margin-top:6px">' + r.erros.length
          + ' linha(s) com problema:<br>' + r.erros.map(esc).join('<br>') + '</div>' : '')
      + (s.repetidosNaLista.length ? '<div style="color:#b45309;margin-top:6px">Repetidos na sua '
          + 'lista (só o primeiro entra): '
          + s.repetidosNaLista.map((i) => esc(i.nome)).join(', ') + '</div>' : '')
      + (s.pulados.length ? '<div style="color:#b45309;margin-top:6px">Já cadastrados, não vou '
          + 'tocar (nem no custo): ' + s.pulados.map((i) => esc(i.nome)).join(', ') + '</div>' : '')
      + '<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0">'
      + s.novos.map((i) => '<div style="color:#166534">➕ <b>' + esc(i.nome) + '</b> · '
          + esc(i.unidade) + (i.custo ? ' · ' + money(i.custo) + '/' + esc(i.unidade) : '')
          + ' · sem contagem</div>').join('');
    $('insImpMsg').textContent = '';
  }

  async function importar() {
    // O BOTAO NAO PODE MORRER CALADO. Ele nascia `disabled` e so ligava depois do Conferir:
    // quem colava a lista e clicava direto em Cadastrar via a tela nao fazer NADA, sem uma
    // palavra. Agora ele confere sozinho, e quando nao ha o que fazer, ele diz por que.
    if (!lote.length) conferir();
    const s = separar(lote);
    if (!s.novos.length) {
      $('insImpMsg').style.color = '#b45309';
      $('insImpMsg').textContent = lote.length
        ? 'Nada a cadastrar: todos os ' + lote.length + ' da lista já existem.'
        : 'Cole a lista na caixa acima primeiro.';
      return;
    }
    if (!confirm('Cadastrar ' + s.novos.length + ' insumo(s) nesta loja?\n\n'
        + 'Eles entram SEM CONTAGEM (e não em zero): aparecem na tela de Estoque como '
        + '"SEM CONTAGEM" e não bloqueiam venda nenhuma. Zero diria "não tem nenhum" e apagaria o '
        + 'produto do cardápio assim que a ficha técnica existisse.')) return;

    $('insImpCriar').disabled = true;
    let ok = 0; const falhas = [];
    for (const item of s.novos) {
      try {
        await Bora.api('/api/insumos', { method: 'POST', body: JSON.stringify(item) });
        ok++;
      } catch (e) { falhas.push(item.nome + ': ' + (e && e.message || e)); }
      $('insImpMsg').style.color = 'var(--muted)';
      $('insImpMsg').textContent = 'cadastrando… ' + (ok + falhas.length) + '/' + s.novos.length;
    }

    $('insImpMsg').style.color = falhas.length ? '#b45309' : '#166534';
    $('insImpMsg').textContent = ok + ' de ' + s.novos.length + ' cadastrado(s)'
      + (falhas.length ? ' · ' + falhas.length + ' falharam' : ' ✓');
    if (falhas.length) {
      // Dizer "pronto" com falha no meio deixaria a ficha tecnica apontando para insumo que nao
      // existe, e isso so aparece quando alguem vende.
      $('insImpPreview').innerHTML = '<span style="color:#dc2626"><b>Estes não entraram:</b><br>'
        + falhas.map(esc).join('<br>')
        + '<br><br>Conferir e cadastrar de novo refaz só o que falta.</span>';
    } else {
      $('insImpPreview').style.display = 'none';
      $('insImpTexto').value = '';
      lote = [];
    }
    $('insImpCriar').disabled = false;
    await recarregar();
    if (window.__recarregarInsumos) await window.__recarregarInsumos();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    $('insImpConferir').addEventListener('click', conferir);
    $('insImpCriar').addEventListener('click', importar);
    await recarregar();
  });
})();
