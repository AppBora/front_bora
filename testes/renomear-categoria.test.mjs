// Renomear uma categoria inteira, de uma vez.
//
// POR QUE A TELA EXISTE: a categoria não é um cadastro, é um campo de texto dentro de CADA
// produto. Renomear era abrir produto por produto e redigitar — e uma letra errada em um deles
// faz esse produto virar uma categoria sozinha no cardápio do cliente, separada dos irmãos.
//
// O QUE ESTE TESTE PROTEGE, em ordem de estrago:
//
// 1) O CORPO DO PUT. O servidor grava `custo` e `estoqueMinimo` SEM CONDIÇÃO
//    (ProdutoService.atualizar) — mandar vazio apagaria os dois, e com o custo iriam o CMV e a
//    margem de todos os relatórios. E `imagemUrl`, quando vem preenchido, é gravado: o que a
//    lista devolve é o ENDEREÇO da foto, então devolvê-lo trocaria a foto por um link para si
//    mesma. `estoque` o servidor ignora de propósito, e mandar o número que a tela carregou é
//    pedir para um dia ele voltar a ser gravado por cima das baixas do dia.
//
// 2) NADA É GRAVADO NO PRIMEIRO CLIQUE. A tela descreve o que vai fazer e espera confirmação.
//    Juntar duas categorias não tem desfazer de um clique.
//
// 3) FALHA NO MEIO NÃO VIRA "PRONTO". Parar na metade deixa a loja com duas categorias meio
//    trocadas; dizer que acabou faria o lojista parar de olhar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const TELA = RAIZ + '/assets/js/renomear-categoria.js';

// Produtos com a forma REAL do GET /api/produtos (ProdutoResumo): imagemUrl é o endereço, e
// `custo` vem preenchido para quem pode editar.
const PRODUTOS = [
  { id: 1, nome: 'Ziraçoca',  categoria: 'Best Forever', preco: 30, custo: 11.5,
    estoque: 40, estoqueMinimo: 5, ativo: true, imagemUrl: '/public/loja/18/produto/1/imagem',
    codigoExterno: '' },
  { id: 2, nome: 'Ziraniho',  categoria: 'Best Forever', preco: 30, custo: null,
    estoque: null, estoqueMinimo: null, ativo: true, imagemUrl: null, codigoExterno: '7470' },
  { id: 3, nome: 'Ziratella', categoria: 'Best Forever', preco: 32.9, custo: 12,
    estoque: 7, estoqueMinimo: 2, ativo: false, imagemUrl: '/public/loja/18/produto/3/imagem',
    codigoExterno: '' },
  { id: 4, nome: 'Coca-Cola', categoria: 'Bebidas', preco: 6, custo: 3,
    estoque: 100, estoqueMinimo: 10, ativo: true, imagemUrl: null, codigoExterno: '' },
  { id: 5, nome: 'Avulso',    categoria: '',        preco: 1, custo: null,
    estoque: null, estoqueMinimo: null, ativo: true, imagemUrl: null, codigoExterno: '' },
];

function montar({ produtos = PRODUTOS, falharEm = [] } = {}) {
  const enviados = [];
  const Bora = {
    requireAuth: () => true,
    produtos: async () => JSON.parse(JSON.stringify(produtos)),
    api: async (rota, opcoes) => {
      const id = Number(String(rota).split('/').pop());
      const corpo = JSON.parse(opcoes.body);
      enviados.push({ id, metodo: opcoes.method, corpo });
      if (falharEm.includes(id)) throw new Error('o servidor recusou');
      return { id };
    },
  };
  const t = subir(TELA, { Bora });
  return { ...t, enviados };
}

/** Sobe a tela e deixa a lista carregar. */
async function abrir(opts) {
  const t = montar(opts);
  await t.carregarPagina();
  return t;
}

async function clicar(t) {
  await t.get('catRenomear').__disparar('click');
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

function escolher(t, de, para) {
  t.get('catDe').value = de;
  t.get('catDe').selectedIndex = 1;      // qualquer coisa > 0: a tela usa isto para "tem escolha"
  t.get('catPara').value = para;
}

// ---------------------------------------------------------------- a lista
test('lista as categorias com quantos produtos cada uma tem', async () => {
  const t = await abrir();
  const html = t.get('catDe').innerHTML;
  assert.match(html, /Best Forever \(3 produtos\)/);
  assert.match(html, /Bebidas \(1 produto\)/, 'um produto so nao pode sair como "1 produtos"');
  assert.match(html, /\(sem categoria\)/,
    'produto sem categoria some da lista — e ele aparece como "Outros" para o cliente');
});

// ---------------------------------------------------------------- o primeiro clique
test('PREMISSA: o primeiro clique NAO grava nada', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t);

  assert.equal(t.enviados.length, 0,
    'gravou no primeiro clique: juntar categoria por engano nao tem desfazer');
  assert.match(t.get('catAviso').innerHTML, /3 produtos/);
  assert.match(t.get('catAviso').innerHTML, /Ziraçoca/, 'nao disse QUAIS produtos vai mexer');
  assert.match(t.get('catAviso').innerHTML, /de novo para confirmar/i);
});

test('o segundo clique aplica', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t);
  await clicar(t);

  assert.equal(t.enviados.length, 3, 'esperava um PUT por produto da categoria');
  assert.deepEqual(t.enviados.map((e) => e.id).sort(), [1, 2, 3]);
  assert.ok(t.enviados.every((e) => e.metodo === 'PUT'));
  assert.ok(t.enviados.every((e) => e.corpo.categoria === 'Especialidades da Casa'));
  assert.match(t.get('catAviso').innerHTML, /Pronto/i);
});

test('mexer nos campos entre os cliques CANCELA a confirmacao', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t);

  // o lojista pensou melhor e trocou o nome
  t.get('catPara').value = 'Outra Coisa';
  await t.get('catPara').__disparar('input');
  await clicar(t);

  assert.equal(t.enviados.length, 0,
    'o segundo clique aplicou uma renomeacao diferente da que a tela descreveu');
  assert.match(t.get('catAviso').innerHTML, /Outra Coisa/);
});

// ---------------------------------------------------------------- o corpo do PUT
test('PREMISSA: o PUT nao leva estoque nem imagemUrl', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t); await clicar(t);

  for (const e of t.enviados) {
    assert.ok(!('estoque' in e.corpo),
      'mandou estoque: o servidor ignora hoje, mas mandar e pedir para apagar as baixas do dia');
    assert.ok(!('imagemUrl' in e.corpo),
      'mandou imagemUrl: devolver o ENDERECO da foto troca a foto por um link para si mesma');
  }
});

test('PREMISSA: custo e estoqueMinimo voltam EXATAMENTE como vieram', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t); await clicar(t);

  const porId = Object.fromEntries(t.enviados.map((e) => [e.id, e.corpo]));
  assert.equal(porId[1].custo, 11.5, 'apagou o custo — com ele vao o CMV e a margem');
  assert.equal(porId[3].custo, 12);
  assert.equal(porId[2].custo, null, 'inventou custo num produto que nao tinha');
  assert.equal(porId[1].estoqueMinimo, 5);
  assert.equal(porId[2].estoqueMinimo, null);
});

test('produto fora do cardapio NAO volta a aparecer', async () => {
  // O Ziratella esta com ativo:false. Isto ja foi defeito de verdade nesta tela (item 7.7):
  // editar mandava `ativo: true` fixo, e o produto tirado do cardapio voltava sozinho.
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t); await clicar(t);

  const z = t.enviados.find((e) => e.id === 3).corpo;
  assert.equal(z.ativo, false, 'religou um produto que o lojista tinha tirado do cardapio');
});

test('o codigo do marketplace e preservado', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t); await clicar(t);

  assert.equal(t.enviados.find((e) => e.id === 2).corpo.codigoExterno, '7470',
    'apagou o codigo externo: o pedido do iFood deixa de casar com o produto');
});

test('nome e preco seguem intactos — so a categoria muda', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t); await clicar(t);

  const porId = Object.fromEntries(t.enviados.map((e) => [e.id, e.corpo]));
  assert.equal(porId[3].nome, 'Ziratella');
  assert.equal(porId[3].preco, 32.9);
});

test('produto de OUTRA categoria nao e tocado', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t); await clicar(t);

  assert.ok(!t.enviados.some((e) => e.id === 4), 'mexeu na Coca-Cola, que e de Bebidas');
  assert.ok(!t.enviados.some((e) => e.id === 5), 'mexeu no produto sem categoria');
});

// ---------------------------------------------------------------- juntar duas
test('renomear para um nome que JA EXISTE avisa que vai juntar', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Bebidas');
  await clicar(t);

  assert.equal(t.enviados.length, 0);
  assert.match(t.get('catAviso').innerHTML, /j[áa] existe/i);
  assert.match(t.get('catAviso').innerHTML, /juntar as duas/i);
  assert.match(t.get('catAviso').innerHTML, /n[ãa]o tem como desfazer/i);
});

test('mesmo avisando, confirmar junta — e so os da categoria de origem', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Bebidas');
  await clicar(t); await clicar(t);

  assert.deepEqual(t.enviados.map((e) => e.id).sort(), [1, 2, 3],
    'regravou tambem os produtos que ja estavam em Bebidas');
});

// ---------------------------------------------------------------- recusas
test('sem novo nome, recusa', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', '   ');
  await clicar(t); await clicar(t);
  assert.equal(t.enviados.length, 0);
  assert.match(t.get('catAviso').innerHTML, /novo nome/i);
});

test('novo nome igual ao atual, recusa', async () => {
  const t = await abrir();
  escolher(t, 'Best Forever', 'Best Forever');
  await clicar(t); await clicar(t);
  assert.equal(t.enviados.length, 0);
  assert.match(t.get('catAviso').innerHTML, /igual ao atual/i);
});

test('sem escolher categoria, recusa', async () => {
  const t = await abrir();
  t.get('catDe').value = '';
  t.get('catDe').selectedIndex = 0;
  t.get('catPara').value = 'Qualquer Coisa';
  await clicar(t);
  assert.equal(t.enviados.length, 0);
  assert.match(t.get('catAviso').innerHTML, /escolha a categoria/i);
});

// ---------------------------------------------------------------- falha no meio
test('PREMISSA: falha no meio NAO vira "pronto", e diz quais ficaram para tras', async () => {
  const t = await abrir({ falharEm: [2] });
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t); await clicar(t);

  const av = t.get('catAviso').innerHTML;
  assert.ok(!/Pronto/i.test(av),
    'disse que acabou com um produto para tras: a loja fica com duas categorias meio trocadas');
  assert.match(av, /Renomeei 2 de 3/);
  assert.match(av, /Ziraniho/, 'nao disse QUAL produto ficou para tras');
  assert.match(av, /Rodar de novo/i);
});

test('falha num produto nao impede os outros', async () => {
  const t = await abrir({ falharEm: [1] });
  escolher(t, 'Best Forever', 'Especialidades da Casa');
  await clicar(t); await clicar(t);
  assert.equal(t.enviados.length, 3, 'parou no primeiro erro em vez de seguir');
});
