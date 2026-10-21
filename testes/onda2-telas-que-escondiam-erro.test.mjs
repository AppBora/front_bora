// Onda 2 da varredura, lado das telas: as que escondiam erro, e as duas que falavam errado com o
// cliente final.
//
// 6.8 o motivo do cancelamento vai PARA O CLIENTE · 6.9 a KDS não despacha retirada ·
// 7.3 o Dashboard engolia queda de rede · 7.4 "despachar bairro" engolia falha e não perguntava ·
// 7.7 produto desativado religava ao editar · 7.10 imprimir não fazia nada com pop-up bloqueado ·
// 7.11 lista vazia virando tela em branco.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const ler = f => fs.readFileSync(RAIZ + f, 'utf8');
const pedidos = ler('assets/js/pedidos.js');
const kds = ler('assets/js/kds.js');
const entregas = ler('assets/js/entregas.js');
const dashboard = ler('assets/js/dashboard.js');
const caixa = ler('assets/js/caixa.js');
const acerto = ler('assets/js/acerto-entregadores.js');
const produtosJs = ler('assets/js/produtos.js');
const produtosHtml = ler('produtos.html');
const ajustes = ler('assets/js/ajustes.js');

// ============================================================ 6.8 o motivo vai para o cliente

test('cancelar: o prompt avisa que o motivo vai PARA O CLIENTE', () => {
  // O texto digitado vai inteiro para o WhatsApp do cliente e para a tela de acompanhar. Quem digita
  // escrevia achando que era anotação interna.
  assert.match(pedidos, /AVISO_MOTIVO/);
  assert.match(pedidos, /enviado AO CLIENTE no WhatsApp/);
  assert.match(pedidos, /prompt\(AVISO_MOTIVO\)/, 'o cancelar tem que usar o aviso');
});

test('recusar: o mesmo aviso, com a palavra certa', () => {
  assert.match(pedidos, /prompt\(AVISO_MOTIVO\.replace\('cancelamento', 'recusa'\)\)/);
});

// ============================================================ 6.9 a KDS não despacha retirada

/** Sobe as duas funções puras da KDS que decidem o próximo passo. */
function kdsProximo() {
  const pr = kds.match(/function proximoDe\(p\) \{[\s\S]*?\n  \}/);
  const er = kds.match(/function ehRetirada\(p\) \{[\s\S]*?\n  \}/);
  const px = kds.match(/const PROXIMO = \{[\s\S]*?\};/);
  assert.ok(pr && er && px, 'não achei proximoDe/ehRetirada/PROXIMO em kds.js');
  const ctx = vm.createContext({ String, Boolean });
  vm.runInContext(px[0] + er[0] + pr[0] + '; this.f = proximoDe;', ctx);
  return ctx.f;
}

test('KDS: pedido de RETIRADA pronto vai para ENTREGUE, não para "saiu para entrega"', () => {
  // Item 6.9: o cliente está no balcão e recebia "saiu para entrega! Já já chega aí".
  const proximo = kdsProximo();

  assert.equal(proximo({ status: 'PRONTO', tipoEntrega: 'RETIRADA' }), 'ENTREGUE');
});

test('KDS: entrega normal continua despachando', () => {
  const proximo = kdsProximo();

  assert.equal(proximo({ status: 'PRONTO', tipoEntrega: 'ENTREGA' }), 'SAIU_PARA_ENTREGA');
});

test('KDS: pedido antigo sem tipo cai no texto da observação, como no servidor', () => {
  // Pedido anterior à V48 não tem a coluna. O servidor lê os dois caminhos (Pedido.ehRetirada), e a
  // tela tem que ler igual — senão ela oferece um botão que o servidor recusa.
  const proximo = kdsProximo();

  assert.equal(proximo({ status: 'PRONTO', observacao: 'RETIRADA NO BALCAO' }), 'ENTREGUE');
  assert.equal(proximo({ status: 'PRONTO', observacao: 'sem cebola' }), 'SAIU_PARA_ENTREGA');
});

test('KDS: os outros passos não mudaram', () => {
  const proximo = kdsProximo();

  assert.equal(proximo({ status: 'RECEBIDO', tipoEntrega: 'RETIRADA' }), 'EM_PREPARO');
  assert.equal(proximo({ status: 'EM_PREPARO', tipoEntrega: 'RETIRADA' }), 'PRONTO');
});

test('KDS: o botão tem rótulo para o passo da retirada', () => {
  // Sem o rótulo o card mostraria "Avançar ▸", que não diz nada a quem está na cozinha.
  assert.match(kds, /ENTREGUE: 'Cliente retirou'/);
});

test('KDS: o __avancar usa o pedido, não só o status', () => {
  // Se ele voltar a usar PROXIMO[st], a tela manda SAIU_PARA_ENTREGA numa retirada e o servidor
  // recusa — o botão mostraria uma coisa e faria outra.
  const m = kds.match(/window\.__avancar = async \(id, st\) => \{[\s\S]*?\n  \};/);
  assert.ok(m);
  assert.match(m[0], /proximoDe\(p\)/);
});

// ============================================================ 7.4 despachar bairro

test('entregas: despachar o bairro PERGUNTA antes', () => {
  // Cada despacho avisa o cliente no WhatsApp: errar aqui fala com gente de fora.
  const m = entregas.match(/window\.__despacharBairro = async \(ids\) => \{[\s\S]*?\n  \};/);
  assert.ok(m, 'não achei o __despacharBairro');
  // A forma importa, não a presença: achado por mutação, `if (false && confirm(...))` passava num
  // teste que só perguntava se `confirm(` aparecia -- e aí a pergunta nunca acontece.
  assert.match(m[0], /if \(!confirm\(/, 'o confirm tem que BARRAR o despacho, não só existir');
  assert.ok(m[0].indexOf('return;') < m[0].indexOf('for (const id of ids)'),
    'desistir da pergunta tem que sair ANTES do laço que despacha');
  assert.match(m[0], /avisa o cliente no WhatsApp/);
});

test('entregas: despachar o bairro NÃO engole falha', () => {
  // Era `catch (e) {}` vazio: o lojista achava que os cinco saíram e um não tinha saído.
  const m = entregas.match(/window\.__despacharBairro = async \(ids\) => \{[\s\S]*?\n  \};/);
  assert.ok(!/catch \(e\) \{\}/.test(m[0]), 'o catch vazio não pode voltar');
  assert.match(m[0], /falhas\.push/);
  assert.match(m[0], /NÃO saiu/, 'e tem que dizer QUAIS não saíram');
});

// ============================================================ 7.3 o Dashboard

test('dashboard: queda de rede mostra faixa, não números congelados', () => {
  // Números congelados sem aviso são pior que tela vazia: quem olha acredita neles.
  assert.match(dashboard, /function avisarSemConexao\(/);
  assert.match(dashboard, /avisarSemConexao\(e\.message\)/, 'o catch tem que chamar o aviso');
  assert.match(dashboard, /não são de agora/, 'a faixa tem que dizer que os números são velhos');
});

test('dashboard: a faixa diz desde QUANDO os números pararam de valer', () => {
  const m = dashboard.match(/function avisarSemConexao\(erro\) \{[\s\S]*?\n  \}/);
  assert.ok(m);
  assert.match(m[0], /toLocaleTimeString/);
});

test('dashboard: carga que dá certo LIMPA a faixa', () => {
  // Faixa que não sai faria o lojista desconfiar de número bom.
  assert.match(dashboard, /limparAvisoDeConexao\(\);/);
  assert.match(dashboard, /function limparAvisoDeConexao\(/);
});

// ============================================================ 7.10 imprimir com pop-up bloqueado

test('imprimir: fechamento de caixa e recibo do motoboy tratam pop-up bloqueado', () => {
  // A função compartilhada da comanda (app.js) já tratava; estas duas estouravam em `w.document` e a
  // tela não fazia NADA — o lojista clicava e nada acontecia.
  for (const [nome, fonte] of [['caixa', caixa], ['acerto', acerto]]) {
    assert.match(fonte, /if \(!w\) \{/, nome + ' não checa se a janela abriu');
    assert.match(fonte, /bloqueou a janela de impressão/, nome + ' não avisa o lojista');
  }
});

test('imprimir: o aviso vem ANTES de usar a janela', () => {
  // Se a checagem vier depois do `w.document.write`, ela nunca roda: o estouro acontece antes.
  for (const [nome, fonte] of [['caixa', caixa], ['acerto', acerto]]) {
    assert.ok(fonte.indexOf('if (!w) {') < fonte.indexOf('w.document.write'),
      nome + ': a checagem tem que vir antes do uso');
  }
});

// ============================================================ 7.7 produto desativado não religa

test('produtos: a tela tem a caixinha de "aparece no cardápio"', () => {
  assert.match(produtosHtml, /id="ativo" type="checkbox"/);
});

test('produtos: o salvar manda o que está na caixinha, não `true` fixo', () => {
  // Item 7.7: era `ativo: true` FIXO, então produto tirado do cardápio voltava a aparecer na
  // primeira vez que alguém editasse o preço — e não havia como desativar pelo painel.
  assert.match(produtosJs, /ativo: \$\('ativo'\) \? \$\('ativo'\)\.checked : true/);
  assert.ok(!/estoqueMinimo: num\(\$\('estoqueMinimo'\)\.value\), ativo: true,/.test(produtosJs),
    'o `ativo: true` fixo não pode voltar');
});

test('produtos: editar traz o estado atual para a caixinha', () => {
  // Sem isto, abrir e salvar um produto desativado religaria ele.
  assert.match(produtosJs, /\$\('ativo'\)\.checked = p\.ativo !== false/);
});

test('produtos: a lista mostra quem está fora do cardápio', () => {
  // Sem marca na lista, o lojista não tem como saber o que está escondido.
  assert.match(produtosJs, /fora do cardápio/);
  assert.match(produtosJs, /p\.ativo === false/);
});

// ============================================================ 7.11 lista vazia

test('listas vazias dizem que estão vazias, em vez de ficar em branco', () => {
  // Tela em branco faz o lojista achar que quebrou — e ligar para o suporte.
  assert.match(ajustes, /Nenhuma forma de pagamento cadastrada/);
  assert.match(ajustes, /Nenhum horário cadastrado/);
  assert.match(ajustes, /Nenhum motivo de cancelamento cadastrado/);
  assert.match(dashboard, /Nenhum pedido ainda hoje/);
});

test('o aviso do horário vazio diz a CONSEQUÊNCIA', () => {
  // Sem horário cadastrado a loja aparece fechada no cardápio. Dizer só "vazio" esconderia isso.
  assert.match(ajustes, /a loja fica sempre fechada no cardápio/);
});
