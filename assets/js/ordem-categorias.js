/**
 * A ordem em que as seções do cardápio aparecem.
 *
 * POR QUE EXISTE
 * As categorias das três lojas da Zirá foram alinhadas aos nomes do cardápio de papel em
 * 28/10/2026. Os nomes ficaram iguais; a ordem não, e não tinha como ficar: as duas telas que
 * mostram categoria ordenavam em A-Z. O papel da loja abre em "Especiais para Compartilhar" — os
 * carros-chefe — e em ordem alfabética o cliente abria o cardápio em "Açaí Fitness", duas bebidas
 * proteicas. A primeira tela é a vitrine, e ela estava sendo sorteada pelo alfabeto.
 *
 * O QUE ELE MANDA
 * A lista INTEIRA, na ordem. Mover uma seção muda a posição de todas as outras: mandar só a que se
 * moveu obrigaria o servidor a adivinhar o estado da tela, e duas abas abertas acabariam com duas
 * seções na mesma posição. Ver CategoriaOrdemService.salvar.
 *
 * O QUE ACONTECE COM QUEM NÃO FOI ORDENADO
 * Nada quebra. Categoria sem posição gravada sai no FIM, em ordem alfabética — que é exatamente o
 * comportamento de antes, e continua valendo para toda loja que nunca abrir este cartão.
 *
 * POR QUE BOTÃO, E NÃO ARRASTAR
 * Porque o lojista mexe nisto do celular, no balcão. Arrastar com o dedo numa lista que rola a
 * página é a interação que mais erra — e errar aqui reordena o cardápio que o cliente está vendo.
 */
(function () {
  if (!Bora.requireAuth()) return;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // O cartão só existe na página de Produtos; em qualquer outra, o script não faz nada.
  if (!$('catOrdem')) return;

  let lista = [];          // [{nome, produtos, posicao, gravada}]
  let mexido = false;      // há mudança na tela que ainda não foi salva?

  function aviso(txt, tipo) {
    const el = $('catOrdemMsg');
    if (!el) return;
    el.textContent = txt || '';
    el.style.color = tipo === 'erro' ? '#b45309' : (tipo === 'ok' ? '#047857' : 'var(--muted)');
  }

  function desenhar() {
    const ol = $('catOrdem');
    if (!lista.length) {
      ol.innerHTML = '<li style="color:var(--muted);list-style:none">Esta loja ainda não tem produto nenhum.</li>';
      $('catOrdemSalvar').disabled = true;
      return;
    }
    $('catOrdemSalvar').disabled = false;
    ol.style.cssText = 'margin:0 0 14px;padding-left:0;list-style:none';
    ol.innerHTML = lista.map((c, i) => {
      const primeiro = i === 0, ultimo = i === lista.length - 1;
      const n = Number(c.produtos) || 0;
      return `<li style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--linha,#e2e8f0);border-radius:10px;margin-bottom:6px">
        <span style="min-width:22px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums">${i + 1}</span>
        <span style="flex:1"><b>${esc(c.nome)}</b>
          <small style="color:#94a3b8"> · ${n} produto${n === 1 ? '' : 's'}</small></span>
        <button class="btn" type="button" data-sobe="${i}" ${primeiro ? 'disabled' : ''}
          aria-label="Subir ${esc(c.nome)}" title="Subir">↑</button>
        <button class="btn" type="button" data-desce="${i}" ${ultimo ? 'disabled' : ''}
          aria-label="Descer ${esc(c.nome)}" title="Descer">↓</button>
      </li>`;
    }).join('');
  }

  function mover(de, para) {
    if (para < 0 || para >= lista.length) return;
    const [item] = lista.splice(de, 1);
    lista.splice(para, 0, item);
    mexido = true;
    desenhar();
    aviso('Ordem mudada na tela. Clique em "Salvar a ordem" para valer no cardápio.');
  }

  async function carregar() {
    try {
      lista = (await Bora.categorias()) || [];
      mexido = false;
      desenhar();
      if (lista.length && !lista.some((c) => c.gravada)) {
        aviso('Hoje elas saem em ordem alfabética — esta loja ainda não escolheu uma ordem.');
      } else {
        aviso('');
      }
    } catch (e) {
      // Tela muda com o botão ligado é a pior combinação: o lojista clicaria em salvar sobre uma
      // lista que não chegou. Sem lista não há ordem para salvar, e o botão diz isso.
      lista = [];
      $('catOrdemSalvar').disabled = true;
      aviso('Não consegui ler as categorias: ' + (e.message || 'falha'), 'erro');
    }
  }

  async function salvar() {
    if (!lista.length) return;
    const botao = $('catOrdemSalvar');
    botao.disabled = true;
    aviso('Salvando…');
    try {
      // O servidor devolve a lista já na ordem que valeu, e é ela que a tela passa a mostrar: se
      // ele tiver descartado algo, o lojista vê o resultado real, não o que ele tinha arrastado.
      lista = (await Bora.salvarOrdemDasCategorias(lista.map((c) => c.nome))) || [];
      mexido = false;
      desenhar();
      aviso('Ordem salva. Já vale no cardápio do cliente e na Frente de Caixa.', 'ok');
    } catch (e) {
      aviso('Não consegui salvar: ' + (e.message || 'falha'), 'erro');
    } finally {
      botao.disabled = false;
    }
  }

  $('catOrdem').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.sobe != null) mover(Number(b.dataset.sobe), Number(b.dataset.sobe) - 1);
    if (b.dataset.desce != null) mover(Number(b.dataset.desce), Number(b.dataset.desce) + 1);
  });
  $('catOrdemSalvar').addEventListener('click', salvar);

  // Sair da página com a ordem mexida e não salva é perder o trabalho em silêncio.
  window.addEventListener('beforeunload', (ev) => {
    if (!mexido) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  carregar();

  // para o teste e para quem precisar recarregar depois de renomear uma categoria
  window.__ordemDeCategorias = { carregar, salvar, mover, lista: () => lista };
})();
