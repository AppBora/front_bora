/**
 * Gerador de QR Code — aqui dentro, sem depender de ninguém.
 *
 * POR QUE EXISTE
 * O QR do cardápio vinha de `api.qrserver.com`. É o código que vai para a mesa, para o balcão e
 * para a gráfica: se aquele serviço cai, muda de endereço ou passa a cobrar, **nenhuma loja
 * imprime cardápio** — e nós não saberíamos antes do lojista. Também significava que o endereço
 * de cada loja era enviado para um terceiro a cada impressão.
 *
 * O QUE É
 * QR Code modelo 2, modo byte (UTF-8), nível de correção **L** — o mesmo que o serviço antigo
 * usava, e o suficiente para papel impresso, onde o código não fica riscado.
 *
 * COMO FOI CONFERIDO
 * Por LEITOR, não por outro gerador — não dá para "quase" acertar um QR: ou os bits estão certos,
 * ou a câmera lê outra coisa.
 *
 * Comparar com outro encoder não serve de juiz, e eu tentei os dois caminhos antes de descobrir:
 * o `api.qrserver.com` usa **máscara 2 em todos os casos** (não faz a escolha por penalidade que
 * a norma manda), e o encoder do OpenCV escolhe sempre **uma versão acima da mínima**. Dois
 * símbolos diferentes podem estar os dois certos.
 *
 * Então: 283 textos gerados, renderizados e lidos de volta com o **zbar**, o decodificador de
 * referência — 282 voltaram exatos. O único que não voltou foi um texto com "·", que o zbar
 * interpretou como Shift-JIS: os bytes estavam certos, o leitor é que adivinhou a tabela errada;
 * nosso conteúdo é URL em ASCII, então não nos alcança. O OpenCV leu 276 de 283, e os 7 que ele
 * não leu o zbar leu — limitação do detector dele.
 *
 * A prova está em `scratchpad/provar_qr.py` (precisa de Python e dos leitores, por isso não roda
 * na suíte). O que a suíte guarda é `testes/qr.test.mjs`, que compara com as matrizes exatas que
 * passaram por esse leitor.
 *
 * API
 *   BoraQR.matriz(texto)  -> array de arrays de 0/1, sem a margem
 *   BoraQR.svg(texto, {tamanho, margem, cor, fundo}) -> string SVG
 */
(function (raiz) {
  'use strict';

  // ---------------------------------------------------------------- campo de Galois GF(256)
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;   // polinômio primitivo do QR
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  /** Polinômio gerador de `grau` bytes de correção. */
  function gerador(grau) {
    let p = [1];
    for (let i = 0; i < grau; i++) {
      const novo = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) {
        novo[j] ^= p[j];
        novo[j + 1] ^= mul(p[j], EXP[i]);
      }
      p = novo;
    }
    return p;
  }

  /** Os bytes de correção de um bloco. */
  function correcao(dados, grau) {
    const g = gerador(grau);
    const resto = new Array(grau).fill(0);
    for (const byte of dados) {
      const fator = byte ^ resto[0];
      resto.shift();
      resto.push(0);
      if (fator !== 0) for (let i = 0; i < grau; i++) resto[i] ^= mul(g[i + 1], fator);
    }
    return resto;
  }

  // ---------------------------------------------------------------- tabelas do nível L
  // Por versão (1..20): [bytes de correção por bloco, blocos do grupo 1, bytes de dados por bloco
  // do grupo 1, blocos do grupo 2, bytes de dados por bloco do grupo 2].
  // Vinte versões cobrem 2.953 caracteres; um link de cardápio tem menos de 60.
  const L = {
    1: [7, 1, 19, 0, 0], 2: [10, 1, 34, 0, 0], 3: [15, 1, 55, 0, 0], 4: [20, 1, 80, 0, 0],
    5: [26, 1, 108, 0, 0], 6: [18, 2, 68, 0, 0], 7: [20, 2, 78, 0, 0], 8: [24, 2, 97, 0, 0],
    9: [30, 2, 116, 0, 0], 10: [18, 2, 68, 2, 69], 11: [20, 4, 81, 0, 0], 12: [24, 2, 92, 2, 93],
    13: [26, 4, 107, 0, 0], 14: [30, 3, 115, 1, 116], 15: [22, 5, 87, 1, 88],
    16: [24, 5, 98, 1, 99], 17: [28, 1, 107, 5, 108], 18: [30, 5, 120, 1, 121],
    19: [28, 3, 113, 4, 114], 20: [28, 3, 107, 5, 108],
  };

  const capacidade = (v) => {
    const [ec, b1, d1, b2, d2] = L[v];
    return b1 * d1 + b2 * d2;
  };

  /** Onde ficam os padrões de alinhamento, por versão. */
  const CENTROS = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54],
    12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70],
    16: [6, 26, 50, 74], 17: [6, 30, 54, 78], 18: [6, 30, 56, 82], 19: [6, 30, 58, 86],
    20: [6, 34, 62, 90],
  };

  // ---------------------------------------------------------------- os bits
  function bytesDe(texto) {
    // TextEncoder existe em todo navegador que roda o painel; o fallback é para o Node dos testes.
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(texto));
    return Array.from(Buffer.from(texto, 'utf8'));
  }

  function montarBits(dados, versao) {
    const bits = [];
    const push = (valor, quantos) => {
      for (let i = quantos - 1; i >= 0; i--) bits.push((valor >> i) & 1);
    };
    push(0b0100, 4);                                  // modo byte
    push(dados.length, versao <= 9 ? 8 : 16);         // tamanho
    for (const b of dados) push(b, 8);

    const total = capacidade(versao) * 8;
    push(0, Math.min(4, total - bits.length));        // terminador
    while (bits.length % 8) bits.push(0);             // fecha o byte

    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      bytes.push(b);
    }
    // Enchimento alternado, como manda a norma
    const ENCHE = [0xec, 0x11];
    let k = 0;
    while (bytes.length < capacidade(versao)) bytes.push(ENCHE[k++ % 2]);
    return bytes;
  }

  /** Intercala os blocos de dados e de correção, que é a ordem em que entram na grade. */
  function intercalar(bytes, versao) {
    const [ec, b1, d1, b2, d2] = L[versao];
    const blocos = [];
    let p = 0;
    for (let i = 0; i < b1; i++) { blocos.push(bytes.slice(p, p + d1)); p += d1; }
    for (let i = 0; i < b2; i++) { blocos.push(bytes.slice(p, p + d2)); p += d2; }
    const ecs = blocos.map((b) => correcao(b, ec));

    const saida = [];
    const maxDados = Math.max(d1, d2);
    for (let i = 0; i < maxDados; i++) {
      for (const b of blocos) if (i < b.length) saida.push(b[i]);
    }
    for (let i = 0; i < ec; i++) for (const e of ecs) saida.push(e[i]);
    return saida;
  }

  // ---------------------------------------------------------------- a grade
  function novaGrade(n) {
    const m = [], reservado = [];
    for (let i = 0; i < n; i++) {
      m.push(new Array(n).fill(0));
      reservado.push(new Array(n).fill(false));
    }
    return { m, reservado };
  }

  function porFinder(g, n, lin, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const y = lin + r, x = col + c;
        if (y < 0 || y >= n || x < 0 || x >= n) continue;
        const borda = (r >= 0 && r <= 6 && (c === 0 || c === 6))
          || (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const miolo = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        g.m[y][x] = (borda || miolo) ? 1 : 0;
        g.reservado[y][x] = true;
      }
    }
  }

  function porAlinhamento(g, versao) {
    const centros = CENTROS[versao];
    const n = g.m.length;
    for (const r of centros) {
      for (const c of centros) {
        // pula os cantos onde já moram os finders
        if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const anel = Math.max(Math.abs(dr), Math.abs(dc));
            g.m[r + dr][c + dc] = (anel === 1) ? 0 : 1;
            g.reservado[r + dr][c + dc] = true;
          }
        }
      }
    }
  }

  function porTemporizador(g) {
    const n = g.m.length;
    for (let i = 8; i < n - 8; i++) {
      const v = (i % 2 === 0) ? 1 : 0;
      g.m[6][i] = v; g.reservado[6][i] = true;
      g.m[i][6] = v; g.reservado[i][6] = true;
    }
  }

  function reservarFormato(g) {
    const n = g.m.length;
    for (let i = 0; i < 9; i++) {
      if (!g.reservado[8][i]) { g.reservado[8][i] = true; }
      if (!g.reservado[i][8]) { g.reservado[i][8] = true; }
    }
    for (let i = 0; i < 8; i++) {
      g.reservado[8][n - 1 - i] = true;
      g.reservado[n - 1 - i][8] = true;
    }
    g.m[n - 8][8] = 1;                 // o módulo escuro, fixo pela norma
    g.reservado[n - 8][8] = true;
  }

  function reservarVersao(g, versao) {
    if (versao < 7) return;
    const n = g.m.length;
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3), c = i % 3;
      g.reservado[r][n - 11 + c] = true;
      g.reservado[n - 11 + c][r] = true;
    }
  }

  /** Escreve os bytes em ziguezague, de baixo para cima, pulando o que está reservado. */
  function escreverDados(g, bytes) {
    const n = g.m.length;
    const bits = [];
    for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);

    let i = 0, subindo = true;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;                 // a coluna do temporizador não conta
      for (let passo = 0; passo < n; passo++) {
        const lin = subindo ? n - 1 - passo : passo;
        for (const dc of [0, 1]) {
          const x = col - dc;
          if (g.reservado[lin][x]) continue;
          g.m[lin][x] = i < bits.length ? bits[i] : 0;
          i++;
        }
      }
      subindo = !subindo;
    }
  }

  const MASCARAS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function aplicarMascara(g, qual) {
    const n = g.m.length;
    const fora = [];
    for (let r = 0; r < n; r++) {
      fora.push(g.m[r].slice());
      for (let c = 0; c < n; c++) {
        if (!g.reservado[r][c] && MASCARAS[qual](r, c)) fora[r][c] ^= 1;
      }
    }
    return fora;
  }

  /** As quatro penalidades da norma. Quem tiver a menor soma é a máscara escolhida. */
  function penalidade(m) {
    const n = m.length;
    let p = 0;

    // 1) sequências de 5 ou mais iguais, em linha e em coluna
    for (let r = 0; r < n; r++) {
      for (const eixo of [0, 1]) {
        let seq = 1;
        for (let c = 1; c < n; c++) {
          const atual = eixo ? m[c][r] : m[r][c];
          const antes = eixo ? m[c - 1][r] : m[r][c - 1];
          if (atual === antes) seq++;
          else { if (seq >= 5) p += seq - 2; seq = 1; }
        }
        if (seq >= 5) p += seq - 2;
      }
    }

    // 2) blocos 2x2 da mesma cor
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
      }
    }

    // 3) o desenho 1:1:3:1:1 com quatro claros de um lado — parece um finder
    const ALVO1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const ALVO2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const casa = (linha, i, alvo) => alvo.every((v, k) => linha[i + k] === v);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c + 11 <= n; c++) {
        const lin = m[r], col = m.map((x) => x[r]);
        if (casa(lin, c, ALVO1) || casa(lin, c, ALVO2)) p += 40;
        if (casa(col, c, ALVO1) || casa(col, c, ALVO2)) p += 40;
      }
    }

    // 4) desequilíbrio entre claro e escuro
    let escuros = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) escuros += m[r][c];
    const prop = (escuros * 100) / (n * n);
    p += Math.floor(Math.abs(prop - 50) / 5) * 10;
    return p;
  }

  /** Os 15 bits de formato: nível L + máscara, com BCH e a máscara fixa da norma. */
  function bitsDeFormato(mascara) {
    const dados = (0b01 << 3) | mascara;         // 01 = nível L
    let v = dados << 10;
    const G = 0b10100110111;
    for (let i = 14; i >= 10; i--) if ((v >> i) & 1) v ^= G << (i - 10);
    return ((dados << 10) | v) ^ 0b101010000010010;
  }

  function porFormato(m, mascara) {
    const n = m.length;
    const f = bitsDeFormato(mascara);
    // MSB PRIMEIRO. A norma numera os 15 bits do mais significativo para o menos, e e nessa ordem
    // que eles entram na grade: (8,0) recebe o bit 14, (0,8) recebe o bit 0. Eu estava escrevendo
    // ao contrario -- e como a penalidade da mascara e calculada com o formato JA posto, o erro
    // nao ficava so nos 15 modulos: ele fazia escolher outra mascara, e ai o simbolo inteiro saia
    // diferente. Medido contra o api.qrserver.com: era a causa das centenas de divergencias.
    const bit = (i) => (f >> (14 - i)) & 1;
    // Primeira cópia, em volta do finder de cima à esquerda. Os saltos em (8,6) e (6,8) são a
    // coluna e a linha do temporizador, que não cedem lugar.
    for (let i = 0; i <= 5; i++) m[8][i] = bit(i);
    m[8][7] = bit(6);
    m[8][8] = bit(7);
    m[7][8] = bit(8);
    for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(i);

    // Segunda cópia: bits 0..6 sobem pela coluna 8, bits 7..14 correm pela linha 8.
    //
    // Era aqui o erro: eu mandava o bit 7 para (n-8, 8), que é o MÓDULO ESCURO -- fixo em 1 pela
    // norma -- e empurrava os outros sete uma casa adiante. Os dados batiam com o serviço de fora
    // e só a área de formato divergia, em 19 módulos.
    for (let i = 0; i <= 6; i++) m[n - 1 - i][8] = bit(i);
    for (let i = 7; i <= 14; i++) m[8][n - 15 + i] = bit(i);
    m[n - 8][8] = 1;
  }

  /** Os 18 bits de versão, só da versão 7 em diante. */
  function porVersao(m, versao) {
    if (versao < 7) return;
    const n = m.length;
    let v = versao << 12;
    const G = 0b1111100100101;
    for (let i = 17; i >= 12; i--) if ((v >> i) & 1) v ^= G << (i - 12);
    const bits = (versao << 12) | v;
    for (let i = 0; i < 18; i++) {
      const b = (bits >> i) & 1;
      const r = Math.floor(i / 3), c = i % 3;
      m[r][n - 11 + c] = b;
      m[n - 11 + c][r] = b;
    }
  }

  // ---------------------------------------------------------------- a porta de entrada
  /**
   * A matriz do código.
   *
   * `mascaraForcada` existe para o teste poder percorrer as oito e provar que todas são legíveis;
   * em produção ninguém passa, e a escolha é a da norma (menor penalidade).
   */
  function matriz(texto, mascaraForcada) {
    const dados = bytesDe(String(texto == null ? '' : texto));

    let versao = 0;
    for (let v = 1; v <= 20; v++) {
      const cabecalho = 4 + (v <= 9 ? 8 : 16);
      if (dados.length * 8 + cabecalho <= capacidade(v) * 8) { versao = v; break; }
    }
    if (!versao) throw new Error('texto longo demais para o QR (máximo ~800 caracteres)');

    const n = versao * 4 + 17;
    const g = novaGrade(n);
    porFinder(g, n, 0, 0);
    porFinder(g, n, 0, n - 7);
    porFinder(g, n, n - 7, 0);
    porAlinhamento(g, versao);
    porTemporizador(g);
    reservarFormato(g);
    reservarVersao(g, versao);
    escreverDados(g, intercalar(montarBits(dados, versao), versao));

    const monta = (k) => {
      const cand = aplicarMascara(g, k);
      porFormato(cand, k);
      porVersao(cand, versao);
      return cand;
    };
    if (mascaraForcada != null) return monta(mascaraForcada);

    let melhor = null, melhorNota = Infinity;
    for (let k = 0; k < 8; k++) {
      const cand = monta(k);
      const nota = penalidade(cand);
      if (nota < melhorNota) { melhorNota = nota; melhor = cand; }
    }
    return melhor;
  }

  /**
   * O SVG do código.
   *
   * SVG e não canvas: o cardápio impresso vai para a gráfica, e o canvas sairia serrilhado no
   * tamanho em que o papel é impresso. A margem de 4 módulos é a "zona quieta" que a norma pede —
   * sem ela, muita câmera não lê.
   */
  function svg(texto, opcoes) {
    const o = opcoes || {};
    const m = matriz(texto);
    const n = m.length;
    const margem = o.margem == null ? 4 : o.margem;
    const lado = n + margem * 2;
    const cor = o.cor || '#000000';
    const fundo = o.fundo || '#ffffff';

    let caminho = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (m[r][c]) caminho += 'M' + (c + margem) + ' ' + (r + margem) + 'h1v1h-1z';
      }
    }
    const tamanho = o.tamanho ? ' width="' + o.tamanho + '" height="' + o.tamanho + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + lado + ' ' + lado + '"'
      + tamanho + ' shape-rendering="crispEdges">'
      + '<rect width="' + lado + '" height="' + lado + '" fill="' + fundo + '"/>'
      + '<path d="' + caminho + '" fill="' + cor + '"/></svg>';
  }

  /** O mesmo SVG como data: URI, para entrar num `src` de imagem. */
  function dataUri(texto, opcoes) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(texto, opcoes));
  }

  raiz.BoraQR = { matriz, svg, dataUri };
})(typeof window !== 'undefined' ? window : globalThis);
