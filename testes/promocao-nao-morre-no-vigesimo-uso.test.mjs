// Item 7.8 da varredura: a promoção morria no 20º uso e não havia como encerrá-la.
//
// Duas coisas no mesmo lugar. O `limiteUsos: 20` era FIXO no código da tela, sem campo e sem aviso:
// loja que faz 50 pedidos numa noite via o cupom parar de valer no meio e não tinha como descobrir
// por quê. E o endpoint de encerrar existia no servidor desde o início — nenhuma tela o chamava,
// então promoção só terminava vencendo ou batendo o limite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const ARQ = process.env.PROMOCOES_JS
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/promocoes.js';

const promo = (o) => ({
  id: 1, codigo: 'BORA15', tipo: 'RELAMPAGO', percentualDesconto: 15,
  fim: new Date(Date.now() + 3600e3).toISOString(), usos: 0, origem: 'Painel', ativa: true, ...o,
});

async function abrir(lista, { responde = true } = {}) {
  const criadas = [];
  const encerradas = [];
  const Bora = {
    requireAuth: () => true,
    termometro: async () => ({ faixa: 'SEM_DADOS', atual: 0, baseline: null, recomendacao: '' }),
    promocoes: async () => lista,
    criarPromocao: async (body) => { criadas.push(body); return {}; },
    encerrarPromocao: async (id) => { encerradas.push(id); return {}; },
  };
  // A tela pendura `__encerrar` no `window`. O harness cria o seu proprio se eu nao passar um --
  // e aí eu nao teria como alcancar a funcao. Guardo a referencia.
  const janela = { open() {}, location: { origin: 'http://t' } };
  const pagina = subir(ARQ, {
    Bora,
    globais: { window: janela, alert() {}, confirm: () => responde },
  });
  await pagina.carregarPagina();
  await new Promise((r) => setTimeout(r, 0));
  return { pagina, criadas, encerradas, janela };
}

/** Preenche o formulario e dispara o submit de verdade, como o navegador faria. */
async function criar(pagina, limite) {
  pagina.get('limite').value = limite;
  pagina.get('desconto').value = '15';
  pagina.get('horas').value = '3';
  pagina.get('codigo').value = 'BORA15';
  pagina.get('descricao').value = 'teste';
  await pagina.get('form').__disparar('submit');
}

const html = (p) => String(p.get('lista').innerHTML);

// =============================================================== o limite

test('promocoes: o limite deixa de ser 20 fixo e vai o que o lojista digitar', async () => {
  const { pagina, criadas } = await abrir([]);

  await criar(pagina, '200');

  assert.equal(criadas.length, 1);
  assert.equal(criadas[0].limiteUsos, 200);
});

test('promocoes: campo vazio = SEM limite (e nao 20)', async () => {
  // O coracao do item: antes, nao preencher nada dava um limite de 20 que ninguem pediu.
  const { pagina, criadas } = await abrir([]);

  await criar(pagina, '');

  assert.equal(criadas[0].limiteUsos, null);
});

test('promocoes: zero tambem e sem limite', async () => {
  // O servidor trata nulo E zero como "sem limite", nos dois lugares que conferem.
  const { pagina, criadas } = await abrir([]);

  await criar(pagina, '0');

  assert.equal(criadas[0].limiteUsos, null);
});

test('promocoes: a lista diz quantos usos FALTAM, nao so quantos houve', async () => {
  const { pagina } = await abrir([promo({ usos: 12, limiteUsos: 20 })]);

  assert.match(html(pagina), /12\/20/);
  assert.match(html(pagina), /faltam 8/);
});

test('promocoes: promocao sem limite diz que nao tem limite', async () => {
  const { pagina } = await abrir([promo({ usos: 37, limiteUsos: null })]);

  assert.match(html(pagina), /sem limite/);
  assert.doesNotMatch(html(pagina), /faltam/);
});

// =============================================================== encerrar

test('promocoes: promocao ativa tem botao de encerrar', async () => {
  const { pagina } = await abrir([promo({ id: 7 })]);

  assert.match(html(pagina), /__encerrar\(7,/);
});

test('promocoes: promocao ja encerrada NAO tem botao', async () => {
  const { pagina } = await abrir([promo({ id: 7, ativa: false })]);

  assert.doesNotMatch(html(pagina), /__encerrar/);
});

test('promocoes: encerrar chama o endpoint que existia e ninguem usava', async () => {
  const { janela, encerradas } = await abrir([promo({ id: 7 })]);

  await janela.__encerrar(7, 'BORA15');

  assert.deepEqual(encerradas, [7]);
});

test('promocoes: desistir da pergunta nao encerra nada', async () => {
  // Quem estiver com o codigo na mao perde o desconto na hora, e nao da para reabrir pela tela.
  const { janela, encerradas } = await abrir([promo({ id: 7 })], { responde: false });

  await janela.__encerrar(7, 'BORA15');

  assert.deepEqual(encerradas, []);
});
