// Todo papel que sai do sistema levava "BoraHapp" no lugar do nome da loja.
//
// `boraTheme` era LIDO em cinco lugares e ESCRITO em nenhum — só apagado no logout (app.js:198):
//
//   app.js:145                 comanda da cozinha        -> "BoraHapp"
//   caixa.js:22                fechamento do caixa       -> "Bora"
//   acerto-entregadores.js:144 recibo do motoboy         -> "BoraHapp"
//   app.js:2 (applyTheme)      nome e cores na abertura  -> não fazia nada
//
// Na TELA o nome aparece certo, porque vem por outro caminho (`whitelabel.js`, nos `[data-store]`).
// Só o impresso caía no genérico — e é justamente o papel que vai para a mão do cliente e do
// motoboy. Achado por dois agentes de QA, independentes, em 23/10/2026.
//
// O segundo efeito, que ninguém tinha ligado ao mesmo botão: `applyTheme()` roda ANTES da API
// responder e existe para a tela não piscar o nome errado. Sem nada gravado, ela era código morto,
// e toda página abria mostrando o texto fixo do HTML até a configuração chegar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/** Roda o whitelabel.js com uma configuração de loja e devolve o que ficou no localStorage. */
async function aplicar(config) {
  const guardado = {};
  const janela = {
    localStorage: {
      getItem: (k) => (k in guardado ? guardado[k] : null),
      setItem: (k, v) => { guardado[k] = String(v); },
      removeItem: (k) => { delete guardado[k]; },
    },
  };
  const documento = {
    documentElement: { style: { setProperty() {} } },
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const Bora = { configuracao: async () => config, token: () => 'mock' };
  const BoraCores = { aplicar() {} };

  const fonte = ler('assets/js/whitelabel.js');
  const fn = new Function('Bora', 'BoraCores', 'document', 'localStorage', 'window',
    fonte + '\n;return aplicarWhiteLabel();');
  await fn(Bora, BoraCores, documento, janela.localStorage, janela);
  return guardado;
}

const CONFIG = {
  lojaId: 17,
  nomeExibicao: 'Pizzaria Bella Napoli',
  corPrimaria: '#C8102E',
  corSecundaria: '#FFD100',
  logoUrl: '/public/loja/17/logo',
  mostrarMarcaBora: false,
};

test('PREMISSA: alguem precisa GRAVAR o boraTheme', async () => {
  const guardado = await aplicar(CONFIG);
  assert.ok(guardado.boraTheme,
    'ninguem grava boraTheme: toda comanda, recibo e fechamento saem com "BoraHapp"');
});

test('o nome da loja fica guardado, e e ele que o papel le', async () => {
  const guardado = await aplicar(CONFIG);
  const tema = JSON.parse(guardado.boraTheme);
  assert.equal(tema.name, 'Pizzaria Bella Napoli');
});

test('as cores e a logo tambem, que e o que applyTheme usa na abertura', async () => {
  const tema = JSON.parse((await aplicar(CONFIG)).boraTheme);
  assert.equal(tema.primary, '#C8102E');
  assert.equal(tema.secondary, '#FFD100');
  assert.equal(tema.logo, '/public/loja/17/logo');
});

test('loja sem nome de exibicao nao grava nome vazio por cima', async () => {
  // Gravar "" faria o papel sair SEM nome nenhum, que e pior que sair genérico.
  const tema = JSON.parse((await aplicar({ ...CONFIG, nomeExibicao: '' })).boraTheme || '{}');
  assert.ok(!tema.name, 'gravou nome vazio');
});

test('a API caindo nao apaga o que ja estava guardado', async () => {
  // Sem isto, um erro de rede na abertura deixaria o papel generico de novo ate a proxima carga.
  const guardado = {};
  guardado.boraTheme = JSON.stringify({ name: 'Pizzaria Bella Napoli' });
  const janela = {
    localStorage: {
      getItem: (k) => (k in guardado ? guardado[k] : null),
      setItem: (k, v) => { guardado[k] = String(v); },
      removeItem: (k) => { delete guardado[k]; },
    },
  };
  const Bora = { configuracao: async () => { throw new Error('rede caiu'); }, token: () => 'mock' };
  const fonte = ler('assets/js/whitelabel.js');
  const fn = new Function('Bora', 'BoraCores', 'document', 'localStorage', 'window',
    fonte + '\n;return aplicarWhiteLabel();');
  await fn(Bora, { aplicar() {} },
    { documentElement: { style: { setProperty() {} } }, querySelectorAll: () => [], addEventListener: () => {} },
    janela.localStorage, janela);
  assert.equal(JSON.parse(guardado.boraTheme).name, 'Pizzaria Bella Napoli');
});

test('os quatro lugares que leem o tema continuam lendo a mesma chave', () => {
  // Se alguem renomear a chave num lado e esquecer do outro, o papel volta a sair generico e
  // ninguem percebe ate o motoboy reclamar.
  for (const arq of ['assets/js/app.js', 'assets/js/caixa.js', 'assets/js/acerto-entregadores.js']) {
    assert.ok(ler(arq).includes("'boraTheme'"), arq + ' parou de ler boraTheme');
  }
  assert.ok(ler('assets/js/whitelabel.js').includes("'boraTheme'"),
    'o whitelabel parou de gravar boraTheme');
});
