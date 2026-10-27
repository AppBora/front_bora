// Quatro defeitos do painel da plataforma, achados pelo QA em 26/10/2026. Todos afetam ou TODAS as
// lojas de uma vez, ou a conta mais privilegiada do sistema.
//
// 1. HTML CRU na lista de clientes. O `ficha()` empurrava `documento` e `motivo` sem `esc()` para
//    dentro de `innerHTML`. O `esc` existe no mesmo arquivo e é usado no nome da loja. Quem controla
//    o campo `documento` — gravado cru pelo signup público — rodava script DENTRO da sessão do
//    ADMINISTRADOR_BORA: a conta que suspende, arquiva, entra em qualquer loja e troca a credencial
//    de todos os marketplaces.
//
// 2. A SEGUNDA PORTA DA CREDENCIAL, que eu mesmo deixei aberta. Em 25/10 construí a tela de
//    credencial da plataforma com confirmação e com o aviso dos tokens esquecidos, sem verificar se
//    o controle já existia. Existia, em Integrações, chamando o mesmo PUT — e sem perguntar nada.
//
// 3. O PROMPT DO PAGAMENTO MANUAL vinha com `199.00` fixo. Um Enter registrava R$ 199
//    independentemente do preço negociado, e o servidor baixa a cobrança no Asaas com o valor
//    digitado e põe no faturamento, que é a base da nota.
//
// 4. AS CONFIRMAÇÕES DIZIAM `#18`, nunca o nome. Suspender tira a loja do ar; a tela lista as lojas
//    lado a lado, e "Zirá Centro" e "Zirá Zona Norte" ficam a uma linha de distância no mouse.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const CONFIG = fs.readFileSync(path.join(RAIZ, 'configuracoes.html'), 'utf8');
const CONFIG_CODIGO = semComentarios(CONFIG);
const INTEGRACOES = semComentarios(fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'integracoes.js'), 'utf8'));
const PROMOCOES = semComentarios(fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'promocoes.js'), 'utf8'));

/**
 * Extrai o `ficha()` do HTML e o roda com o escopo mínimo que ele usa.
 *
 * Por que extrair em vez de executar o bloco inteiro: o script do `configuracoes.html` é um IIFE,
 * então o `ficha` é local e não há como alcançá-lo de fora. Extrair a função e dar a ela o `esc`
 * real do arquivo mede o que importa — o que SAI para o `innerHTML` — sem depender de reescrever
 * nada do código de produção.
 *
 * O `esc` vem do próprio arquivo, não de uma cópia: dublá-lo faria o teste medir a minha versão do
 * escape em vez da que a tela usa, que é o erro que eu já cometi com o mapa de papéis.
 */
function fichaDoPainel() {
  const fonteFicha = /\n(  function ficha\(c\) \{[\s\S]*?\n  \})/.exec(CONFIG);
  assert.ok(fonteFicha, 'não achei o ficha() no HTML: este teste está medindo nada');

  const fonteEsc = /\n(  const esc = v => String[\s\S]*?\[c\]\)\);)/.exec(CONFIG);
  assert.ok(fonteEsc, 'não achei o esc() do painel');

  const ctx = vm.createContext({ console, Date, Math, Number, String, Object, Array });
  vm.runInContext([
    fonteEsc[1],
    // Os outros ajudantes que o ficha usa não são objeto deste teste; o mínimo honesto para ele
    // rodar.
    "const dinheiro = v => 'R$ ' + Number(v || 0).toFixed(2);",
    "const data = d => String(d).slice(0, 10);",
    "const ASSINATURA = {};",
    fonteFicha[1],
    'globalThis.__ficha = ficha;',
  ].join('\n'), ctx);
  return vm.runInContext('__ficha', ctx);
}

// ---------------------------------------------------------------- 1. o HTML cru
test('PREMISSA: o nome da loja JÁ era escapado — o esc existe e funciona', () => {
  // Sem isto, um `esc` quebrado faria tudo abaixo passar por não escapar nada.
  assert.match(CONFIG_CODIGO, /const esc = v => String\(v == null \? '' : v\)\.replace\(\/\[&<>"'\]\/g/,
    'o esc do painel mudou de forma; reveja este arquivo');
});

test('o DOCUMENTO da loja sai escapado na ficha', () => {
  const ficha = fichaDoPainel();
  const saida = ficha({ documento: '<img src=x onerror=alert(1)>', precoMensal: 199 });

  assert.ok(!saida.includes('<img'),
    'o documento saiu cru e vai para innerHTML: script rodando na sessão do administrador da '
    + 'plataforma — a conta que suspende, arquiva e troca credencial de todas as lojas');
  assert.match(saida, /&lt;img/, 'o valor precisa aparecer escapado, e não desaparecer');
});

test('o MOTIVO também sai escapado', () => {
  const ficha = fichaDoPainel();
  const saida = ficha({ motivo: "x'><script>alert(1)</script>", precoMensal: 199 });
  assert.ok(!saida.includes('<script'), 'o motivo saiu cru');
  assert.ok(!saida.includes("'>"), 'a apóstrofe passou: ela quebra para fora de atributo');
});

test('documento normal continua legível', () => {
  // Escapar não pode estragar o caso comum: o dono precisa LER o CNPJ.
  const ficha = fichaDoPainel();
  assert.match(ficha({ documento: '12.345.678/0001-99', precoMensal: 199 }), /12\.345\.678\/0001-99/);
});

// ---------------------------------------------------------------- 2. a segunda porta
test('Integrações PERGUNTA antes de trocar a credencial da plataforma', () => {
  const fn = INTEGRACOES.slice(INTEGRACOES.indexOf('window.__salvarApp'),
    INTEGRACOES.indexOf('window.__removerApp'));
  assert.ok(fn.length > 200, 'não achei o __salvarApp: este teste mede nada');
  assert.match(fn, /if \(!confirm\(/,
    'a segunda porta continua silenciosa: um clique derruba o recebimento de todas as lojas sem '
    + 'app próprio naquele canal');
  assert.match(fn, /TODAS as lojas/, 'a pergunta não diz o alcance');
  assert.match(fn, /esquecer os tokens atuais/,
    'no 99Food salvar faz o servidor esquecer os tokens de todas as lojas do canal — quem aperta '
    + 'merece saber antes');
});

test('as DUAS telas da credencial perguntam, e dizem a mesma coisa', () => {
  // O defeito era haver duas portas com comportamentos diferentes. Travando as duas juntas.
  const nova = semComentarios(fs.readFileSync(
    path.join(RAIZ, 'assets', 'js', 'credenciais-plataforma.js'), 'utf8'));
  for (const [onde, fonte] of [['credenciais-plataforma.js', nova], ['integracoes.js', INTEGRACOES]]) {
    assert.match(fonte, /esquecer os tokens atuais/, onde + ' não avisa dos tokens');
  }
});

// ---------------------------------------------------------------- 3. o valor sugerido
test('o pagamento manual sugere o preço DO CLIENTE, não 199 fixo', () => {
  assert.ok(!/'199\.00'\)/.test(CONFIG_CODIGO),
    'voltou o 199 fixo: um Enter registra R$ 199 para quem tem outro preço negociado, e o servidor '
    + 'baixa a cobrança no Asaas com esse valor');
  assert.match(CONFIG_CODIGO, /precoSugerido\(cliente\)/, 'o prompt não usa o preço do cliente');
});

test('sem preço conhecido, o prompt vem VAZIO', () => {
  // Melhor o dono digitar do que o sistema sugerir um número que ele não conferiu.
  const fn = CONFIG_CODIGO.slice(CONFIG_CODIGO.indexOf('function precoSugerido'));
  assert.match(fn.slice(0, 300), /Number\(v\) <= 0 \? '' :/,
    'preço nulo ou zero tem de virar campo vazio, não um palpite');
});

test('desistir na TERCEIRA pergunta não registra o dinheiro', () => {
  // As duas primeiras já checavam null. Trancar a saída em duas de três é pior que não ter saída,
  // porque ensina que Esc funciona.
  const bloco = CONFIG_CODIGO.slice(CONFIG_CODIGO.indexOf("if (acao === 'pagamento')"));
  const obs = bloco.slice(bloco.indexOf('const obs = prompt('), bloco.indexOf('btn.disabled = true'));
  assert.match(obs, /if \(obs === null\) return;/,
    'Esc na observação ainda grava o pagamento, com baixa no Asaas e linha no faturamento');
});

// ---------------------------------------------------------------- 4. o nome na confirmação
test('as confirmações dizem o NOME da loja, e não só o número', () => {
  assert.ok(!/const nome = '#' \+ id;/.test(CONFIG_CODIGO),
    'voltou o "#18": suspender tira a loja do ar, e a tela lista as lojas lado a lado');
  assert.match(CONFIG_CODIGO, /ultimaLista\.find\(c => String\(c\.id\) === String\(id\)\)/,
    'o nome tem de vir da lista que a tela já carregou');
  assert.match(CONFIG_CODIGO, /cliente\.nome \+ ' \(#' \+ id \+ '\)'/,
    'o número tem de continuar junto do nome: é o que o suporte usa para conferir');
});

test('loja que não está na lista cai no número, e não em "undefined"', () => {
  const fn = CONFIG_CODIGO.slice(CONFIG_CODIGO.indexOf('const cliente = ultimaLista.find'));
  assert.match(fn.slice(0, 260), /: '#' \+ id;/, 'sem reserva, o confirm diria "undefined"');
});

// ---------------------------------------------------------------- o esc da promoção
test('o esc de Promoções passa a escapar APÓSTROFE', () => {
  // Ele é usado dentro de `onclick="__encerrar(id, '...')"`. Sem a apóstrofe na lista, um código de
  // promoção como `X'+alert(1)+'` escapava da string e rodava na sessão de quem abrisse a tela.
  assert.match(PROMOCOES, /replace\(\/\[&<>"'\]\/g/, 'a apóstrofe saiu da lista do esc');
  assert.match(PROMOCOES, /"'": '&#39;'/, 'falta o mapeamento da apóstrofe');
});
