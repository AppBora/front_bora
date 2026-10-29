/**
 * Quem vai RETIRAR não vê "Saiu para entrega — a caminho de você".
 *
 * A linha do tempo da tela pública era uma constante de seis fases, e a quinta é a do motoboy. Quem
 * escolheu retirar no balcão lia isso e ficava esperando em casa uma entrega que ninguém ia fazer.
 * Na retirada o pedido vai de PRONTO direto para ENTREGUE, então aquele passo nunca acende — ele só
 * ficava ali, cinza, contando uma história errada (pente fino de 29/10/2026).
 *
 * A tela não tinha como saber: o endpoint de status devolvia código, status, pago, loja, criadoEm e
 * motivoCancelamento, e nada do tipo de entrega. O conserto é dos dois lados — o servidor passou a
 * mandar `retirada`, e aqui a lista de fases passa a depender dele.
 *
 * ## O caso do link antigo
 *
 * Link que o cliente recebeu antes do deploy chega sem o campo. `undefined` não é `true`, então a
 * tela mostra a lista inteira, como antes. Mostrar um passo a mais é melhor que esconder um que vai
 * acontecer de verdade.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(aqui, '..', 'acompanhar.html'), 'utf8');

/**
 * As três peças da tela, avaliadas a partir do arquivo — não copiadas.
 *
 * O trecho vai do `const FASES` até o fim do `rotuloFinal`, que são declarações puras: não tocam no
 * `document`, no `fetch` nem no relógio, e por isso dá para executá-las aqui.
 */
function pecasDaTela() {
  const ini = HTML.indexOf('const FASES');
  assert.ok(ini > 0, 'nao achei o FASES no acompanhar.html');
  const marca = HTML.indexOf('const rotuloFinal', ini);
  assert.ok(marca > ini, 'nao achei o rotuloFinal: a tela voltou a ter lista fixa de fases?');
  const fim = HTML.indexOf('});', marca) + 3;
  const trecho = HTML.slice(ini, fim);
  return new Function(`${trecho}
    return { FASES, ORDEM, fasesPara, rotuloFinal };`)();
}

const nomes = (lista) => lista.map((f) => f.t);

test('PREMISSA: a tela tem as seis fases e a quinta e a do motoboy', () => {
  const { FASES } = pecasDaTela();

  assert.equal(FASES.length, 6, `a tela tem ${FASES.length} fases; esperava 6`);
  assert.equal(FASES[4].t, 'Saiu para entrega');
  assert.equal(FASES[4].soEntrega, true,
    'a fase do motoboy perdeu a marca `soEntrega`: ela volta a aparecer para quem vai retirar');
});

test('na RETIRADA o passo do motoboy nao aparece', () => {
  const { fasesPara } = pecasDaTela();

  const lista = nomes(fasesPara(true));
  assert.equal(lista.length, 5, `a retirada mostrou ${lista.length} fases: ${lista.join(' > ')}`);
  assert.ok(!lista.includes('Saiu para entrega'),
    'quem vai buscar no balcao continua vendo "a caminho de voce"');
  assert.deepEqual(lista,
    ['Pedido recebido', 'Confirmado', 'Em preparo', 'Pronto', 'Entregue'],
    'a ordem das fases da retirada mudou');
});

test('na ENTREGA a lista continua inteira', () => {
  const { fasesPara } = pecasDaTela();

  assert.deepEqual(nomes(fasesPara(false)),
    ['Pedido recebido', 'Confirmado', 'Em preparo', 'Pronto', 'Saiu para entrega', 'Entregue']);
});

test('link ANTIGO, sem o campo, continua mostrando tudo', () => {
  // Resposta de servidor anterior ao conserto: `retirada` chega `undefined`.
  const { fasesPara } = pecasDaTela();

  assert.equal(fasesPara(undefined).length, 6,
    'link antigo passou a esconder o passo do motoboy -- esconder o que VAI acontecer e pior');
  assert.equal(fasesPara(null).length, 6);
});

test('o ultimo passo da retirada se chama RETIRADO, nao entregue', () => {
  const { rotuloFinal } = pecasDaTela();

  assert.equal(rotuloFinal(true).t, 'Retirado',
    '"Entregue" para quem foi buscar no balcao e a mesma confusao, no fim da linha');
  assert.equal(rotuloFinal(false).t, 'Entregue');
});

test('a tela PEDE o campo retirada ao servidor', () => {
  // Sem isto o resto nao vale nada: a decisao seria tomada sobre um campo que nunca chega.
  assert.match(HTML, /fasesPara\(d\.retirada\)/,
    'a tela parou de olhar o `retirada` da resposta');
});

test('a fase ATUAL e contada na lista que esta na TELA', () => {
  // Na retirada a quinta fase nao existe. Usar o indice da ORDEM fixa pintaria a fase errada de
  // concluida -- "Pronto" apareceria como passo atual enquanto o pedido ja foi retirado.
  assert.match(HTML, /const atual = fases\.findIndex/,
    'a posicao atual voltou a sair da ORDEM fixa, e nao da lista mostrada');
});
