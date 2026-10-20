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
