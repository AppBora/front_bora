import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const REPO_FE = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/';
const ARQ = process.env.CAIXA_JS || REPO_FE + 'caixa.js';
const hoje = () => new Date().toISOString();
const card = (o) => ({ status: 'RECEBIDO', valorTotal: 0, formaPagamento: 'Dinheiro', origem: 'Balcao',
  criadoEm: hoje(), aguardandoPagamento: false, ...o });

async function fecharCaixaCom(cards) {
  const Bora = { requireAuth: () => true, board: async () => cards, repetir() {} };
  const pagina = subir(ARQ, { Bora, globais: { boraCanal: o => ({ ic: 'X', key: o }) } });
  await pagina.carregarPagina();
  return pagina;
}
const txt = (p, id) => String(p.get(id).textContent);

test('caixa: PIX que ninguem pagou fica fora do faturamento e aparece no aviso', async () => {
  const p = await fecharCaixaCom([
    card({ valorTotal: 30 }),
    card({ valorTotal: 50, formaPagamento: 'PIX (aguardando)', aguardandoPagamento: true }),
  ]);
  assert.equal(txt(p, 'kFat'), 'R$ 30,00');
  assert.equal(txt(p, 'kPed'), '1');
  assert.match(txt(p, 'sub'), /1 pedido\(s\) esperando PIX \(R\$ 50,00\)/);
});

test('caixa: cancelado nao entra no faturamento mas entra na contagem de cancelados', async () => {
  const p = await fecharCaixaCom([card({ valorTotal: 40 }), card({ valorTotal: 99, status: 'CANCELADO' })]);
  assert.equal(txt(p, 'kFat'), 'R$ 40,00');
  assert.equal(txt(p, 'kCanc'), '1');
});

test('caixa: ticket medio = faturamento / pedidos validos', async () => {
  const p = await fecharCaixaCom([card({ valorTotal: 10 }), card({ valorTotal: 30 })]);
  assert.equal(txt(p, 'kTicket'), 'R$ 20,00');
});

test('caixa: pedido de ontem nao entra no fechamento de hoje', async () => {
  const ontem = new Date(Date.now() - 36 * 3600e3).toISOString();
  const p = await fecharCaixaCom([card({ valorTotal: 10, criadoEm: ontem })]);
  assert.equal(txt(p, 'kFat'), 'R$ 0,00');
});

test('caixa: dia sem venda nao divide por zero', async () => {
  const p = await fecharCaixaCom([]);
  assert.equal(txt(p, 'kTicket'), 'R$ 0,00');
});
