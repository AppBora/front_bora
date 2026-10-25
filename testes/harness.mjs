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

/**
 * O fonte SEM as LINHAS de comentario — para teste que procura codigo e nao conversa.
 *
 * POR QUE ISTO EXISTE (25/10/2026): em dois dias eu escrevi TRES testes que procuravam um padrao no
 * arquivo inteiro e acusavam o MEU PROPRIO COMENTARIO. Os tres falhavam com o codigo certo:
 *
 *   - um procurava a linha antiga do "Ultimo erro" e achava o helper que a contem de proposito;
 *   - um procurava "maximum-scale" e achava o comentario de CSS que explica por que eu NAO travei o
 *     zoom;
 *   - um procurava `$('iaImportar')` e achava o comentario que explica por que a fiacao saiu.
 *
 * Teste que aponta para o lugar errado e pior que teste nenhum, porque o proximo a ler acredita
 * nele. Ajustar o escopo caso a caso nao resolveu: na terceira vez virou classe de defeito.
 *
 * POR QUE POR LINHA, E NAO CARACTERE A CARACTERE
 *
 * A primeira versao caminhava o fonte acompanhando aspas, apostrofo e crase, para nao confundir
 * `//` dentro de texto. Parecia mais correta e era PIOR: ela entrou em "modo texto" numa REGEX com
 * aspas dentro (`/[&<>"]/g`, que existe no esc do configuracoes.html) e dali em diante ignorou
 * todos os `//` do arquivo. Resultado: o comentario sobreviveu e o teste continuou falhando, agora
 * com uma explicacao errada do motivo.
 *
 * Ferramenta de teste que falha de maneira imprevisivel e pior que ferramenta nenhuma, porque
 * outros testes passam a confiar nela. Esta versao nao acompanha estado de texto NENHUM, entao nao
 * tem como ser enganada: tira os comentarios de HTML (que tem comeco e fim proprios) e descarta
 * as LINHAS que sao so comentario.
 *
 * O LIMITE, explicito: comentario no FIM de uma linha de codigo (`const a = 1; // nota`) continua
 * no resultado. Os tres acidentes eram linhas inteiras de comentario, que e como se escreve
 * explicacao de verdade. Se um dia precisar do outro caso, o jeito honesto e um parser, nao mais
 * um palpite.
 */
export function semComentarios(fonte) {
  return String(fonte)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split('\n')
    .map(linha => {
      const t = linha.trim();
      // `*` pega o meio de bloco e de javadoc; `*/` pega o fechamento.
      if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return '';
      return linha;
    })
    .join('\n');
}
