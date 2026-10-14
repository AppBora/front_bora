/**
 * A cor do texto é escolhida pela conta, não pela escolha do lojista.
 *
 * O CSS pintava o PREÇO de cada item do cardápio com a cor secundária da loja. A Zirá escolheu
 * #FFD100; amarelo claro sobre branco dá 1,46:1 de contraste, e a norma pede 4,5:1. O dado mais
 * importante da tela ficava praticamente invisível — e no sol do balcão, invisível de verdade.
 *
 * Trocar a cor da Zirá resolveria a Zirá e deixaria a próxima loja de cor clara no mesmo buraco.
 * Estes testes travam a conta, não a cor de ninguém.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
require(join(aqui, '..', 'assets', 'js', 'cores.js'));
const C = globalThis.BoraCores;

const BRANCO = [255, 255, 255];
const MINIMO = 4.5; // WCAG AA, texto normal

/** Contraste de uma cor hex contra o branco. */
const sobreBranco = (hex) => C.contraste(C.paraRgb(hex), BRANCO);

test('o amarelo da Zirá era ilegível como texto, e a conta sabe disso', () => {
  const medido = sobreBranco('#FFD100');
  assert.ok(medido < 1.5, `#FFD100 sobre branco deu ${medido.toFixed(2)}:1`);
  assert.ok(medido < MINIMO, 'se isto passar a dar 4,5:1, a conta está errada');
});

test('a cor legível derivada do amarelo da Zirá passa na norma', () => {
  const legivel = C.legivelSobreBranco(C.paraRgb('#FFD100'));
  const medido = sobreBranco(legivel);
  assert.ok(medido >= MINIMO, `${legivel} deu ${medido.toFixed(2)}:1`);
});

test('escurecer preserva o matiz: o amarelo vira amarelo escuro, não cinza', () => {
  const [r, g, b] = C.paraRgb(C.legivelSobreBranco(C.paraRgb('#FFD100')));
  assert.ok(r > b && g > b, `esperava vermelho e verde acima do azul, deu rgb(${r},${g},${b})`);
  assert.ok(r >= g, 'o amarelo tem vermelho >= verde');
});

test('cor que já é legível atravessa sem mudança', () => {
  // A primária da Zirá (#5B1A8B) já dá 10,68:1: mexer nela seria estragar a marca sem motivo.
  assert.equal(C.legivelSobreBranco(C.paraRgb('#5B1A8B')).toLowerCase(), '#5b1a8b');
  assert.equal(C.legivelSobreBranco(C.paraRgb('#7c3aed')).toLowerCase(), '#7c3aed');
});

test('o texto em cima da cor da loja é o que contrasta mais com ela', () => {
  // Em cima do amarelo: escuro. Em cima do roxo: branco.
  assert.equal(C.textoSobre(C.paraRgb('#FFD100')), '#10211c');
  assert.equal(C.textoSobre(C.paraRgb('#5B1A8B')), '#ffffff');
  assert.equal(C.textoSobre(C.paraRgb('#000000')), '#ffffff');
  assert.equal(C.textoSobre(C.paraRgb('#FFFFFF')), '#10211c');
});

test('cor de luminância média cai no preto puro, porque nem branco nem o escuro passam', () => {
  // Isto foi achado por teste, depois de eu dar a conta como pronta: em vermelho puro o quase-preto
  // dá 4,18:1 e o branco 4,00:1 — os dois ABAIXO de 4,5. O preto puro resolve com 5,25:1.
  assert.equal(C.textoSobre(C.paraRgb('#FF0000')), '#000000');
  assert.ok(C.contraste(C.paraRgb('#10211c'), C.paraRgb('#FF0000')) < MINIMO);
  assert.ok(C.contraste(BRANCO, C.paraRgb('#FF0000')) < MINIMO);
  assert.ok(C.contraste([0, 0, 0], C.paraRgb('#FF0000')) >= MINIMO);
});

test('o texto escolhido sempre passa na norma em cima da cor da loja', () => {
  const marcas = ['#FFD100', '#5B1A8B', '#7c3aed', '#22c55e', '#FFFFFF', '#000000',
                  '#DDDDDD', '#FF0000', '#00FF00', '#0000FF', '#FFA500',
                  '#8B0000', '#4B0082', '#808080', '#FF69B4', '#008080'];
  for (const m of marcas) {
    const texto = C.textoSobre(C.paraRgb(m));
    const medido = C.contraste(C.paraRgb(texto), C.paraRgb(m));
    assert.ok(medido >= MINIMO, `texto ${texto} sobre ${m} deu só ${medido.toFixed(2)}:1`);
  }
});

test('qualquer cor de marca gera um preço legível', () => {
  const marcas = ['#FFD100', '#FFFF00', '#FFFFFF', '#F0F0F0', '#00FFFF', '#FFC0CB', '#ADFF2F'];
  for (const m of marcas) {
    const legivel = C.legivelSobreBranco(C.paraRgb(m));
    const medido = sobreBranco(legivel);
    assert.ok(medido >= MINIMO, `${m} virou ${legivel}, que deu só ${medido.toFixed(2)}:1`);
  }
});

test('cor inválida não quebra a tela: devolve null e a loja fica no tema padrão', () => {
  assert.equal(C.paraRgb('nao-e-cor'), null);
  assert.equal(C.paraRgb(''), null);
  assert.equal(C.paraRgb(null), null);
  assert.equal(C.paraRgb('#12345'), null);
});

test('hex de 3 dígitos é aceito', () => {
  assert.equal(C.paraHex(C.paraRgb('#FD0')), '#ffdd00');
  assert.equal(C.paraHex(C.paraRgb('fff')), '#ffffff');
});

test('aplicar() define as derivadas junto com a cor da loja', () => {
  const definidas = {};
  const estiloFalso = { setProperty: (k, v) => { definidas[k] = v; } };

  C.aplicar(estiloFalso, { corPrimaria: '#5B1A8B', corSecundaria: '#FFD100' });

  assert.equal(definidas['--secondary'], '#ffd100');
  assert.equal(definidas['--secondary-legivel'], '#8c7300');
  assert.equal(definidas['--secondary-texto'], '#10211c');
  assert.equal(definidas['--primary'], '#5b1a8b');
  assert.equal(definidas['--primary-texto'], '#ffffff');
});

test('loja sem cor cadastrada não tem variável nenhuma sobrescrita', () => {
  const definidas = {};
  const estiloFalso = { setProperty: (k, v) => { definidas[k] = v; } };

  C.aplicar(estiloFalso, {});
  C.aplicar(estiloFalso, { corSecundaria: 'lixo' });

  assert.equal(Object.keys(definidas).length, 0, 'tem que ficar no tema padrão do CSS');
});

test('o CSS usa as variáveis derivadas onde a cor vira TEXTO', async () => {
  // Guarda contra alguém voltar a pintar o preço com --secondary cru.
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(join(aqui, '..', 'assets', 'css', 'styles.css'), 'utf8');

  const preco = css.match(/\.menu-item \.mp\{[^}]*\}/);
  assert.ok(preco, 'não achei a regra do preço do cardápio');
  assert.ok(/--secondary-legivel/.test(preco[0]), `o preço voltou a usar a cor crua: ${preco[0]}`);

  const botao = css.match(/\.btn-finish\{[^}]*\}/);
  assert.ok(botao, 'não achei a regra do botão Finalizar venda');
  assert.ok(/--secondary-texto/.test(botao[0]), `o botão voltou ao texto branco fixo: ${botao[0]}`);
});
