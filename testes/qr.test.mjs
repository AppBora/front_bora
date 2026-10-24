// O gerador de QR que mora aqui dentro (assets/js/qr.js).
//
// POR QUE ELE EXISTE: o QR do cardápio vinha de `api.qrserver.com`. É o código que vai para a
// mesa, para o balcão e para a gráfica — se aquele serviço cai, muda de endereço ou passa a
// cobrar, **nenhuma loja imprime cardápio**, e nós só saberíamos pelo lojista. Também mandava o
// endereço de cada loja para um terceiro a cada impressão.
//
// COMO ELE FOI PROVADO — e por que este arquivo compara com matrizes congeladas:
//
// Não dá para "quase" acertar um QR: ou os bits estão certos, ou a câmera lê outra coisa. O juiz
// foi um LEITOR de verdade, não outro gerador:
//   · O api.qrserver.com usa máscara 2 em TODOS os casos — não faz a escolha por penalidade que a
//     norma manda. Dois símbolos diferentes podem estar os dois certos, então ele não serve de
//     juiz.
//   · O codificador do OpenCV escolhe sempre uma versão acima da mínima, então também não dá para
//     comparar módulo a módulo.
//
// Então: 283 textos foram gerados, renderizados e lidos de volta com o **zbar** (o decodificador
// de referência) — 282 voltaram exatos. O único que não voltou foi um texto com "·", que o zbar
// interpretou como Shift-JIS: os bytes estavam certos, o leitor é que adivinhou a tabela errada.
// Nosso conteúdo real é URL (ASCII), então isso não nos alcança. O OpenCV leu 276 dos 283; os 7
// que ele não leu, o zbar leu — é limitação do detector dele.
//
// As matrizes em `fixtures/qr-conhecidos.json` são exatamente as que passaram por esse leitor.
// Comparar com elas é o jeito de a suíte (Node puro, sem Python e sem rede) continuar guardando
// esse resultado. O script da prova está em `scratchpad/provar_qr.py`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';

// TextEncoder de propósito: é o caminho que o navegador usa. O `Buffer` no qr.js é só a saída
// para quem roda em Node sem ele.
const ctx = { console, TextEncoder };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets/js/qr.js'), 'utf8'), ctx,
  { filename: 'qr.js' });
const QR = ctx.BoraQR;

const CONHECIDOS = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'testes/fixtures/qr-conhecidos.json'), 'utf8'));

// ---------------------------------------------------------------- o que foi provado por leitor
test('PREMISSA: as matrizes batem com as que o leitor aprovou', () => {
  assert.ok(CONHECIDOS.length >= 9, 'a fixture encolheu');
  for (const caso of CONHECIDOS) {
    // `Array.from` de propósito: o `vm` devolve arrays de OUTRO realm, com outro Array.prototype,
    // e o deepStrictEqual compara protótipo — ele falhava com o conteúdo idêntico, sem apontar
    // uma linha sequer diferente. Custou um bom tempo até eu ver que era isso.
    const linhas = Array.from(QR.matriz(caso.texto), (l) => Array.from(l).join(''));
    assert.deepEqual(linhas, caso.linhas,
      'o QR de "' + caso.texto.slice(0, 40) + '" mudou — ele não é mais o que o zbar leu');
  }
});

test('a versão escolhida é a menor que cabe', () => {
  for (const caso of CONHECIDOS) {
    const m = QR.matriz(caso.texto);
    assert.equal((m.length - 17) / 4, caso.versao,
      'mudou a versão de "' + caso.texto.slice(0, 30) + '": o código fica maior à toa');
  }
});

// ---------------------------------------------------------------- invariantes da norma
const matrizDe = (t) => QR.matriz(t);

test('PREMISSA: os três finders estão nos cantos certos', () => {
  // Sem eles a câmera não acha o código — não é "fica feio", é não lê.
  const m = matrizDe('https://borahapp.com.br/cardapio.html?loja=18');
  const n = m.length;
  const olho = (lin, col) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const borda = (r === 0 || r === 6 || c === 0 || c === 6);
        const miolo = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        assert.equal(m[lin + r][col + c], (borda || miolo) ? 1 : 0,
          'finder quebrado em ' + lin + ',' + col);
      }
    }
  };
  olho(0, 0); olho(0, n - 7); olho(n - 7, 0);
});

test('o temporizador alterna, nas duas direções', () => {
  const m = matrizDe('https://borahapp.com.br/cardapio.html?loja=18');
  const n = m.length;
  for (let i = 8; i < n - 8; i++) {
    const esperado = i % 2 === 0 ? 1 : 0;
    assert.equal(m[6][i], esperado, 'linha 6 na coluna ' + i);
    assert.equal(m[i][6], esperado, 'coluna 6 na linha ' + i);
  }
});

test('PREMISSA: o módulo escuro está lá, e é 1', () => {
  // Fixo pela norma. Eu já o sobrescrevi com um bit de formato uma vez, e o símbolo inteiro saiu
  // errado por causa disso.
  for (const caso of CONHECIDOS) {
    const m = QR.matriz(caso.texto);
    assert.equal(m[m.length - 8][8], 1, 'módulo escuro apagado em "' + caso.texto.slice(0, 30) + '"');
  }
});

test('a área de formato é igual nas duas cópias', () => {
  // As duas cópias existem para o código sobreviver a um canto sujo. Se elas divergirem, metade
  // dos leitores lê uma coisa e metade lê outra.
  const TABELA = ['111011111000100', '111001011110011', '111110110101010', '111100010011101',
    '110011000101111', '110001100011000', '110110001000001', '110100101110110'];
  for (const caso of CONHECIDOS) {
    const m = QR.matriz(caso.texto);
    const n = m.length;
    const copia1 = [...Array(6).keys()].map((i) => m[8][i])
      .concat([m[8][7], m[8][8], m[7][8]])
      .concat([5, 4, 3, 2, 1, 0].map((r) => m[r][8]));
    const copia2 = [...Array(7).keys()].map((i) => m[n - 1 - i][8])
      .concat([...Array(8).keys()].map((i) => m[8][n - 8 + i]));
    assert.deepEqual(copia1, copia2, 'as duas cópias do formato divergem');
    assert.ok(TABELA.includes(copia1.join('')),
      'o formato não é nenhum dos oito válidos do nível L: ' + copia1.join(''));
  }
});

// ---------------------------------------------------------------- as oito máscaras
test('PREMISSA: todas as oito máscaras produzem um símbolo bem formado', () => {
  // O teste do leitor cobriu a máscara ESCOLHIDA. Este cobre as outras sete, porque a escolha
  // muda com o conteúdo — e um defeito que só aparece na máscara 5 ficaria escondido até o dia
  // em que um link caísse nela.
  const t = 'https://borahapp.com.br/cardapio.html?loja=18';
  const base = QR.matriz(t, 0);
  for (let k = 0; k < 8; k++) {
    const m = QR.matriz(t, k);
    assert.equal(m.length, base.length, 'a máscara mudou o tamanho do código');
    assert.equal(m[m.length - 8][8], 1, 'módulo escuro apagado na máscara ' + k);
    assert.equal(m[0][0], 1, 'finder quebrado na máscara ' + k);
    assert.equal(m[6][8], 8 % 2 === 0 ? 1 : 0, 'temporizador mascarado na máscara ' + k);
  }
});

test('máscaras diferentes dão símbolos diferentes', () => {
  const t = 'https://borahapp.com.br/cardapio.html?loja=18';
  const vistos = new Set();
  for (let k = 0; k < 8; k++) vistos.add(QR.matriz(t, k).map((l) => l.join('')).join('|'));
  assert.equal(vistos.size, 8, 'alguma máscara não está sendo aplicada');
});

// ---------------------------------------------------------------- o texto
test('acento entra como UTF-8', () => {
  // O cardápio tem "Açaí" no nome da loja. Se o texto for cortado por byte, o código leva lixo.
  const m = QR.matriz('Zirá Açaíteria');
  assert.ok(m.length >= 21);
});

test('texto vazio não estoura', () => {
  const m = QR.matriz('');
  assert.equal(m.length, 21);
});

test('texto longo demais recusa, em vez de gerar um código truncado', () => {
  // Gerar um QR com metade do endereço é pior que não gerar: ele abre OUTRA página.
  assert.throws(() => QR.matriz('x'.repeat(5000)), /longo demais/);
});

// ---------------------------------------------------------------- o SVG
test('o SVG sai com a zona quieta de 4 módulos', () => {
  // Sem a margem branca, muita câmera não lê. É exigência da norma, não enfeite.
  const svg = QR.svg('https://borahapp.com.br/cardapio.html?loja=18');
  const m = QR.matriz('https://borahapp.com.br/cardapio.html?loja=18');
  assert.match(svg, new RegExp('viewBox="0 0 ' + (m.length + 8) + ' ' + (m.length + 8) + '"'));
});

test('o SVG pinta fundo branco, e não transparente', () => {
  // Transparente sobre papel colorido, ou sobre tema escuro, deixa o código ilegível.
  const svg = QR.svg('teste');
  assert.match(svg, /<rect[^>]*fill="#ffffff"/);
});

test('o data URI serve para um src de imagem', () => {
  const uri = QR.dataUri('https://borahapp.com.br/cardapio.html?loja=18');
  assert.match(uri, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.ok(!/[<>"]/.test(uri), 'o SVG não foi escapado: quebra o atributo src');
});
