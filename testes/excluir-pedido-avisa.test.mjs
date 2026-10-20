// O aviso do "excluir pedido" tem que dizer o que acontece com o dinheiro.
//
// Até 20/10/2026 o excluir NÃO devolvia nada — nem estoque, nem insumo, nem cashback — e o lojista não
// tinha como saber. O cliente perdia o saldo que gastou numa venda que o próprio lojista acabou de
// declarar que nunca existiu. Agora devolve (PedidoService.excluir), e o aviso conta isso.
//
// E conta a coisa CERTA nos dois casos: pedido já cancelado não devolve de novo, porque o estorno
// rodou no cancelamento — devolver duas vezes somaria estoque e cashback em dobro.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const JS = fs.readFileSync(
  'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/pedidos.js', 'utf8');

test('excluir: o aviso diz que o estoque e o cashback voltam', () => {
  assert.match(JS, /O estoque e o cashback deste pedido VOLTAM/,
    'o lojista precisa saber que apagar devolve — é o motivo de ele usar esse botão');
});

test('excluir: para pedido JÁ CANCELADO o aviso é outro', () => {
  // Dizer "voltam" num pedido cancelado seria mentira: já voltaram no cancelamento.
  assert.match(JS, /status === 'CANCELADO'/,
    'o aviso tem que distinguir o pedido que já foi cancelado');
  assert.match(JS, /já voltaram quando você cancelou/);
});

test('excluir: o aviso continua dizendo que não dá para desfazer', () => {
  // O conserto não pode fazer o botão parecer inofensivo: ele continua apagando a venda dos
  // relatórios, e isso não volta.
  assert.match(JS, /não dá para desfazer/);
  assert.match(JS, /use Cancelar/, 'e continua empurrando o Cancelar para pedido de verdade');
});

test('excluir: o texto do aviso entra ANTES do confirm, não depois', () => {
  const fn = JS.match(/window\.__excluir = async \(id\) => \{([\s\S]*?)\n  \};/);
  assert.ok(fn, 'não achei o __excluir');
  const i = fn[1].indexOf('const volta');
  const j = fn[1].indexOf('if (!confirm(');
  assert.ok(i >= 0 && j >= 0, 'as duas partes têm que estar lá');
  assert.ok(i < j, 'a mensagem precisa existir antes de ser usada no confirm');
});

test('excluir: o confirm USA a variável do aviso', () => {
  // Sem isto o texto fica montado e nunca aparece — o pior dos dois mundos, porque parece feito.
  const fn = JS.match(/window\.__excluir = async \(id\) => \{([\s\S]*?)\n  \};/)[1];
  const confirmLinha = fn.split('\n').find(l => l.includes('if (!confirm('));
  assert.ok(confirmLinha.includes('${volta}'), 'o confirm tem que interpolar o aviso');
});
