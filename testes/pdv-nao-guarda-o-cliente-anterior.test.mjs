// Frente de Caixa: o cliente da venda anterior ficava preso na tela.
//
// `finalizar()` limpava o carrinho (`cart = []`) e NAO zerava o seletor de cliente. A linha
// seguinte chama `atualizarCashback()`, que le justamente `$('cliente').value` -- entao a tela
// voltava a mostrar o saldo do cliente que ja foi embora. E pior: `atualizarCashback()` so
// desmarca o "usar cashback" quando o saldo e zero, logo, com saldo sobrando, a marcacao
// CONTINUAVA LIGADA para a venda seguinte.
//
// No balcao cada venda e uma pessoa diferente. O efeito era dinheiro saindo no nome errado: a
// proxima pessoa atendida gastava o cashback de um terceiro, ou acumulava no cadastro dele.
//
// Achado pelo agente de QA visual em 23/10/2026 (achado 4 do lote das secoes 1-12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const ARQ = process.env.PDV_JS
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/pdv.js';

/** Maria tem saldo; Joao nao tem. Os dois existem na lista do balcao. */
const CLIENTES = [
  { id: 1, nome: 'Maria', telefone: '15999990000', cashback: 12.5 },
  { id: 2, nome: 'Joao', telefone: '15999991111', cashback: 0 },
];

async function abrir() {
  const pedidos = [];
  const status = [];
  const Bora = {
    requireAuth: () => true,
    produtos: async () => ([{ id: 10, nome: 'Pizza', preco: 50, ativo: true, categoria: 'Salgados' }]),
    clientes: async () => CLIENTES.map(c => ({ ...c })),
    formasPagamento: async () => ([{ descricao: 'Dinheiro', ativo: true }]),
    criarPedido: async (body) => { pedidos.push(body); return { id: 500 + pedidos.length }; },
    mudarStatus: async (id, s) => { status.push([id, s]); return {}; },
    api: async (rota) => (rota.includes('/complementos')
      ? []
      : [{ id: 10, nome: 'Pizza', preco: 50, ativo: true, categoria: 'Salgados' }]),
  };
  // A tela pendura __add/__inc/__dec no window: e por ali que o toque no tile coloca no carrinho.
  // Clicar no grid pelo harness nao funciona (o duble nao tem closest), e um carrinho vazio faz
  // `finalizar()` desistir na primeira linha -- o teste passaria a medir nada.
  const janela = { location: { href: '' } };
  const pagina = subir(ARQ, {
    Bora,
    globais: { alert() {}, confirm: () => true, window: janela },
  });
  await pagina.carregarPagina();
  await new Promise(r => setTimeout(r, 0));
  return { pagina, pedidos, status, janela };
}

/** Atende a Maria, com o cashback dela marcado, e fecha a venda. */
async function venderParaMaria(pagina) {
  const sel = pagina.get('cliente');
  sel.value = '1';
  sel.__disparar('change');
  pagina.get('usarCashback').checked = true;
  pagina.get('usarCashback').__disparar('change');
  return sel;
}

/** Coloca um item no carrinho pelo mesmo caminho do toque no tile. */
async function porNoCarrinho(janela) {
  await janela.__add(10);
}

test('PREMISSA: depois de fechar a venda o seletor nao pode continuar no cliente anterior', async () => {
  const { pagina, janela } = await abrir();
  await venderParaMaria(pagina);
  await porNoCarrinho(janela);
  await pagina.get('finish').__disparar('click');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(
    pagina.get('cliente').value, '',
    'a tela continuou na Maria: a proxima pessoa do balcao seria atendida como ela',
  );
});

test('PREMISSA: o "usar cashback" nao pode continuar marcado para a proxima venda', async () => {
  const { pagina, janela } = await abrir();
  await venderParaMaria(pagina);
  await porNoCarrinho(janela);
  await pagina.get('finish').__disparar('click');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(
    pagina.get('usarCashback').checked, false,
    'a marcacao sobrou ligada: a venda seguinte abateria o saldo de um terceiro',
  );
});

test('o aviso de saldo some junto com o cliente', async () => {
  const { pagina, janela } = await abrir();
  await venderParaMaria(pagina);
  await porNoCarrinho(janela);
  await pagina.get('finish').__disparar('click');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(pagina.get('cashbackBox').style.display, 'none');
});

test('a venda em si continua saindo certa, com o cliente e o cashback escolhidos', async () => {
  const { pagina, pedidos, status, janela } = await abrir();
  await venderParaMaria(pagina);
  await porNoCarrinho(janela);
  await pagina.get('finish').__disparar('click');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(pedidos.length, 1, 'tinha que ter criado exatamente um pedido');
  assert.equal(pedidos[0].clienteId, 1, 'o pedido e da Maria -- zerar e DEPOIS de gravar');
  assert.equal(pedidos[0].usarCashback, true);
  assert.equal(pedidos[0].origem, 'Balcão');
  assert.equal(pedidos[0].tipoEntrega, 'RETIRADA');
  assert.deepEqual(status[0], [501, 'ENTREGUE'], 'venda de balcao ja nasce entregue');
});

test('duas vendas seguidas: a segunda nao herda nada da primeira', async () => {
  const { pagina, pedidos, janela } = await abrir();
  await venderParaMaria(pagina);
  await porNoCarrinho(janela);
  await pagina.get('finish').__disparar('click');
  await new Promise(r => setTimeout(r, 10));

  // chega a proxima pessoa e o atendente so toca no produto
  await porNoCarrinho(janela);
  await pagina.get('finish').__disparar('click');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(pedidos.length, 2);
  assert.equal(pedidos[1].clienteId, null, 'a segunda venda saiu no nome da Maria');
  assert.equal(pedidos[1].usarCashback, false, 'a segunda venda gastou o cashback da Maria');
});
