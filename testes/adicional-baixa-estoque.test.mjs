// O vínculo do adicional com o insumo, na tela de complementos.
//
// POR QUE ISTO É TESTE E NÃO SÓ UM CAMPO: desde a V55 (item 2.6 da varredura) o adicional baixa
// estoque pelo insumo que ele consome. Se esta tela parar de mandar os dois campos, ou mandar errado,
// o lojista escolhe a granola, salva, vê "✅ Salvo!" — e o estoque continua não baixando. Sem erro,
// sem log, e ele conclui que o sistema não funciona. Ver AdicionalGuardaOinsumoTest no backend, que
// cobre o outro lado.
//
// O que é testado aqui é a MONTAGEM DO CORPO, que é regra, não DOM. A leitura dos campos é DOM e fica
// na tela; por isso a tela foi separada em "ler" e "montar", e a montagem mora numa função pura.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const fonte = fs.readFileSync(RAIZ + 'assets/js/complementos-gestao.js', 'utf8');

/** Sobe só as funções puras da tela, sem DOM. */
function telaPura() {
  const janela = {};
  const ctx = vm.createContext({
    window: janela, document: { getElementById: () => null }, console, Number, String, Object, Array,
    JSON, Math, Promise,
  });
  vm.runInContext(fonte, ctx, { filename: 'complementos-gestao.js' });
  return janela;
}

/** Um grupo lido da tela, com uma opção. Os valores vêm como STRING, igual ao `input.value`. */
function lido(item) {
  return [{ nome: 'Adicionais', minimo: '0', maximo: '5',
    itens: [{ nome: 'Granola', preco: '3.00', insumoId: '', quantidade: '', ...item }] }];
}

// ------------------------------------------------------------------ o corpo que vai para o servidor

test('adicional: o insumo e a quantidade vão no corpo', () => {
  const { __compCorpo } = telaPura();

  const corpo = __compCorpo(lido({ insumoId: '50', quantidade: '0.030' }));

  assert.equal(corpo[0].itens[0].insumoId, 50);
  assert.equal(corpo[0].itens[0].quantidade, 0.03);
});

test('adicional: quantidade com VÍRGULA é aceita', () => {
  // O lojista digita "0,030". Sem a troca por ponto o Number dá NaN e o vínculo era descartado sem
  // ninguém avisar — o pior jeito de falhar nesta tela.
  const { __compCorpo } = telaPura();

  assert.equal(__compCorpo(lido({ insumoId: '50', quantidade: '0,030' }))[0].itens[0].quantidade, 0.03);
});

test('adicional: os dois campos andam juntos', () => {
  const { __compCorpo } = telaPura();

  const soInsumo = __compCorpo(lido({ insumoId: '50', quantidade: '' }))[0].itens[0];
  assert.equal(soInsumo.insumoId, null, 'insumo sem quantidade não liga nada');
  assert.equal(soInsumo.quantidade, null);

  const soQtd = __compCorpo(lido({ insumoId: '', quantidade: '0.030' }))[0].itens[0];
  assert.equal(soQtd.insumoId, null, 'quantidade sem insumo não tem o que baixar');
  assert.equal(soQtd.quantidade, null);
});

test('adicional: quantidade ZERO ou negativa não liga o insumo', () => {
  const { __compCorpo } = telaPura();

  assert.equal(__compCorpo(lido({ insumoId: '50', quantidade: '0' }))[0].itens[0].insumoId, null);
  assert.equal(__compCorpo(lido({ insumoId: '50', quantidade: '-1' }))[0].itens[0].insumoId, null);
});

test('adicional: o nome e o preço continuam funcionando', () => {
  // O recurso novo não pode quebrar o que a tela já fazia.
  const { __compCorpo } = telaPura();

  const item = __compCorpo(lido({}))[0].itens[0];
  assert.equal(item.nome, 'Granola');
  assert.equal(item.preco, 3);
});

test('adicional: opção sem nome é descartada, grupo sem nome também', () => {
  const { __compCorpo } = telaPura();

  assert.equal(__compCorpo(lido({ nome: '  ' }))[0].itens.length, 0);
  assert.equal(__compCorpo([{ nome: '', minimo: '0', maximo: '1', itens: [] }]).length, 0);
});

test('adicional: lista vazia ou nula não estoura', () => {
  const { __compCorpo } = telaPura();

  // `deepEqual` estrito compara o prototipo, e o array nasce dentro do `vm` -- o que importa aqui e
  // que nao estoura e que volta vazio.
  assert.equal(__compCorpo([]).length, 0);
  assert.equal(__compCorpo(null).length, 0);
  assert.equal(__compCorpo(undefined).length, 0);
});

// ------------------------------------------------------------------ o aviso que salva o lojista

test('adicional: avisa quando o insumo foi escolhido e a quantidade ficou vazia', () => {
  // É o erro mais provável desta tela, e o mais silencioso: salva, diz "Salvo!", e não baixa nada.
  const { __compAviso } = telaPura();

  const aviso = __compAviso(lido({ insumoId: '50', quantidade: '' }));

  assert.ok(aviso, 'tem que avisar');
  assert.match(aviso, /Granola/);
  assert.match(aviso, /sem quantidade/);
});

test('adicional: NÃO avisa quando está tudo preenchido', () => {
  const { __compAviso } = telaPura();

  assert.equal(__compAviso(lido({ insumoId: '50', quantidade: '0,030' })), null);
});

test('adicional: NÃO avisa quando o lojista não escolheu insumo nenhum', () => {
  // É o padrão, e é todo adicional que não controla estoque. Avisar aqui seria barulho em cima do
  // uso normal da tela.
  const { __compAviso } = telaPura();

  assert.equal(__compAviso(lido({})), null);
});

// ------------------------------------------------------------------ a validação que já existia

test('adicional: mínimo maior que o número de opções continua sendo barrado', () => {
  // O cardápio exigiria a escolha e não haveria opção suficiente: o cliente nunca fecharia o pedido.
  const { __compCorpo, __compProblema } = telaPura();

  const corpo = __compCorpo([{ nome: 'Tamanho', minimo: '2', maximo: '3', itens: [] }]);

  assert.match(__compProblema(corpo), /nunca conseguiria fechar/);
});

test('adicional: cadastro válido não é barrado', () => {
  const { __compCorpo, __compProblema } = telaPura();

  const corpo = __compCorpo(lido({ insumoId: '50', quantidade: '0,030' }));

  assert.equal(__compProblema(corpo), null);
});

// ------------------------------------------------------------------ a tela manda e mostra

test('adicional: a tela MANDA o corpo montado pela função pura, não um objeto montado na mão', () => {
  // Se alguém voltar a montar o corpo dentro do clique, os testes acima param de medir a tela.
  assert.match(fonte, /const corpo = window\.__compCorpo\(lidos\)/,
    'o salvar tem que usar o __compCorpo, senão a regra testada não é a que roda');
  assert.match(fonte, /body: JSON\.stringify\(corpo\)/);
});

test('adicional: a tela lê os quatro campos da opção', () => {
  const salvar = fonte.match(/const lidos = \[\.\.\.wrap\.querySelectorAll\('\.cg-grupo'\)\][\s\S]*?\}\)\);/);
  assert.ok(salvar, 'não achei a leitura da tela');
  for (const campo of ['cg-inome', 'cg-ipreco', 'cg-iinsumo', 'cg-iqtd']) {
    assert.ok(salvar[0].includes(campo), 'a leitura parou de olhar o campo ' + campo);
  }
});

test('adicional: a unidade do insumo aparece ao lado da quantidade', () => {
  // Sem ela o lojista digita 30 pensando em gramas num insumo cadastrado em quilo, e o estoque
  // derrete 1000x mais rápido do que deveria.
  assert.match(fonte, /cg-iun/, 'a tela perdeu o campo que mostra a unidade');
  assert.match(fonte, /i\.unidade \|\| 'un'/, 'a lista de insumos tem que mostrar a unidade');
});
