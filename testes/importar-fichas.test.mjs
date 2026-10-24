// Importar fichas técnicas em lote.
//
// POR QUE A TELA EXISTE: a ficha se monta produto a produto, no 🧪. Uma açaiteria com 35 produtos
// e 43 insumos são centenas de cliques — e **enquanto a ficha não existe, vender não baixa nada**:
// o sistema cai no estoque do próprio produto, que numa loja assim não é controlado.
//
// O QUE ESTE TESTE PROTEGE, em ordem de estrago:
//
// 1) O PUT SUBSTITUI A FICHA INTEIRA (`InsumoService.java:152` apaga antes de gravar). Um produto
//    que já tem ficha e aparece na lista com menos linhas perde o resto, em silêncio — e o
//    ingrediente que sumiu deixa de baixar do estoque. A conferência tem de avisar ANTES.
//
// 2) NOME QUE NÃO EXISTE É RECUSADO, não ignorado. Uma linha engolida vira um ingrediente que
//    nunca baixa, e isso só aparece no inventário do fim do mês.
//
// 3) A QUANTIDADE É DECIMAL E EM pt-BR. "0,3" de polpa não pode virar 3, nem 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const TELA = RAIZ + '/assets/js/importar-fichas.js';

const PRODUTOS = [
  { id: 10, nome: 'Copo de Açaí 300ml', preco: 19.9 },
  { id: 11, nome: 'Copo de Açaí 500ml', preco: 24.9 },
  { id: 12, nome: 'Barca de Açaí Gourmet', preco: 47.9 },
];
const INSUMOS = [
  { id: 1, nome: 'Polpa de Açaí', unidade: 'kg' },
  { id: 2, nome: 'Copo 300ml', unidade: 'un' },
  { id: 3, nome: 'Tampa 300ml', unidade: 'un' },
  { id: 4, nome: 'Granola', unidade: 'kg' },
  { id: 5, nome: 'Leite Condensado', unidade: 'un' },
];

function montar({ fichas = {}, falharEm = [] } = {}) {
  const gravadas = [];
  const Bora = {
    requireAuth: () => true,
    produtos: async () => JSON.parse(JSON.stringify(PRODUTOS)),
    insumos: async () => JSON.parse(JSON.stringify(INSUMOS)),
    ficha: async (id) => (fichas[id] || []),
    salvarFicha: async (produtoId, itens) => {
      gravadas.push({ produtoId, itens });
      if (falharEm.includes(produtoId)) throw new Error('o servidor recusou');
      return itens;
    },
  };
  const t = subir(TELA, { Bora, globais: { window: {} } });
  return { ...t, gravadas };
}

const assentar = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };

async function abrir(opts) {
  const t = montar(opts);
  await t.carregarPagina();
  await assentar();
  t.gravadas.length = 0;
  return t;
}

async function usar(t, texto, { sóConferir = false } = {}) {
  t.get('fiTexto').value = texto;
  await t.get('fiConferir').__disparar('click');
  await assentar();
  if (sóConferir) return;
  await t.get('fiCriar').__disparar('click');   // 1º clique: pede confirmação
  await assentar();
  await t.get('fiCriar').__disparar('click');   // 2º clique: grava
  await assentar();
}

const TRES_LINHAS = [
  'Copo de Açaí 300ml ; Polpa de Açaí ; 0,3',
  'Copo de Açaí 300ml ; Copo 300ml ; 1',
  'Copo de Açaí 300ml ; Tampa 300ml ; 1',
].join('\n');

// ---------------------------------------------------------------- o caminho feliz
test('as linhas do mesmo produto viram UMA ficha', async () => {
  const t = await abrir();
  await usar(t, TRES_LINHAS);

  assert.equal(t.gravadas.length, 1, 'esperava uma gravação, uma por produto');
  assert.equal(t.gravadas[0].produtoId, 10);
  // JSON.parse(JSON.stringify(...)): o `vm` do harness devolve objetos de OUTRO realm, e o
  // deepStrictEqual compara prototipo -- ele falha com "mesma estrutura, referencia diferente".
  assert.deepEqual(JSON.parse(JSON.stringify(t.gravadas[0].itens)), [
    { insumoId: 1, quantidade: 0.3 },
    { insumoId: 2, quantidade: 1 },
    { insumoId: 3, quantidade: 1 },
  ]);
});

test('PREMISSA: a quantidade decimal em pt-BR chega certa', async () => {
  // "0,3" de polpa virando 3 seria dez vezes o consumo; virando 0, nenhum.
  const t = await abrir();
  await usar(t, 'Copo de Açaí 300ml ; Polpa de Açaí ; 0,3');
  assert.equal(t.gravadas[0].itens[0].quantidade, 0.3);
});

test('produtos diferentes viram gravacoes diferentes', async () => {
  const t = await abrir();
  await usar(t, [
    'Copo de Açaí 300ml ; Copo 300ml ; 1',
    'Copo de Açaí 500ml ; Polpa de Açaí ; 0,5',
  ].join('\n'));
  assert.deepEqual(t.gravadas.map((g) => g.produtoId).sort(), [10, 11]);
});

test('o mesmo insumo duas vezes no mesmo produto SOMA', async () => {
  // "Leite Condensado 1" e "Leite Condensado 2" é o lojista dizendo 3 — não uma linha vencendo a
  // outra em silêncio.
  const t = await abrir();
  await usar(t, [
    'Barca de Açaí Gourmet ; Leite Condensado ; 1',
    'Barca de Açaí Gourmet ; Leite Condensado ; 2',
  ].join('\n'));
  assert.equal(t.gravadas[0].itens.length, 1);
  assert.equal(t.gravadas[0].itens[0].quantidade, 3);
});

test('casar nome ignora caixa e espaco', async () => {
  const t = await abrir();
  await usar(t, '  copo de açaí 300ML  ;  polpa de açaí  ; 0,3');
  assert.equal(t.gravadas[0].produtoId, 10);
  assert.equal(t.gravadas[0].itens[0].insumoId, 1);
});

// ---------------------------------------------------------------- a substituição
test('PREMISSA: avisa que a ficha ATUAL sera substituida, com os numeros', async () => {
  // É o estrago mais caro desta tela: o ingrediente que sumiu deixa de baixar do estoque, e isso
  // só aparece no inventário do fim do mês.
  const t = await abrir({ fichas: { 10: [{ insumoId: 1 }, { insumoId: 2 }, { insumoId: 4 }] } });
  await usar(t, 'Copo de Açaí 300ml ; Polpa de Açaí ; 0,3', { sóConferir: true });

  const p = t.get('fiPreview').innerHTML;
  assert.match(p, /substitu[íi]da/i, 'não avisou que a ficha será substituída');
  assert.match(p, /3 ingrediente\(s\) hoje/, 'não disse quantos tem hoje');
  assert.match(p, /vai ficar com 1/, 'não disse quantos vai ficar');
});

test('produto SEM ficha nao vira aviso de substituicao', async () => {
  const t = await abrir({ fichas: {} });
  await usar(t, TRES_LINHAS, { sóConferir: true });
  assert.ok(!/substitu[íi]da/i.test(t.get('fiPreview').innerHTML),
    'assustou o lojista com um aviso que não se aplica');
});

// ---------------------------------------------------------------- o segundo clique
test('PREMISSA: o primeiro clique em Gravar NAO grava', async () => {
  const t = await abrir();
  t.get('fiTexto').value = TRES_LINHAS;
  await t.get('fiConferir').__disparar('click');
  await assentar();
  await t.get('fiCriar').__disparar('click');
  await assentar();

  assert.equal(t.gravadas.length, 0, 'gravou no primeiro clique');
  assert.match(t.get('fiMsg').textContent, /de novo para confirmar/i);
});

test('mexer no texto entre os cliques cancela a confirmacao', async () => {
  const t = await abrir();
  t.get('fiTexto').value = TRES_LINHAS;
  await t.get('fiConferir').__disparar('click'); await assentar();
  await t.get('fiCriar').__disparar('click'); await assentar();

  t.get('fiTexto').value = 'Copo de Açaí 500ml ; Polpa de Açaí ; 0,5';
  await t.get('fiTexto').__disparar('input');
  await t.get('fiCriar').__disparar('click'); await assentar();

  assert.equal(t.gravadas.length, 0, 'gravou uma lista diferente da que foi conferida');
});

// ---------------------------------------------------------------- recusas
test('PREMISSA: produto que nao existe e RECUSADO, nao ignorado', async () => {
  const t = await abrir();
  await usar(t, 'Produto Que Nao Existe ; Polpa de Açaí ; 1');
  assert.equal(t.gravadas.length, 0);
  assert.match(t.get('fiPreview').innerHTML, /não existe o produto/i);
});

test('PREMISSA: insumo que nao existe e RECUSADO, e a linha NAO entra', async () => {
  const t = await abrir();
  await usar(t, [
    'Copo de Açaí 300ml ; Polpa de Açaí ; 0,3',
    'Copo de Açaí 300ml ; Insumo Inventado ; 1',
  ].join('\n'));

  assert.equal(t.gravadas[0].itens.length, 1,
    'a linha do insumo inexistente entrou de algum jeito');
  assert.match(t.get('fiPreview').innerHTML, /não existe o insumo/i);
  assert.match(t.get('fiPreview').innerHTML, /nunca baixa do estoque/i,
    'precisa dizer o que uma linha recusada causa');
});

test('quantidade invalida e recusada', async () => {
  const t = await abrir();
  await usar(t, 'Copo de Açaí 300ml ; Polpa de Açaí ; abc');
  assert.equal(t.gravadas.length, 0);
  assert.match(t.get('fiPreview').innerHTML, /quantidade inválida/i);
});

test('quantidade zero ou negativa e recusada', async () => {
  // Zero numa ficha é um ingrediente que não consome nada: ou é engano, ou a linha não devia
  // existir. Guardar isso só faz o custo sair menor do que é.
  for (const q of ['0', '-1', '0,0']) {
    const t = await abrir();
    await usar(t, 'Copo de Açaí 300ml ; Polpa de Açaí ; ' + q);
    assert.equal(t.gravadas.length, 0, 'aceitou quantidade ' + q);
  }
});

test('linha sem os tres campos e recusada', async () => {
  const t = await abrir();
  await usar(t, 'Copo de Açaí 300ml ; Polpa de Açaí');
  assert.equal(t.gravadas.length, 0);
  assert.match(t.get('fiPreview').innerHTML, /faltou campo/i);
});

// ---------------------------------------------------------------- falha no meio
test('PREMISSA: falha no meio NAO vira "pronto", e nomeia quem ficou de fora', async () => {
  const t = await abrir({ falharEm: [11] });
  await usar(t, [
    'Copo de Açaí 300ml ; Copo 300ml ; 1',
    'Copo de Açaí 500ml ; Polpa de Açaí ; 0,5',
  ].join('\n'));

  assert.match(t.get('fiMsg').textContent, /1 de 2/);
  assert.match(t.get('fiPreview').innerHTML, /não gravaram/i);
  assert.match(t.get('fiPreview').innerHTML, /Copo de Açaí 500ml/);
});

test('falha num produto nao impede os outros', async () => {
  const t = await abrir({ falharEm: [10] });
  await usar(t, [
    'Copo de Açaí 300ml ; Copo 300ml ; 1',
    'Copo de Açaí 500ml ; Polpa de Açaí ; 0,5',
  ].join('\n'));
  assert.equal(t.gravadas.length, 2, 'parou no primeiro erro em vez de seguir');
});

// ---------------------------------------------------------------- comentários
//
// O rascunho que eu entrego vem com a parte certa pronta para colar (embalagem, que é sempre 1) e
// a parte que depende da loja marcada com `#` ao lado. Sem aceitar comentário, colar o rascunho
// só geraria uma lista de erros.

test('linha que comeca com # e ignorada, e nao recusada', async () => {
  const t = await abrir();
  await usar(t, [
    '# Copo de Açaí 300ml ; Polpa de Açaí ; ?  <- a Zirá preenche',
    'Copo de Açaí 300ml ; Copo 300ml ; 1',
  ].join('\n'));

  assert.equal(t.gravadas.length, 1);
  assert.equal(t.gravadas[0].itens.length, 1, 'o comentário entrou como ingrediente');
  assert.ok(!/recusada/i.test(t.get('fiPreview').innerHTML),
    'o comentário foi tratado como linha com erro');
});

test('PREMISSA: o numero da linha no erro e o do texto colado, contando comentarios', async () => {
  // Apontar "linha 1" quando o lojista conta 3 no editor manda ele procurar no lugar errado.
  const t = await abrir();
  await usar(t, [
    '# cabeçalho',
    '',
    'Copo de Açaí 300ml ; Insumo Que Nao Existe ; 1',
  ].join('\n'));

  assert.match(t.get('fiPreview').innerHTML, /linha 3:/,
    'o número da linha não bate com o que o lojista vê no editor');
});
