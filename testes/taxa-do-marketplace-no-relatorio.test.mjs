import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const ARQ = process.env.RELATORIOS_JS
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/relatorios.js';

// Item 5.8 da varredura. O faturamento da tela e o BRUTO que o cliente pagou -- taxa de entrega
// incluida. Quando quem entrega e o marketplace, essa taxa e dele, e estava somando no faturamento da
// loja sem ninguem saber. O numero NAO foi descontado (decisao do dono); o que entrou foi dizer o
// tamanho embaixo dele. Estes testes travam as duas coisas.

const RELATORIO = {
  loja: 'Zira Acaiteria', dias: 30,
  faturamento: 140, pedidos: 4, ticketMedio: 35,
  margem: 100, margemPct: 71.4, cmv: 40, cancelados: 0, aguardandoPagamento: 0,
  porDia: {}, porCanal: {}, porProduto: {}, porEntregador: {},
};

async function abrir(rel) {
  const Bora = {
    requireAuth: () => true,
    minhasLojas: async () => [],
    relatorios: async () => ({ ...RELATORIO, ...rel }),
  };
  const pagina = subir(ARQ, { Bora });
  await pagina.carregarPagina();
  return pagina;
}
const txt = (p, id) => String(p.get(id).textContent);

test('relatorios: a taxa que o marketplace ficou aparece embaixo do faturamento', async () => {
  const p = await abrir({ taxaDoMarketplace: 14 });

  assert.match(txt(p, 'kTaxaMkt'), /R\$ 14,00/);
  assert.match(txt(p, 'kTaxaMkt'), /taxa de entrega do marketplace/);
});

test('relatorios: o faturamento continua sendo o bruto, nao o liquido', async () => {
  // A parte que eu NAO decidi sozinho. Se um dia o dono pedir o liquido, este teste falha e conta
  // que a mudanca foi deliberada.
  const p = await abrir({ taxaDoMarketplace: 14 });

  assert.equal(txt(p, 'kFat'), 'R$ 140,00');
});

test('relatorios: loja sem marketplace nao ganha linha nenhuma', async () => {
  // O risco do outro lado: um "inclui R$ 0,00 de taxa" em toda loja de balcao e ruido, e ruido faz
  // o lojista parar de ler o cartao.
  const p = await abrir({ taxaDoMarketplace: 0 });

  assert.equal(txt(p, 'kTaxaMkt'), '');
});

test('relatorios: API antiga sem o campo nao quebra a tela', async () => {
  // Durante a troca de versao o navegador pode estar com o JS novo e a API ainda sem o campo.
  const p = await abrir({});

  assert.equal(txt(p, 'kTaxaMkt'), '');
  assert.equal(txt(p, 'kFat'), 'R$ 140,00');
});
