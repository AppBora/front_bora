// Tres defeitos de tela achados pelos agentes de QA em 23/10/2026, cada um medido antes do conserto.
//
// 1) CLIENTES SEM BUSCA. A tela nao tinha nenhum campo de buscar, pesquisar ou filtrar -- zero
//    ocorrencias no HTML. Com 2 clientes ninguem nota; com 800, o balconista nao acha ninguem, e o
//    caminho que sobra e cadastrar de novo -- que racha o cashback entre dois cadastros.
//
// 2) REDE COM 5 ABAS E 4 CARREGADORES. rede.html tem um chip data-v="agente" que nao existe no
//    LOADERS de rede-analise.js, e a chamada LOADERS[v]() nao tem guarda. Clicar em "Agente IA"
//    estoura TypeError -- e, com essa aba ativa, trocar o periodo e clicar Buscar nao recarrega
//    NADA, calado. O lojista muda o filtro e a tela ignora.
//
// 3) PEDIDO POR TELEFONE SEM ENDERECO PROPRIO. O backend aceita enderecoEntrega e bairroEntrega
//    (NovoPedidoRequest, usados em PublicController), e a tela de Novo Pedido nunca mandava esses
//    campos: zero ocorrencias no js e no html. Cliente que liga pedindo entrega num endereco
//    diferente do cadastro, o painel nao atende -- a capacidade existia no servidor e a tela nao
//    oferecia.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* ------------------------------------------------------------------ 1) busca em Clientes */

const CLIENTES = [
  { id: 1, nome: 'Maria Eduarda', telefone: '15981034318', bairro: 'Centro', cashback: 12.5 },
  { id: 2, nome: 'Joao da Silva', telefone: '15999998888', bairro: 'Vila Nova', cashback: 0 },
  { id: 3, nome: 'Ana Paula', telefone: '15970001111', bairro: 'Centro', cashback: 3 },
];

async function abrirClientes() {
  const Bora = {
    requireAuth: () => true,
    clientes: async () => CLIENTES.map(c => ({ ...c })),
    api: async () => ({}),
  };
  const pagina = subir(path.join(RAIZ, 'assets/js/clientes.js'), {
    Bora, globais: { alert() {}, confirm: () => true, window: { location: { href: '' } } },
  });
  await pagina.carregarPagina();
  await new Promise(r => setTimeout(r, 0));
  return pagina;
}

test('PREMISSA: a tela de Clientes tem um campo de busca', () => {
  const html = ler('clientes.html');
  assert.match(html, /id="busca"/,
    'nao ha campo de busca em clientes.html: com 800 clientes o balconista nao acha ninguem');
});

test('buscar por nome filtra a lista', async () => {
  const pagina = await abrirClientes();
  const campo = pagina.get('busca');
  campo.value = 'ana';
  campo.__disparar('input');
  const linhas = pagina.get('lista').innerHTML;
  assert.ok(linhas.includes('Ana Paula'), 'quem eu procurei sumiu');
  assert.ok(!linhas.includes('Joao da Silva'), 'quem eu nao procurei ficou');
});

test('buscar por telefone acha, mesmo o usuario digitando so os numeros', async () => {
  const pagina = await abrirClientes();
  const campo = pagina.get('busca');
  campo.value = '15999998888';
  campo.__disparar('input');
  const linhas = pagina.get('lista').innerHTML;
  assert.ok(linhas.includes('Joao da Silva'),
    'a lista mostra o telefone formatado; buscar pelos numeros crus tem que achar do mesmo jeito');
  // Sem esta linha o teste passa com a lista INTEIRA na tela -- ou seja, sem busca nenhuma.
  assert.ok(!linhas.includes('Maria Eduarda'), 'a busca nao filtrou: a lista continua inteira');
});

test('buscar por bairro tambem acha', async () => {
  const pagina = await abrirClientes();
  const campo = pagina.get('busca');
  campo.value = 'centro';
  campo.__disparar('input');
  const linhas = pagina.get('lista').innerHTML;
  assert.ok(linhas.includes('Maria Eduarda') && linhas.includes('Ana Paula'));
  assert.ok(!linhas.includes('Joao da Silva'));
});

test('busca sem resultado explica, em vez de mostrar tabela vazia', async () => {
  const pagina = await abrirClientes();
  const campo = pagina.get('busca');
  campo.value = 'zzzzzz';
  campo.__disparar('input');
  assert.match(pagina.get('lista').innerHTML, /nenhum cliente|não achei|nao achei/i);
});

test('apagar a busca traz todo mundo de volta', async () => {
  const pagina = await abrirClientes();
  const campo = pagina.get('busca');
  campo.value = 'ana'; campo.__disparar('input');
  // Confere que filtrou DE VERDADE antes de limpar -- senao "todo mundo voltou" e so a lista
  // inteira que nunca saiu do lugar, e o teste passa sem busca nenhuma existir.
  assert.ok(!pagina.get('lista').innerHTML.includes('Joao da Silva'), 'nao chegou a filtrar');
  campo.value = '';   campo.__disparar('input');
  const linhas = pagina.get('lista').innerHTML;
  for (const c of CLIENTES) assert.ok(linhas.includes(c.nome), c.nome + ' nao voltou');
});

/* ------------------------------------------------------- 2) a aba que estoura na tela Rede */

test('PREMISSA: todo chip da tela Rede tem QUEM o carregue', () => {
  // A moldura "5 chips e 4 carregadores" estava errada: a aba do agente tem script proprio
  // (agente-rede.js), que escuta o chip dela. Estar fora do LOADERS e correto. O defeito era a
  // chamada sem guarda. O que este teste tem de garantir, entao, e que ninguem fique orfao: ou o
  // chip esta no LOADERS, ou alguem mais escuta ele.
  const chips = [...new Set([...ler('rede.html').matchAll(/data-v="([a-z]+)"/g)].map(m => m[1]))];
  const analise = ler('assets/js/rede-analise.js');
  const bloco = analise.slice(analise.indexOf('const LOADERS'), analise.indexOf('const LOADERS') + 400);
  const outros = ler('assets/js/agente-rede.js');
  const orfaos = chips.filter(v => !bloco.includes(v + ':') && !outros.includes(`data-v="${v}"`));
  assert.deepEqual(orfaos, [],
    'chip que ninguem carrega: clicar nele nao faz nada, ou estoura');
});

test('a chamada do carregador tem guarda, para aba nova nao derrubar a tela', () => {
  const js = ler('assets/js/rede-analise.js');
  assert.ok(/LOADERS\[v\]\s*&&|typeof LOADERS\[v\]|const carregar = LOADERS\[v\]/.test(js),
    'LOADERS[v]() sem guarda: quem acrescentar um chip amanha quebra a tela de novo');
});

/* -------------------------------------------- 3) endereco proprio no pedido por telefone */

test('PREMISSA: Novo Pedido tem onde digitar o endereco DESTE pedido', () => {
  const html = ler('novo-pedido.html');
  assert.match(html, /id="pedEndereco"/,
    'nao ha campo de endereco do pedido: cliente que liga pedindo entrega noutro endereco nao e atendido');
  assert.match(html, /id="pedBairro"/, 'falta o bairro do pedido, que e quem define a taxa');
});

test('o endereco do pedido vai no corpo enviado', () => {
  const js = ler('assets/js/novo-pedido.js');
  assert.ok(js.includes('enderecoEntrega'),
    'a tela nao manda enderecoEntrega -- o backend aceita desde sempre e a tela nao oferecia');
  assert.ok(js.includes('bairroEntrega'), 'a tela nao manda bairroEntrega');
});
