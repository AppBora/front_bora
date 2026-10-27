// Três defeitos do checkout do CLIENTE FINAL, achados pelo QA em 26/10/2026.
//
// É a tela mais crítica do produto: chega pelo QR da mesa, quase sempre de celular, e quem está do
// outro lado é o cliente da loja — não o lojista, que a gente pode ensinar.
//
// 1. O CLIENTE FICAVA PRESO. O único botão que fechava o checkout (`#ckFechar`) mora DENTRO do
//    `#ckForm`, que o `confirmarPedido` esconde. O `#checkout` é `position:fixed;inset:0`, então
//    continuava cobrindo a tela toda: quem abria o PIX e desistia só saía recarregando a página. E o
//    `setInterval` de 5 s que verifica o pagamento era limpo só por aquele botão — ficava batendo no
//    servidor para sempre, no celular do cliente.
//
// 2. O CUPOM ENVIADO ERA O TEXTO DO CAMPO, não o cupom aplicado. O cliente aplicava, apagava o
//    campo sem clicar em Aplicar de novo, a tela seguia prometendo o desconto, e o servidor cobrava
//    o valor cheio. Preço na tela diferente do preço cobrado.
//
// 3. CUPOM QUE COBRIA O CARRINHO INTEIRO era aceito pela tela e recusado pelo servidor (400 "O
//    cupom não pode zerar o pedido"). O cashback já respeitava o centavo mínimo; o cupom não.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir, semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const TELA = RAIZ + '/assets/js/cardapio.js';
const HTML = fs.readFileSync(path.join(RAIZ, 'cardapio.html'), 'utf8');
const FONTE = semComentarios(fs.readFileSync(TELA, 'utf8'));

const PRODUTO = {
  id: 1, nome: 'Açaí 500ml', categoria: 'Açaí', preco: 10, esgotado: false, complementos: [],
};

function montar({ cupom = null } = {}) {
  const chamadas = [];
  const Bora = {
    api: async (url, opts) => {
      chamadas.push({ url, metodo: (opts && opts.method) || 'GET',
        corpo: opts && opts.body ? JSON.parse(opts.body) : null });
      if (url.includes('/cardapio')) {
        return { nome: 'Loja', aberta: true, produtos: [PRODUTO], bairros: [], formas: [] };
      }
      if (url.includes('/cupom/')) {
        if (!cupom) throw new Error('Cupom inválido');
        return cupom;
      }
      if (url.includes('/pedir')) return { codigo: 'A1', valorTotal: 10 };
      return {};
    },
    apiBase: () => 'http://t',
  };
  const t = subir(TELA, {
    Bora,
    search: '?loja=1',
    comSeletores: true,
    globais: { alert: () => {}, confirm: () => true, BoraCores: { aplicar() {} } },
  });
  return { ...t, chamadas };
}

const assentar = async () => { for (let i = 0; i < 15; i++) await new Promise((r) => setImmediate(r)); };

// ---------------------------------------------------------------- 1. a saída
test('PREMISSA: o botão de fechar mora dentro do bloco que é escondido ao confirmar', () => {
  // É a causa do defeito, e precisa estar medida: se o HTML mudar de forma, o resto deste arquivo
  // mede o lugar errado.
  const form = HTML.slice(HTML.indexOf('id="ckForm"'), HTML.indexOf('id="ckPix"'));
  assert.ok(form.includes('id="ckFechar"'),
    'o #ckFechar saiu do #ckForm — reveja este arquivo inteiro');
});

test('a tela do PIX tem saída própria', () => {
  const pix = HTML.slice(HTML.indexOf('id="ckPix"'), HTML.indexOf('id="ckOk"'));
  assert.match(pix, /id="pxFechar"/,
    'sem botão na tela do PIX o cliente só sai recarregando a página, e o setInterval de 5s fica '
    + 'batendo no servidor para sempre');
});

test('a tela de sucesso tem volta ao cardápio', () => {
  const ok = HTML.slice(HTML.indexOf('id="ckOk"'));
  assert.match(ok, /id="okVoltar"/,
    'depois de pedir, a única porta era o link que leva embora do cardápio — não havia "pedir mais"');
});

test('fechar o checkout LIMPA o relógio do PIX, pelas três saídas', () => {
  // O `clearInterval` é o que impede o celular do cliente de bater no servidor para sempre. Se
  // alguma saída esquecer dele, o vazamento volta por aquela porta.
  assert.match(FONTE, /const fecharCheckout = \(\) => \{ clearInterval\(pollTimer\); \$\('checkout'\)\.hidden = true; \};/,
    'o fechar deixou de limpar o setInterval');
  for (const botao of ["\\$\\('ckFechar'\\)", "\\$\\('pxFechar'\\)", "\\$\\('okVoltar'\\)"]) {
    assert.match(FONTE, new RegExp(botao), 'falta ligar ' + botao);
  }
});

test('fechar a tela do PIX PERGUNTA, e diz que o pedido não foi cancelado', () => {
  // Sair dali sem aviso faria o cliente achar que desfez o pedido — que existe e está esperando o
  // pagamento. É o oposto do que ele precisa entender.
  const fn = FONTE.slice(FONTE.indexOf("$('pxFechar')"), FONTE.indexOf("$('okVoltar')"));
  assert.match(fn, /confirm\(/, 'fecha o PIX sem avisar nada');
  assert.match(fn, /JÁ FOI FEITO|nao cancela|não cancela/i,
    'o aviso tem de dizer que o pedido continua de pé');
  assert.match(fn, /30 minutos/, 'o cliente precisa saber que o pedido expira sozinho');
});

test('Esc e clique no fundo fecham — MENOS na tela do PIX', () => {
  // As duas saídas que todo mundo tenta antes de procurar botão. Na tela do PIX elas não valem de
  // propósito: sair sem ler o aviso faria o cliente achar que cancelou.
  assert.match(FONTE, /e\.key !== 'Escape'/, 'o Esc não fecha o checkout');
  assert.match(FONTE, /e\.target !== \$\('checkout'\)/,
    'o clique dentro da caixa branca fecharia a tela junto');
  const guardas = FONTE.match(/if \(!\$\('ckPix'\)\.hidden\) return;/g) || [];
  assert.equal(guardas.length, 2,
    'as duas saídas rápidas precisam da guarda do PIX; achei ' + guardas.length);
});

// ---------------------------------------------------------------- 2. o cupom enviado
test('o cupom enviado é o APLICADO, e não o texto do campo', () => {
  assert.match(FONTE, /cupom: cupomAplicado \? cupomAplicado\.codigo : ''/,
    'voltou a mandar o texto do campo: a tela promete um preço e o servidor cobra outro');
  assert.ok(!/cupom: cupomOk \? \$\('ckCupom'\)\.value\.trim\(\) : ''/.test(FONTE),
    'sobrou o envio antigo');
});

test('MEXER no campo desfaz o cupom aplicado, na hora', async () => {
  const t = montar({ cupom: { codigo: 'BEMVINDO4', tipo: 'VALOR', valor: 4, desconto: 4 } });
  await t.carregarPagina();
  await assentar();

  t.get('ckCupom').value = 'BEMVINDO4';
  await t.get('ckAplicarCupom').__disparar('click');
  await assentar();
  assert.match(t.get('ckCupomMsg').textContent, /aplicado/i, 'o cupom não foi aplicado (premissa)');

  // O cliente apaga o campo e NÃO clica em Aplicar de novo.
  t.get('ckCupom').value = '';
  await t.get('ckCupom').__disparar('input');
  await assentar();

  assert.ok(!/aplicado/i.test(t.get('ckCupomMsg').textContent),
    'a tela continuou dizendo "Cupom aplicado" com o campo vazio: ' + t.get('ckCupomMsg').textContent);
});

test('editar o código também desfaz, mas voltar ao mesmo texto NÃO', () => {
  // O segundo caso importa: digitar e apagar uma letra não pode obrigar a aplicar de novo se o
  // texto final é o mesmo cupom.
  const fn = FONTE.slice(FONTE.indexOf("$('ckCupom').addEventListener('input'"));
  assert.match(fn, /digitado === String\(cupomAplicado\.codigo \|\| ''\)\.toUpperCase\(\)/,
    'voltar ao mesmo código deveria manter o cupom aplicado');
  assert.match(fn, /cupomAplicado = null/);
  assert.match(fn, /cupomOk = false/);
  assert.match(fn, /atualizarEntrega\(\)/, 'o total tem de voltar a ser o de verdade');
});

test('cupom recusado pelo servidor zera as DUAS marcas', () => {
  // `cupomOk` ficava true de uma tentativa anterior e o envio usava essa marca.
  const fn = FONTE.slice(FONTE.indexOf('catch (e) { cupomAplicado = null'));
  assert.match(fn.slice(0, 120), /cupomOk = false/,
    'o cupomOk sobrevivia a um cupom inválido');
});

// ---------------------------------------------------------------- 3. o teto do cupom
test('o cupom NÃO zera o pedido: o teto é o total menos um centavo', () => {
  const fn = FONTE.slice(FONTE.indexOf('function descontoDoCupom'),
    FONTE.indexOf('function descontoDoCashback'));
  assert.ok(fn.length > 150, 'não achei o descontoDoCupom: este teste mede nada');
  assert.match(fn, /const teto = total - 0\.01;/,
    'a tela aceita zerar o pedido e o servidor recusa com 400: o cliente leva erro no fim');
  assert.ok(!/Math\.min\(bruto, totalCarrinho\(\)\)/.test(fn), 'sobrou o teto antigo');
});

test('a mesma regra do cashback, que já estava certa', () => {
  // Os dois descontos vêm do mesmo servidor com a mesma regra. Divergir é o que criou o defeito.
  const cashback = FONTE.slice(FONTE.indexOf('function descontoDoCashback'));
  assert.match(cashback.slice(0, 400), /const teto = base - 0\.01;/,
    'o cashback perdeu o centavo mínimo — agora os dois divergem pelo outro lado');
});
