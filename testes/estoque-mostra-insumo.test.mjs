// A tela de Estoque mostra PRODUTO e INSUMO.
//
// O DEFEITO (achado pelo dono usando, 24/10): a tela lia só produtos. Numa açaiteria o que se
// estoca é copo, água, leite condensado e polpa — e isso são INSUMOS. Ele cadastrou 43 insumos e
// não viu nenhum deles em "Estoque", porque a tela mostrava justamente o que a loja não estoca.
//
// O QUE ESTE TESTE PROTEGE, em ordem de estrago:
//
// 1) O AJUSTE VAI COMO DELTA, PARA O ENDPOINT CERTO. O "+1" tem de somar NO BANCO. Calcular no
//    navegador a partir de uma lista carregada minutos antes e gravar o absoluto já apagou as
//    vendas de uma noite inteira no produto — o insumo não pode repetir isso.
//
// 2) INSUMO TEM CASA DECIMAL, PRODUTO NÃO. 2,5 kg de granola é um número legítimo; tratar como
//    inteiro perde meio quilo a cada contagem.
//
// 3) QUEM NÃO PODE VER INSUMO AINDA VÊ A TELA. Insumo é de GERENTE para cima; se a chamada falhar,
//    a tela segue mostrando os produtos em vez de morrer inteira.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const TELA = RAIZ + '/assets/js/estoque.js';

const PRODUTOS = [
  { id: 7, nome: 'Coca-Cola Lata', categoria: 'Bebidas', preco: 6, custo: 3,
    estoque: 12, estoqueMinimo: 4 },
  { id: 8, nome: 'Barca de Açaí', categoria: 'Gourmet', preco: 47.9, custo: 14,
    estoque: null, estoqueMinimo: null },          // nao controla: nao entra na tela
];
const INSUMOS = [
  { id: 1, nome: 'Granola', unidade: 'kg', custo: 18.9, estoque: 2.5, estoqueMinimo: 1 },
  { id: 2, nome: 'Copo 500ml', unidade: 'un', custo: 0.38, estoque: 0, estoqueMinimo: 100 },
  { id: 3, nome: 'Polpa de Açaí', unidade: 'kg', custo: 12, estoque: null, estoqueMinimo: null },
];

function montar({ produtos = PRODUTOS, insumos = INSUMOS, insumoFalha = false } = {}) {
  const chamadas = [];
  const Bora = {
    requireAuth: () => true,
    produtos: async () => JSON.parse(JSON.stringify(produtos)),
    insumos: async () => {
      if (insumoFalha) throw new Error('403');
      return JSON.parse(JSON.stringify(insumos));
    },
    ajustarEstoqueProduto: async (id, delta) => chamadas.push({ o: 'produto', k: 'AJUSTAR', id, delta }),
    definirEstoqueProduto: async (id, q) => chamadas.push({ o: 'produto', k: 'DEFINIR', id, q }),
    ajustarEstoqueInsumo: async (id, delta) => chamadas.push({ o: 'insumo', k: 'AJUSTAR', id, delta }),
    definirEstoqueInsumo: async (id, q) => chamadas.push({ o: 'insumo', k: 'DEFINIR', id, q }),
  };
  const janela = {};
  const t = subir(TELA, { Bora, globais: { window: janela, alert: () => {} } });
  return { ...t, chamadas, janela };
}

async function abrir(opts) {
  const t = montar(opts);
  await t.carregarPagina();
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return t;
}

const html = (t) => t.get('lista').innerHTML;

// ---------------------------------------------------------------- o que aparece
test('PREMISSA: os insumos aparecem na tela de Estoque', async () => {
  const t = await abrir();
  assert.match(html(t), /Granola/, 'o insumo nao apareceu — foi assim que o dono bateu');
  assert.match(html(t), /Copo 500ml/);
});

test('o produto com estoque controlado continua aparecendo', async () => {
  const t = await abrir();
  assert.match(html(t), /Coca-Cola Lata/);
});

test('o que NAO controla estoque fica de fora, dos dois lados', async () => {
  const t = await abrir();
  assert.ok(!/Barca de Açaí/.test(html(t)), 'produto sem controle entrou na tela de estoque');
  assert.ok(!/Polpa de Açaí/.test(html(t)), 'insumo sem controle entrou na tela de estoque');
});

test('cada linha diz se e produto ou insumo', async () => {
  const t = await abrir();
  const linhas = html(t).split('<tr>');
  const granola = linhas.find((l) => l.includes('Granola'));
  const coca = linhas.find((l) => l.includes('Coca-Cola'));
  assert.match(granola, /INSUMO/);
  assert.match(coca, /PRODUTO/);
});

// ---------------------------------------------------------------- os numeros
test('PREMISSA: o decimal do insumo nao e truncado na tela', async () => {
  const t = await abrir();
  const granola = html(t).split('<tr>').find((l) => l.includes('Granola'));
  assert.match(granola, /2,5/, 'mostrou 2 no lugar de 2,5 kg — meio quilo some por contagem');
  assert.ok(!/2,500/.test(granola), 'poluiu com zeros a direita');
});

test('o valor em estoque soma produto E insumo, pelo custo', async () => {
  const t = await abrir();
  // 12 × 3,00 = 36,00  +  2,5 × 18,90 = 47,25  +  0 × 0,38 = 0
  assert.equal(t.get('kValor').textContent, 'R$ 83,25');
});

test('ruptura e minimo contam os dois', async () => {
  const t = await abrir();
  // String(): no navegador textContent e sempre texto; o duble do harness guarda o que recebeu.
  assert.equal(String(t.get('kRuptura').textContent), '1',
    'o Copo 500ml esta zerado e nao foi contado');
  assert.equal(String(t.get('kBaixo').textContent), '0');
});

test('o zerado aparece como RUPTURA e vem primeiro na lista', async () => {
  const t = await abrir();
  const corpo = html(t);
  assert.match(corpo, /RUPTURA/);
  assert.ok(corpo.indexOf('Copo 500ml') < corpo.indexOf('Granola'),
    'o que acabou tem de estar no topo: e a pergunta que leva o lojista a abrir a tela');
});

// ---------------------------------------------------------------- o ajuste
test('PREMISSA: o + do insumo vai como DELTA, para o endpoint de insumo', async () => {
  const t = await abrir();
  await t.janela.__ajustar('insumo', 1, 1);
  assert.deepEqual(t.chamadas[0], { o: 'insumo', k: 'AJUSTAR', id: 1, delta: 1 },
    'gravou absoluto, ou mandou para o endpoint de produto');
});

test('o + do produto continua indo para o endpoint de produto', async () => {
  const t = await abrir();
  await t.janela.__ajustar('produto', 7, -1);
  assert.deepEqual(t.chamadas[0], { o: 'produto', k: 'AJUSTAR', id: 7, delta: -1 });
});

test('PREMISSA: digitar 2,5 num insumo grava 2.5, e nao 2', async () => {
  const t = await abrir();
  await t.janela.__definir('insumo', 1, '2,5');
  assert.deepEqual(t.chamadas[0], { o: 'insumo', k: 'DEFINIR', id: 1, q: 2.5 },
    'truncou o decimal do insumo');
});

test('digitar num produto continua inteiro', async () => {
  const t = await abrir();
  await t.janela.__definir('produto', 7, '15');
  assert.deepEqual(t.chamadas[0], { o: 'produto', k: 'DEFINIR', id: 7, q: 15 });
});

test('valor negativo digitado vira zero, nao negativo', async () => {
  const t = await abrir();
  await t.janela.__definir('insumo', 1, '-3');
  assert.equal(t.chamadas[0].q, 0, 'mandou estoque negativo para o servidor');
});

test('texto que nao e numero nao grava nada', async () => {
  const t = await abrir();
  await t.janela.__definir('insumo', 1, 'abc');
  assert.equal(t.chamadas.length, 0);
});

// ---------------------------------------------------------------- quem nao pode ver insumo
test('PREMISSA: se os insumos nao vierem, a tela ainda mostra os produtos', async () => {
  const t = await abrir({ insumoFalha: true });
  assert.match(html(t), /Coca-Cola Lata/,
    'a tela inteira morreu porque a conta nao pode ver insumo');
  assert.ok(!/Granola/.test(html(t)));
});

test('loja sem nada controlado explica onde cadastrar', async () => {
  const t = await abrir({ produtos: [], insumos: [] });
  assert.match(html(t), /Produtos/);
  assert.match(html(t), /Insumos/);
});
