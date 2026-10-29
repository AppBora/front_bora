/**
 * No celular, cada item do menu leva o NOME, não só o emoji.
 *
 * Abaixo de 900px a barra lateral vira uma barra inferior fixa, e o rótulo de cada item era
 * escondido (`.navtx{display:none}`) sem nada no lugar: sobravam **26 emoji** numa faixa que rola de
 * lado, onde menos da metade cabe na tela. Três deles são de dinheiro e quase iguais — Fechar Caixa
 * 💰, Acerto Motoboy 💵, Desempenho 💹 — e o `<a>` saía sem `title` e sem `aria-label`, então nem o
 * leitor de tela tinha o que ler (pente fino de 29/10/2026).
 *
 * Ícone sozinho só funciona para quem já decorou, e ninguém decorou 26.
 *
 * ## O que ficou medido no navegador, em 375px
 *
 * Com o rótulo curto a barra ficou com **61px** de altura, e o `.main` já reserva 84px embaixo —
 * então o fim do conteúdo continua aparecendo. Com o bloco "Dono / Administrador" ainda dentro dela
 * a barra ia a 113px e comia o fim da página; por isso ele sai no celular (na lateral do desktop
 * continua).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const APP = readFileSync(join(raiz, 'assets', 'js', 'app.js'), 'utf8');
const CSS = readFileSync(join(raiz, 'assets', 'css', 'styles.css'), 'utf8');

/** O BORA_NAV do arquivo, avaliado — não uma cópia. */
function itensDoMenu() {
  const i = APP.indexOf('const BORA_NAV');
  assert.ok(i > 0, 'nao achei o BORA_NAV no app.js');
  const fim = APP.indexOf('];', i) + 2;
  return new Function(`${APP.slice(i, fim).replace('const BORA_NAV', 'var BORA_NAV')}; return BORA_NAV;`)();
}

/** O bloco `@media(max-width:900px)` inteiro, contando as chaves. */
function blocoDoCelular() {
  const i = CSS.indexOf('@media(max-width:900px)');
  assert.ok(i > 0, 'nao achei o @media do celular no styles.css');
  let nivel = 0;
  for (let j = CSS.indexOf('{', i); j < CSS.length; j++) {
    if (CSS[j] === '{') nivel++;
    else if (CSS[j] === '}' && --nivel === 0) return CSS.slice(i, j + 1);
  }
  return CSS.slice(i);
}

test('PREMISSA: o menu tem os itens que esta tela precisa mostrar', () => {
  const itens = itensDoMenu();
  assert.ok(itens.length >= 20,
    `achei ${itens.length} itens no BORA_NAV; esperava mais de 20. O reconhecedor parou de funcionar.`);
});

test('todo item do menu cabe na barra do celular', () => {
  // 10 caracteres e o que cabe nos 62px de `max-width` do rotulo sem virar reticencias. Acima disso
  // o nome aparece cortado, que e pouco melhor que nao aparecer.
  const grandes = itensDoMenu()
    .map((i) => ({ nome: i.curto || i.label, label: i.label }))
    .filter((i) => i.nome.length > 10);

  assert.deepEqual(grandes, [],
    'estes itens nao cabem na barra do celular. Ponha um `curto` de ate 10 caracteres neles:\n   '
    + grandes.map((g) => `${g.label} -> "${g.nome}" (${g.nome.length})`).join('\n   '));
});

test('nenhum nome curto se repete: o menu tem tres telas de dinheiro', () => {
  // Fechar Caixa, Acerto Motoboy e Desempenho sao tres telas diferentes com icone parecido. Dois
  // nomes iguais na barra deixariam o problema exatamente onde ele estava.
  const nomes = itensDoMenu().map((i) => (i.curto || i.label).toLowerCase());
  const repetidos = nomes.filter((n, i) => nomes.indexOf(n) !== i);

  assert.deepEqual([...new Set(repetidos)], [], 'nome repetido na barra do celular');
});

test('o link do menu leva o nome inteiro para quem nao ve a tela', () => {
  const render = APP.slice(APP.indexOf('function renderNav'));

  assert.match(render, /title="\$\{i\.label\}"/,
    'o <a> do menu perdeu o title: no celular sobra o emoji, e o nome inteiro nao esta em lugar nenhum');
  assert.match(render, /aria-label="\$\{i\.label\}"/,
    'sem aria-label o leitor de tela anuncia o emoji');
  assert.match(render, /navtx-curto/,
    'o renderNav parou de emitir o rotulo curto que a barra do celular mostra');
});

test('a barra do celular MOSTRA o rotulo curto, e o desktop esconde', () => {
  const celular = blocoDoCelular();

  // `.side .navtx-curto`, com dois seletores: a regra que esconde no desktop esta DEPOIS deste bloco
  // no arquivo, e com a mesma especificidade a ultima vence. Medido no navegador: com um seletor so,
  // o rotulo saia com display:none em 375px.
  assert.match(celular, /\.side\s+\.navtx-curto\{[^}]*display:block/,
    'o rotulo curto nao aparece no celular -- confira a especificidade contra a regra do desktop');
  assert.match(celular, /\.navtx\{display:none\}/,
    'o rotulo inteiro tem de sair no celular: "Rede & Analise IA" ocuparia meia tela');

  const foraDoMedia = CSS.replace(celular, '');
  assert.match(foraDoMedia, /\.navtx-curto\{display:none\}/,
    'o rotulo curto apareceu no desktop, onde o nome inteiro cabe na lateral');
});

test('o bloco "quem sou eu" sai da barra do celular', () => {
  // 46px de uma barra fixa que nao e botao nem link. Com ele a barra ia a 113px e o `.main` reserva
  // 84px -- o fim do conteudo ficava escondido atras dela.
  assert.match(blocoDoCelular(), /#quemSouEu\{display:none\}/,
    'o bloco de identificacao voltou para a barra de baixo do celular');
});
