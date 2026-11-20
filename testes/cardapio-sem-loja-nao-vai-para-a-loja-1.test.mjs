// LINK DE CARDÁPIO SEM `?loja=` NÃO PODE MANDAR O PEDIDO PARA A LOJA DE TESTE.
//
// O DEFEITO (varredura de 18/11/2026, consertado em 19/11)
// `cardapio.js:6` era `const lojaId = params.get('loja') || '1'`. Um link malformado — QR impresso
// errado, URL cortada na mensagem de WhatsApp, alguém digitando `borahapp.com.br/cardapio.html` na
// mão — abria o cardápio da **loja 1**, que é a loja de TESTE.
//
// O cliente montava o pedido, finalizava, e o pedido caía numa loja onde ninguém olha o painel.
// Ninguém prepara, ninguém avisa, e o cliente fica esperando comida que não vem. O erro aparece
// como "pedido perdido" longe da causa.
//
// É A MESMA FAMÍLIA DO `|| 1` DO QR, já consertada em `cardapio-qr-sabe-de-qual-loja.test.mjs`. O
// padrão é o mesmo e vale escrever: **valor padrão que "resolve sozinho" é erro em silêncio.**
// Quando não se sabe de qual loja é, a resposta certa é dizer que não se sabe.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const JS = fs.readFileSync(RAIZ + 'assets/js/cardapio.js', 'utf8');

/**
 * Executa a resolução do `lojaId` LIDA DO ARQUIVO, com o `?loja=` que se quiser.
 *
 * Extrai as duas linhas que decidem (`lojaCrua` e `lojaId`) e as roda com um `params` de mentira.
 * Assim o teste mede o arquivo que vai para produção, não uma cópia da regra.
 */
function resolver(busca) {
  const linhas = JS.split('\n');
  const crua = linhas.find(l => l.includes('const lojaCrua'));
  const id = linhas.find(l => l.trim().startsWith('const lojaId'));
  assert.ok(crua && id, 'não achei as linhas que resolvem a loja no cardapio.js');

  const corpo = crua + '\n' + id + '\nreturn lojaId;';
  const fabrica = new Function('params', corpo);
  return fabrica(new URLSearchParams(busca));
}

// ----------------------------------------------------------------- a premissa

// A PREMISSA: com `?loja=` válido, a resolução devolve a loja. Sem isto, um teste que exigisse
// `null` passaria com uma função que devolve `null` sempre — e o cardápio não abriria para ninguém.
test('premissa: com ?loja=18 o cardapio abre na loja 18', () => {
  assert.equal(resolver('?loja=18'), '18');
});

test('premissa: a loja 1 continua acessivel quando pedida de propósito', () => {
  assert.equal(resolver('?loja=1'), '1',
    'a loja 1 é a de teste, e tem de abrir quando ALGUÉM PEDE por ela — o defeito era abrir sem pedir');
});

// ----------------------------------------------------------------- o que importa

test('SEM ?loja= nenhum, NAO cai na loja 1', () => {
  assert.equal(resolver(''), null,
    'link sem loja resolveu para alguma coisa: era o `|| "1"` que mandava o pedido para a loja de teste');
});

test('?loja= vazio tambem nao cai na loja 1', () => {
  assert.equal(resolver('?loja='), null);
});

test('?loja= com lixo nao cai na loja 1', () => {
  for (const v of ['abc', '0', '-3', '1.5', '18x', ' ', '%20', 'null', 'undefined', '1;2']) {
    assert.equal(resolver('?loja=' + encodeURIComponent(v)), null,
      `"${v}" virou loja válida — e qualquer coisa que não seja id de loja tem de virar aviso, não pedido`);
  }
});

test('espaco ao redor do numero e aparado, nao recusado', () => {
  assert.equal(resolver('?loja=%2018%20'), '18',
    'espaço em volta é erro de digitação, e o cliente não tem culpa — aparar é melhor que recusar');
});

// ----------------------------------------------------------------- a guarda na tela

test('sem loja, a tela AVISA e o botao de finalizar sai da frente', () => {
  const i = JS.indexOf('if (!lojaId)');
  assert.ok(i > 0, 'não há guarda na tela para o link sem loja');

  const bloco = JS.slice(i, i + 1400);
  assert.ok(/incompleto/i.test(bloco), 'a mensagem tem de dizer que o LINK está incompleto');
  assert.ok(bloco.includes("getElementById('menu')"), 'a mensagem tem de aparecer no lugar do menu');
  assert.ok(bloco.includes('disabled = true'), 'o botão de finalizar tem de ser desligado');
  assert.ok(/return;/.test(bloco), 'a guarda tem de PARAR o resto: sem loja não há pedido a montar');
});

// ----------------------------------------------------------------- a repeticao

test('nenhum outro `|| 1` resolvendo loja sozinho no cardapio', () => {
  const suspeitas = [];
  for (const linha of JS.split('\n')) {
    if (linha.trim().startsWith('//') || linha.trim().startsWith('*')) continue;
    if (/loja\w*\s*(=|\?\?|\|\|)\s*['"]?1['"]?\s*[;,)]/.test(linha)) suspeitas.push(linha.trim().slice(0, 110));
  }
  assert.deepEqual(suspeitas, [],
    'alguém voltou a resolver a loja com um valor padrão:\n' + suspeitas.join('\n'));
});
