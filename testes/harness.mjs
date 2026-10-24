// Harness minimo para rodar os scripts do painel (IIFE + DOM global) no Node, sem npm e sem jsdom.
import vm from 'node:vm';
import fs from 'node:fs';

function elemento() {
  const e = { textContent: '', innerHTML: '', value: '', checked: false, hidden: false, style: {},
    dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    // Guarda os ouvintes em vez de engoli-los, e deixa o teste disparar o evento. Sem isto, tela
    // que faz o trabalho no `submit` do formulario -- Promocoes, Ajustes, Configuracoes -- so dava
    // para testar por dentro, chamando funcao interna, que e medir outra coisa.
    __ouvintes: {},
    addEventListener(ev, fn) { (this.__ouvintes[ev] ??= []).push(fn); },
    async __disparar(ev, evento = { preventDefault() {}, stopPropagation() {} }) {
      for (const fn of this.__ouvintes[ev] ?? []) await fn(evento);
    },
    // removeAttribute faltava, e toda tela que esconde/limpa atributo -- foto de produto, aria-*,
    // disabled -- estourava no teste por falta do duble, nao por defeito da tela.
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
    appendChild() {}, focus() {}, querySelectorAll: () => [], querySelector: () => null,
    // Um <form> de verdade tem reset(). Sem isto, toda tela que chama `$('form').reset()` -- e varias
    // chamam, depois de salvar -- estourava no teste por falta do dublê, nao por defeito da tela.
    reset() { this.value = ''; this.checked = false; } };
  return e;
}

/**
 * Os helpers de VERDADE do app.js, para o teste nao medir um dublê.
 *
 * O `boraEhVenda` decide o que entra no faturamento das telas de dinheiro, e ele mora num lugar so
 * exatamente para as telas nao divergirem. Um stub no teste desfaria isso: o teste passaria com a
 * regra do stub enquanto a tela roda com a do arquivo.
 *
 * Avalia o app.js inteiro num contexto com stubs de DOM. Ele NAO e so declaracoes: tem trechos que
 * rodam na carga (registro do manifest, marca da loja), e eles mexem no document. Por isso os stubs
 * abaixo cobrem `head`, `body` e `documentElement` -- sem isso a avaliacao estoura. Medido: sem o
 * `head`, quebra em app.js:214.
 */
export function helpersDoApp(raiz = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/') {
  const nada = () => null;
  const ctx = vm.createContext({
    document: { querySelector: nada, querySelectorAll: () => [], getElementById: nada,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
      body: { appendChild() {} }, head: { appendChild() {} },
      documentElement: { style: { setProperty() {} } },
      addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    // O app.js registra o service worker na carga; sem o navegador o `in` estoura.
    navigator: { serviceWorker: { register: () => Promise.resolve() } },
    window: { open: () => ({ document: { write() {}, close() {} }, focus() {} }), location: { origin: 'http://t' } },
    console, Date, Math, JSON, Number, String, Object, Array, Promise, setTimeout,
  });
  vm.runInContext(fs.readFileSync(raiz + 'assets/js/app.js', 'utf8'), ctx,
    { filename: 'app.js' });
  return {
    boraEhVenda: vm.runInContext('boraEhVenda', ctx),
    boraEsperandoPix: vm.runInContext('boraEsperandoPix', ctx),
    boraCanal: vm.runInContext('boraCanal', ctx),
    boraSla: vm.runInContext('boraSla', ctx),
    // Mesma razao dos de cima: a forma de pagamento normalizada mora no app.js para o Fechar Caixa
    // e o cartao do KDS falarem do mesmo dinheiro com as mesmas palavras.
    boraFormaPagamento: vm.runInContext('boraFormaPagamento', ctx),
  };
}

export function subir(arquivo, { Bora, globais = {}, search = '', comSeletores = false } = {}) {
  const els = new Map();
  const ouvintes = {};
  const get = id => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };

  // querySelector de verdade, OPCIONAL.
  //
  // O padrao devolve null, e varias telas fazem `document.querySelector(...).checked = true` --
  // que estoura. O teste entao parava ANTES de mexer na tela, e todo assert de `hidden` lia o
  // valor inicial do duble em vez do que a tela fez: teste verde medindo nada. Aconteceu de
  // verdade com a escolha entrega/retirada.
  //
  // Fica opcional para nao mudar o comportamento dos testes que ja existem. Com `comSeletores`,
  // cada seletor vira um elemento proprio e estavel, que o teste alcanca por `porSeletor`.
  const seletores = new Map();
  const porSeletor = sel => {
    if (!seletores.has(sel)) seletores.set(sel, elemento());
    return seletores.get(sel);
  };

  const document = {
    getElementById: get, hidden: false,
    addEventListener: (ev, fn) => (ouvintes[ev] ??= []).push(fn),
    querySelector: comSeletores ? porSeletor : () => null,
    querySelectorAll: comSeletores ? (sel => [porSeletor(sel)]) : () => [],
    createElement: () => elemento(),
    body: elemento(),
    // A marca da loja entra por `BoraCores.aplicar(document.documentElement.style, marca)`. Sem
    // o documentElement aqui, a avaliacao do ARGUMENTO estourava antes do stub rodar, e a tela
    // escrevia o erro dentro do proprio #menu -- um teste que so olha ausencia passaria vazio.
    documentElement: elemento(),
  };
  const store = new Map();
  const localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const ctx = vm.createContext({ document, localStorage, Bora, console, Date, Math, JSON, Number, String, Object, Array,
    Promise, setTimeout, clearInterval, setInterval, location: { search, pathname: '/x.html', origin: 'http://t' },
    window: { open() {}, location: { origin: 'http://t' } }, URLSearchParams, encodeURIComponent, ...globais });
  vm.runInContext(fs.readFileSync(arquivo, 'utf8'), ctx, { filename: arquivo });
  return {
    els, get, seletores, porSeletor,
    async carregarPagina() {          // dispara DOMContentLoaded e deixa as promessas assentarem
      for (const f of ouvintes.DOMContentLoaded ?? []) await f();
      for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    },
  };
}
