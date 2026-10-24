// A escolha entre ENTREGA e RETIRADA não pode sumir.
//
// O DEFEITO: a escolha só aparecia quando a loja tinha bairro cadastrado
// (`ckTipoWrap.hidden = !bairros.length`), e o HTML já traz ENTREGA marcada. Resultado: a loja que
// só faz balcão — ou que ainda não montou a tabela de frete — recebia **todo** pedido como
// entrega, com frete zero.
//
// O estrago é de operação e de dinheiro: o entregador sai para buscar um pedido que o cliente ia
// retirar, ou o pedido fica parado esperando uma entrega que ninguém vai fazer. E o cliente é
// obrigado a inventar um endereço para conseguir fechar.
//
// NOTA SOBRE ESTE ARQUIVO: a primeira versão dele passava medindo NADA. O checkout só abre com
// item no carrinho (`if (!itensCarrinho().length) return;`), então a tela nunca rodava e os
// asserts liam o `hidden: false` inicial do dublê. Por isso cada teste aqui confere primeiro que
// o checkout ABRIU — sem essa trava, este arquivo volta a ser decorativo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const TELA = RAIZ + '/assets/js/cardapio.js';
const CARDAPIO = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'testes/fixtures/cardapio-loja-18.json'), 'utf8'));

// Produto SEM complemento: o `__add` de um produto com complemento abre o modal em vez de somar.
const SEM_COMPLEMENTO = CARDAPIO.produtos.find((p) => !(p.complementos || []).length);

function montar({ bairros = [] } = {}) {
  const enviados = [];
  const janela = { open() {}, location: { origin: 'http://t' } };
  const Bora = {
    cardapioPublico: async () => ({ ...CARDAPIO, bairros }),
    api: async (rota, opcoes) => {
      if (opcoes && opcoes.method === 'POST') enviados.push(JSON.parse(opcoes.body));
      return { id: 1, codigo: 'A1', valorTotal: 10 };
    },
  };
  const t = subir(TELA, {
    Bora,
    search: '?loja=18',
    comSeletores: true,   // a tela faz querySelector(...).checked — sem isto ela estoura
    globais: {
      window: janela,
      BoraCores: { aplicar() {} },
      navigator: { clipboard: { writeText: async () => {} } },
      alert: () => {},
      clearTimeout,
    },
  });
  return { ...t, enviados, janela };
}

const assentar = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)); };

/** Sobe a tela, põe um item no carrinho e abre o checkout — conferindo que ele abriu mesmo. */
async function abrirCheckout({ bairros = [] } = {}) {
  const t = montar({ bairros });
  await t.carregarPagina();
  await assentar();

  assert.ok(t.get('menu').innerHTML.includes('menu-item'),
    'a tela nem desenhou o cardápio — o teste não mede nada daqui para frente');

  t.janela.__add(SEM_COMPLEMENTO.id);
  await assentar();
  await t.get('send').__disparar('click');
  await assentar();

  assert.equal(t.get('checkout').hidden, false,
    'o checkout não abriu: todo assert abaixo leria o valor inicial do dublê');
  return t;
}

// ---------------------------------------------------------------- a premissa
test('PREMISSA: sem bairro cadastrado, a escolha entrega/retirada APARECE', async () => {
  const t = await abrirCheckout({ bairros: [] });
  assert.equal(t.get('ckTipoWrap').hidden, false,
    'a loja de balcão recebe todo pedido como entrega, com frete zero');
});

test('com bairro cadastrado ela continua aparecendo', async () => {
  const t = await abrirCheckout({ bairros: [{ bairro: 'Centro', taxa: 5 }] });
  assert.equal(t.get('ckTipoWrap').hidden, false);
});

test('o campo de bairro segue escondido quando a loja nao tem tabela de frete', async () => {
  // Perguntar o bairro sem tabela não mudaria preço nenhum, e só atrapalha.
  const t = await abrirCheckout({ bairros: [] });
  assert.equal(t.get('ckBairroWrap').hidden, true,
    'pediu bairro numa loja que não cadastrou nenhum');
});

test('com tabela de frete, o bairro e pedido', async () => {
  const t = await abrirCheckout({ bairros: [{ bairro: 'Centro', taxa: 5 }] });
  assert.equal(t.get('ckBairroWrap').hidden, false);
});

// ---------------------------------------------------------------- o padrão não mudou
test('o HTML mantem ENTREGA como padrao — a mudanca e so deixar ESCOLHER', () => {
  // Trocar o padrão mudaria o comportamento de toda loja que entrega, que é a maioria. O defeito
  // nunca foi o padrão: foi esconder a opção.
  const html = fs.readFileSync(path.join(RAIZ, 'cardapio.html'), 'utf8');
  assert.match(html, /name="ckTipo" value="ENTREGA" checked/, 'a entrega deixou de ser o padrão');
  assert.match(html, /name="ckTipo" value="RETIRADA"/);
});

test('PREMISSA: o codigo nao esconde mais a escolha por falta de bairro', () => {
  const js = fs.readFileSync(TELA, 'utf8');
  assert.ok(!/ckTipoWrap'\)\.hidden = !bairros\.length/.test(js),
    'voltou a esconder a escolha quando a loja não tem bairro');
  assert.match(js, /ckTipoWrap'\)\.hidden = false/);
});

test('a validacao do checkout nao cobra endereco de quem vai retirar', () => {
  // Sem isto, deixar escolher retirada não adiantaria: o cliente ainda teria de inventar um
  // endereço para conseguir fechar o pedido.
  const js = fs.readFileSync(TELA, 'utf8');
  const fn = js.match(/function oQueFaltaNoCheckout\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(fn, 'não achei o oQueFaltaNoCheckout');
  assert.match(fn[1], /if \(!ehRetirada\(\)\) \{[\s\S]*?endereço[\s\S]*?bairro[\s\S]*?\}/,
    'o endereço e o bairro precisam ser cobrados só de quem pede entrega');
});
