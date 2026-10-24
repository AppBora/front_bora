// Nenhuma tela manda estoque dentro do cadastro.
//
// O DEFEITO (medido em 20/10/2026): o formulário de Produtos mandava `estoque` sempre, com o número
// carregado na abertura da tela. Abrir Produtos às 18h, vender 12 durante a noite e corrigir só o
// PREÇO às 21h apagava as 12 baixas — sem log e sem aviso.
//
// E o outro lado do mesmo cano: as telas de Estoque e Contagem ajustavam estoque mandando o CADASTRO
// INTEIRO de volta pelo mesmo PUT /api/produtos. O cadastro que elas conhecem não tem todos os
// campos: nenhuma das duas manda `codigoExterno`. Cada ajuste de estoque apagaria o código do
// marketplace que entrou na v119 — e com ele a baixa de estoque dos pedidos de iFood/99.
//
// A solução foi SEPARAR as duas operações, não proteger campo por campo: enquanto as duas passarem
// pela mesma requisição, o próximo campo que alguém adicionar cai no mesmo buraco.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/';
const ler = f => fs.readFileSync(RAIZ + f, 'utf8');
/** O arquivo sem as linhas de comentário — para medir o que RODA, não o que está escrito sobre. */
const lerCodigo = f => ler(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

test('estoque.js: ajusta pelo endpoint de estoque, NUNCA pelo cadastro', () => {
  const js = lerCodigo('estoque.js');
  assert.doesNotMatch(js, /atualizarProduto/,
    'a tela de Estoque não pode mandar o cadastro: ela apagaria os campos que não conhece');
  assert.match(js, /ajustarEstoqueProduto/, 'os botões + e − usam o ajuste');
  assert.match(js, /definirEstoqueProduto/, 'o campo de valor usa o definir');
});

test('estoque.js: o + e o − mandam o DELTA, não a conta feita no navegador', () => {
  // Antes: `(p.estoque || 0) + delta`, a partir de uma lista carregada minutos antes, gravado como
  // valor absoluto. Clicar "+1" às 21h com a lista de 18h gravava 31 e apagava as vendas da noite.
  const js = lerCodigo('estoque.js');
  // A assinatura ganhou o `tipo` em 24/10, quando a tela passou a mostrar insumo também. O que
  // este teste guarda não mudou: a conta é do BANCO, nunca da lista que a tela carregou.
  const fn = js.match(/window\.__ajustar = async \(tipo, id, delta\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fn, 'não achei o __ajustar');
  assert.doesNotMatch(fn[1], /\.estoque/,
    'o __ajustar não pode ler o estoque da lista local — a conta é do banco');
  assert.match(fn[1], /ajustarEstoqueProduto\(id, delta\)/, 'manda o delta cru do produto');
  assert.match(fn[1], /ajustarEstoqueInsumo\(id, delta\)/, 'manda o delta cru do insumo');
});

test('contagem.js: manda só o estoque', () => {
  const js = lerCodigo('contagem.js');
  assert.doesNotMatch(js, /atualizarProduto/,
    'a Contagem não pode mandar o cadastro inteiro a cada produto contado');
  assert.match(js, /definirEstoqueProduto\(p\.id, novo\)/,
    'o valor contado vai pelo endpoint de estoque');
});

test('produtos.js: só manda estoque quando o lojista MUDOU o número', () => {
  const js = ler('produtos.js');
  const fn = js.match(/async function salvarEstoqueSeMudou\(id\) \{([\s\S]*?)\n  \}/);
  assert.ok(fn, 'não achei o salvarEstoqueSeMudou');
  assert.match(fn[1], /if \(agora === estoqueNaTela\) return;/,
    'não mexeu no campo = não manda nada, e as vendas da noite ficam de pé');
  assert.match(fn[1], /definirEstoqueProduto/, 'mudou = é uma contagem, vai pelo endpoint de estoque');
});

test('produtos.js: guarda o estoque que a tela carregou, ao abrir para editar', () => {
  const js = ler('produtos.js');
  const edit = js.match(/window\.__edit = id => \{([\s\S]*?)\n  \};/);
  assert.ok(edit, 'não achei o __edit');
  assert.match(edit[1], /estoqueNaTela = p\.estoque \?\? null;/,
    'sem guardar o valor de origem não há como saber se o lojista mexeu');
});

test('produtos.js: o salvar da edição chama as DUAS coisas, nessa ordem', () => {
  // Cadastro primeiro, estoque depois. Se o cadastro falhar (nome vazio, código repetido), o estoque
  // não pode ter sido mexido.
  const js = ler('produtos.js');
  const bloco = js.match(/if \(id\) \{([\s\S]*?)\n      \}/);
  assert.ok(bloco, 'não achei o bloco do salvar na edição');
  const i = bloco[1].indexOf("method: 'PUT'");
  const j = bloco[1].indexOf('salvarEstoqueSeMudou');
  assert.ok(i >= 0 && j >= 0, 'as duas chamadas têm que estar lá');
  assert.ok(i < j, 'o cadastro vai primeiro: se ele falhar, o estoque não pode ter mudado');
});

test('insumos.js: mesma regra do produto', () => {
  const js = lerCodigo('insumos.js');
  assert.match(js, /estoqueNaTela/, 'o insumo também guarda o valor de origem');
  assert.match(js, /definirEstoqueInsumo/, 'e usa o endpoint de estoque quando o número mudou');
});

test('api.js: as funcoes de estoque existem e batem com os endpoints do servidor', () => {
  const js = lerCodigo('api.js');
  assert.match(js, /'\/api\/produtos\/' \+ id \+ '\/estoque'/);
  assert.match(js, /'\/api\/insumos\/' \+ id \+ '\/estoque'/);
  // Os dois lados passam pelo mesmo atalho `mexerNoEstoque*`, com o tipo explícito. O literal
  // `tipo: 'DEFINIR'` saiu do insumo quando ele ganhou o AJUSTAR e virou um atalho só — a tela de
  // Estoque passou a mostrar insumo, e os botões + e − precisam somar no banco também lá.
  assert.match(js, /mexerNoEstoqueProduto\(id, 'DEFINIR', quantidade\)/);
  assert.match(js, /mexerNoEstoqueProduto\(id, 'AJUSTAR', delta\)/);
  assert.match(js, /mexerNoEstoqueInsumo\(id, 'DEFINIR', quantidade\)/);
  assert.match(js, /mexerNoEstoqueInsumo\(id, 'AJUSTAR', delta\)/);
  assert.match(js, /JSON\.stringify\(\{ tipo, quantidade \}\)/,
    'o corpo precisa levar tipo e quantidade, que é o que o MexerNoEstoqueRequest espera');
});

test('o atalho atualizarProduto NAO existe mais em nenhum lugar', () => {
  // A trava do desenho, e é por remoção. Aquele atalho mandava o cadastro inteiro num PUT; quem
  // chamava sem ter todos os campos apagava o que não conhecia — era assim que a tela de Estoque
  // apagaria o código do marketplace. Enquanto o atalho existir, alguém vai usá-lo de novo.
  //
  // Hoje o único que edita cadastro é o formulário de Produtos, e ele chama o endpoint direto.
  const arquivos = fs.readdirSync(RAIZ).filter(f => f.endsWith('.js'));
  const usam = arquivos.filter(f => lerCodigo(f).includes('atualizarProduto'));
  assert.deepEqual(usam, [], 'o atalho voltou nestes arquivos: ' + usam.join(', '));
});
