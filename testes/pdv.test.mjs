// A Frente de Caixa: o que a tela MOSTRA tem que ser o que o servidor GRAVA.
//
// O defeito que estes testes travam (achado em 18/10/2026): a tela somava só os itens. Quando o
// caixa marcava "usar cashback", a linha Total continuava no preço cheio e o servidor descontava o
// saldo. O caixa cobrava o que estava na tela; o pedido era gravado por menos. O cliente pagava o
// cheio E perdia o saldo, e a gaveta fechava com mais dinheiro do que o sistema dizia.
//
// A conta certa é a mesma do servidor (`FidelidadeService.resgatePossivel`):
//     desconto = min(saldo, subtotal − 0,01)
// — o resgate nunca zera o pedido, sempre fica pelo menos um centavo a pagar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const REPO_FE = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/';
const ARQ = process.env.PDV_JS || REPO_FE + 'pdv.js';

const PRODUTOS = [
  { id: 1, nome: 'Açaí 500ml', categoria: 'Açaí', preco: 24, ativo: true },
  { id: 2, nome: 'Água', categoria: 'Bebidas', preco: 4, ativo: true },
];

/** Sobe o pdv.js de verdade com um cliente que tem `saldo` de cashback. */
async function abrirCaixa(saldo) {
  const enviados = [];
  const Bora = {
    requireAuth: () => true,
    produtos: async () => PRODUTOS,
    clientes: async () => [{ id: 7, nome: 'Marina', cashback: saldo }],
    formasPagamento: async () => [{ id: 1, descricao: 'Dinheiro', ativo: true }],
    api: async (url, opt) => { enviados.push(JSON.parse(opt.body)); return { id: 1, codigo: 'A1' }; },
    criarPedido: async (corpo) => { enviados.push(corpo); return { id: 1, codigo: 'A1' }; },
  };
  const pagina = subir(ARQ, { Bora, globais: { boraToast() {} } });
  await pagina.carregarPagina();
  return { pagina, enviados };
}

const txt = (p, id) => String(p.get(id).textContent);

test('pdv: a tela tem a linha do desconto e o ouvinte do visto', async () => {
  // Estes dois são o conserto. Sem a linha, não há onde mostrar; sem o ouvinte, marcar não refaz a
  // conta. Conferimos no arquivo, porque o harness não renderiza o HTML.
  const fs = await import('node:fs');
  const html = fs.readFileSync(
    'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/pdv.html', 'utf8');
  assert.match(html, /id="linhaCashbackBox"/, 'pdv.html perdeu a linha do desconto');
  assert.match(html, /id="linhaCashback"/, 'pdv.html perdeu o valor do desconto');

  const js = fs.readFileSync(REPO_FE + 'pdv.js', 'utf8');
  assert.match(js, /usarCashback'\)\.addEventListener\('change'/,
    'sem este ouvinte, marcar o visto nao mexe no total');
  assert.match(js, /descontoDoCashback/, 'a conta do desconto sumiu');
});

test('pdv: a conta do desconto e a MESMA do servidor', async () => {
  // resgatePossivel = min(saldo, total − 0,01), nunca negativo. Reproduzimos a função do arquivo
  // para provar a regra — se alguém trocar a fórmula no pdv.js, este teste continua medindo a
  // fórmula do arquivo, não uma cópia minha.
  const fs = await import('node:fs');
  const js = fs.readFileSync(REPO_FE + 'pdv.js', 'utf8');
  const corpo = js.match(/function descontoDoCashback\(subtotal\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(corpo, 'nao achei a funcao descontoDoCashback no pdv.js');

  // Monta a função com o mínimo de contexto que ela usa.
  const fabrica = new Function('marcado', 'saldo', `
    const $ = () => ({ checked: marcado, value: '7' });
    const clientes = [{ id: 7, cashback: saldo }];
    function descontoDoCashback(subtotal) {${corpo[1]}}
    return descontoDoCashback;`);

  const caso = (marcado, saldo, subtotal) => fabrica(marcado, saldo)(subtotal);

  assert.equal(caso(false, 10, 24), 0, 'visto desmarcado nao desconta nada');
  assert.equal(caso(true, 0, 24), 0, 'cliente sem saldo nao desconta');
  assert.equal(caso(true, 10, 24), 10, 'saldo menor que o pedido desconta o saldo inteiro');
  assert.equal(caso(true, 100, 24), 23.99, 'saldo maior que o pedido deixa UM CENTAVO a pagar');
  assert.equal(caso(true, 100, 0.01), 0, 'pedido de um centavo nao pode ficar em zero');
  assert.equal(caso(true, 10, 0), 0, 'comanda vazia nao desconta');
  assert.equal(caso(true, 7.005, 24), 7.01, 'arredonda em 2 casas, como o servidor');
});

test('pdv: o corpo enviado ao servidor leva o usarCashback do visto', async () => {
  // O servidor é quem decide o valor final; o que a tela manda é a INTENÇÃO. Se este campo deixar de
  // ser enviado, o desconto some da gravação e a tela passa a mentir para o outro lado.
  const fs = await import('node:fs');
  const js = fs.readFileSync(REPO_FE + 'pdv.js', 'utf8');
  assert.match(js, /usarCashback:\s*\$\('usarCashback'\)\.checked/,
    'o pedido precisa continuar mandando usarCashback ao servidor');
});

test('pdv: trocar de cliente refaz a conta', async () => {
  // Cliente novo = saldo novo = total novo. Antes, atualizarCashback só mexia na caixinha verde.
  const fs = await import('node:fs');
  const js = fs.readFileSync(REPO_FE + 'pdv.js', 'utf8');
  const fn = js.match(/function atualizarCashback\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(fn, 'nao achei atualizarCashback');
  assert.match(fn[1], /renderCart\(\)/,
    'trocar de cliente tem que refazer o total, nao so a caixinha do saldo');
});

test('pdv: a tela sobe sem erro e sem cliente nenhum', async () => {
  const { pagina } = await abrirCaixa(0);
  assert.equal(txt(pagina, 'total'), 'R$ 0,00');
  assert.equal(txt(pagina, 'qtdItens'), '0');
});
