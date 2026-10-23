// Dois defeitos da tela Novo Pedido, achados pelos agentes de QA em 23/10/2026 e medidos de novo aqui.
//
// 1) O CANAL. O seletor "Canal de venda" era montado na ordem do BORA_CANAIS, que comeca com iFood.
//    Como o navegador seleciona a primeira opcao, todo pedido lancado por quem nao tocou nesse campo
//    entrava na base como `origem: "iFood"`. Pedido que a loja atendeu no telefone virava venda de
//    marketplace: suja a tela de Canais, o relatorio por canal e a conta de comissao. E pior, a taxa
//    olha esse mesmo campo (`/BALC/i` zera o frete), entao o canal errado tambem mexe no dinheiro.
//
// 2) A TAXA DO BAIRRO. O campo do formulario de cliente novo diz "Bairro (define a taxa)" e nao
//    definia taxa nenhuma. `taxaDoBairro` lia `c.bairro` do cliente SELECIONADO -- e quem esta
//    cadastrando cliente novo nao tem cadastro ainda, entao `c` era null e a taxa ficava 0,00.
//    Nao havia listener nenhum no campo. A loja entregava de graca sem perceber, e o rotulo prometia
//    o que a tela nao fazia.
//
// Os dois testes de premissa abaixo (`PREMISSA:`) sao os que falhavam antes do conserto. Sem eles eu
// nao saberia se o conserto consertou alguma coisa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const ARQ = process.env.NOVO_PEDIDO_JS
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/novo-pedido.js';

const CANAIS = [
  { key: 'iFood', ic: '🔴', cor: '#EA1D2C', match: ['IFOOD'] },
  { key: '99Food', ic: '🟡', cor: '#FFC400', match: ['99FOOD', '99'] },
  { key: 'Rappi', ic: '🟠', cor: '#FF441F', match: ['RAPPI'] },
  { key: 'Uber Eats', ic: '🟢', cor: '#06C167', match: ['UBER'] },
  { key: 'WhatsApp', ic: '💬', cor: '#25D366', match: ['WHATS'] },
  { key: 'Instagram', ic: '📷', cor: '#C13584', match: ['INSTA'] },
  { key: 'Telefone', ic: '📞', cor: '#3b82f6', match: ['FONE'] },
  { key: 'Site', ic: '🌐', cor: '#0ea5e9', match: ['SITE'] },
  { key: 'Balcão', ic: '🏪', cor: '#8b5cf6', match: ['BALC'] },
  { key: 'Delivery', ic: '🛵', cor: '#7c3aed', match: ['DELIVERY'] },
];

async function abrir() {
  const criados = [];
  const Bora = {
    requireAuth: () => true,
    clientes: async () => ([
      { id: 1, nome: 'Maria', telefone: '15999990000', bairro: 'Centro', cashback: 0 },
    ]),
    produtos: async () => ([{ id: 10, nome: 'Pizza', preco: 50, ativo: true }]),
    formasPagamento: async () => ([{ descricao: 'Dinheiro', ativo: true }]),
    taxas: async () => ([
      { bairro: 'Centro', taxa: 6, ativo: true },
      { bairro: 'Vila Nova', taxa: 9, ativo: true },
    ]),
    complementos: async () => ([]),
    api: async (rota, opcoes) => {
      if (rota === '/api/clientes') return { id: 99, nome: 'Novo', bairro: '' };
      criados.push({ rota, corpo: JSON.parse(opcoes.body) });
      return { id: 1234 };
    },
  };
  const pagina = subir(ARQ, {
    Bora,
    globais: { BORA_CANAIS: CANAIS, alert() {}, confirm: () => true, window: { location: { href: '' } } },
  });
  await pagina.carregarPagina();
  await new Promise((r) => setTimeout(r, 0));
  return { pagina, criados };
}

/** Abre o formulario de cliente novo (so na primeira vez -- o botao alterna) e digita um bairro. */
function abrirCadastroNovo(pagina) {
  pagina.get('btnNovoCliente').__disparar('click');
}
function digitarBairro(pagina, bairro) {
  const campo = pagina.get('ncBairro');
  campo.value = bairro;
  campo.__disparar('input');
}

// O <select> do harness nao escolhe a primeira opcao sozinho como o navegador faz, entao ler
// `.value` aqui daria verde sem medir nada. Quem decide o padrao de verdade e a MARCACAO: sem
// nenhuma opcao marcada `selected`, o navegador seleciona a primeira. E isso que eu meco.
const MARKETPLACES = ['iFood', '99Food', 'Rappi', 'Uber Eats'];
function primeiraOpcao(html) {
  const m = html.match(/<option[^>]*value="([^"]*)"/);
  return m ? m[1] : null;
}

test('PREMISSA: o canal padrao NAO pode ser um marketplace', async () => {
  const { pagina } = await abrir();
  const html = pagina.get('origem').innerHTML;
  assert.ok(!/<option[^>]+selected/i.test(html),
    'se alguem marcar uma opcao com selected, este teste precisa passar a olhar essa, nao a primeira');
  const padrao = primeiraOpcao(html);
  assert.ok(
    !MARKETPLACES.includes(padrao),
    `o seletor abre em "${padrao}": pedido do telefone entraria na base como venda de marketplace`,
  );
});

test('o canal padrao e um canal que a propria loja atendeu', async () => {
  const { pagina } = await abrir();
  assert.equal(primeiraOpcao(pagina.get('origem').innerHTML), 'Telefone');
});

test('os marketplaces continuam disponiveis, so nao sao o padrao', async () => {
  const { pagina } = await abrir();
  const html = pagina.get('origem').innerHTML;
  for (const k of ['iFood', '99Food', 'Rappi', 'Uber Eats']) {
    assert.ok(html.includes(k), `o canal ${k} sumiu do seletor -- nao era para tirar, era para nao ser o padrao`);
  }
});

test('PREMISSA: digitar o bairro do cliente novo cobra a taxa daquele bairro', async () => {
  const { pagina } = await abrir();
  abrirCadastroNovo(pagina);
  digitarBairro(pagina, 'Centro');
  assert.equal(
    pagina.get('taxa').value, '6.00',
    'o campo diz "Bairro (define a taxa)" e a taxa ficou ' + pagina.get('taxa').value,
  );
});

test('trocar o bairro digitado troca a taxa', async () => {
  const { pagina } = await abrir();
  abrirCadastroNovo(pagina);
  digitarBairro(pagina, 'Centro');
  assert.equal(pagina.get('taxa').value, '6.00');
  digitarBairro(pagina, 'Vila Nova');
  assert.equal(pagina.get('taxa').value, '9.00');
});

test('bairro digitado que nao tem taxa cadastrada fica zero, sem inventar', async () => {
  const { pagina } = await abrir();
  abrirCadastroNovo(pagina);
  digitarBairro(pagina, 'Bairro Que Nao Existe');
  assert.equal(pagina.get('taxa').value, '0.00');
});

test('o bairro do cadastro continua valendo para quem ja e cliente', async () => {
  const { pagina } = await abrir();
  const sel = pagina.get('cliente');
  sel.value = '1';
  sel.__disparar('change');
  assert.equal(pagina.get('taxa').value, '6.00', 'o caminho antigo, do cliente ja cadastrado, nao pode ter quebrado');
});

test('balcao continua sem frete, venha o bairro de onde vier', async () => {
  const { pagina } = await abrir();
  abrirCadastroNovo(pagina);
  digitarBairro(pagina, 'Centro');
  const origem = pagina.get('origem');
  origem.value = 'Balcão';
  origem.__disparar('change');
  assert.equal(pagina.get('taxa').value, '0.00', 'balcao nao cobra entrega');
});
