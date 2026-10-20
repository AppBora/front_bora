// O cardápio público não pode vender o que acabou.
//
// POR QUE: antes, o produto sem estoque aparecia normal no menu. O cliente montava o carrinho
// inteiro e só levava o "acabou" no confirmar — a pior forma de contar isso a ele, e a mesma razão
// pela qual o cardápio já avisa antes que a loja está fechada.
//
// O servidor é quem decide de verdade (409 na gravação, provado em PedidoDoCardapioTest). Isto aqui
// é para o cliente não tomar o susto no fim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const JS = fs.readFileSync(
  'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/cardapio.js', 'utf8');

test('cardapio: o item esgotado mostra "Esgotado" no lugar do preço', () => {
  assert.match(JS, /p\.esgotado[\s\S]{0,200}Esgotado/,
    'o cliente precisa LER que acabou, não só ver o botão apagado');
});

test('cardapio: o botão + do esgotado vem desabilitado', () => {
  const t = JS.match(/itens\.map\(p => `<div class="menu-item"[\s\S]*?<\/div>`\)\.join\(''\)/);
  assert.ok(t, 'não achei o template do item do menu');
  assert.match(t[0], /p\.esgotado[\s\S]*?disabled/,
    'sem o disabled o cliente clica, adiciona, e só descobre no confirmar');
});

test('cardapio: __add RECUSA o esgotado, não só o botão', () => {
  // Esta trava é para o OUTRO caminho: o "repetir pedido" monta o carrinho por código, sem passar
  // pelo botão. Sem ela, repetir um pedido com item que acabou passava direto.
  const fn = JS.match(/window\.__add = id => \{([\s\S]*?)\n  \};/);
  assert.ok(fn, 'não achei o window.__add');
  assert.match(fn[1], /if \(p\.esgotado\) return;/,
    'o __add tem que recusar o esgotado por conta própria');
});

test('cardapio: repetir pedido AVISA quando um item esgotou', () => {
  // Ficar em silêncio faria o cliente levar menos do que pediu sem saber — é a mesma regra que já
  // valia para o item que saiu do cardápio.
  assert.match(JS, /if \(p\.esgotado\) \{ avisos\.push/,
    'repetir pedido tem que contar ao cliente que o item esgotou');
});

test('cardapio: o esgotado NÃO esconde o produto da lista', () => {
  // Decisão de propósito: o produto continua visível, apagado. Esconder faria o cliente achar que o
  // cardápio mudou, e ele não teria como saber que aquilo volta amanhã.
  const t = JS.match(/itens\.map\(p => `<div class="menu-item"[\s\S]*?<\/div>`\)\.join\(''\)/)[0];
  assert.match(t, /opacity/, 'o esgotado fica apagado, não removido');
  assert.doesNotMatch(t, /p\.esgotado \? '' :/, 'o item esgotado não pode sair da lista');
});
