// O cartão do cardápio público tem de mostrar o preço que o cliente VAI PAGAR.
//
// O DEFEITO
// O cartão imprimia `p.preco` cru. Quando o produto tem um grupo de complemento OBRIGATÓRIO
// (`minimo > 0`), esse número não é pagável por ninguém. O caso real é o "Monte Seu Açaí" da
// Zirá: o recipiente é obrigatório (escolha 1 de 1) e é ELE que carrega o preço.
//
//   hoje:              base R$ 90,00  +  copo 300ml R$ 10,00   = R$ 100,00 no carrinho
//   depois da revisão: base R$  0,00  +  copo 300ml R$ 12,90   = R$  12,90 no carrinho
//
// Nos dois casos o cartão anunciava o número errado — e o segundo é pior, porque anuncia R$ 0,00
// um produto que custa de R$ 12,90 a R$ 50,00.
//
// E O OUTRO LADO: o cardápio de PAPEL imprime esses tamanhos como um bloco próprio
// ("AÇAÍ PURO — 300 ml R$ 12,90…"). Quem lia o papel e escaneava o QR procurava "Açaí Puro 300ml"
// e não achava: no app aquilo era uma opção escondida dentro de outro item. Agora os tamanhos
// saem escritos no cartão, com o preço já somado — o papel e a tela dizem a mesma coisa.
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

const money = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

/** Sobe o cardápio público com um cardápio de verdade e devolve o HTML do menu. */
async function abrirCardapio(cardapio = CARDAPIO) {
  // A tela usa o atalho `Bora.cardapioPublico`, nao `Bora.api` direto -- stub no lugar errado
  // deixava o menu vazio e o teste media nada.
  const Bora = { cardapioPublico: async () => cardapio, api: async () => ({}) };
  const t = subir(TELA, {
    Bora,
    search: '?loja=18',
    globais: {
      // sem BoraCores a tela estoura em aplicarMarca e escreve o erro DENTRO do #menu
      BoraCores: { aplicar() {} },
      navigator: { clipboard: { writeText: async () => {} } },
      alert: () => {},
      clearTimeout,
    },
  });
  await t.carregarPagina();
  const html = t.get('menu').innerHTML;
  // Se a tela estourar, ela escreve o erro DENTRO do #menu e todo assert de ausencia passaria
  // sozinho. Ja aconteceu neste arquivo: stub no lugar errado, menu vazio, teste verde.
  assert.ok(html.includes('menu-item'),
    'a tela nao desenhou cartao nenhum -- o teste nao esta medindo nada. Menu: ' + html.slice(0, 200));
  return { html, t };
}

/**
 * O pedaço de HTML do cartão daquele produto.
 *
 * Casa pelo `<div class="mn">NOME</div>`, e não por ">NOME<" solto: a Zirá tem uma CATEGORIA
 * chamada "Monte Seu Açaí" além do produto, e o cabeçalho dela cai no pedaço do item ANTERIOR.
 * Com o casamento solto, o teste lia o cartão errado e dizia que o conserto não tinha funcionado.
 */
function cartao(html, nome) {
  const partes = html.split('<div class="menu-item"');
  const marca = '<div class="mn">' + nome + '</div>';
  const achados = partes.filter((p) => p.includes(marca));
  assert.equal(achados.length, 1,
    'esperava um cartao de ' + nome + ', achei ' + achados.length);
  return achados[0];
}

const monte = CARDAPIO.produtos.find((p) => p.nome === 'Monte Seu Açaí');
const recipientes = monte.complementos.find((g) => g.nome === 'Recipientes');
const maisBarato = Math.min(...recipientes.itens.map((i) => Number(i.preco)));

test('PREMISSA: a fixture tem mesmo um grupo obrigatorio que carrega o preco', () => {
  assert.equal(Number(recipientes.minimo), 1, 'o recipiente deixou de ser obrigatorio');
  assert.equal(Number(recipientes.maximo), 1, 'o recipiente deixou de ser escolha unica');
  assert.ok(maisBarato > 0, 'o recipiente mais barato e de graca: este teste nao mede mais nada');
});

test('produto com escolha obrigatoria mostra "a partir de", e nao o preco base', async () => {
  const { html } = await abrirCardapio();
  const c = cartao(html, 'Monte Seu Açaí');

  assert.match(c, /a partir de/,
    'anunciou o preco base como se fosse o preco final de um produto que exige escolher o copo');
  assert.ok(c.includes(money(Number(monte.preco) + maisBarato)),
    'o "a partir de" precisa somar o item obrigatorio mais barato: esperado '
    + money(Number(monte.preco) + maisBarato));
});

test('os tamanhos saem ESCRITOS no cartao, com o preco ja somado', async () => {
  const { html } = await abrirCardapio();
  const c = cartao(html, 'Monte Seu Açaí');

  for (const i of recipientes.itens.slice(0, 6)) {
    assert.ok(c.includes(i.nome),
      'o tamanho ' + i.nome + ' nao aparece: quem leu o papel nao acha no app');
    assert.ok(c.includes(money(Number(monte.preco) + Number(i.preco))),
      'o tamanho ' + i.nome + ' saiu sem o preco que o cliente vai pagar');
  }
});

test('produto SEM obrigatorio continua mostrando o preco limpo, sem "a partir de"', async () => {
  const { html } = await abrirCardapio();
  // A Barca tem adicionais, mas o grupo gratis e minimo 1 com itens de R$ 0 -- nao muda o preco.
  const barca = CARDAPIO.produtos.find((p) => p.nome === 'Barca de Açaí Gourmet');
  const c = cartao(html, 'Barca de Açaí Gourmet');
  assert.ok(c.includes(money(barca.preco)));
  assert.ok(!/a partir de/.test(c),
    'poluiu com "a partir de" um produto cujo obrigatorio e de graca');
});

test('o grupo de 4 adicionais gratis NAO e confundido com tamanho', async () => {
  const { html } = await abrirCardapio();
  const c = cartao(html, 'Barca de Açaí Gourmet');
  assert.ok(!c.includes('class="mt"'),
    'listou os 4 adicionais gratis como se fossem tamanhos do produto');
});

test('bebida simples nao ganha linha nenhuma a mais', async () => {
  const { html } = await abrirCardapio();
  const agua = CARDAPIO.produtos.find((p) => p.nome === 'Água Mineral Leve 500ml');
  const c = cartao(html, 'Água Mineral Leve 500ml');
  assert.ok(c.includes(money(agua.preco)));
  assert.ok(!/a partir de/.test(c) && !c.includes('class="mt"'));
});

test('PREMISSA: com a base zerada, o cartao NAO anuncia R$ 0,00', async () => {
  // E o estado para onde a loja vai depois da revisao de precos. Sem o conserto, o cardapio
  // anunciaria "R$ 0,00" um produto que custa de R$ 12,90 a R$ 50,00.
  const copia = JSON.parse(JSON.stringify(CARDAPIO));
  const m = copia.produtos.find((p) => p.nome === 'Monte Seu Açaí');
  m.preco = 0;
  const rec = m.complementos.find((g) => g.nome === 'Recipientes');
  rec.itens.forEach((i, n) => { i.preco = [12.90, 16.90, 19.90, 24.90, 50, 30][n] ?? i.preco; });

  const { html } = await abrirCardapio(copia);
  const c = cartao(html, 'Monte Seu Açaí');
  assert.ok(!/R\$ 0,00/.test(c), 'anunciou de graca um produto que custa a partir de R$ 12,90');
  assert.ok(c.includes('R$ 12,90'), 'o "a partir de" nao pegou o copo mais barato');
});

test('o esgotado continua dizendo Esgotado, e sem tamanhos', async () => {
  const copia = JSON.parse(JSON.stringify(CARDAPIO));
  copia.produtos.find((p) => p.nome === 'Monte Seu Açaí').esgotado = true;
  const { html } = await abrirCardapio(copia);
  const c = cartao(html, 'Monte Seu Açaí');
  assert.match(c, /Esgotado/);
  assert.ok(!/a partir de/.test(c), 'mostrou preco de um item que acabou');
  assert.ok(!c.includes('class="mt"'), 'listou tamanhos de um item que acabou');
});

test('produto sem complemento nenhum nao estoura', async () => {
  const copia = JSON.parse(JSON.stringify(CARDAPIO));
  copia.produtos = [{ id: 1, nome: 'Só isso', categoria: 'X', preco: 9.5 }];
  const { html } = await abrirCardapio(copia);
  assert.ok(html.includes('Só isso') && html.includes('R$ 9,50'));
});
