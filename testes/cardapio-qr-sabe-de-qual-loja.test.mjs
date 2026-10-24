// De QUAL loja é o QR que vai para a parede.
//
// O DEFEITO QUE ESTE TESTE FECHA
// A tela fazia `const lojaId = Bora.user().lojaId || 1`. Quem entra pela plataforma -- suporte, o
// dono da Bora -- fica SEM loja na sessão enquanto não escolhe uma. O `|| 1` então resolvia
// sozinho, em silêncio: o link, o QR e o botão do cardápio impresso saíam todos apontando para o
// cardápio da LOJA 1.
//
// Por que isso é grave e não é detalhe: ninguém confere um QR já colado. O cliente aponta a
// câmera, abre o cardápio de outra loja, e pede de lá. O erro aparece como pedido perdido semanas
// depois, longe da tela que o causou.
//
// A regra agora: sem loja na sessão, a tela PERGUNTA. Nada de link, nada de QR, nada de impressão
// até alguém dizer de qual loja é — e as três coisas leem a MESMA resposta, para não existir um
// QR apontando para uma loja e um papel para outra.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const TELA = RAIZ + '/assets/js/cardapio-qr.js';

const LOJAS = [
  { id: 7, nome: 'Pizzaria Bella Napoli', ativo: true },
  { id: 18, nome: 'Zirá Açaíteria', ativo: true },
  { id: 23, nome: 'Loja parada', ativo: false },
];

function montar({ lojaDaSessao = null, lojas = LOJAS, falhaNaLista = null } = {}) {
  const janela = { open() {}, location: { origin: 'http://t' } };
  const Bora = {
    requireAuth: () => true,
    user: () => ({ nome: 'dono', papel: 'ADMINISTRADOR_BORA', lojaId: lojaDaSessao }),
    minhasLojas: async () => { if (falhaNaLista) throw new Error(falhaNaLista); return lojas; },
    logout() {},
  };
  // O gerador de QR de verdade: a tela desenha o codigo com ele, e um duble esconderia um
  // estouro do gerador justamente no caminho que importa.
  const ctxQr = { console, TextEncoder };
  vm.createContext(ctxQr);
  vm.runInContext(fs.readFileSync(RAIZ + '/assets/js/qr.js', 'utf8'), ctxQr);
  const t = subir(TELA, { Bora, globais: { window: janela, BoraQR: ctxQr.BoraQR } });
  return { ...t, janela };
}

// ---------------------------------------------------------------- a premissa
test('PREMISSA: sessao sem loja NAO cai para a loja 1', async () => {
  const t = montar({ lojaDaSessao: null });
  await t.carregarPagina();

  assert.equal(t.get('link').value, '',
    'gerou um link sem saber de qual loja — era o cardapio da loja 1 indo para a parede');
  assert.ok(!t.get('qr').src,
    'desenhou o QR da loja 1');
  assert.match(t.get('qrEstado').textContent, /escolha a loja/i,
    'a tela precisa DIZER que esta esperando a loja, e nao so ficar vazia');
});

test('sessao sem loja: a tela pergunta, com as lojas que a conta enxerga', async () => {
  const t = montar({ lojaDaSessao: null });
  await t.carregarPagina();

  assert.equal(t.get('semLoja').hidden, false, 'a caixa de escolha ficou escondida');
  const html = t.get('escolhaLoja').innerHTML;
  for (const l of LOJAS) assert.ok(html.includes(l.nome), 'faltou ' + l.nome + ' na lista');
  assert.ok(html.includes('value="18"'), 'a opcao precisa levar o id, nao so o nome');
  assert.match(html, /Loja parada[\s\S]{0,30}\(inativa\)/,
    'loja inativa tem de vir marcada: imprimir o QR dela e imprimir um cardapio fora do ar');
});

test('escolhida a loja, o link e o QR saem COM ELA', async () => {
  const t = montar({ lojaDaSessao: null });
  await t.carregarPagina();

  const sel = t.get('escolhaLoja');
  sel.value = '18';
  await sel.__disparar('change');

  assert.match(t.get('link').value, /loja=18/, 'o link nao pegou a loja escolhida');
  assert.ok(!/loja=1(\D|$)/.test(t.get('link').value), 'o link voltou para a loja 1');
  // O QR agora e desenhado aqui dentro, entao o endereco nao aparece no `src`. A asserçao fica
  // mais forte: o codigo tem de ser EXATAMENTE o do link da loja 18 -- byte a byte.
  assert.match(String(t.get('qr').src), /^data:image\/svg\+xml/,
    'o QR nao foi desenhado depois da escolha');
  const ctx2 = { console, TextEncoder };
  vm.createContext(ctx2);
  vm.runInContext(fs.readFileSync(RAIZ + '/assets/js/qr.js', 'utf8'), ctx2);
  assert.equal(String(t.get('qr').src), ctx2.BoraQR.dataUri(t.get('link').value, { margem: 4 }),
    'o QR desenhado nao corresponde ao link que a tela mostra');
  assert.equal(t.get('qrEstado').textContent, '', 'o aviso de "escolha a loja" ficou na tela');
});

test('a folha impressa le a MESMA loja que o QR', async () => {
  const t = montar({ lojaDaSessao: null });
  await t.carregarPagina();
  assert.equal(t.janela.__lojaDoCardapio(), null, 'disse ter loja antes de alguem escolher');

  const sel = t.get('escolhaLoja');
  sel.value = '18';
  await sel.__disparar('change');

  assert.equal(t.janela.__lojaDoCardapio(), 18,
    'o botao da folha impressa responderia outra loja que a do QR nesta mesma tela');
});

test('voltar para "— escolha —" apaga o link, em vez de deixar o anterior', async () => {
  const t = montar({ lojaDaSessao: null });
  await t.carregarPagina();
  const sel = t.get('escolhaLoja');
  sel.value = '18';
  await sel.__disparar('change');
  sel.value = '';
  await sel.__disparar('change');

  assert.equal(t.get('link').value, '', 'o link da loja anterior ficou na tela');
  assert.equal(t.janela.__lojaDoCardapio(), null);
});

// ---------------------------------------------------------------- o caminho de todo dia
test('lojista com loja na sessao nao e perguntado nada', async () => {
  const t = montar({ lojaDaSessao: 7 });
  await t.carregarPagina();

  // `hidden` nasce false no dublê do harness, entao ele nao distingue "nunca mexeram" de
  // "mostraram". O que prova que a tela NAO perguntou e a lista nunca ter sido montada.
  assert.equal(t.get('escolhaLoja').innerHTML, '',
    'montou a lista de lojas para quem ja tem loja na sessao');
  assert.match(t.get('link').value, /loja=7/);
  assert.equal(t.janela.__lojaDoCardapio(), 7);
});

test('o WhatsApp opcional entra no link sem derrubar a loja', async () => {
  const t = montar({ lojaDaSessao: 7 });
  await t.carregarPagina();
  t.get('wa').value = '(11) 99999-9999';
  await t.get('wa').__disparar('input');

  assert.match(t.get('link').value, /loja=7/, 'o numero do WhatsApp apagou a loja do link');
  assert.match(t.get('link').value, /wa=5511999999999/);
});

// ---------------------------------------------------------------- quando a lista nao vem
test('se a lista de lojas falhar, a tela diz — e segue sem gerar nada', async () => {
  const t = montar({ lojaDaSessao: null, falhaNaLista: 'sem rede' });
  await t.carregarPagina();

  assert.match(t.get('semLojaMsg').textContent, /sem rede/,
    'engoliu o erro: o usuario fica olhando uma lista vazia sem saber por que');
  assert.equal(t.get('link').value, '', 'gerou link mesmo sem conseguir saber a loja');
});

test('conta sem nenhuma loja recebe um recado claro, nao uma lista vazia', async () => {
  const t = montar({ lojaDaSessao: null, lojas: [] });
  await t.carregarPagina();

  assert.match(t.get('semLojaMsg').textContent, /nenhuma loja/i);
  assert.equal(t.get('link').value, '');
});
