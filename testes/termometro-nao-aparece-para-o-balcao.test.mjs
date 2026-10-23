// Item 8.3 da varredura: o termômetro de vendas mostra o faturamento das últimas 24h e a média
// esperada, EM REAIS — e o Dashboard é aberto ao OPERADOR de propósito, porque é o balcão dele.
//
// A API passou a exigir papel (antes não exigia nada). Aqui se trava o outro lado: a tela não pode
// nem chamar o endpoint para quem não pode ver. Deixar o 403 acontecer e escrever "indisponível"
// parece defeito do sistema e gera pergunta para o lojista; e um 403 no console a cada abertura do
// Dashboard é ruído que esconde erro de verdade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir, helpersDoApp } from './harness.mjs';

const JS = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/';
const HELPERS = helpersDoApp();

const TERMOMETRO = {
  faixa: 'SAUDAVEL', atual: 1234.5, baseline: 1000, indice: 1.23,
  recomendacao: 'Vendas saudáveis. Nada a fazer.',
};

async function abrirDashboardComo(papel) {
  let chamouTermometro = false;
  const Bora = {
    requireAuth: () => true,
    user: () => ({ id: 7, papel, lojaId: 18 }),
    board: async () => [],
    resumo: async () => ({ emPreparo: 0, saiuParaEntrega: 0, entreguesUltimaHora: 0 }),
    termometro: async () => { chamouTermometro = true; return TERMOMETRO; },
    promocoes: async () => [],
    repetir() {},
    api: async () => ({}),
  };
  const pagina = subir(JS + 'dashboard.js', {
    Bora,
    globais: { ...HELPERS, boraToast() {}, alert() {}, confirm: () => false },
  });
  await pagina.carregarPagina();
  // O dashboard dispara renderTermometro sem esperar (ele e so um painel). Um tique de fila da ao
  // innerHTML a chance de acontecer antes da conferencia -- sem isso o teste leria a tela antes de
  // ela ser desenhada e passaria verde por motivo errado.
  await new Promise((r) => setTimeout(r, 0));
  return { pagina, chamouTermometro: () => chamouTermometro };
}

test('termometro: o OPERADOR nao ve o painel e a tela nem chama a API', async () => {
  const { pagina, chamouTermometro } = await abrirDashboardComo('OPERADOR');

  assert.equal(pagina.get('painelTermometro').hidden, true, 'o painel tem que ficar escondido');
  assert.equal(String(pagina.get('termometro').innerHTML), '', 'e sem conteudo nenhum dentro');
  assert.equal(chamouTermometro(), false, 'nem devia ter chamado o endpoint');
});

test('termometro: o ENTREGADOR tambem nao ve', async () => {
  const { pagina, chamouTermometro } = await abrirDashboardComo('ENTREGADOR');

  assert.equal(pagina.get('painelTermometro').hidden, true);
  assert.equal(chamouTermometro(), false);
});

test('termometro: o GERENTE ve o painel com os valores', async () => {
  // O outro lado, e o que mais importa: esconder para o balcao nao pode esconder para quem manda.
  const { pagina, chamouTermometro } = await abrirDashboardComo('GERENTE');

  assert.equal(pagina.get('painelTermometro').hidden, false);
  assert.equal(chamouTermometro(), true);
  // A tela escreve innerHTML; o harness nao espelha isso em textContent (foi o que a primeira
  // versao deste teste leu, e ela "passou" num vazio).
  //
  // O valor sai como "R$ 1234,50", sem separador de milhar: o `money` que o dashboard usa nao poe.
  // Travo o que a tela REALMENTE escreve, nao o que eu imaginei que ela escrevia.
  assert.match(String(pagina.get('termometro').innerHTML), /1234,50/);
  assert.match(String(pagina.get('termometro').innerHTML), /1000,00/, 'a media esperada tambem');
});

test('termometro: o dono da loja ve', async () => {
  const { pagina } = await abrirDashboardComo('ADMINISTRADOR_LOJA');
  assert.equal(pagina.get('painelTermometro').hidden, false);
});

test('termometro: o suporte da plataforma ve', async () => {
  // ADMINISTRADOR_BORA atende o lojista: se nao ve o numero, nao ajuda.
  const { pagina } = await abrirDashboardComo('ADMINISTRADOR_BORA');
  assert.equal(pagina.get('painelTermometro').hidden, false);
});

test('termometro: sessao sem papel nao ve (falha fechado)', async () => {
  const { pagina, chamouTermometro } = await abrirDashboardComo(undefined);

  assert.equal(pagina.get('painelTermometro').hidden, true,
    'papel que a tela nao entende tem que esconder, nao mostrar');
  assert.equal(chamouTermometro(), false);
});
