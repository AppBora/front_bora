// O cardápio público mostrava o preço cheio e o servidor descontava o cashback.
//
// O DEFEITO (varredura 1.2, consertado em 21/10/2026): `atualizarEntrega` somava itens, cupom e
// frete, e ignorava o cashback — e não havia ouvinte no visto `ckUsarCashback`. No PIX o QR Code sai
// com o valor certo e o cliente percebe; no "pagar na entrega" ele **separa o dinheiro errado** e
// chega faltando troco, com o entregador na porta.
//
// É o mesmo defeito que o PDV tinha (v118), agora no canal do cliente.
//
// A ORDEM DA CONTA IMPORTA, e é a do servidor (PublicController, trecho do `usarCashback`):
//   base    = itens − cupom
//   resgate = min(saldo, base − 0,01)      ← nunca zera o pedido
//   total   = (base − resgate) + frete     ← o frete entra DEPOIS
// Trocar a ordem (descontar o cashback do total com frete) dá outro número — e a tela passaria a
// mentir de um jeito diferente.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const JS = fs.readFileSync(RAIZ + 'assets/js/cardapio.js', 'utf8');
const HTML = fs.readFileSync(RAIZ + 'cardapio.html', 'utf8');
const CODIGO = JS.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

// ------------------------------------------------------------------ a conta

/** Monta a função do arquivo, sem copiá-la: se alguém mudar a fórmula lá, isto mede a de lá. */
function regraDoArquivo(marcado, saldo) {
  const corpo = JS.match(/function descontoDoCashback\(base\) \{([\s\S]*?)\n  \}/);
  assert.ok(corpo, 'não achei o descontoDoCashback no cardapio.js');
  const fabrica = new Function('marcado', 'saldoCashback', `
    const $ = () => ({ checked: marcado });
    function descontoDoCashback(base) {${corpo[1]}}
    return descontoDoCashback;`);
  return fabrica(marcado, saldo);
}

test('cardapio: a conta do desconto e a MESMA do servidor', () => {
  const caso = (marcado, saldo, base) => regraDoArquivo(marcado, saldo)(base);

  assert.equal(caso(false, 10, 30), 0, 'visto desmarcado nao desconta nada');
  assert.equal(caso(true, 0, 30), 0, 'sem saldo nao desconta');
  assert.equal(caso(true, 10, 30), 10, 'saldo menor que a base desconta o saldo inteiro');
  assert.equal(caso(true, 100, 30), 29.99, 'saldo maior deixa UM CENTAVO a pagar');
  assert.equal(caso(true, 100, 0.01), 0, 'pedido de um centavo nao pode ficar em zero');
  assert.equal(caso(true, 10, 0), 0, 'carrinho vazio nao desconta');
  assert.equal(caso(true, 7.005, 30), 7.01, 'arredonda em 2 casas, como o servidor');
});

test('cardapio: o frete entra DEPOIS do cashback, como no servidor', () => {
  // Pedido de R$ 10, frete R$ 5, saldo R$ 20. O servidor calcula o resgate sobre os R$ 10:
  //   resgate = min(20, 10 − 0,01) = 9,99  →  total = (10 − 9,99) + 5 = 5,01
  // Se a tela descontasse do total COM frete, daria min(20, 15 − 0,01) = 14,99 → total 0,01.
  const fn = regraDoArquivo(true, 20);
  assert.equal(fn(10), 9.99, 'o desconto e calculado sobre a base SEM frete');

  const bloco = JS.match(/function atualizarEntrega\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(bloco, 'não achei o atualizarEntrega');
  assert.match(bloco[1], /descontoDoCashback\(itens\)/,
    'o desconto tem que ser calculado sobre `itens` (já sem o cupom), não sobre o total com frete');
  assert.match(bloco[1], /money\(Math\.max\(0, itens - cashback\) \+ frete\)/,
    'o total e (itens − cashback) + frete, nessa ordem');
});

test('cardapio: o cupom sai ANTES do cashback, como no servidor', () => {
  const bloco = JS.match(/function atualizarEntrega\(\) \{([\s\S]*?)\n  \}/)[1];
  const i = bloco.indexOf('descontoDoCupom()');
  const j = bloco.indexOf('descontoDoCashback(');
  assert.ok(i >= 0 && j > i, 'o cupom tem que ser descontado antes de calcular o cashback');
});

// ------------------------------------------------------------------ a tela

test('cardapio: a tela tem a linha do desconto', () => {
  assert.match(HTML, /id="ctCashbackLinha"/, 'cardapio.html perdeu a linha do desconto');
  assert.match(HTML, /id="ctCashback"/, 'cardapio.html perdeu o valor do desconto');
});

test('cardapio: a linha fica escondida quando nao ha desconto', () => {
  // Linha verde de "- R$ 0,00" em todo pedido vira ruído e o cliente para de ler a conta.
  assert.match(CODIGO, /ctCashbackLinha'\)\.hidden = cashback <= 0/);
});

test('cardapio: marcar o visto refaz a conta', () => {
  assert.match(CODIGO, /ckUsarCashback'\)\.addEventListener\('change', atualizarEntrega\)/,
    'sem este ouvinte, marcar o visto nao mexe no total');
});

test('cardapio: o saldo chegar do servidor TAMBEM refaz a conta', () => {
  // O saldo vem por consulta ao servidor, depois de o cliente digitar nome e telefone. Se a conta não
  // for refeita, o desconto não aparece até o cliente mexer em outra coisa — e era o mesmo descuido
  // que o PDV tinha.
  const fn = JS.match(/async function verCashback\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(fn, 'não achei o verCashback');
  assert.equal((fn[1].match(/atualizarEntrega\(\)/g) || []).length, 2,
    'o verCashback tem que refazer a conta nos DOIS caminhos: quando o saldo chega e quando '
    + 'nome/telefone ainda estão incompletos');
});

test('cardapio: o corpo enviado ao servidor continua levando o usarCashback', () => {
  // O servidor é quem decide o valor final; o que a tela manda é a INTENÇÃO.
  assert.match(CODIGO, /usarCashback: !!\(\$\('ckUsarCashback'\)/);
});
