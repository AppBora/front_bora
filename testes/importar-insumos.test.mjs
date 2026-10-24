// Importar insumos em lote.
//
// POR QUE A TELA EXISTE: a de Insumos cadastra um por vez. Uma açaiteria tem copo de 300, 500 e
// 770, pote, barca, roleta, polpa, granola, leite condensado e mais vinte adicionais — perto de
// quarenta linhas. Na mão é meia hora de clique, e o erro de digitação não aparece na hora: vira
// um insumo repetido com nome quase igual, e a ficha técnica do produto aponta para o errado.
//
// O QUE ESTE TESTE PROTEGE:
// 1) NÃO DUPLICAR. Insumo repetido quebra a ficha técnica, e o estrago só aparece quando alguém
//    vende e a baixa sai do insumo errado.
// 2) UNIDADE INVÁLIDA É RECUSADA NA CONFERÊNCIA. O servidor aceitaria calado, e o insumo ficaria
//    com uma unidade que nenhuma tela sabe mostrar nem somar.
// 3) PREÇO COM PONTO. "12.50" já entrou como R$ 1.250,00 uma vez (item 7.6), e o import é
//    justamente onde alguém cola planilha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const TELA = RAIZ + '/assets/js/importar-insumos.js';

const EXISTENTES = [
  { id: 1, nome: 'Granola', unidade: 'kg', custo: 18.9, estoque: 4, estoqueMinimo: 1 },
];

function montar({ existentes = EXISTENTES, falharEm = [], confirmar = true } = {}) {
  const chamadas = [];
  const Bora = {
    requireAuth: () => true,
    api: async (rota, opcoes) => {
      if (!opcoes) return JSON.parse(JSON.stringify(existentes));   // GET /api/insumos
      const corpo = JSON.parse(opcoes.body);
      chamadas.push({ rota, metodo: opcoes.method, corpo });
      if (falharEm.includes(corpo.nome)) throw new Error('o servidor recusou');
      return { id: 99 };
    },
  };
  const t = subir(TELA, { Bora, globais: { confirm: () => confirmar } });
  return { ...t, chamadas };
}

async function assentar() { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)); }

async function abrir(opts) {
  const t = montar(opts);
  await t.carregarPagina();
  await assentar();
  t.chamadas.length = 0;
  return t;
}

async function usar(t, texto, { sóConferir = false } = {}) {
  t.get('insImpTexto').value = texto;
  await t.get('insImpConferir').__disparar('click');
  await assentar();
  if (sóConferir) return;
  await t.get('insImpCriar').__disparar('click');
  await assentar();
}

// ---------------------------------------------------------------- o caminho feliz
test('cadastra os insumos novos, com estoque zerado', async () => {
  const t = await abrir();
  await usar(t, ['Copo 500ml ; un ; 0,38', 'Água Mineral 500ml ; un ; 1,20'].join('\n'));

  assert.equal(t.chamadas.length, 2);
  assert.ok(t.chamadas.every((c) => c.metodo === 'POST'));
  const copo = t.chamadas[0].corpo;
  assert.equal(copo.nome, 'Copo 500ml');
  assert.equal(copo.unidade, 'un');
  assert.equal(copo.custo, 0.38);
  assert.equal(copo.estoque, 0, 'o insumo tem de nascer no controle de estoque, em zero');
});

test('o custo e opcional', async () => {
  const t = await abrir();
  await usar(t, 'Copo 300ml ; un');
  assert.equal(t.chamadas[0].corpo.custo, 0);
  assert.equal(t.chamadas[0].corpo.unidade, 'un');
});

test('sem unidade, assume "un"', async () => {
  const t = await abrir();
  await usar(t, 'Tampa 500ml');
  assert.equal(t.chamadas[0].corpo.unidade, 'un');
});

// ---------------------------------------------------------------- não duplicar
test('PREMISSA: insumo que ja existe NAO e cadastrado de novo', async () => {
  const t = await abrir();
  await usar(t, ['Granola ; kg ; 22,00', 'Copo 500ml ; un ; 0,38'].join('\n'));

  assert.equal(t.chamadas.length, 1, 'duplicou a Granola: a ficha tecnica passa a apontar errado');
  assert.equal(t.chamadas[0].corpo.nome, 'Copo 500ml');
});

test('PREMISSA: insumo que ja existe tambem nao tem o custo regravado', async () => {
  const t = await abrir();
  await usar(t, 'Granola ; kg ; 22,00');
  assert.equal(t.chamadas.length, 0, 'mexeu no custo de um insumo que ja existia');
});

test('casar nome ignora maiuscula e espaco', async () => {
  const t = await abrir();
  await usar(t, '  granola  ; kg ; 22,00');
  assert.equal(t.chamadas.length, 0, 'duplicou por diferenca de caixa ou espaco');
});

test('nome repetido DENTRO da lista entra uma vez so', async () => {
  const t = await abrir();
  await usar(t, ['Copo 500ml ; un ; 0,38', 'copo 500ml ; un ; 0,40'].join('\n'));
  assert.equal(t.chamadas.length, 1, 'a propria lista duplicou o insumo');
});

// ---------------------------------------------------------------- recusas
test('PREMISSA: unidade que nao existe e RECUSADA, nao enviada', async () => {
  const t = await abrir();
  await usar(t, 'Polpa de Açaí ; litro ; 12,00');

  assert.equal(t.chamadas.length, 0,
    'mandou uma unidade que nenhuma tela entende — o servidor aceitaria calado');
  // o esc() vira as aspas em &quot;, entao confiro os pedacos, nao a frase com aspas
  assert.match(t.get('insImpPreview').innerHTML, /unidade .{0,8}litro.{0,8} não existe/);
  assert.match(t.get('insImpPreview').innerHTML, /un, kg, g, L, ml/);
});

test('linha sem nome e recusada, e as outras seguem', async () => {
  const t = await abrir();
  await usar(t, [' ; un ; 1,00', 'Copo 770ml ; un ; 0,45'].join('\n'));
  assert.equal(t.chamadas.length, 1);
  assert.equal(t.chamadas[0].corpo.nome, 'Copo 770ml');
});

test('cancelar no confirm nao cadastra nada', async () => {
  const t = await abrir({ confirmar: false });
  await usar(t, 'Copo 500ml ; un ; 0,38');
  assert.equal(t.chamadas.length, 0);
});

// ---------------------------------------------------------------- o preço
test('PREMISSA: custo com ponto decimal nao vira cem vezes mais caro', async () => {
  // Item 7.6: "12.50" ja entrou como R$ 1.250,00.
  const t = await abrir();
  await usar(t, 'Polpa de Açaí ; kg ; 12.50');
  assert.equal(t.chamadas[0].corpo.custo, 12.50);
});

test('custo com separador de milhar continua certo', async () => {
  const t = await abrir();
  await usar(t, 'Caixa de Açaí 10L ; un ; 1.250');
  assert.equal(t.chamadas[0].corpo.custo, 1250);
});

// ---------------------------------------------------------------- a conferência
test('a conferencia conta, e NAO cadastra', async () => {
  const t = await abrir();
  await usar(t, ['Granola ; kg', 'Copo 500ml ; un', 'Copo 300ml ; un'].join('\n'),
    { sóConferir: true });

  assert.equal(t.chamadas.length, 0, 'conferir cadastrou alguma coisa');
  const p = t.get('insImpPreview').innerHTML;
  assert.match(p, /2 a cadastrar/);
  assert.match(p, /1 já existe/);
  assert.match(p, /Granola/, 'nao disse QUAL insumo foi pulado');
});

// ---------------------------------------------------------------- falha no meio
test('PREMISSA: falha no meio NAO vira "pronto", e nomeia quem ficou de fora', async () => {
  const t = await abrir({ falharEm: ['Copo 500ml'] });
  await usar(t, ['Copo 500ml ; un', 'Copo 300ml ; un'].join('\n'));

  assert.match(t.get('insImpMsg').textContent, /1 de 2/);
  const p = t.get('insImpPreview').innerHTML;
  assert.match(p, /não entraram/i);
  assert.match(p, /Copo 500ml/);
});

test('falha num insumo nao impede os outros', async () => {
  const t = await abrir({ falharEm: ['Copo 500ml'] });
  await usar(t, ['Copo 500ml ; un', 'Copo 300ml ; un'].join('\n'));
  assert.equal(t.chamadas.length, 2, 'parou no primeiro erro em vez de seguir');
});

// ---------------------------------------------------------------- o botao mudo
//
// DEFEITO DE VERDADE, achado pelo dono usando (24/10): ele colou a lista, clicou em "Cadastrar" e
// a tela NAO FEZ NADA, sem uma palavra. O botao nascia `disabled` e so ligava depois do
// "Conferir" -- e nada na tela dizia isso. Botao que morre calado e pior que botao que da erro.

test('PREMISSA: colar e clicar em Cadastrar DIRETO funciona, sem passar pelo Conferir', async () => {
  const t = await abrir();
  t.get('insImpTexto').value = ['Copo 500ml ; un ; 0,38', 'Copo 300ml ; un'].join('\n');
  await t.get('insImpCriar').__disparar('click');
  await assentar();

  assert.equal(t.chamadas.length, 2,
    'o botao Cadastrar nao fez nada sem o Conferir -- foi assim que o dono bateu de cara');
  assert.equal(t.chamadas[0].corpo.nome, 'Copo 500ml');
});

test('clicar em Cadastrar com a caixa VAZIA diz o que fazer, em vez de ficar mudo', async () => {
  const t = await abrir();
  await t.get('insImpCriar').__disparar('click');
  await assentar();
  assert.equal(t.chamadas.length, 0);
  assert.match(t.get('insImpMsg').textContent, /cole a lista/i);
});

test('quando tudo da lista ja existe, a tela DIZ, em vez de ficar muda', async () => {
  const t = await abrir();
  t.get('insImpTexto').value = 'Granola ; kg';
  await t.get('insImpCriar').__disparar('click');
  await assentar();
  assert.equal(t.chamadas.length, 0);
  assert.match(t.get('insImpMsg').textContent, /j[áa] existem/i);
});
