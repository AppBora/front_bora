// O cardápio de papel, gerado do mesmo cardápio que o cliente vê.
//
// O que este teste protege, em ordem de estrago:
//
// 1) NÃO IMPRIMIR NADA quando o QR não veio. A imagem vem de um serviço de fora
//    (api.qrserver.com). Sem internet, ou com ele fora do ar, a tela antiga dizia "Seu cardápio
//    está no ar 🎉" ao lado de um ícone quebrado — o lojista imprimia a folha com um buraco
//    branco e colava no balcão. Uma folha sem código é pior que nenhuma folha, porque ninguém
//    confere o que já está na parede.
//
// 2) COR DE MARCA NÃO NASCE LEGÍVEL. O amarelo #FFD100 dá 1,46:1 contra branco, e a norma pede
//    4,5:1. O cardápio sai em papel BRANCO: usar a cor crua deixaria o título invisível justo nas
//    lojas de identidade clara — e só na impressão, que é onde ninguém testa.
//
// 3) O preço do papel é o preço do cardápio digital, porque vem da mesma chamada. Não há duas
//    fontes para divergirem.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// O gerador de QR de verdade (ver cardapio-folha.test.mjs para o porquê).
const ctxQr = { console, TextEncoder };
vm.createContext(ctxQr);
vm.runInContext(ler('assets/js/qr.js'), ctxQr);
const BORA_QR = ctxQr.BoraQR;

const CARDAPIO = {
  loja: { id: 17, nome: 'Pizzaria Bella Napoli' },
  marca: { nome: 'Pizzaria Bella Napoli', corPrimaria: '#C8102E', corSecundaria: '#FFD100',
           logoUrl: '/public/loja/17/logo' },
  produtos: [
    { id: 1, nome: 'Margherita', categoria: 'Pizzas', preco: 52.90,
      complementos: [{ nome: 'Borda', minimo: 0, maximo: 1,
                       itens: [{ nome: 'Catupiry', preco: 8 }, { nome: 'Sem borda', preco: 0 }] }] },
    { id: 2, nome: 'Água Mineral', categoria: 'Bebidas', preco: 5, complementos: [] },
  ],
};

/** Roda o gerador num mundo de mentira, e devolve o que ele fez. */
async function rodar({ qrFalha = false, cardapio = CARDAPIO } = {}) {
  const aberto = { html: '' };
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, textContent: '', style: {}, disabled: false });

  const janela = {
    open: () => ({ document: { write: (h) => { aberto.html += h; }, close() {} } }),
  };

  const contexto = {
    Bora: {
      requireAuth: () => true,
      user: () => ({ lojaId: 17, papel: 'ADMINISTRADOR_LOJA' }),
      api: async () => cardapio,
    },
    document: {
      getElementById: el,
      addEventListener: () => {},
    },
    // O QR: ou monta, ou estoura. É o interruptor do teste.
    BoraQR: {
      dataUri: (texto, o) => {
        if (qrFalha) throw new Error('texto longo demais para o QR');
        return BORA_QR.dataUri(texto, o);
      },
    },
    location: { origin: 'https://borahapp.com.br', pathname: '/cardapio-qr.html' },
    setTimeout, clearTimeout, Promise,
    BoraCores: {
      paraRgb: (c) => {
        const h = String(c).replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      },
      // escurece ate passar em 4,5:1 -- a mesma ideia do cores.js de verdade
      legivelSobreBranco: (rgb) => {
        const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const razao = (c) => 1.05 / (0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]) + 0.05);
        let f = 1, c = rgb;
        while (razao(c) < 4.5 && f > 0.05) { f -= 0.025; c = rgb.map((v) => v * f); }
        return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      },
    },
  };
  contexto.window = janela;

  const fonte = ler('assets/js/cardapio-impresso.js');
  const nomes = Object.keys(contexto);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...nomes, fonte + '\n;return window.__gerarCardapioImpresso;');
  const gerar = fn(...nomes.map((n) => contexto[n]));
  // o script pendura a função no window do contexto
  await (gerar || janela.__gerarCardapioImpresso)();
  return { html: aberto.html, msg: els.impMsg ? els.impMsg.textContent : '', els };
}

test('PREMISSA: QR que nao carrega NAO gera folha nenhuma', async () => {
  const r = await rodar({ qrFalha: true });
  assert.equal(r.html, '',
    'abriu a janela de impressao sem o QR: o lojista imprimiria uma folha com o codigo em branco');
});

test('quando o QR falha, a tela DIZ o motivo', async () => {
  const r = await rodar({ qrFalha: true });
  assert.match(r.msg, /n[aã]o gerei/i);
  assert.match(r.msg, /nada foi impresso/i, 'o recado precisa deixar claro que nada saiu');
});

test('com o QR carregado, a folha sai com os produtos e os precos', async () => {
  const r = await rodar();
  assert.ok(r.html.includes('Margherita'));
  assert.ok(r.html.includes('R$ 52,90'), 'preco do cardapio digital nao apareceu no papel');
  assert.ok(r.html.includes('Água Mineral'));
  assert.ok(r.html.includes('R$ 5,00'));
});

test('a folha leva o QR e tambem o endereco escrito', async () => {
  const r = await rodar();
  assert.match(r.html, /data:image\/svg\+xml/, 'a folha saiu sem o QR');
  assert.ok(r.html.includes('cardapio.html?loja=17'),
    'quem nao conseguir ler o codigo precisa poder digitar o endereco');
});

test('PREMISSA: cor de marca clara nao vai crua para o papel', async () => {
  const r = await rodar();
  assert.ok(!r.html.includes('#FFD100') && !r.html.includes('#ffd100'),
    'o amarelo da loja foi usado como cor de texto: 1,46:1 contra branco, ilegivel impresso');
});

test('as secoes saem agrupadas por categoria', async () => {
  const r = await rodar();
  assert.ok(r.html.includes('Pizzas'));
  assert.ok(r.html.includes('Bebidas'));
});

test('os adicionais saem com preco, e o de graca diz "gratis"', async () => {
  const r = await rodar();
  assert.ok(r.html.includes('Catupiry'));
  assert.ok(r.html.includes('R$ 8,00'));
  assert.match(r.html, /Sem borda[\s\S]{0,120}grátis/,
    'adicional sem custo saiu como R$ 0,00 em vez de "grátis"');
});

test('loja sem produto ativo nao gera folha em branco', async () => {
  const r = await rodar({ cardapio: { ...CARDAPIO, produtos: [] } });
  assert.equal(r.html, '');
  assert.match(r.msg, /nenhum produto ativo/i);
});

test('o nome da loja no papel e o da marca, nao o nome do sistema', async () => {
  const r = await rodar();
  assert.ok(r.html.includes('Pizzaria Bella Napoli'));
  assert.ok(!/BoraHapp/.test(r.html), 'o papel saiu com a marca da plataforma no lugar da loja');
});
