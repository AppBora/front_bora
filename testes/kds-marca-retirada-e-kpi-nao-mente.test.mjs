// Dois defeitos achados pelos agentes de QA em 23/10/2026.
//
// 1) O KDS NÃO DIZ QUE É RETIRADA, E O QUE MOSTRA ENGANA. O cartão monta
//    `cliente · origem · SLA`, e naquele lugar aparece o CANAL, não o tipo de entrega. Medido ao
//    vivo pelo agente: um pedido com `tipoEntrega: RETIRADA` e `origem: "Delivery"` lia
//    "Maria Eduarda · Delivery · SLA 35min". Quem está na cozinha lê "Delivery" num pedido que o
//    cliente vem buscar — e embala para entrega.
//    O `ehRetirada()` já existe no arquivo: era usado só para esconder o botão Despachar, nunca
//    para rotular o cartão. O quadro de Pedidos já desenha "🛍️ Retirada no balcão"; o KDS não.
//
// 2) KPI VAZIO EM VEZ DE ZERO, EM ENTREGAS. `kpiProntos` vem do board e `kpiSaiu`/`kpiHora` vêm de
//    `/api/dashboard/resumo` — duas fontes para números da MESMA linha. Quando o campo falta, a
//    tela escreve "undefined", e o lojista não distingue "nenhuma entrega em rota" de "a tela
//    quebrou". Pior: `emRota` já era calculado do board, ali mesmo, e jogado fora.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const agora = new Date().toISOString();

/* ----------------------------------------------------------------- 1) o KDS */

const NA_COZINHA = [
  { id: 1, codigo: '#001', status: 'RECEBIDO', origem: 'Delivery', tipoEntrega: 'RETIRADA',
    clienteNome: 'Maria Eduarda', itens: [{ quantidade: 1, descricao: 'Pizza' }], criadoEm: agora },
  { id: 2, codigo: '#002', status: 'RECEBIDO', origem: 'Telefone', tipoEntrega: 'ENTREGA',
    clienteNome: 'Joao da Silva', itens: [{ quantidade: 1, descricao: 'Calzone' }], criadoEm: agora },
];

async function abrirKds() {
  const Bora = {
    requireAuth: () => true,
    board: async () => NA_COZINHA.map(p => ({ ...p })),
    api: async () => ({}),
    _conexao: () => {},
    repetir: () => {},
    user: () => ({ papel: 'ADMINISTRADOR_LOJA' }),
  };
  const pagina = subir(path.join(RAIZ, 'assets/js/kds.js'), {
    Bora,
    globais: { alert() {}, confirm: () => true, window: { location: { href: '' } },
               boraSla: () => 35, boraCanal: (o) => ({ key: o, ic: '🏪', cor: '#333' }),
               boraToast: () => {},
               // O KDS liga um cronometro de 1s (kds.js:126). Sem este duble o relogio fica vivo
               // depois do teste e o processo nunca encerra -- a rodada trava em vez de falhar.
               setInterval: () => 0, clearInterval: () => {} },
  });
  await pagina.carregarPagina();
  await new Promise(r => setTimeout(r, 10));
  return pagina;
}

test('PREMISSA: o cartao do KDS diz que o pedido e retirada', async () => {
  const pagina = await abrirKds();
  const html = pagina.get('fazer').innerHTML + pagina.get('pronto').innerHTML;
  assert.match(html, /Retirada/i,
    'o KDS nao marca retirada: a cozinha embala para entrega um pedido que o cliente vem buscar');
});

test('o selo de retirada diz, com todas as letras, que NAO e entrega', async () => {
  // Tirar o canal do cartao seria errado -- saber de onde veio o pedido e util. O que a cozinha
  // nao pode e ler "Delivery" e concluir que sai de moto. Entao o selo tem de desfazer a duvida
  // por escrito, e nao so por icone.
  const pagina = await abrirKds();
  const html = pagina.get('fazer').innerHTML + pagina.get('pronto').innerHTML;
  const cartaoDaMaria = html.slice(html.indexOf('#001'), html.indexOf('#002') > 0 ? html.indexOf('#002') : undefined);
  assert.match(cartaoDaMaria, /n[aã]o [eé] entrega/i,
    'o selo nao desfaz a duvida: o cartao mostra o canal "Delivery" e a cozinha embala para entrega');
});

test('pedido de entrega nao ganha selo de retirada', async () => {
  const pagina = await abrirKds();
  const html = pagina.get('fazer').innerHTML + pagina.get('pronto').innerHTML;
  const cartaoDoJoao = html.slice(html.indexOf('#002'));
  assert.ok(!/Retirada/i.test(cartaoDoJoao), 'marcou retirada num pedido de entrega');
});

/* ------------------------------------------------------- 2) os KPIs de Entregas */

test('PREMISSA: KPI sem dado mostra zero, nao "undefined"', () => {
  const js = ler('assets/js/entregas.js');
  assert.ok(!/textContent = resumo\.entreguesUltimaHora;/.test(js),
    'o KPI escreve o campo cru: faltando, a tela mostra "undefined" e o lojista nao sabe se e '
    + 'zero ou se quebrou');
});

test('o KPI "em rota" sai da MESMA fonte que a tabela logo abaixo', () => {
  const js = ler('assets/js/entregas.js');
  assert.ok(/kpiSaiu'\)\.textContent = emRota\.length/.test(js),
    'kpiSaiu vem do resumo enquanto a tabela vem do board: duas fontes para a mesma linha, e elas '
    + 'discordam na tela');
});
