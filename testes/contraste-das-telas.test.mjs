/**
 * O contraste das cores FIXAS das telas — as que não vêm da escolha do lojista.
 *
 * O `cores.test.mjs` guarda a CONTA que deriva uma cor legível da cor que o lojista escolheu. Este
 * arquivo guarda outra coisa: as cores escritas à mão no CSS e no JS do painel, que nenhuma conta
 * ajusta. O pente fino de 29/10/2026 achou seis delas reprovando, e as seis estavam em texto que
 * alguém precisa ler para trabalhar:
 *
 *   - o botão que fecha a venda no cardápio: 1,98:1 (branco sobre o verde do WhatsApp);
 *   - os botões que empurram o pedido no quadro: 2,15 a 3,96:1 (branco sobre a cor da coluna);
 *   - o cinza #94a3b8, em 86 lugares de 37 arquivos: 2,56:1 sobre branco;
 *   - o rodapé da tela que o cliente olha esperando o pedido: 1,48:1;
 *   - o aviso de estoque baixo em Insumos: 2,15:1;
 *   - a inicial do produto sem foto no PDV: 1,42:1.
 *
 * Nenhuma delas quebra nada: a tela "funciona". É por isso que precisam de teste — defeito que não
 * quebra nada só é achado por quem mede, e quem lê a tela no sol do balcão não tem como reclamar de
 * um número.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..');
const require = createRequire(import.meta.url);
require(join(raiz, 'assets', 'js', 'cores.js'));
const C = globalThis.BoraCores;

const NORMAL = 4.5;   // WCAG AA, texto normal
const GRANDE = 3.0;   // WCAG AA, texto grande (>= 18,66px em negrito)

const ler = (...p) => readFileSync(join(raiz, ...p), 'utf8');
const contraste = (a, b) => C.contraste(C.paraRgb(a), C.paraRgb(b));

/** A cor declarada numa regra do CSS, achada pelo seletor. */
function corDaRegra(css, seletor, propriedade) {
  const i = css.indexOf(seletor + '{');
  assert.ok(i >= 0, `nao achei a regra "${seletor}" no CSS -- se ela foi renomeada, atualize ESTE teste`);
  const corpo = css.slice(i, css.indexOf('}', i));
  const m = new RegExp(propriedade + ':(#[0-9a-fA-F]{3,8})').exec(corpo);
  assert.ok(m, `a regra "${seletor}" nao tem ${propriedade} com cor fixa: ${corpo.slice(0, 120)}`);
  return m[1];
}

// ============================================================ o cardápio público

test('o botao que FECHA A VENDA no cardapio e legivel', () => {
  const css = ler('assets', 'css', 'styles.css');
  const fundo = corDaRegra(css, '.menu-bar .send', 'background');
  const texto = corDaRegra(css, '.menu-bar .send', 'color');
  const medido = contraste(fundo, texto);

  assert.ok(medido >= NORMAL,
    `"Finalizar pedido" deu ${medido.toFixed(2)}:1 (${texto} sobre ${fundo}). E o ultimo clique `
    + 'antes de o pedido virar dinheiro.');
});

test('a inicial do produto sem foto aparece no azulejo do PDV', () => {
  const css = ler('assets', 'css', 'styles.css');
  const fundo = corDaRegra(css, '.prodtile .pf-vazia', 'background');
  const texto = corDaRegra(css, '.prodtile .pf-vazia', 'color');
  const medido = contraste(fundo, texto);

  // 28px/900 e texto grande: 3:1 bastaria. Com 1,42:1 a letra simplesmente nao estava la.
  assert.ok(medido >= GRANDE,
    `a inicial deu ${medido.toFixed(2)}:1 (${texto} sobre ${fundo})`);
});

test('o rodape da tela que o cliente acompanha e legivel', () => {
  const html = ler('acompanhar.html');
  const m = /\.rodape\{[^}]*color:(#[0-9a-fA-F]{3,8})/.exec(html);
  assert.ok(m, 'nao achei a cor do .rodape no acompanhar.html');
  const medido = contraste('#ffffff', m[1]);

  // O cartao e branco. E a UNICA assinatura do BoraHapp na tela que o consumidor final mais olha.
  assert.ok(medido >= NORMAL, `o rodape deu ${medido.toFixed(2)}:1 com ${m[1]}`);
});

// ============================================================ o quadro de pedidos

test('toda coluna do quadro tem corEscura, e o branco em cima dela passa', () => {
  const js = ler('assets', 'js', 'pedidos.js');
  const colunas = [...js.matchAll(/\{ key: '([A-Z_]+)'[^}]*?cor: '(#[0-9a-fA-F]{6})'([^}]*?)\}/g)]
    .map(([, key, cor, resto]) => ({
      key, cor, escura: (/corEscura: '(#[0-9a-fA-F]{6})'/.exec(resto) || [])[1],
    }));

  assert.ok(colunas.length >= 5,
    `achei ${colunas.length} colunas no pedidos.js; esperava as 5 do quadro -- o reconhecedor deste `
    + 'teste parou de funcionar, e teste que nao mede nada passa sempre');

  for (const c of colunas) {
    assert.ok(c.escura, `a coluna ${c.key} nao tem corEscura: o botao de avancar fica com texto `
      + `branco sobre ${c.cor}`);
    const medido = contraste('#ffffff', c.escura);
    assert.ok(medido >= NORMAL,
      `a coluna ${c.key} deu ${medido.toFixed(2)}:1 com branco sobre ${c.escura}`);
  }
});

test('o botao de AVANCAR e o contador usam a cor escura, nao a clara', () => {
  const css = ler('assets', 'css', 'styles.css');

  for (const seletor of ['.kacts .adv', '.kcol-head .pill']) {
    const i = css.indexOf(seletor + '{');
    assert.ok(i >= 0, `nao achei "${seletor}"`);
    const corpo = css.slice(i, css.indexOf('}', i));
    assert.ok(corpo.includes('--col-escura'),
      `"${seletor}" tem texto branco sobre a cor da coluna e voltou a usar a cor CLARA: ${corpo}`);
  }
});

test('o botao de ACEITAR o pedido e legivel', () => {
  const css = ler('assets', 'css', 'styles.css');
  const fundo = corDaRegra(css, '.kacts .ok', 'background');
  const medido = contraste(fundo, '#ffffff');

  assert.ok(medido >= NORMAL, `"Aceitar" deu ${medido.toFixed(2)}:1 (branco sobre ${fundo})`);
});

// ============================================================ o cinza que reprova

/**
 * O #94a3b8 dá 2,56:1 sobre branco e 2,40:1 sobre o fundo #f6f7fb: reprova em qualquer tamanho.
 *
 * Ele continua valendo em dois lugares, e só nestes: sobre o fundo ESCURO do KDS, onde a conta se
 * inverte e ele é o lado claro; e como cor de BORDA ou de chip, que é decoração e não texto.
 */
test('o cinza 94a3b8 nao volta como cor de TEXTO em tela clara', () => {
  const PERMITIDO = new Map([
    // KDS: fundo escuro, onde este cinza e o lado claro da conta.
    ['assets/css/styles.css', 3],
  ]);

  const arquivos = [
    'assets/css/styles.css', 'acompanhar.html', 'cardapio.html', 'login.html', 'cadastro.html',
    'produtos.html', 'insumos.html', 'pdv.html', 'novo-pedido.html', 'promocoes.html', 'rede.html',
    'relatorios.html', 'configuracoes.html',
    ...['ajustes', 'caixa', 'canais', 'cardapio', 'clientes', 'contagem', 'crm', 'cupons',
      'dashboard', 'desempenho', 'entregadores', 'entregas', 'estoque', 'insumos', 'integracoes',
      'novo-pedido', 'ordem-categorias', 'pdv', 'pedidos', 'produtos', 'relatorios', 'usuarios',
      'onboarding', 'complementos-gestao', 'credenciais-plataforma'].map((n) => `assets/js/${n}.js`),
  ];

  const sobrando = [];
  for (const rel of arquivos) {
    let texto;
    try {
      texto = ler(...rel.split('/'));
    } catch {
      continue;   // arquivo renomeado: nao e o assunto deste teste
    }
    // O `(?<![-a-z])` tira `border-left-color`, `background-color` e companhia: borda e fundo sao
    // decoracao, e a norma de 4,5:1 e de TEXTO. Sem isso o teste reprovava o
    // `border-left-color` da loja arquivada no configuracoes.html, que esta certo.
    const quantas = (texto.match(/(?<![-a-z])color:\s*#94a3b8/gi) || []).length;
    const permitidas = PERMITIDO.get(rel) || 0;
    if (quantas > permitidas) {
      sobrando.push(`${rel}: ${quantas} uso(s) como cor de texto, ${permitidas} permitido(s)`);
    }
  }

  assert.deepEqual(sobrando, [],
    'o #94a3b8 (2,56:1 sobre branco) voltou como cor de texto. Use var(--muted) no CSS ou #6b7280 '
    + 'no estilo em linha -- os dois sao o mesmo #6b7280, que da 4,83:1.\n   '
    + sobrando.join('\n   '));
});

test('o token --muted do painel passa na norma', () => {
  // Os 84 lugares consertados apontam para ele. Se o token mudar para uma cor clara, tudo volta.
  const css = ler('assets', 'css', 'styles.css');
  const m = /--muted:(#[0-9a-fA-F]{3,8})/.exec(css);
  assert.ok(m, 'o token --muted sumiu do :root');

  assert.ok(contraste('#ffffff', m[1]) >= NORMAL,
    `--muted (${m[1]}) da ${contraste('#ffffff', m[1]).toFixed(2)}:1 sobre o cartao branco`);
  assert.ok(contraste('#f6f7fb', m[1]) >= NORMAL,
    `--muted (${m[1]}) da ${contraste('#f6f7fb', m[1]).toFixed(2)}:1 sobre o fundo da pagina`);
});

// ============================================================ o aviso de estoque

test('o aviso de estoque baixo em Insumos e legivel', () => {
  const js = ler('assets', 'js', 'insumos.js');
  // A cor vem do ternario do estoqueCel: zero -> vermelho, baixo -> ambar, resto -> escuro.
  const m = /baixo \? '(#[0-9a-fA-F]{6})'/.exec(js);
  assert.ok(m, 'nao achei a cor do estoque baixo no insumos.js');
  const medido = contraste('#ffffff', m[1]);

  assert.ok(medido >= NORMAL,
    `o aviso de estoque baixo deu ${medido.toFixed(2)}:1 com ${m[1]} -- era o aviso que precisa ser `
    + 'visto e o menos legivel da tabela');
});

test('o estoque ZERO em Insumos continua legivel', () => {
  const js = ler('assets', 'js', 'insumos.js');
  const m = /<= 0 \? '(#[0-9a-fA-F]{6})'/.exec(js);
  assert.ok(m, 'nao achei a cor do estoque zero no insumos.js');

  assert.ok(contraste('#ffffff', m[1]) >= NORMAL,
    `o estoque zero deu ${contraste('#ffffff', m[1]).toFixed(2)}:1 com ${m[1]}`);
});
