// Três defeitos da lista de 23/10, fechados em 24/10.
//
// #22 O cadastro não contava os 7 dias grátis que a landing promete em 5 lugares — e que o
//     servidor dá de verdade (`SignupController.java:163`: `acessoAte = now().plusDays(7)`). A
//     promessa sumia justamente na hora de pedir e-mail e senha, que é onde a pessoa decide.
//
// #23 O nome de exemplo no HTML era "Sorveteria da Rosa", uma loja de verdade. O whitelabel só
//     troca quando `nomeExibicao` vem preenchido; apagar o campo grava "", que é falsy — e o
//     lojista passava a ver o nome de outra pessoa no próprio painel.
//
// #20 A tela de Produtos mandava `estoque` no corpo do PUT. É inofensivo HOJE só porque o
//     servidor ignora o campo de propósito (`ProdutoService.java:73`), justamente para não apagar
//     as baixas do dia. Mandar assim mesmo deixa a armadilha armada: quem "consertar" o backend
//     para honrar o corpo ressuscita o bug das 21h sem saber que existiu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// ================================================================= #22
test('#22 o cadastro conta os 7 dias gratis', () => {
  const h = ler('cadastro.html');
  assert.match(h, /7 primeiros dias são grátis/i,
    'a promessa da landing some na tela onde a pessoa decide');
});

test('#22 e continua dizendo o preço de depois, para nao virar pegadinha', () => {
  const h = ler('cadastro.html');
  assert.match(h, /R\$ 199\/mês/,
    'falar do grátis sem falar do preço troca um problema por outro');
});

// ================================================================= #23
test('PREMISSA: #23 nenhuma tela traz "Sorveteria da Rosa" escrito', () => {
  const telas = fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html'));
  const comNome = telas.filter((f) => ler(f).includes('Sorveteria da Rosa'));
  assert.deepEqual(comNome, [],
    'o nome de uma loja de verdade voltou como exemplo nestas telas: ' + comNome.join(', '));
});

test('#23 o whitelabel cai no nome da sessao quando o campo esta vazio', async () => {
  const janela = {};
  const t = subir(RAIZ + '/assets/js/whitelabel.js', {
    Bora: {
      // o lojista apagou o campo: o servidor devolve string vazia, que e falsy
      configuracao: async () => ({ nomeExibicao: '', corPrimaria: '#000', logoUrl: null }),
      user: () => ({ lojaId: 18, lojaNome: 'Zirá Açaíteria' }),
      token: () => 'x',
    },
    comSeletores: true,
    globais: { window: janela, BoraCores: { aplicar() {} } },
  });
  janela.Bora = {
    configuracao: async () => ({ nomeExibicao: '' }),
    user: () => ({ lojaId: 18, lojaNome: 'Zirá Açaíteria' }),
  };
  await t.carregarPagina();
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));

  assert.equal(t.porSeletor('[data-store]').textContent, 'Zirá Açaíteria',
    'com o campo vazio a tela ficou com o texto do HTML em vez do nome da loja');
});

test('#23 com o campo preenchido, ele continua mandando', async () => {
  const janela = {};
  const t = subir(RAIZ + '/assets/js/whitelabel.js', {
    Bora: {
      configuracao: async () => ({ nomeExibicao: 'Pizzaria Bella Napoli' }),
      user: () => ({ lojaNome: 'Outro Nome' }),
      token: () => 'x',
    },
    comSeletores: true,
    globais: { window: janela, BoraCores: { aplicar() {} } },
  });
  janela.Bora = { user: () => ({ lojaNome: 'Outro Nome' }) };
  await t.carregarPagina();
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));

  assert.equal(t.porSeletor('[data-store]').textContent, 'Pizzaria Bella Napoli',
    'o nome escolhido pelo lojista tem de vencer o da sessão');
});

// ================================================================= #20
test('PREMISSA: #20 editar produto NAO manda estoque no corpo', () => {
  const js = ler('assets/js/produtos.js');
  const fn = js.match(/function payload\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(fn, 'não achei o payload()');
  assert.ok(!/estoque: num\(\$\('estoque'\)\.value\),/.test(fn[1]),
    'o estoque voltou para o corpo da edição — a armadilha das 21h fica armada de novo');
  assert.match(fn[1], /if \(!\$\('id'\)\.value\) p\.estoque = num/,
    'o estoque precisa continuar indo na CRIAÇÃO, onde é a quantidade inicial');
});

test('#20 o estoqueMinimo continua indo sempre', () => {
  // Diferente do estoque: o servidor grava `estoqueMinimo` SEM CONDIÇÃO, então não mandar
  // apagaria o mínimo de todo produto que for editado.
  const js = ler('assets/js/produtos.js');
  const fn = js.match(/function payload\(\) \{([\s\S]*?)\n  \}/);
  assert.match(fn[1], /estoqueMinimo: num\(\$\('estoqueMinimo'\)\.value\)/);
});
