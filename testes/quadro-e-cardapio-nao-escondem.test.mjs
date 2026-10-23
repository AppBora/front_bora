// Tres defeitos achados pelos agentes de QA em 23/10/2026, todos de "a tela esconde ou mente".
//
// 1) A ABA "CANCELADOS" NUNCA MOSTRA NADA. O filtro deixa o cancelado passar
//    (`pedidos.js:97`), mas nenhuma COLUNA do quadro aceita esse status, e o render so emite card
//    para `col.inclui.includes(p.status)`. A aba existe, o lojista clica, e nao aparece nada --
//    nem com o backend certo. Quem cancelou um pedido por engano nao tem onde conferir.
//
// 2) O FILTRO "DELIVERY" ENGOLE A RETIRADA. `pedidos.js:99` fecha com
//    `|| (!origem.includes('BALC'))`: tudo que nao e balcao vira delivery. Pedido de RETIRADA
//    feito por telefone aparece como entrega, e o lojista conta errado quanto cada canal rende.
//
// 3) NO CARDAPIO, GRUPO OPCIONAL VIRA OBRIGATORIO DEPOIS DO PRIMEIRO TOQUE. `cardapio.js:109`
//    escolhe `radio` quando `maximo === 1` -- inclusive quando o minimo e ZERO. Radio nao
//    desmarca: o cliente clica em "Catupiry +R$ 8,00", muda de ideia, e nao tem como voltar
//    atras a nao ser tirando o item do carrinho. Ele paga os R$ 8,00 que nao quis, ou desiste.
//    Dois agentes acharam este, por caminhos diferentes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* ------------------------------------------------- 1 e 2: o quadro de Pedidos */

const PEDIDOS = [
  { id: 1, codigo: '#001', status: 'RECEBIDO', origem: 'Telefone', valorTotal: 50,
    tipoEntrega: 'ENTREGA', itens: [], criadoEm: new Date().toISOString() },
  { id: 2, codigo: '#002', status: 'ENTREGUE', origem: 'Balcão', valorTotal: 30,
    tipoEntrega: 'RETIRADA', itens: [], criadoEm: new Date().toISOString() },
  { id: 3, codigo: '#003', status: 'CANCELADO', origem: 'Telefone', valorTotal: 40,
    tipoEntrega: 'ENTREGA', motivoCancelamento: 'Cliente desistiu',
    itens: [], criadoEm: new Date().toISOString() },
  { id: 4, codigo: '#004', status: 'RECEBIDO', origem: 'Telefone', valorTotal: 25,
    tipoEntrega: 'RETIRADA', itens: [], criadoEm: new Date().toISOString() },
];

async function abrirQuadro() {
  const Bora = {
    requireAuth: () => true,
    board: async () => PEDIDOS.map(p => ({ ...p })),
    api: async () => ({}),
    _conexao: () => {},
    repetir: () => {},
    user: () => ({ nome: 'QA', papel: 'ADMINISTRADOR_LOJA', lojaId: 17 }),
  };
  const pagina = subir(path.join(RAIZ, 'assets/js/pedidos.js'), {
    Bora,
    globais: {
      alert() {}, confirm: () => true, prompt: () => 'motivo',
      window: { location: { href: '' } },
      boraSla: () => 30,
      // Globais do app.js, que o harness nao carrega. Sem elas o carregar() estoura e o quadro
      // fica VAZIO -- e o teste mediria a minha falta de duble, nao a tela.
      boraCanal: (o) => ({ key: o || 'Balcão', ic: '🏪', cor: '#8b5cf6' }),
      boraPrintComanda: () => {},
      boraToast: () => {},
    },
  });
  await pagina.carregarPagina();
  await new Promise(r => setTimeout(r, 0));
  return pagina;
}

/**
 * Clica no chip do filtro, como o lojista faria.
 *
 * O botao falso precisa de `classList`: o handler faz `b.classList.add('active')` antes de
 * aplicar o filtro, e sem isso ele estoura e o teste mede a minha falta de duble, nao a tela.
 */
async function filtrar(pagina, valor) {
  const botao = { dataset: { f: valor }, classList: { add() {}, remove() {}, toggle() {} } };
  await pagina.get('chips').__disparar('click', {
    target: { closest: () => botao },
    preventDefault() {}, stopPropagation() {},
  });
}

test('PREMISSA: existe coluna para CANCELADO no quadro', () => {
  const js = ler('assets/js/pedidos.js');
  const bloco = js.slice(js.indexOf('const COLUNAS'), js.indexOf('const PROXIMO'));
  assert.ok(bloco.includes('CANCELADO'),
    'nenhuma coluna aceita CANCELADO: a aba existe e nunca mostra nada, nem com o backend certo');
});

test('a aba Cancelados mostra o pedido cancelado', async () => {
  const pagina = await abrirQuadro();
  await filtrar(pagina, 'CANCELADO');
  const html = pagina.get('kboard').innerHTML;
  assert.ok(html.includes('#003'), 'o pedido cancelado nao apareceu em lugar nenhum do quadro');
});

test('o cancelado some das outras abas, que e o certo', async () => {
  const pagina = await abrirQuadro();
  const html = pagina.get('kboard').innerHTML;
  assert.ok(!html.includes('#003'), 'o cancelado vazou para a vista normal do balcao');
  assert.ok(html.includes('#001'), 'sumiu pedido que devia aparecer');
});

test('PREMISSA: o filtro Delivery nao pode engolir a retirada', () => {
  const js = ler('assets/js/pedidos.js');
  assert.ok(!js.includes("!origem.includes('BALC')"),
    'o filtro trata "tudo que nao e balcao" como delivery: pedido de retirada conta como entrega');
});

test('Delivery mostra entrega e esconde retirada', async () => {
  const pagina = await abrirQuadro();
  await filtrar(pagina, 'DELIVERY');
  const html = pagina.get('kboard').innerHTML;
  assert.ok(html.includes('#001'), 'o pedido de ENTREGA sumiu do filtro Delivery');
  assert.ok(!html.includes('#004'), 'o pedido de RETIRADA apareceu como delivery');
});

/* ------------------------------------------------- 3: o grupo opcional do cardapio */

test('PREMISSA: grupo opcional nao pode virar radio', () => {
  const js = ler('assets/js/cardapio.js');
  assert.ok(!/g\.maximo === 1 \? 'radio'/.test(js),
    'grupo com maximo 1 vira radio mesmo sendo OPCIONAL: depois do primeiro toque o cliente nao '
    + 'consegue mais desmarcar, e paga o adicional que nao quis');
});

test('grupo obrigatorio de escolha unica continua sendo radio', () => {
  // Esse e o caso em que radio e CERTO: "escolha 1 tamanho" nao admite nenhum nem dois.
  const js = ler('assets/js/cardapio.js');
  assert.ok(/minimo\s*>\s*0\s*&&\s*g\.maximo === 1/.test(js) || /radio/.test(js),
    'o caminho do grupo obrigatorio sumiu junto');
});
