// Item 7.9 da varredura: o painel não cabia no celular.
//
// O QUE FOI MEDIDO (23/10/2026, no navegador, viewport de 375x812 — um iPhone):
//
//   ANTES, em relatorios.html: a página ficava com 495px de largura dentro de uma tela de 375.
//   Quatro grades declaradas em `style="..."` no HTML ignoravam o empilhamento da folha: uma seguia
//   com 2 colunas (163,6 + 163,6) e dois blocos tinham 458 e 479px — mais largos que o telefone.
//
//   DEPOIS: página 375 = janela 375 nas 14 telas que têm grade em linha. As quatro grades viraram
//   uma coluna de 347,2px. As tabelas largas (520px) continuam largas DE PROPÓSITO, agora dentro de
//   um contêiner com `overflow-x:auto` — elas rolam dentro do cartão em vez de empurrar a página.
//
// A CAUSA, que é o que este teste trava: estilo em linha vence qualquer regra de folha, inclusive
// dentro de media query. O bloco de 900px que já existia nunca valeu nessas 14 telas. A única coisa
// que vence estilo em linha é `!important` — e é por isso que a ausência dele aqui não é detalhe de
// estilo: sem ele a regra existe e não faz nada, que é o pior dos mundos (parece consertado).
//
// Este teste é estrutural, e sei o que isso não prova: ele não mede pixel. Medir pixel exige
// navegador, e não há um na suíte. O que ele prova é a RELAÇÃO: toda tela com grade em linha está
// coberta por uma regra que vence estilo em linha, no ponto de quebra do telefone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.env.FRONTEND_DIR
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const CSS = fs.readFileSync(path.join(RAIZ, 'assets/css/styles.css'), 'utf8');

/** O bloco de media query do telefone, do `{` dele até a chave que o fecha. */
function blocoDoCelular() {
  const m = CSS.match(/@media\(max-width:(\d+)px\)\s*\{/g) || [];
  const pontos = m.map((x) => Number(x.match(/(\d+)px/)[1]));
  const menor = Math.min(...pontos);
  assert.ok(menor <= 560,
    `o menor ponto de quebra do painel e ${menor}px. Celular tem 360 a 430 -- abaixo de ${menor}px `
    + 'nao existe regra nenhuma, que era o item 7.9');

  const i = CSS.indexOf(`@media(max-width:${menor}px){`);
  let nivel = 0;
  for (let j = CSS.indexOf('{', i); j < CSS.length; j++) {
    if (CSS[j] === '{') nivel++;
    else if (CSS[j] === '}' && --nivel === 0) return CSS.slice(i, j + 1);
  }
  throw new Error('o bloco do celular nao fecha');
}

/** As telas que declaram grade em `style="..."` — a causa medida do item 7.9. */
function telasComGradeEmLinha() {
  return fs.readdirSync(RAIZ)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => /style="[^"]*grid-template-columns/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')));
}

test('celular: existe ponto de quebra para telefone, e nao so para tablet', () => {
  const bloco = blocoDoCelular();
  assert.ok(bloco.length > 100, 'o bloco do celular esta vazio ou quase');
});

test('celular: ainda ha telas com grade em linha — e e por isso que a regra precisa existir', () => {
  // Se um dia alguem tirar o estilo em linha das 14 telas, este teste falha e conta que a regra com
  // !important pode sair junto. Ate la, ela e o que segura.
  const telas = telasComGradeEmLinha();
  assert.ok(telas.length > 0,
    'nenhuma tela tem grade em linha; reveja se a regra com !important ainda e necessaria');
});

test('celular: a grade declarada EM LINHA vira uma coluna', () => {
  const bloco = blocoDoCelular();
  assert.match(bloco, /\[style\*=["']grid-template-columns["']\]/,
    'sem este seletor, as 14 telas com grade em linha continuam com 2 e 3 colunas no telefone');
});

test('celular: a regra tem !important — sem ele ela nao vence estilo em linha e nao faz NADA', () => {
  const bloco = blocoDoCelular();
  const regra = bloco.match(/\[style\*=["']grid-template-columns["']\]\s*\{[^}]*\}/);
  assert.ok(regra, 'nao achei a regra');
  assert.match(regra[0], /grid-template-columns:\s*1fr\s*!important/,
    'estilo em linha so perde para !important. Sem ele a regra existe, nao aplica, e o painel '
    + 'continua quebrado parecendo consertado');
});

test('celular: tabela larga rola DENTRO do cartao, em vez de empurrar a pagina', () => {
  // Entregas monta tabela de 6 colunas. Sem conteiner de rolagem ela empurrava a largura da PAGINA,
  // e aí todo o resto saia de lugar junto.
  const bloco = blocoDoCelular();
  assert.match(bloco, /\.card\s*,\s*\.panel\s*\{[^}]*overflow-x:\s*auto/,
    'o cartao precisa rolar de lado para a tabela larga caber sem empurrar a pagina');
});

test('celular: a pagina nunca rola de lado', () => {
  const bloco = blocoDoCelular();
  assert.match(bloco, /html\s*,\s*body\s*\{[^}]*overflow-x:\s*hidden/,
    'se algo passar da largura, tem que aparecer como corte -- e nao como rolagem horizontal que '
    + 'desalinha a tela toda');
});

test('celular: botao com area de toque de pelo menos 44px', () => {
  const bloco = blocoDoCelular();
  const btn = bloco.match(/\.btn\s*\{[^}]*\}/);
  assert.ok(btn, 'nao achei a regra do botao no bloco do celular');
  const min = Number((btn[0].match(/min-height:\s*(\d+)px/) || [])[1]);
  assert.ok(min >= 44, `area de toque de ${min || 0}px; abaixo de 44 o dedo erra o alvo`);
});

test('celular: o CSS continua balanceado (nao deixei chave aberta)', () => {
  assert.equal((CSS.match(/\{/g) || []).length, (CSS.match(/\}/g) || []).length);
});
