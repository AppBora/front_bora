/**
 * Cores da marca da loja, com contraste garantido.
 *
 * O PROBLEMA QUE ISTO RESOLVE (achado em 09/10/2026, medido no cardapio da Zira): o CSS pintava o
 * PRECO de cada item com `--secondary`, a cor secundaria escolhida pelo lojista. A Zira escolheu
 * #FFD100, amarelo. Amarelo claro sobre branco da **1,46:1** de contraste; a norma pede 4,5:1 para
 * texto. O dado mais importante do cardapio ficou praticamente invisivel — e no sol do balcao,
 * invisivel de verdade. O botao "Finalizar venda" da Frente de Caixa tinha o mesmo 1,46:1, com texto
 * branco por cima do amarelo.
 *
 * Trocar a cor da Zira resolveria a Zira e deixaria a proxima loja que escolher cor clara no mesmo
 * buraco. Quem tem que decidir a cor do TEXTO e o sistema, pela luminancia da cor de fundo.
 *
 * O que este arquivo publica, em cima de `--primary` e `--secondary`:
 *   --secondary-texto    cor para escrever EM CIMA da secundaria (branco ou quase-preto)
 *   --secondary-legivel  a secundaria escurecida o suficiente para servir de TEXTO sobre branco
 *   --primary-texto      o mesmo, para a primaria
 *
 * Loja sem cor cadastrada nao passa por aqui: continua com o padrao do CSS.
 *
 * Nao depende de nada. E carregado pelo cardapio publico e pelo painel, que sao dois mundos sem
 * modulo compartilhado — este arquivo e de proposito o lugar unico da conta, para nao virar a 32a
 * copia de utilitario espalhada pelos .js (o `esc` ja esta em 31).
 */
(function (global) {
  'use strict';

  var BRANCO = [255, 255, 255];
  var ESCURO = [16, 33, 28]; // quase-preto esverdeado, combina com qualquer marca
  var MINIMO_TEXTO = 4.5;    // WCAG AA, texto normal

  /** '#FFD100' ou '#FD0' -> [255, 209, 0]. Devolve null se nao reconhecer. */
  function paraRgb(cor) {
    if (typeof cor !== 'string') return null;
    var h = cor.trim().replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function paraHex(rgb) {
    return '#' + rgb.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  /** Luminancia relativa (WCAG 2.x). */
  function luminancia(rgb) {
    var c = rgb.map(function (v) {
      var x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  /** Razao de contraste entre duas cores, de 1 a 21. */
  function contraste(a, b) {
    var la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  /** Branco ou quase-preto: o que der mais contraste EM CIMA desta cor. */
  function textoSobre(rgb) {
    return contraste(BRANCO, rgb) >= contraste(ESCURO, rgb) ? paraHex(BRANCO) : paraHex(ESCURO);
  }

  /**
   * A mesma cor, escurecida ate dar contraste de texto sobre branco.
   *
   * Escurece multiplicando os canais, o que preserva o matiz: o amarelo da loja vira um amarelo
   * escuro (mostarda), nao um cinza. Se nem o preto puro bastasse, para no escuro e pronto.
   */
  function legivelSobreBranco(rgb, minimo) {
    var alvo = minimo || MINIMO_TEXTO;
    if (contraste(rgb, BRANCO) >= alvo) return paraHex(rgb);
    var fator = 1;
    for (var i = 0; i < 40; i++) {
      fator -= 0.025;
      if (fator <= 0) break;
      var escura = [rgb[0] * fator, rgb[1] * fator, rgb[2] * fator];
      if (contraste(escura, BRANCO) >= alvo) return paraHex(escura);
    }
    return paraHex(ESCURO);
  }

  /**
   * Aplica as cores da loja e as variaveis derivadas.
   *
   * @param estilo  o `.style` de um elemento (normalmente `document.documentElement.style`)
   * @param marca   objeto com `corPrimaria` e/ou `corSecundaria` em hex
   */
  function aplicar(estilo, marca) {
    if (!estilo || !marca) return;
    var p = paraRgb(marca.corPrimaria);
    var s = paraRgb(marca.corSecundaria);
    if (p) {
      estilo.setProperty('--primary', paraHex(p));
      estilo.setProperty('--primary-texto', textoSobre(p));
      estilo.setProperty('--primary-legivel', legivelSobreBranco(p));
    }
    if (s) {
      estilo.setProperty('--secondary', paraHex(s));
      estilo.setProperty('--secondary-texto', textoSobre(s));
      estilo.setProperty('--secondary-legivel', legivelSobreBranco(s));
    }
  }

  global.BoraCores = {
    aplicar: aplicar,
    textoSobre: textoSobre,
    legivelSobreBranco: legivelSobreBranco,
    contraste: contraste,
    paraRgb: paraRgb,
    paraHex: paraHex
  };
})(typeof window !== 'undefined' ? window : globalThis);
