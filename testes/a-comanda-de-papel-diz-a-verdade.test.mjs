// A comanda IMPRESSA — o papel que vai na mão de quem entrega.
//
// DOIS DEFEITOS, os dois continuação de consertos que eu dei por completos (achados pelo QA em
// 26/10/2026):
//
// 1. RETIRADA. O cartão do quadro já pergunta pelo `tipoEntrega` e o KDS já estampa "RETIRADA NO
//    BALCÃO". O papel ficou fora das duas correções: pedido de retirada entrava RECEBIDO, a
//    auto-impressão soltava a comanda, e o motoboy recebia nome, telefone e o **endereço de casa**
//    de alguém que estava no balcão esperando. É dado pessoal do cliente da loja saindo impresso
//    para quem não precisa dele, mais uma entrega que ninguém pediu.
//
// 2. FORMA DE PAGAMENTO CRUA. O marketplace grava "CREDIT", e era isso que saía impresso para quem
//    entrega decidir se cobra. O `boraFormaPagamento` está no MESMO arquivo, 130 linhas acima, e o
//    comentário dele diz que existe porque "o mesmo texto cru vai para o cartão do KDS". Consertei
//    o cartão em 25/10 e esqueci o papel.
//
// Este teste EXECUTA o `boraPrintComanda` e lê o HTML que ele escreveu na janela de impressão —
// não olha o texto do fonte. O que importa aqui é o que sai no papel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RAIZ = path.join(import.meta.dirname, '..');

/**
 * Carrega o app.js com uma `window.open` falsa que guarda o que foi escrito.
 *
 * Não uso o `helpersDoApp` do harness porque preciso capturar a janela de impressão, e ele não
 * expõe isso. O resto dos stubs é o mesmo: o app.js roda coisas na carga.
 */
function imprimir(pedido) {
  const escrito = [];
  const janela = {
    document: { write: (h) => escrito.push(h), close() {} },
    focus() {},
    print() {},
  };
  const ctx = vm.createContext({
    document: {
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
      body: { appendChild() {} }, head: { appendChild() {} },
      documentElement: { style: { setProperty() {} } }, addEventListener() {},
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { serviceWorker: { register: () => Promise.resolve() } },
    window: { open: () => janela, location: { origin: 'http://t' } },
    console, Date, Math, JSON, Number, String, Object, Array, Promise, setTimeout,
  });
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'app.js'), 'utf8'), ctx,
    { filename: 'app.js' });
  vm.runInContext('boraPrintComanda', ctx)(pedido);
  return escrito.join('');
}

const BASE = {
  id: 500, codigo: '#1001', valorTotal: 47.9, criadoEm: '2026-10-26T18:00:00Z',
  clienteNome: 'Maria Eduarda', clienteTelefone: '(11) 99999-0000',
  enderecoEntrega: 'Rua das Flores, 120', bairroEntrega: 'Centro',
  itens: [{ quantidade: 1, descricao: 'Açaí 500ml' }],
  formaPagamento: 'Dinheiro', origem: 'Site',
};

// ---------------------------------------------------------------- retirada
test('PREMISSA: a comanda de ENTREGA leva o endereço do pedido', () => {
  // Sem isto, os testes abaixo passariam com uma comanda que nunca imprime endereço nenhum.
  const html = imprimir({ ...BASE, tipoEntrega: 'ENTREGA' });
  assert.match(html, /Rua das Flores, 120/, 'a comanda de entrega perdeu o endereço');
  assert.match(html, /Centro/);
});

test('RETIRADA: a comanda NÃO imprime o endereço de casa do cliente', () => {
  const html = imprimir({ ...BASE, tipoEntrega: 'RETIRADA' });
  assert.ok(!/Rua das Flores/.test(html),
    'o endereço de casa de quem está no balcão foi impresso para o motoboy: dado pessoal do '
    + 'cliente da loja indo para quem não precisa dele');
  assert.ok(!/Centro/.test(html), 'o bairro também sobrou no papel');
});

test('RETIRADA: a comanda DIZ que é retirada', () => {
  // Esconder o endereço não basta: sem o selo, a comanda de retirada fica igual a uma de entrega
  // sem endereço cadastrado, e alguém sai para entregar.
  const html = imprimir({ ...BASE, tipoEntrega: 'RETIRADA' });
  assert.match(html, /RETIRADA NO BALCAO/, 'o papel não diz que é retirada');
  assert.match(html, /nao e entrega/, 'falta a frase que impede a leitura errada');
});

test('pedido ANTIGO sem tipoEntrega cai na observação, como as outras telas', () => {
  // Pedido gravado antes da coluna existir. O `pedidos.js` usa a mesma regra de reserva.
  const html = imprimir({
    ...BASE, tipoEntrega: null, observacao: 'RETIRADA NO BALCAO - cliente busca 19h',
  });
  assert.match(html, /RETIRADA NO BALCAO/);
  assert.ok(!/Rua das Flores/.test(html), 'imprimiu endereço num pedido de retirada antigo');
});

test('ENTREGA não ganha selo de retirada', () => {
  const html = imprimir({ ...BASE, tipoEntrega: 'ENTREGA' });
  assert.ok(!/RETIRADA NO BALCAO/.test(html),
    'comanda de entrega dizendo retirada faria o pedido não sair para a rua');
});

// ---------------------------------------------------------------- forma de pagamento
test('o CÓDIGO do marketplace não sai impresso em inglês', () => {
  const html = imprimir({ ...BASE, tipoEntrega: 'ENTREGA', formaPagamento: 'CREDIT' });
  assert.match(html, /Crédito/, 'o papel saiu com "CREDIT": quem entrega lê um código em inglês');
  assert.ok(!/>CREDIT</.test(html), 'sobrou o texto cru na célula');
});

test('a FRASE com valores dentro não vira rótulo num papel de 280px', () => {
  const html = imprimir({
    ...BASE, tipoEntrega: 'ENTREGA',
    formaPagamento: 'Pago online: Crédito Visa R$ 17,00 + Pago online: Crédito Master R$ 10,00',
  });
  assert.match(html, /Pago online/);
  assert.ok(!/Crédito Visa R\$ 17,00/.test(html),
    'a frase inteira foi impressa num papel estreito, com os valores dentro do rótulo');
});

test('forma de pagamento normal continua igual', () => {
  const html = imprimir({ ...BASE, tipoEntrega: 'ENTREGA', formaPagamento: 'Dinheiro' });
  assert.match(html, /Dinheiro/);
});

test('sem forma de pagamento, o papel não escreve "undefined"', () => {
  const html = imprimir({ ...BASE, tipoEntrega: 'ENTREGA', formaPagamento: null });
  assert.ok(!/undefined/.test(html), 'escreveu undefined na comanda');
  assert.ok(!/>null</.test(html), 'escreveu null na comanda');
});

// ---------------------------------------------------------------- o que não pode mudar
test('a comanda continua trazendo o que a cozinha precisa', () => {
  const html = imprimir({ ...BASE, tipoEntrega: 'ENTREGA' });
  assert.match(html, /#1001/, 'perdeu o código do pedido');
  assert.match(html, /Açaí 500ml/, 'perdeu os itens');
  assert.match(html, /R\$ 47,90/, 'perdeu o total');
  assert.match(html, /Maria Eduarda/, 'perdeu o nome do cliente');
});

test('o código não ganha duas cerquilhas', () => {
  // Pedidos nascem como "#1001"; somar outro dava "##1001". Já era tratado — travando aqui porque
  // eu mexi na vizinhança.
  //
  // A primeira versão deste teste varria o HTML inteiro por "##" e achava o COMENTÁRIO que
  // explicava o defeito — um comentário de HTML que estava dentro do template e, portanto, viajava
  // impresso no papel do cliente. Falhava com o código certo. O comentário foi movido para o JS no
  // mesmo commit, e este teste passou a olhar o elemento onde o código realmente aparece.
  const html = imprimir({ ...BASE, tipoEntrega: 'ENTREGA' });
  const celula = /<div class="big">([^<]*)<\/div>/.exec(html);
  assert.ok(celula, 'não achei a célula do código: este teste está medindo nada');
  assert.equal(celula[1], '#1001', 'o código saiu errado no papel: ' + celula[1]);
});

test('o papel NÃO carrega comentário de desenvolvedor', () => {
  // Explicação de código não tem o que fazer no que vai para a impressora. E comentário dentro do
  // template é armadilha dupla: engana busca de teste e sai no papel.
  const html = imprimir({ ...BASE, tipoEntrega: 'ENTREGA' });
  assert.ok(!/<!--/.test(html), 'sobrou comentário de HTML no que vai para a impressora');
});
