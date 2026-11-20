// OS DOIS BLOQUEIOS DE OPERAÇÃO NO CELULAR (varredura de 18/11/2026, consertados em 19/11).
//
// Medidos por mim no navegador, em 375x812.
//
// BLOQUEIO 1 — Novo Pedido: o botão "＋ Adicionar ao pedido" ficava em x0=375 → x1=548, começando
// exatamente na borda, 100% fora. E a página NÃO rola de lado (`html,body{overflow-x:hidden}`),
// então não havia como alcançá-lo: parecia que a tela travou. Lançar pedido pelo celular era
// impossível.
//
// A CAUSA REAL, que não era o botão: a regra de celular `grid-template-columns:1fr !important`
// aplicava — e `1fr` é `minmax(auto,1fr)`, cujo mínimo `auto` é o MIN-CONTENT. A coluna resolvia
// para **520px dentro de um formulário de 319px**, e tudo que estava nela saía da tela. A regra
// existia, aplicava, e não resolvia — o pior tipo de defeito, o que parece consertado.
// Depois do conserto, medido: coluna 319px, botão em x0=28 → x1=347, dentro da tela, 44px de toque.
//
// BLOQUEIO 2 — Frente de Caixa: página de 3317px, "🛒 Comanda" em y=2787 e "Finalizar venda" em
// y=3164 — 3,9 telas abaixo da dobra. O `@media(max-width:1000px)` tira o `position:sticky` da
// comanda, então ela empilha depois da lista inteira de produtos. O operador tocava no produto e
// NADA mudava no que ele via. Para quem vende no balcão com fila, é vender às cegas.
// O conserto é a barra fixa (`#pdvBar`), o mesmo padrão que o cardápio público já usa: o total
// sempre à vista e um toque para chegar na comanda. Medido depois: barra fixa de 676→740 com 14px
// de folga acima da navegação de 58px, sem cobrir o "Finalizar venda".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
// Sem os comentarios: um comentario que CITA uma regra antiga fazia este teste medir o texto do
// comentario em vez da regra. Aconteceu na primeira versao deste arquivo.
const CSS = fs.readFileSync(RAIZ + 'assets/css/styles.css', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const PDV_JS = fs.readFileSync(RAIZ + 'assets/js/pdv.js', 'utf8');
const PDV_HTML = fs.readFileSync(RAIZ + 'pdv.html', 'utf8');

// ============================================================ BLOQUEIO 1

test('a grade de celular usa minmax(0,1fr), que e o que de fato encolhe', () => {
  const regras = CSS.match(/grid-template-columns:\s*[^;!]*!important/g) || [];
  assert.ok(regras.length >= 2, 'nao achei as regras de uma coluna do celular');
  for (const r of regras) {
    assert.match(r, /minmax\(0,\s*1fr\)/,
      '`1fr` sozinho e `minmax(auto,1fr)`: a coluna nao encolhe abaixo do min-content do conteudo, '
      + 'e foi isso que deixou o botao "Adicionar ao pedido" fora de uma tela de 375px COM a regra '
      + 'de celular ativa. Regra encontrada: ' + r);
  }
});

test('a linha de adicionar produto pode quebrar, e o select pode encolher', () => {
  const linha = CSS.match(/\.itens-linha\{[^}]*\}/);
  assert.ok(linha, 'nao achei a regra .itens-linha');
  assert.match(linha[0], /flex-wrap:\s*wrap/,
    'sem flex-wrap o botao nao desce para a linha de baixo quando falta largura');

  const nome = CSS.match(/\.itens-linha \.nome\{[^}]*\}/);
  assert.ok(nome, 'nao achei a regra .itens-linha .nome');
  assert.match(nome[0], /min-width:\s*0/,
    'um flex item com flex:1 NAO encolhe abaixo da largura do seu conteudo sem min-width:0 — era o '
    + 'select que empurrava o botao para fora em vez de ceder espaco');
});

// ============================================================ BLOQUEIO 2

/** Roda o `pintarBarraDoCelular` lido do arquivo, com um DOM de mentira. */
function pintar(qtd, total) {
  const i = PDV_JS.indexOf('function pintarBarraDoCelular(');
  assert.ok(i > 0, 'nao achei pintarBarraDoCelular em pdv.js');
  let abre = PDV_JS.indexOf('{', i), nivel = 0, fim = -1;
  for (let k = abre; k < PDV_JS.length; k++) {
    if (PDV_JS[k] === '{') nivel++;
    else if (PDV_JS[k] === '}') { nivel--; if (nivel === 0) { fim = k; break; } }
  }
  const corpo = PDV_JS.slice(abre + 1, fim);

  const els = {
    pdvBar: { hidden: false },
    pdvBarQtd: { textContent: '' },
    pdvBarTotal: { textContent: '' },
  };
  const document = { getElementById: id => els[id] || null };
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  new Function('document', 'money', 'qtd', 'total', corpo)(document, money, qtd, total);
  return els;
}

test('a barra do celular mostra a MESMA conta da comanda', () => {
  const els = pintar(3, 59.7);
  assert.equal(els.pdvBar.hidden, false, 'com itens no carrinho a barra tem de aparecer');
  assert.equal(els.pdvBarQtd.textContent, '3 itens');
  assert.equal(els.pdvBarTotal.textContent, 'R$ 59,70');
});

test('um item no singular, porque o operador le isso o dia inteiro', () => {
  assert.equal(pintar(1, 19.9).pdvBarQtd.textContent, '1 item');
});

test('carrinho vazio esconde a barra', () => {
  assert.equal(pintar(0, 0).pdvBar.hidden, true,
    'barra com "0 itens / R$ 0,00" ocupa espaco na tela e nao informa nada');
});

test('a barra le o total JA com desconto, nao o subtotal', () => {
  // O `renderCart` passa `Math.max(0, subtotal - desconto)`. Dois lugares calculando o total e dois
  // lugares para divergir -- e o cashback do PDV ja causou exatamente isso uma vez.
  const i = PDV_JS.indexOf('pintarBarraDoCelular(qtd,');
  assert.ok(i > 0, 'a barra nao e atualizada pelo renderCart');
  const chamada = PDV_JS.slice(i, i + 80);
  assert.match(chamada, /Math\.max\(0,\s*subtotal\s*-\s*desconto\)/,
    'a barra tem de receber o mesmo numero que a linha "Total" da comanda');
});

test('a barra existe no HTML e comeca escondida', () => {
  assert.match(PDV_HTML, /id="pdvBar"[^>]*hidden/,
    'a barra tem de nascer escondida: carrinho vazio nao precisa dela');
  assert.ok(PDV_HTML.includes('id="pdvBarIr"'), 'falta o botao que leva para a comanda');
});

test('o botao da barra leva a comanda para a tela', () => {
  const i = PDV_JS.indexOf("getElementById('pdvBarIr')");
  assert.ok(i > 0, 'o botao da barra nao tem ouvinte');
  const bloco = PDV_JS.slice(i, i + 400);
  assert.match(bloco, /\.cart/, 'o botao tem de achar a comanda');
  assert.match(bloco, /scrollIntoView/, 'o botao tem de ROLAR ate a comanda — e o conserto do bloqueio');
});

test('a barra fica acima da navegacao, que no celular tambem e fixa embaixo', () => {
  const regra = CSS.match(/\.pdv-bar\{[^}]*position:fixed[^}]*\}/);
  assert.ok(regra, 'nao achei a regra fixa da .pdv-bar no bloco de celular');
  const fundo = Number((regra[0].match(/bottom:(\d+)px/) || [])[1]);
  assert.ok(fundo >= 58,
    `a barra esta a ${fundo}px do fundo e a navegacao do celular mede 58px (medido): ela cobriria `
    + 'a navegacao');
});

test('a barra SO aparece no celular', () => {
  const fora = CSS.match(/\.pdv-bar\{display:none\}/);
  assert.ok(fora, 'no desktop a comanda ja fica fixa ao lado: a barra ali seria ruido');
});

test('o fim da comanda nao fica atras da barra', () => {
  assert.match(CSS, /\.cart \.cart-foot\{padding-bottom:\d+px\}/,
    'sem folga no fim da comanda, o "Finalizar venda" fica atras da barra quando se rola ate o fim');
});
