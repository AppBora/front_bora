// O quadro de pedidos na virada da meia-noite. Achado pelo QA em 26/10/2026, e o que eu medi é pior
// do que o que estava anotado.
//
// O QUE ESTAVA ANOTADO: "o quadro reimprime comandas na virada do dia".
//
// O QUE EU MEDI, lendo o código: o campo `#dia` é preenchido com a data NO CARREGAMENTO da página
// (`el.value = hojeISO()`), e o recarregamento automático só roda enquanto esse valor é igual a hoje
// (`diaEscolhido() === hojeISO() ? carregar() : null`). Passada a meia-noite com a tela aberta, o
// valor do campo é de ontem e o de hoje é outro: **o quadro para de atualizar para sempre**.
//
// Numa açaiteria ou pizzaria aberta depois da meia-noite isso significa: pedido novo não aparece, não
// apita, não imprime — e o "Atualizado 23:59" fica congelado na tela dizendo que está tudo bem,
// porque o "Dia fechado" só é escrito por `aoTrocarDia`, que ninguém chama na virada. A cozinha não
// vê o pedido e o cliente espera.
//
// A REIMPRESSÃO é o segundo sintoma da mesma raiz: quando o lojista percebe e clica em "Hoje", o
// `detectarNovos` ainda tem os ids de RECEBIDO de ontem, então todo pedido aberto do dia novo conta
// como novidade — apita e, com a impressão automática ligada, sai tudo na impressora de uma vez.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { subir } from './harness.mjs';

const ARQUIVO = path.join(import.meta.dirname, '..', 'assets', 'js', 'pedidos.js');

const HOJE = '2026-10-27';
const ONTEM = '2026-10-26';

/** Sobe a tela com um relógio que eu controlo e um board por dia. */
async function quadro({ agora = HOJE, boards = {}, autoPrint = false } = {}) {
  const pedidos = [];
  const impressos = [];
  const apitos = [];
  let dataFalsa = agora;

  // `hojeISO()` usa `new Date(Date.now() - offset)`: controlo pelo Date.now.
  const DateReal = Date;
  class DataDoTeste extends DateReal {
    constructor(...args) {
      if (args.length === 0) super(dataFalsa + 'T12:00:00Z');
      else super(...args);
    }
    static now() { return new DateReal(dataFalsa + 'T12:00:00Z').getTime(); }
    getTimezoneOffset() { return 0; }
  }

  const app = subir(ARQUIVO, {
    Bora: {
      requireAuth: () => true,
      user: () => ({ papel: 'GERENTE' }),
      board: async (dia) => { pedidos.push(dia); return boards[dia] || []; },
      api: async () => ({}),
      repetir: (fn) => { app.__tick = fn; },
      _conexao() {},
      logout() {},
    },
    globais: {
      Date: DataDoTeste,
      boraBeep: () => apitos.push(1),
      boraPrintComanda: (p) => impressos.push(p.id),
      boraToast() {},
      boraCanal: () => ({ ic: '', key: 'Cardápio', cor: '#000' }),
      money: v => 'R$ ' + v,
      localStorage: {
        getItem: k => (k === 'boraAutoPrint' && autoPrint ? '1' : null),
        setItem() {}, removeItem() {},
      },
    },
    comSeletores: true,
  });

  await app.carregarPagina();
  return {
    app, pedidos, impressos, apitos,
    diaNoCampo: () => app.get('dia').value,
    rotulo: () => app.get('liveTxt').textContent,
    viraODia: (novo) => { dataFalsa = novo; },
    // A impressão sai num `setTimeout(..., 400)`: sem esperar, `impressos` está sempre vazio e TODO
    // teste de impressão passa verde medindo nada. Aconteceu duas vezes neste arquivo — a segunda só
    // apareceu quando o mutante matou UM teste em vez de dois, e o que sobreviveu era meu falso
    // verde, não código certo.
    esperarImpressao: () => new Promise(r => setTimeout(r, 450)),
    async tick() { await app.__tick(); await new Promise(r => setTimeout(r, 450)); },
  };
}

function pedido(id, status = 'RECEBIDO') {
  return { id, codigo: 'P' + id, status, origem: 'CARDAPIO', valorTotal: 30, clienteNome: 'Ana' };
}

// ---------------------------------------------------------------- a premissa
test('PREMISSA: a tela preenche o campo do dia e busca o quadro desse dia', async () => {
  // Sem isto, uma tela que não carrega nada faria todo assert abaixo passar vazio.
  //
  // Duas buscas ao abrir, e não uma: o `ligarControlesDeDia` termina chamando `aoTrocarDia`, que
  // recarrega, e o DOMContentLoaded chama `carregar` de novo. É pré-existente e inofensivo (duas
  // buscas idênticas) — está escrito aqui porque foi isto que reprovou a primeira versão deste
  // teste, e não quero que o próximo a ler ache que achou um defeito.
  const q = await quadro({ boards: { [HOJE]: [pedido(1)] } });
  assert.equal(q.diaNoCampo(), HOJE, 'o campo do dia não foi preenchido');
  assert.deepEqual(new Set(q.pedidos), new Set([HOJE]), 'buscou o quadro de outro dia');
  assert.ok(q.pedidos.length >= 1, 'não buscou o quadro de hoje');
});

test('PREMISSA: enquanto o dia não vira, o recarregamento continua acontecendo', async () => {
  const q = await quadro({ boards: { [HOJE]: [] } });
  const antes = q.pedidos.length;
  await q.tick();
  assert.ok(q.pedidos.length > antes, 'o recarregamento parou sem motivo');
});

// ---------------------------------------------------------------- 1. a virada
test('o quadro NÃO PARA na virada da meia-noite', async () => {
  const q = await quadro({ boards: { [ONTEM]: [], [HOJE]: [] }, agora: ONTEM });
  assert.equal(q.diaNoCampo(), ONTEM);

  q.viraODia(HOJE);
  await q.tick();

  assert.equal(q.diaNoCampo(), HOJE,
    'o campo ficou no dia de ontem: o recarregamento para e o quadro congela para sempre');
  assert.ok(q.pedidos.includes(HOJE),
    'não buscou o quadro do dia novo: pedido da madrugada nunca aparece na cozinha');
});

test('depois da virada ele continua ao vivo', async () => {
  const q = await quadro({ boards: { [ONTEM]: [], [HOJE]: [] }, agora: ONTEM });
  q.viraODia(HOJE);
  await q.tick();            // a virada
  const antes = q.pedidos.length;
  await q.tick();            // o tique seguinte
  assert.ok(q.pedidos.length > antes, 'parou de atualizar depois de virar o dia');
});

test('depois da virada o rótulo volta a ser de dia ao vivo', async () => {
  // Antes: o rótulo ficava congelado em "Atualizado 23:59" e a tela afirmava estar atualizada
  // enquanto o quadro já não era mais recarregado.
  const q = await quadro({ boards: { [ONTEM]: [], [HOJE]: [] }, agora: ONTEM });
  q.viraODia(HOJE);
  await q.tick();
  assert.match(q.rotulo(), /^Atualizado /, 'rótulo: ' + q.rotulo());
});

test('em dia FECHADO o rótulo diz "Dia fechado", e não uma hora', async () => {
  // O `aoTrocarDia` escrevia "Dia fechado" e o `carregar` da linha seguinte sobrescrevia com
  // "Atualizado hh:mm": o lojista perdia o único sinal de que o quadro não está mais ao vivo, e
  // pedido já entregue parecia estar esperando.
  const q = await quadro({ boards: { [HOJE]: [], [ONTEM]: [] } });
  const el = q.app.get('dia');
  el.value = ONTEM;
  await el.__disparar('change');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(q.rotulo(), 'Dia fechado', 'rótulo: ' + q.rotulo());
});

// ---------------------------------------------------------------- 2. a reimpressão
test('a virada do dia NÃO reimprime as comandas abertas', async () => {
  // O sintoma que estava anotado. Ontem tinha os pedidos 1 e 2 abertos; hoje tem 3 e 4.
  const q = await quadro({
    agora: ONTEM, autoPrint: true,
    boards: { [ONTEM]: [pedido(1), pedido(2)], [HOJE]: [pedido(3), pedido(4)] },
  });
  assert.deepEqual(q.impressos, [], 'a primeira carga já imprimiu');

  q.viraODia(HOJE);
  await q.tick();

  assert.deepEqual(q.impressos, [],
    'o quadro do dia novo saiu todo na impressora: uma pilha de comandas de uma vez, com o cliente '
    + 'do lado');
  assert.deepEqual(q.apitos, [], 'apitou para pedido que não é novo');
});

test('trocar para um dia FECHADO e voltar não reimprime nada', async () => {
  const q = await quadro({
    autoPrint: true,
    boards: { [HOJE]: [pedido(3), pedido(4)], [ONTEM]: [pedido(1)] },
  });
  const el = q.app.get('dia');

  el.value = ONTEM;
  await el.__disparar('change');     // olhar o dia fechado
  await q.esperarImpressao();
  el.value = HOJE;
  await el.__disparar('change');     // e voltar
  await q.esperarImpressao();

  assert.deepEqual(q.impressos, [],
    'voltar de um dia fechado reimprimia o quadro inteiro de hoje');
});

test('mas o pedido REALMENTE novo continua apitando e imprimindo', async () => {
  // O conserto não pode calar o alerta: é ele que faz a cozinha ver o pedido.
  const boards = { [HOJE]: [pedido(3)] };
  const q = await quadro({ autoPrint: true, boards });

  boards[HOJE] = [pedido(3), pedido(9)];
  await q.tick();

  assert.deepEqual(q.impressos, [9], 'o pedido novo não saiu na impressora');
  assert.deepEqual(q.apitos, [1], 'o pedido novo não apitou');
});

test('pedido novo na MADRUGADA, depois da virada, apita', async () => {
  // O caso que junta os dois consertos: a loja aberta às 00:10 recebe um pedido.
  const boards = { [ONTEM]: [pedido(1)], [HOJE]: [] };
  const q = await quadro({ agora: ONTEM, autoPrint: true, boards });

  q.viraODia(HOJE);
  await q.tick();                      // a virada: nada a alertar
  assert.deepEqual(q.impressos, []);

  boards[HOJE] = [pedido(50)];
  await q.tick();                      // o pedido da madrugada

  assert.deepEqual(q.impressos, [50], 'o pedido da madrugada não chegou na impressora');
});

// ---------------------------------------------------------------- 3. o dia fechado fica parado
test('dia FECHADO escolhido pelo lojista NÃO é arrastado pela virada', async () => {
  // Ele pediu para ver um dia específico. Puxar a tela dele para hoje porque o relógio virou seria
  // trocar o que ele está lendo embaixo do nariz dele.
  const q = await quadro({ boards: { [HOJE]: [], [ONTEM]: [], '2026-10-20': [] } });
  const el = q.app.get('dia');

  el.value = '2026-10-20';
  await el.__disparar('change');
  const buscasAntes = q.pedidos.length;

  q.viraODia('2026-10-28');
  await q.tick();

  assert.equal(q.diaNoCampo(), '2026-10-20', 'arrastou o lojista para fora do dia que ele abriu');
  assert.equal(q.pedidos.length, buscasAntes, 'dia fechado voltou a ser recarregado sozinho');
  assert.equal(q.rotulo(), 'Dia fechado', 'rótulo: ' + q.rotulo());
});
