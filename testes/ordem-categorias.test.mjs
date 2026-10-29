// A ordem em que as seções do cardápio aparecem.
//
// POR QUE A TELA EXISTE: em 28/10/2026 as categorias das três lojas da Zirá foram alinhadas aos
// nomes do cardápio de papel. Os nomes ficaram iguais; a ordem não — as duas telas ordenavam em
// A-Z, então o cliente abria o cardápio em "Açaí Fitness", duas bebidas proteicas, enquanto
// "Especiais para Compartilhar" ficava no meio da página.
//
// O QUE ESTE TESTE PROTEGE, em ordem de estrago:
//
// 1) A ORDEM QUE VAI NO PUT. É o produto inteiro desta tela. Mandar a lista embaralhada, ou
//    ordenada de novo no caminho, reordena o cardápio que o cliente está vendo AGORA.
//
// 2) A TELA MOSTRA O QUE O SERVIDOR GRAVOU, não o que o lojista arrastou. Se o servidor
//    descartar algo, quem está olhando tem de ver o resultado real.
//
// 3) FALHA AO SALVAR NÃO VIRA "SALVO". Dizer que salvou faria o lojista fechar a tela e acreditar
//    que o cardápio mudou.
//
// 4) A TELA NÃO REORDENA POR CONTA PRÓPRIA. Quem decide a ordem é o servidor (lá "quem não tem
//    posição vai para o fim, em A-Z"). Se a tela também ordenasse, as duas regras divergiriam e a
//    lista da tela deixaria de ser a do cliente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const TELA = RAIZ + '/assets/js/ordem-categorias.js';

// A forma REAL do GET /api/categorias (CategoriaOrdemService.listar).
const CATEGORIAS = [
  { nome: 'Especiais para Compartilhar', produtos: 3, posicao: 0, gravada: true },
  { nome: 'Açaí Puro', produtos: 4, posicao: 1, gravada: true },
  { nome: 'Bebidas', produtos: 1, posicao: 2, gravada: false },
  { nome: 'Mundo dos Sorvetes', produtos: 3, posicao: 3, gravada: false },
];

function montar({ categorias = CATEGORIAS, falharAoSalvar = false, falharAoLer = false, devolve = null } = {}) {
  const enviados = [];
  const Bora = {
    requireAuth: () => true,
    categorias: async () => {
      if (falharAoLer) throw new Error('sem rede');
      return JSON.parse(JSON.stringify(categorias));
    },
    salvarOrdemDasCategorias: async (nomes) => {
      enviados.push(nomes);
      if (falharAoSalvar) throw new Error('o servidor recusou');
      return devolve || nomes.map((n, i) => ({ nome: n, produtos: 1, posicao: i, gravada: true }));
    },
  };
  // O harness não tem window.addEventListener, e a tela avisa antes de sair com ordem não salva.
  // Dar um window de verdade é melhor que pôr um `if` na tela só para o teste passar.
  const janela = { addEventListener(ev, fn) { (this.__ouvintes[ev] ??= []).push(fn); }, __ouvintes: {},
    open() {}, location: { origin: 'http://t' } };
  const t = subir(TELA, { Bora, globais: { window: janela } });
  return { ...t, enviados, janela };
}

/** Sobe a tela e deixa o carregar() terminar. */
async function abrir(opts) {
  const t = montar(opts);
  await t.carregarPagina();
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return t;
}

async function assentar() { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); }

/** Clica no ↓ da linha `i`, pelo ouvinte de verdade da lista. */
async function descer(t, i) {
  await t.get('catOrdem').__disparar('click', {
    target: { closest: () => ({ dataset: { desce: String(i) } }) },
    preventDefault() {}, stopPropagation() {},
  });
}

async function subirLinha(t, i) {
  await t.get('catOrdem').__disparar('click', {
    target: { closest: () => ({ dataset: { sobe: String(i) } }) },
    preventDefault() {}, stopPropagation() {},
  });
}

const nomesNaTela = (t) => [...t.get('catOrdem').innerHTML.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]);

// ---------------------------------------------------------------- a lista
test('PREMISSA: a tela mostra na ordem que o servidor mandou, sem reordenar', async () => {
  const t = await abrir();

  assert.deepEqual(nomesNaTela(t),
    ['Especiais para Compartilhar', 'Açaí Puro', 'Bebidas', 'Mundo dos Sorvetes'],
    'a tela ordenou por conta propria: quem decide a ordem e o servidor');
});

test('diz quantos produtos cada secao tem, no singular e no plural', async () => {
  const t = await abrir();
  const html = t.get('catOrdem').innerHTML;

  assert.match(html, /Bebidas<\/b>\s*<small[^>]*>\s*· 1 produto</, 'um produto so nao pode sair como "1 produtos"');
  assert.match(html, /Açaí Puro<\/b>\s*<small[^>]*>\s*· 4 produtos</);
});

test('avisa quando a loja nunca escolheu uma ordem', async () => {
  const t = await abrir({ categorias: CATEGORIAS.map((c) => ({ ...c, gravada: false })) });

  assert.match(t.get('catOrdemMsg').textContent, /alfab[ée]tica/i,
    'sem este aviso o lojista acha que a ordem que ele ve foi escolhida por alguem');
});

test('loja sem produto nenhum nao quebra, e o botao de salvar fica desligado', async () => {
  const t = await abrir({ categorias: [] });

  assert.match(t.get('catOrdem').innerHTML, /produto nenhum/i);
  assert.equal(t.get('catOrdemSalvar').disabled, true);
});

// ---------------------------------------------------------------- mover
test('descer troca com a de baixo, e nao grava nada sozinho', async () => {
  const t = await abrir();
  await descer(t, 0);

  assert.deepEqual(nomesNaTela(t),
    ['Açaí Puro', 'Especiais para Compartilhar', 'Bebidas', 'Mundo dos Sorvetes']);
  assert.equal(t.enviados.length, 0, 'mover na tela nao pode gravar: o lojista ainda esta decidindo');
  assert.match(t.get('catOrdemMsg').textContent, /Salvar a ordem/,
    'mexeu e a tela nao avisou que falta salvar');
});

test('subir troca com a de cima', async () => {
  const t = await abrir();
  await subirLinha(t, 2);

  assert.deepEqual(nomesNaTela(t),
    ['Especiais para Compartilhar', 'Bebidas', 'Açaí Puro', 'Mundo dos Sorvetes']);
});

test('a seta que nao faz nada DIZ que nao faz nada', async () => {
  const t = await abrir();
  const linhas = t.get('catOrdem').innerHTML.split('</li>');

  // O APAGADO do botao desabilitado nao e mais testado aqui: virou regra da folha de estilo
  // (`button:disabled` em styles.css), porque o defeito era de TODO botao do painel. Este teste
  // guarda o que e desta tela: a seta certa recebe `disabled`, e o balao explica por que.
  assert.match(linhas[0], /data-sobe="0"[^>]*disabled/,
    'a seta de subir da PRIMEIRA linha tem de nascer desabilitada');
  assert.match(linhas[0], /data-sobe="0"[^>]*title="Já é a primeira"/);
  assert.doesNotMatch(linhas[0], /data-desce="0"[^>]*disabled/,
    'desabilitou a seta de descer da primeira linha, que funciona');

  const ultima = linhas[linhas.length - 2];
  assert.match(ultima, /data-desce="3"[^>]*disabled/);
  assert.match(ultima, /data-desce="3"[^>]*title="Já é a última"/);
});

test('o primeiro nao sobe e o ultimo nao desce', async () => {
  const t = await abrir();
  await subirLinha(t, 0);
  await descer(t, 3);

  assert.deepEqual(nomesNaTela(t),
    ['Especiais para Compartilhar', 'Açaí Puro', 'Bebidas', 'Mundo dos Sorvetes'],
    'mover para fora da lista reordenou ou perdeu uma secao');
});

// ---------------------------------------------------------------- salvar
test('PREMISSA: salva a lista INTEIRA, na ordem que esta na tela', async () => {
  const t = await abrir();
  await descer(t, 0);
  await t.get('catOrdemSalvar').__disparar('click');
  await assentar();

  assert.equal(t.enviados.length, 1);
  assert.deepEqual(t.enviados[0],
    ['Açaí Puro', 'Especiais para Compartilhar', 'Bebidas', 'Mundo dos Sorvetes'],
    'mandou a ordem errada: isso reordena o cardapio que o cliente esta vendo');
});

test('depois de salvar, a tela mostra o que o SERVIDOR devolveu', async () => {
  const t = await abrir({
    devolve: [
      { nome: 'Bebidas', produtos: 1, posicao: 0, gravada: true },
      { nome: 'Açaí Puro', produtos: 4, posicao: 1, gravada: true },
    ],
  });
  await t.get('catOrdemSalvar').__disparar('click');
  await assentar();

  assert.deepEqual(nomesNaTela(t), ['Bebidas', 'Açaí Puro'],
    'a tela ficou com a lista dela: se o servidor descartar algo, o lojista nao fica sabendo');
  assert.match(t.get('catOrdemMsg').textContent, /salva/i);
});

test('falha ao salvar NAO vira "salvo"', async () => {
  const t = await abrir({ falharAoSalvar: true });
  await descer(t, 0);
  await t.get('catOrdemSalvar').__disparar('click');
  await assentar();

  const msg = t.get('catOrdemMsg').textContent;
  assert.match(msg, /recusou|não consegui/i);
  // /salva/i casaria dentro de "Não consegui SALVAr" -- o assert frouxo reprovava a tela certa.
  assert.doesNotMatch(msg, /ordem salva/i, 'disse que salvou depois de falhar');
  assert.equal(t.get('catOrdemSalvar').disabled, false, 'o botao ficou travado depois do erro');
});

test('falha ao LER as categorias aparece na tela', async () => {
  const t = await abrir({ falharAoLer: true });

  // Tela muda e botao ligado e a pior combinacao: o lojista clica em salvar e manda uma lista
  // vazia por cima da ordem que a loja ja tinha.
  assert.match(t.get('catOrdemMsg').textContent, /não consegui ler/i);
  assert.equal(t.get('catOrdemSalvar').disabled, true);
});

// ---------------------------------------------------------------- sair sem salvar
test('sair da pagina com ordem mexida pede confirmacao', async () => {
  const t = await abrir();
  await descer(t, 0);

  const ouvintes = t.janela.__ouvintes.beforeunload || [];
  assert.equal(ouvintes.length, 1, 'a tela nao avisa quem sai com a ordem nao salva');
  let impediu = false;
  ouvintes[0]({ preventDefault: () => { impediu = true; } });
  assert.equal(impediu, true);
});

test('sair sem ter mexido NAO pede confirmacao', async () => {
  const t = await abrir();

  let impediu = false;
  (t.janela.__ouvintes.beforeunload || [])[0]({ preventDefault: () => { impediu = true; } });
  assert.equal(impediu, false, 'avisar sem motivo ensina o lojista a ignorar o aviso');
});
