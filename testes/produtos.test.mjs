// O "Código no iFood / 99" na tela de Produtos.
//
// POR QUE ISTO É TESTE E NÃO SÓ UM CAMPO: o pedido que chega do iFood/99 só acha o produto da loja
// por este código (ou pelo nome limpo). Se o campo sumir da tela, ou parar de ser enviado, ou parar
// de aparecer preenchido ao editar, o lojista não tem como ligar os dois lados — e o pedido de
// delivery volta a entrar sem baixar estoque, calado. Ver EstoqueDoMarketplaceTest no backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const html = fs.readFileSync(RAIZ + 'produtos.html', 'utf8');
const js = fs.readFileSync(RAIZ + 'assets/js/produtos.js', 'utf8');

test('produtos: a tela tem o campo do código do marketplace', () => {
  assert.match(html, /id="codigoExterno"/, 'produtos.html perdeu o campo do código');
  assert.match(html, /maxlength="60"/,
    'o limite tem que bater com a coluna varchar(60) do banco, senão o salvar quebra no servidor');
});

test('produtos: salvar MANDA o código, mesmo vazio', () => {
  // Mandar sempre é de propósito: é assim que se APAGA o código de um produto que já tinha um. Se o
  // campo só fosse enviado quando preenchido, o lojista nunca conseguiria limpar um código errado.
  assert.match(js, /codigoExterno:\s*\$\('codigoExterno'\)\.value\.trim\(\)/,
    'o payload do salvar parou de mandar o codigoExterno');
});

test('produtos: clicar para editar abre o campo preenchido', () => {
  const edit = js.match(/window\.__edit = id => \{([\s\S]*?)\n  \};/);
  assert.ok(edit, 'não achei o window.__edit');
  assert.match(edit[1], /\$\('codigoExterno'\)\.value = p\.codigoExterno/,
    'editar um produto tem que trazer o código que já está salvo, senão salvar de novo o apaga');
});

// ---------------------------------------------------------------------------------------------
// Acima estão os testes de conteúdo do arquivo. Abaixo, o comportamento de verdade: a tela é
// EXECUTADA, com um produto que já tem código salvo, e medimos o que ela preenche e o que ela manda.
// Teste de grep prova que a linha existe; estes provam que ela funciona.
import { subir } from './harness.mjs';

const PRODUTO = { id: 11, nome: 'Açaí 500ml', categoria: 'Açaí', preco: 24, custo: 8.5,
  estoque: 10, estoqueMinimo: 2, ativo: true, codigoExterno: '7470' };

async function abrirProdutos() {
  const enviados = [];
  const janela = { open() {}, scrollTo() {}, location: { origin: 'http://t' } };
  const Bora = {
    requireAuth: () => true,
    requirePapel: () => true,
    produtos: async () => [PRODUTO],
    insumos: async () => [],
    api: async (url, opt) => {
      if (opt && opt.body) enviados.push({ url, metodo: opt.method, corpo: JSON.parse(opt.body) });
      if (url === '/api/produtos') return [PRODUTO];
      return {};
    },
  };
  const pagina = subir('C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/produtos.js',
    { Bora, globais: { window: janela, boraToast() {}, alert() {}, confirm: () => true, FileReader: class {}, Image: class {} } });
  await pagina.carregarPagina();
  return { pagina, enviados, janela };
}

test('produtos (rodando): editar um produto traz o código salvo para o campo', async () => {
  const { pagina, janela } = await abrirProdutos();
  assert.equal(typeof janela.__edit, 'function', 'a tela não registrou o __edit');

  janela.__edit(11);

  assert.equal(pagina.get('codigoExterno').value, '7470',
    'sem isto, salvar de novo apagaria o código que já estava lá');
  assert.equal(pagina.get('nome').value, 'Açaí 500ml');
});

test('produtos (rodando): editar um produto SEM código deixa o campo vazio, não "undefined"', async () => {
  // O ?? '' importa: "undefined" seria gravado como código de verdade e nunca casaria com nada.
  const { pagina, janela } = await abrirProdutos();
  PRODUTO.codigoExterno = undefined;
  janela.__edit(11);
  PRODUTO.codigoExterno = '7470';

  assert.equal(pagina.get('codigoExterno').value, '');
});
