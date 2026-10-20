// Dashboard e Caixa, com OS MESMOS pedidos, têm que mostrar O MESMO faturamento.
//
// O DEFEITO (relatado em 18/10, reproduzido aqui em 20/10): o Dashboard usava
// `status !== 'CANCELADO'` e o Caixa usava `status !== 'CANCELADO' && !aguardandoPagamento`. Com um
// pedido de R$ 30 pago e um PIX de R$ 50 abandonado no checkout, a primeira tela dizia R$ 80 e o
// fechamento de caixa dizia R$ 30 — no mesmo dia, para os mesmos pedidos. O lojista não tinha como
// saber qual acreditar, e os dois discordavam do Relatórios, que já fazia certo no servidor.
//
// Estes testes SOBEM as duas telas de verdade, com os helpers de verdade do app.js (não dublês), e
// comparam os números. É a única forma de provar que não divergem — grep prova que a linha está lá,
// não que as duas contas dão o mesmo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir, helpersDoApp } from './harness.mjs';

const JS = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/';
const hoje = () => new Date().toISOString();

const card = (o) => ({ status: 'RECEBIDO', valorTotal: 0, formaPagamento: 'Dinheiro', origem: 'Balcao',
  criadoEm: hoje(), aguardandoPagamento: false, itens: [], ...o });

/** Os helpers REAIS do app.js. Um stub aqui faria o teste medir a regra do stub, não a que roda. */
const HELPERS = helpersDoApp();

async function abrir(arquivo, cards, extras = {}) {
  const Bora = {
    requireAuth: () => true,
    board: async () => cards,
    resumo: async () => ({ emPreparo: 0, saiuParaEntrega: 0, entreguesUltimaHora: 0 }),
    promocoes: async () => [],
    criarPromocao: async () => ({}),
    repetir() {},
    api: async () => ({}),
    ...extras,
  };
  const pagina = subir(JS + arquivo, {
    Bora,
    globais: { ...HELPERS, boraToast() {}, alert() {}, confirm: () => false },
  });
  await pagina.carregarPagina();
  return pagina;
}

const txt = (p, id) => String(p.get(id).textContent);

// O cenário exato do relatório: R$ 30 pago, R$ 50 abandonado no checkout.
const CENARIO = [
  card({ valorTotal: 30 }),
  card({ valorTotal: 50, formaPagamento: 'PIX (aguardando)', aguardandoPagamento: true }),
];

test('o faturamento do Dashboard NAO inclui o PIX abandonado', async () => {
  const p = await abrir('dashboard.js', CENARIO);
  assert.equal(txt(p, 'kFat'), 'R$ 30,00',
    'era R$ 80,00 antes do conserto: o PIX de R$ 50 nunca foi pago');
  assert.equal(txt(p, 'kPed'), '1', 'e a contagem de pedidos tem que seguir a mesma regra');
});

test('Dashboard e Caixa dao O MESMO numero para os MESMOS pedidos', async () => {
  // O teste que realmente importa. Se um dia as regras divergirem de novo, é aqui que aparece.
  const dash = await abrir('dashboard.js', CENARIO);
  const caixa = await abrir('caixa.js', CENARIO);

  assert.equal(txt(dash, 'kFat'), txt(caixa, 'kFat'),
    'Dashboard e Caixa discordaram sobre o faturamento do mesmo dia');
  assert.equal(txt(dash, 'kPed'), txt(caixa, 'kPed'),
    'e discordaram sobre a quantidade de pedidos');
});

test('o ticket medio tambem bate entre as duas telas', async () => {
  // Ticket = faturamento / pedidos. Se as duas telas usassem regras diferentes para numerador e
  // denominador, o ticket sairia errado nas duas, de formas diferentes.
  const cards = [card({ valorTotal: 10 }), card({ valorTotal: 30 }),
    card({ valorTotal: 999, aguardandoPagamento: true })];
  const dash = await abrir('dashboard.js', cards);
  const caixa = await abrir('caixa.js', cards);

  assert.equal(txt(dash, 'kTicket'), 'R$ 20,00', '(10 + 30) / 2, sem o PIX pendente');
  assert.equal(txt(dash, 'kTicket'), txt(caixa, 'kTicket'));
});

test('o Dashboard DIZ quanto esta esperando PIX, em vez de so mostrar menos', async () => {
  // Sem isto o conserto parece prejuízo: o lojista vê R$ 30 onde via R$ 80 e acha que perdeu venda.
  const p = await abrir('dashboard.js', CENARIO);

  const aviso = p.get('kFatPix');
  assert.equal(aviso.hidden, false, 'o aviso tem que aparecer quando ha PIX pendente');
  assert.match(String(aviso.textContent), /R\$ 50,00/, 'e tem que dizer QUANTO');
  assert.match(String(aviso.textContent), /esperando PIX/);
});

test('sem PIX pendente, o aviso do Dashboard fica escondido', async () => {
  const p = await abrir('dashboard.js', [card({ valorTotal: 30 })]);

  assert.equal(p.get('kFatPix').hidden, true,
    'caixa amarela vazia todo dia vira ruido e o lojista para de ler');
  assert.equal(txt(p, 'kFat'), 'R$ 30,00');
});

test('PIX PAGO conta nas duas telas', async () => {
  // O servidor zera o aguardandoPagamento quando o Asaas confirma. Se a regra derrubasse venda paga,
  // o erro seria o oposto: faturamento MENOR que a realidade.
  const cards = [card({ valorTotal: 70, formaPagamento: 'PIX', aguardandoPagamento: false })];
  const dash = await abrir('dashboard.js', cards);
  const caixa = await abrir('caixa.js', cards);

  assert.equal(txt(dash, 'kFat'), 'R$ 70,00');
  assert.equal(txt(caixa, 'kFat'), 'R$ 70,00');
});

test('cancelado fica fora do faturamento nas duas, e aparece como cancelado nas duas', async () => {
  const cards = [card({ valorTotal: 40 }), card({ valorTotal: 99, status: 'CANCELADO' })];
  const dash = await abrir('dashboard.js', cards);
  const caixa = await abrir('caixa.js', cards);

  assert.equal(txt(dash, 'kFat'), 'R$ 40,00');
  assert.equal(txt(caixa, 'kFat'), 'R$ 40,00');
  assert.match(txt(dash, 'kCanc'), /^1/);
  assert.equal(txt(caixa, 'kCanc'), '1');
});

test('PIX pendente NAO entra na conta de cancelamento do Dashboard', async () => {
  // Erro vizinho e tentador: tirar do faturamento e jogar em "cancelado". Cancelado é o pedido
  // CANCELADO, nada mais — o pendente ainda pode virar venda. Foi o mesmo erro corrigido no
  // RelatorioService.
  const p = await abrir('dashboard.js', CENARIO);

  assert.match(txt(p, 'kCanc'), /^0/, 'o PIX pendente nao e cancelamento');
});
