// Onda 1 da varredura: o que o lojista e o cliente final sentem no dia a dia.
//
// Quatro itens, quatro telas: a cozinha vendo o recado (7.1), o import de cardápio aceitando ponto
// decimal (7.6), o PDV não envenenando o cache de adicionais (7.5) e o cardápio perguntando dinheiro
// ou cartão (6.7).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const kds = fs.readFileSync(RAIZ + 'assets/js/kds.js', 'utf8');
const produtos = fs.readFileSync(RAIZ + 'assets/js/produtos.js', 'utf8');
const pdv = fs.readFileSync(RAIZ + 'assets/js/pdv.js', 'utf8');
const cardapio = fs.readFileSync(RAIZ + 'assets/js/cardapio.js', 'utf8');
const cardapioHtml = fs.readFileSync(RAIZ + 'cardapio.html', 'utf8');

// ============================================================ 7.6 o preço do import

/**
 * Sobe a função REAL de preço, extraída do arquivo.
 *
 * Ela vive dentro do escopo da tela e só é publicada quando o modal abre, então o teste não a
 * alcançaria por `window`. Extrair o texto e avaliar é o que mede a função que roda de verdade — um
 * dublê aqui provaria a minha conta, não a dela.
 */
function precoDoImport() {
  const m = produtos.match(/function precoDoImport\(bruto\) \{[\s\S]*?\n    \}/);
  assert.ok(m, 'não achei a função precoDoImport em produtos.js');
  const ctx = vm.createContext({ Number, String, Set, Math });
  vm.runInContext(m[0] + '; this.f = precoDoImport;', ctx);
  return ctx.f;
}

test('import: "12,50" com vírgula é R$ 12,50', () => {
  assert.equal(precoDoImport()('12,50'), 12.5);
});

test('import: "12.50" com PONTO é R$ 12,50, não R$ 1.250', () => {
  // O defeito 7.6, medido em 21/10/2026: a versão anterior apagava todo ponto achando que era
  // separador de milhar, então um cardápio colado no formato de planilha em inglês entrava CEM VEZES
  // mais caro. E o import roda no onboarding, que é exatamente quando se cola uma planilha.
  assert.equal(precoDoImport()('12.50'), 12.5);
});

test('import: "R$ 1.250,00" continua sendo mil duzentos e cinquenta', () => {
  assert.equal(precoDoImport()('R$ 1.250,00'), 1250);
});

test('import: "1,234.56" (padrão inglês) é mil duzentos e trinta e quatro e cinquenta e seis', () => {
  assert.equal(precoDoImport()('1,234.56'), 1234.56);
});

test('import: separador único com três casas é MILHAR, não decimal', () => {
  // "1.250" é mil duzentos e cinquenta: ninguém cadastra preço com três casas decimais.
  assert.equal(precoDoImport()('1.250'), 1250);
  assert.equal(precoDoImport()('1.250.000'), 1250000);
  assert.equal(precoDoImport()('12,500'), 12500);
});

test('import: número inteiro e espaços continuam funcionando', () => {
  assert.equal(precoDoImport()('25'), 25);
  assert.equal(precoDoImport()(' R$ 25 '), 25);
});

test('import: lixo vira NaN, e o parse já recusa NaN', () => {
  // O `parse` testa `isFinite(preco) || preco <= 0` e põe a linha na lista de erros. O importante é
  // não inventar um número.
  assert.ok(!Number.isFinite(precoDoImport()('abc')));
  assert.match(produtos, /if \(!isFinite\(preco\) \|\| preco <= 0\)/,
    'o parse tem que continuar recusando preço inválido em vez de cadastrar');
});

test('import: o parse USA a função nova, não a conta antiga', () => {
  // Se alguém voltar a linha antiga, os testes acima param de medir a tela.
  assert.match(produtos, /const preco = precoDoImport\(precoBruto\)/);
  assert.ok(!produtos.includes("replace(/[R$\\s.]/g, '')"),
    'a conta antiga (que apagava todo ponto) não pode voltar');
});

// ============================================================ 7.1 a cozinha vê o recado

test('KDS: o card desenha a observação do pedido', () => {
  // Item 7.1: o dado SEMPRE chegou (o PedidoCard manda `observacao`); o card é que não desenhava.
  // "Sem cebola" não chegava em quem monta o prato.
  assert.match(kds, /function recado\(p\)/, 'o kds.js perdeu a função que desenha o recado');
  assert.match(kds, /p\.observacao/, 'o card tem que ler a observação');
  assert.match(kds, /\$\{recado\(p\)\}/, 'e tem que desenhar ela no card');
});

test('KDS: o recado é escapado', () => {
  // A observação é texto livre digitado pela equipe ou pelo cliente do cardápio.
  const m = kds.match(/function recado\(p\) \{[\s\S]*?\n  \}/);
  assert.ok(m);
  assert.match(m[0], /esc\(texto\)/, 'texto de fora no HTML sem escapar é injeção');
});

test('KDS: pedido sem observação não ganha caixa vazia', () => {
  const m = kds.match(/function recado\(p\) \{[\s\S]*?\n  \}/);
  assert.match(m[0], /if \(!texto\) return ''/,
    'sem recado, não desenha nada — senão todo card ganha uma tarja vazia');
});

// ============================================================ 7.5 o PDV não envenena o cache

test('PDV: falha ao carregar adicional NÃO grava lista vazia no cache', () => {
  // Item 7.5: `catch (e) { complementosPorProduto[produtoId] = []; }` fazia uma falha de rede de um
  // segundo derrubar os adicionais do produto pelo resto da sessão — e ele passava a entrar no
  // carrinho pelo PREÇO BASE, calado. Numa açaiteria é metade do valor da venda.
  const m = pdv.match(/async function carregarComplementos\(produtoId\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'não achei o carregarComplementos');
  assert.ok(!/complementosPorProduto\[produtoId\] = \[\];/.test(m[0]),
    'o cache não pode ser envenenado com lista vazia numa falha');
  assert.match(m[0], /throw e/, 'a falha tem que subir para quem chamou decidir');
});

test('PDV: produto com falha no adicional NÃO entra no carrinho', () => {
  // Entrar pelo preço base é prejuízo silencioso; não entrar é um aviso que o operador vê.
  const m = pdv.match(/window\.__add = async id => \{[\s\S]*?\n  \};/);
  assert.ok(m, 'não achei o __add');
  assert.match(m[0], /catch/, 'o __add tem que tratar a falha');
  assert.match(m[0], /alert\(/, 'e avisar o operador');
  assert.ok(m[0].indexOf('return;') < m[0].indexOf('abrirEscolha'),
    'na falha tem que sair antes de abrir a escolha');
});

// ============================================================ 6.7 dinheiro ou cartão

test('cardápio: a tela pergunta dinheiro ou cartão', () => {
  // Item 6.7: o acerto do entregador procura a palavra DINHEIRO para saber quanto de dinheiro vivo o
  // motoboy traz. O cardápio nunca perguntou, então era R$ 0,00 em todo pedido do link.
  assert.match(cardapioHtml, /name="pgEntrega" value="DINHEIRO"/);
  assert.match(cardapioHtml, /name="pgEntrega" value="CARTAO"/);
  assert.match(cardapioHtml, /id="ckEntregaComoWrap"/);
});

test('cardápio: a escolha vai no pedido', () => {
  assert.match(cardapio, /function formaNaEntrega\(\)/);
  assert.match(cardapio, /formaPagamento: forma === 'PIX' \? 'PIX' : formaNaEntrega\(\)/,
    'o payload tem que mandar como o cliente vai pagar na entrega');
});

test('cardápio: a pergunta só aparece para quem paga na entrega', () => {
  // Perguntar "dinheiro ou cartão" a quem escolheu PIX é ruído, e confunde.
  assert.match(cardapio, /ckEntregaComoWrap'\)\.hidden = pix && pixDisponivel/);
});

test('cardápio: sem marcar nada, volta vazio e o servidor decide', () => {
  // O servidor cai em "Na entrega", que é o comportamento de antes — e segue contando como
  // não-dinheiro, a única leitura honesta quando ninguém perguntou.
  const m = cardapio.match(/function formaNaEntrega\(\) \{[\s\S]*?\n  \}/);
  assert.ok(m);
  assert.match(m[0], /m \? m\.value : ''/);
});
