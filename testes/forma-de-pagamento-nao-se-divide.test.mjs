// "Por forma de pagamento" no Fechar Caixa para de mostrar a mesma forma em duas linhas.
//
// O DEFEITO (medido na PRODUÇÃO em 24/10/2026): o agrupamento usava o texto cru do campo
// (`pag[p.formaPagamento]`). O campo é preenchido por caminhos diferentes — cardápio, PDV, novo
// pedido, marketplace — e cada um escreve do seu jeito. Estes são os valores que estavam GRAVADOS,
// e é com eles que este teste trabalha: fixture de dado real, não inventado.
//
// A consequência é na tela em que o lojista confere o dinheiro do dia: dez linhas para um punhado de
// formas, duas de PIX para somar de cabeça, um "CREDIT" em inglês, e uma barra cujo rótulo é uma
// frase com valores dentro.
//
// A INVARIANTE QUE IMPORTA MAIS QUE A APARÊNCIA: o total não pode mudar. Agrupamento que perde um
// centavo é muito pior que dez linhas feias, e é por isso que o primeiro teste daqui é o da soma.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { helpersDoApp } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');

// Os helpers vem do harness (`helpersDoApp`), que ja sabe montar os stubs de DOM que o app.js
// exige na carga -- ele nao e so declaracoes, registra manifest e marca da loja. Minha primeira
// versao montava o contexto a mao e estourava em `document.createElement`: reinventar o que o
// harness ja resolve custou 11 testes vermelhos por nada.
function helpers() {
  return helpersDoApp(RAIZ.split(path.sep).join('/') + '/');
}

// Exatamente o que estava gravado na produção em 24/10/2026, com as contagens lidas do banco.
const REAL = [
  ['Pix', 12],
  ['CREDIT', 5],
  ['Na entrega', 4],
  ['Dinheiro', 3],
  ['Dinheiro (atualizado)', 2],
  [null, 2],
  ['Pago online: Crédito Visa R$ 17,00 + Pago online: Crédito Master R$ 10,00', 2],
  ['Vale Refeicao', 1],
  ['PIX (pago)', 1],
  ['Cartão de débito', 1],
];

test('PREMISSA: o helper existe e é global, como boraCanal', () => {
  const ctx = helpers();
  assert.equal(typeof ctx.boraFormaPagamento, 'function',
    'sem o helper global, cada tela volta a inventar a sua regra — foi assim que o faturamento do '
    + 'Dashboard divergiu do Fechar Caixa (ver boraEhVenda)');
});

test('O TOTAL NÃO MUDA: agrupar não pode perder dinheiro', () => {
  const { boraFormaPagamento } = helpers();
  // R$ 10,00 por pedido, para a conta ser conferível de cabeça.
  const pedidos = REAL.flatMap(([fp, n]) => Array.from({ length: n }, () => ({ formaPagamento: fp, valorTotal: 10 })));
  const esperado = pedidos.length * 10;

  const pag = {};
  for (const p of pedidos) {
    const k = boraFormaPagamento(p.formaPagamento);
    pag[k] = (pag[k] || 0) + Number(p.valorTotal || 0);
  }
  const somado = Object.values(pag).reduce((a, b) => a + b, 0);

  assert.equal(somado, esperado,
    'o agrupamento perdeu ou duplicou dinheiro — isto é a tela de fechar o caixa');
  assert.equal(pedidos.length, 33, 'a fixture mudou; confira as contagens medidas na produção');
});

test('as duas linhas de PIX viram uma', () => {
  const { boraFormaPagamento } = helpers();
  assert.equal(boraFormaPagamento('Pix'), 'PIX');
  assert.equal(boraFormaPagamento('PIX (pago)'), 'PIX');
});

test('as duas linhas de dinheiro viram uma', () => {
  const { boraFormaPagamento } = helpers();
  assert.equal(boraFormaPagamento('Dinheiro'), 'Dinheiro');
  assert.equal(boraFormaPagamento('Dinheiro (atualizado)'), 'Dinheiro');
});

test('o codigo do marketplace deixa de aparecer em ingles', () => {
  const { boraFormaPagamento } = helpers();
  assert.equal(boraFormaPagamento('CREDIT'), 'Crédito',
    '"CREDIT" aparecia no cartão do KDS e na barra do caixa');
  assert.equal(boraFormaPagamento('DEBIT'), 'Débito');
  assert.equal(boraFormaPagamento('MEAL_VOUCHER'), 'Vale');
});

test('a FRASE com valores dentro para de ser rotulo de barra', () => {
  const { boraFormaPagamento } = helpers();
  const frase = 'Pago online: Crédito Visa R$ 17,00 + Pago online: Crédito Master R$ 10,00';
  assert.equal(boraFormaPagamento(frase), 'Pago online');
});

test('"pago online" ganha de "credito" na frase composta — e a ordem e deliberada', () => {
  const { boraFormaPagamento } = helpers();
  // A frase contém as duas palavras. Para quem fecha o caixa, o que decide é se o dinheiro está na
  // mão ou na conta. Se "crédito" ganhasse, o lojista procuraria no caixa um dinheiro que está no
  // banco.
  assert.equal(boraFormaPagamento('Pago online: Crédito'), 'Pago online');
  assert.equal(boraFormaPagamento('Crédito na maquininha'), 'Crédito');
});

test('PIX ganha de online, porque o lojista pensa nele como coisa propria', () => {
  const { boraFormaPagamento } = helpers();
  assert.equal(boraFormaPagamento('Pago online: PIX'), 'PIX');
});

test('acento e caixa nao criam linha nova', () => {
  const { boraFormaPagamento } = helpers();
  assert.equal(boraFormaPagamento('Vale Refeicao'), 'Vale');
  assert.equal(boraFormaPagamento('Vale Refeição'), 'Vale');
  assert.equal(boraFormaPagamento('VALE REFEIÇÃO'), 'Vale');
  assert.equal(boraFormaPagamento('Cartão de débito'), 'Débito');
  assert.equal(boraFormaPagamento('CARTAO DE DEBITO'), 'Débito');
});

test('vazio e nulo viram UMA linha com nome', () => {
  const { boraFormaPagamento } = helpers();
  for (const v of [null, undefined, '', '   ']) {
    assert.equal(boraFormaPagamento(v), 'Não informado',
      'linha sem nome no gráfico do dinheiro: o lojista não sabe o que é aquela barra');
  }
});

test('forma DESCONHECIDA volta com o proprio nome, e NAO cai num "Outros"', () => {
  const { boraFormaPagamento } = helpers();
  // Jogar o desconhecido num balde esconderia uma forma de pagamento nova exatamente de quem
  // precisa conferir se aquele dinheiro entrou.
  assert.equal(boraFormaPagamento('Boleto'), 'Boleto');
  assert.equal(boraFormaPagamento('Cheque'), 'Cheque');
  assert.equal(boraFormaPagamento('  Fiado  '), 'Fiado', 'tem de vir aparado');
});

// ---------------------------------------------------------------- as duas telas que usam
test('o Fechar Caixa agrupa pela forma NORMALIZADA, nao pelo texto cru', () => {
  const caixa = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'caixa.js'), 'utf8');
  assert.match(caixa, /const fp = boraFormaPagamento\(p\.formaPagamento\)/,
    'o caixa voltou a agrupar pelo texto cru: a mesma forma volta a sair em duas linhas');
  assert.ok(!/const fp = p\.formaPagamento \|\| 'Não informado'/.test(caixa),
    'sobrou o agrupamento antigo');
});

test('o KDS tem GUARDA: app.js velho no cache nao derruba o quadro', () => {
  // `boraFormaPagamento` mora no app.js, outro arquivo com outro cache. Chamar direto faria o
  // QUADRO INTEIRO -- a tela onde a cozinha trabalha -- morrer por causa de um rótulo de
  // pagamento, se o navegador do lojista estivesse com uma versão velha do app.js. Mesmo padrão do
  // `boraSla`, que já era guardado ali por essa razão.
  //
  // Sem este teste a guarda seria código que ninguém mede: o teste de comportamento injeta a função
  // de verdade, então nunca passa pelo caminho do fallback.
  const pedidos = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'pedidos.js'), 'utf8');
  assert.match(pedidos, /typeof boraFormaPagamento === 'function'/,
    'a chamada ficou sem guarda: app.js velho no cache apaga o quadro da cozinha');
  // E o fallback tem de ser legível, não "undefined" na cara do operador.
  assert.match(pedidos, /\(p\.formaPagamento \|\| 'Pagamento —'\)/,
    'o fallback precisa de texto para pedido sem forma de pagamento');
});

test('o cartao do KDS mostra a forma normalizada E o canal', () => {
  // Dois defeitos na mesma linha. O `||` escondia a origem: pedido do iFood pago em crédito dizia
  // só "Crédito", e isso muda o que o operador faz — pedido de marketplace não se liga para o
  // cliente, e o cancelamento é por lá.
  const pedidos = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'pedidos.js'), 'utf8');
  assert.match(pedidos, /boraFormaPagamento\(p\.formaPagamento\)/,
    'o KDS voltou a mostrar o texto cru — era de lá que saía o "CREDIT"');
  assert.match(pedidos, /boraCanal\(p\.origem\)/, 'o canal voltou a ficar escondido');
  assert.ok(!/esc\(p\.formaPagamento\) \|\| \(p\.origem/.test(pedidos),
    'sobrou o "||" que escondia o canal quando havia forma de pagamento');
});
