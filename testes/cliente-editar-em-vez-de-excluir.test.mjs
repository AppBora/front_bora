// A tela de clientes passa a ter EDITAR (item 7.12) — e o excluir avisa o que se perde.
//
// POR QUE ISTO É TESTE: a tela só tinha criar e excluir. Para corrigir um telefone digitado errado, o
// único caminho era excluir e cadastrar de novo — e excluir leva o cashback do cliente junto, sem
// avisar. O endpoint de editar (`PUT /api/clientes/{id}`) sempre existiu; era a tela que não usava.
//
// E isto não é cosmético: desde o item 6.10 o servidor RECUSA cadastrar telefone que já é de outro
// cliente. Sem o caminho de editar, essa recusa deixaria o operador sem saída nenhuma.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { subir } from './harness.mjs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const js = fs.readFileSync(RAIZ + 'assets/js/clientes.js', 'utf8');
const html = fs.readFileSync(RAIZ + 'clientes.html', 'utf8');

const MARIA = { id: 55, nome: 'Maria Silva', telefone: '62999990000', endereco: 'Rua A, 10',
  bairro: 'Centro', referencia: 'portão azul', cashback: 12.5 };

async function abrirClientes() {
  const enviados = [];
  const avisos = [];
  const Bora = {
    requireAuth: () => true,
    clientes: async () => [MARIA],
    api: async (url, opt) => {
      enviados.push({ url, metodo: opt && opt.method, corpo: opt && opt.body ? JSON.parse(opt.body) : null });
      return {};
    },
  };
  const janela = { scrollTo() {} };
  const pagina = subir(RAIZ + 'assets/js/clientes.js', {
    Bora,
    globais: { window: janela, alert: m => avisos.push(m), confirm: m => { avisos.push(m); return true; } },
  });
  await pagina.carregarPagina();
  return { pagina, janela, enviados, avisos };
}

// ------------------------------------------------------------------ a tela tem o caminho

test('clientes: a tela tem o campo escondido do id e os botões', () => {
  assert.match(html, /id="id" type="hidden"/, 'sem o id, o salvar não sabe se é criar ou editar');
  assert.match(html, /id="salvar"/);
  assert.match(html, /id="cancelar"/);
});

test('clientes: a lista desenha o botão de editar', () => {
  assert.match(js, /onclick="__editar\(\$\{c\.id\}\)"/, 'cada linha tem que ter o ✎');
  assert.match(js, /window\.__editar = /);
});

test('clientes: editar usa PUT no id; criar continua POST', () => {
  assert.match(js, /method: id \? 'PUT' : 'POST'/,
    'o salvar tem que decidir pelo id — sem isso, editar cria um cadastro novo');
  assert.match(js, /'\/api\/clientes' \+ \(id \? '\/' \+ id : ''\)/);
});

// ------------------------------------------------------------------ e funciona

test('clientes (rodando): editar traz o cadastro para o formulário', async () => {
  const { pagina, janela } = await abrirClientes();
  assert.equal(typeof janela.__editar, 'function', 'a tela não registrou o __editar');

  janela.__editar(55);

  assert.equal(pagina.get('id').value, 55, 'sem o id, salvar criaria outro cadastro');
  assert.equal(pagina.get('nome').value, 'Maria Silva');
  assert.equal(pagina.get('endereco').value, 'Rua A, 10');
  assert.equal(pagina.get('referencia').value, 'portão azul');
});

test('clientes (rodando): o telefone volta LEGÍVEL para o lojista', async () => {
  // Guardado só com dígitos (é a chave de busca do cardápio), mostrado com máscara.
  const { pagina, janela } = await abrirClientes();

  janela.__editar(55);

  assert.equal(pagina.get('telefone').value, '(62) 99999-0000');
});

test('clientes (rodando): editar muda o texto do botão e mostra o cancelar', async () => {
  // Sem isso o operador não sabe que está editando, e acha que vai criar outro.
  const { pagina, janela } = await abrirClientes();

  janela.__editar(55);

  assert.match(pagina.get('salvar').textContent, /Salvar altera/);
  assert.equal(pagina.get('cancelar').hidden, false);
});

test('clientes (rodando): cancelar volta para o modo de cadastro novo', async () => {
  const { pagina, janela } = await abrirClientes();
  janela.__editar(55);

  janela.__cancelarEdicao();

  assert.equal(pagina.get('id').value, '');
  assert.match(pagina.get('salvar').textContent, /Adicionar/);
  assert.equal(pagina.get('cancelar').hidden, true);
});

// ------------------------------------------------------------------ o excluir avisa

test('clientes (rodando): excluir avisa que o cashback vai embora', async () => {
  // O cliente do cenário tem R$ 12,50 de saldo. Excluir sem avisar era o defeito: o lojista usava o
  // excluir como se fosse "corrigir".
  const { pagina, janela, avisos } = await abrirClientes();

  await janela.__del(55);

  const texto = avisos.join(' ');
  assert.match(texto, /12,50/, 'o aviso tem que dizer o valor do saldo. Foi: ' + texto);
  assert.match(texto, /✎/, 'e apontar o caminho de corrigir em vez de excluir');
});

test('clientes: o aviso só fala de saldo quando há saldo', () => {
  // Avisar de R$ 0,00 em todo cliente faria o aviso deixar de ser lido.
  assert.match(js, /Number\(c\.cashback \|\| 0\) > 0/);
});
