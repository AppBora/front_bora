// A credencial do app da plataforma nos marketplaces ganha tela — e ela tem de ser segura.
//
// O DEFEITO (25/10/2026): os três endpoints existiam desde antes — GET/PUT/DELETE
// `/admin-bora/credenciais`, com auditoria, só para administrador, e o segredo nunca voltando na
// resposta. NENHUMA tela os chamava. A única forma de corrigir uma credencial errada era escrever
// direto no banco.
//
// O que isso custou, medido: o 99Food da loja 1 passou dias em 401 porque o `client_secret` da
// plataforma tem 13 caracteres, quando o do único app de 99Food que funciona aqui tem 32. E não
// havia caminho no painel para trocar.
//
// O QUE ESTE TESTE PROTEGE, em ordem de estrago:
//
// 1. O SEGREDO NÃO PODE IR PARA A TELA. O servidor não o devolve; a tela não pode inventar jeito de
//    mostrá-lo, nem deixá-lo num campo de texto comum que o navegador memorize.
// 2. CAMPO VAZIO MANTÉM o atual. É o que o servidor faz. Mandar string vazia faria o servidor
//    recusar, e o dono acharia que a tela está quebrada.
// 3. SÓ O ADMINISTRADOR DA PLATAFORMA. O servidor confere de novo, mas desenhar para quem não pode
//    usar é convidar ao erro.
// 4. A CONSEQUÊNCIA DITA ANTES. Trocar a credencial do 99Food faz o servidor esquecer os tokens de
//    TODAS as lojas daquele canal: elas se reconectam se a nova estiver certa, e param se estiver
//    errada.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const TELA = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'credenciais-plataforma.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'configuracoes.html'), 'utf8');

const RESPOSTA = [
  { canal: 'IFOOD', label: 'iFood', clientId: 'app-ifood-123', temSecret: true,
    tamanhoSecret: 36, secretAtualizadoEm: '2026-10-20T10:00:00Z', origem: 'TELA' },
  { canal: 'NOVE_NOVE', label: '99Food', clientId: '5764xxxxxxxxxxxxxxx', temSecret: true,
    tamanhoSecret: 13, secretAtualizadoEm: '2026-09-01T12:00:00Z', origem: 'TELA' },
];

function subir({ papel = 'ADMINISTRADOR_BORA', resposta = RESPOSTA, confirmar = true,
  falharNoPut = null } = {}) {
  const els = new Map();
  const chamadas = [];
  // O dublê de elemento sabe UMA coisa a mais que o harness comum: `querySelectorAll` lê os
  // atributos `data-salvar` / `data-apagar` do innerHTML que a tela acabou de escrever e devolve um
  // botão para cada um. Sem isso o `ligar()` não liga nada e o teste só poderia olhar o texto do
  // fonte — e olhar texto não é olhar comportamento, como eu já aprendi hoje com o `d.ultimoAviso`.
  const elemento = () => {
    const el = {
      innerHTML: '', textContent: '', value: '', hidden: false, disabled: false, style: {},
      dataset: {}, addEventListener() {}, appendChild() {},
      querySelectorAll(sel) {
        const attr = /data-salvar/.test(sel) ? 'salvar' : /data-apagar/.test(sel) ? 'apagar' : null;
        if (!attr) return [];
        const re = new RegExp('data-' + attr + '="([^"]+)"', 'g');
        const achados = [];
        let m;
        while ((m = re.exec(String(el.innerHTML)))) {
          const b = { disabled: false, dataset: { [attr]: m[1] }, onclick: null };
          achados.push(b);
          (el.__botoes ??= []).push(b);
        }
        return achados;
      },
    };
    return el;
  };
  const get = (id) => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };
  const ouvintes = {};
  const Bora = {
    user: () => ({ papel, lojaId: 1, nome: 'Dono' }),
    requireAuth: () => true,
    api: async (url, opts) => {
      chamadas.push({ url, metodo: (opts && opts.method) || 'GET', corpo: opts && opts.body ? JSON.parse(opts.body) : null });
      if (url === '/admin-bora/credenciais' && !(opts && opts.method)) return resposta;
      if (falharNoPut && opts && opts.method === 'PUT') throw new Error(falharNoPut);
      return {};
    },
  };
  const janela = {};
  const ctx = {
    document: {
      getElementById: get,
      addEventListener: (ev, fn) => { (ouvintes[ev] ??= []).push(fn); },
      createElement: elemento, querySelector: () => null, querySelectorAll: () => [],
      body: elemento(), documentElement: elemento(),
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Bora, console, Date, Math, JSON, Number, String, Object, Array, Promise, setTimeout,
    alert: () => {}, confirm: () => confirmar, window: janela, encodeURIComponent,
  };
  ctx.window = janela;
  vm.runInNewContext(TELA, ctx);
  return { get, chamadas, janela, ouvintes };
}

async function abrir(opts) {
  const t = subir(opts);
  for (const f of t.ouvintes.DOMContentLoaded ?? []) await f();
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  return t;
}

// ---------------------------------------------------------------- o segredo
test('O SEGREDO nunca aparece na tela — o servidor não o manda e a tela não o pede', async () => {
  const t = await abrir();
  const html = t.get('credLista').innerHTML;

  // A resposta do servidor não tem o valor; o teste garante que a tela não inventa um campo que o
  // mostre, nem ecoa algo parecido.
  assert.ok(!/clientSecret/.test(html), 'a tela desenhou o campo do segredo com valor');
  assert.ok(!/value="[^"]*secret/i.test(html), 'algo do segredo foi para um atributo value');
  // O campo de digitar é `password`, e não texto: evita que o navegador e quem olha por cima do
  // ombro vejam o segredo sendo colado.
  assert.match(html, /type="password"/, 'o campo do segredo tem de ser password');
  assert.match(html, /autocomplete="new-password"/,
    'sem isto o navegador oferece preencher com senha salva de outro lugar');
});

test('mostra o TAMANHO do segredo, que foi o que resolveu o 401 do 99Food', async () => {
  // 13 contra 36 é a diferença que o dono precisa VER. Sem o número, a tela diz "salvo ✓" nos dois
  // e não há como desconfiar.
  const t = await abrir();
  const html = t.get('credLista').innerHTML;
  assert.match(html, /13<\/b> caracteres/, 'não mostrou o tamanho do segredo do 99Food');
  assert.match(html, /36<\/b> caracteres/, 'não mostrou o tamanho do segredo do iFood');
});

test('mostra QUANDO o segredo foi gravado', async () => {
  // "Isso aqui é de quando?" — credencial da época da homologação e credencial de hoje têm o mesmo
  // jeito na tela, e a data é a única coisa que as separa.
  const t = await abrir();
  assert.match(t.get('credLista').innerHTML, /gravado em/, 'não diz de quando é a credencial');
});

test('segredo NÃO salvo aparece como não salvo, e não como "salvo ✓"', async () => {
  const t = await abrir({ resposta: [{ canal: 'IFOOD', label: 'iFood', clientId: 'x',
    temSecret: false, tamanhoSecret: 0, secretAtualizadoEm: null, origem: null }] });
  const html = t.get('credLista').innerHTML;
  assert.match(html, /não salvo/, 'disse que há segredo salvo quando não há');
  assert.ok(!/salvo ✓/.test(html), 'prometeu segredo que não existe');
});

// ---------------------------------------------------------------- o campo vazio
/** Clica no botão que a tela desenhou para aquele canal, como o dono faria. */
async function clicar(t, attr, canal) {
  const botoes = t.get('credLista').__botoes || [];
  const b = botoes.find((x) => x.dataset[attr] === canal && typeof x.onclick === 'function');
  assert.ok(b, 'não achei o botão ' + attr + ' do ' + canal + ' ligado');
  await b.onclick();
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  return b;
}

test('CAMPO VAZIO não manda clientSecret: o servidor mantém o atual', async () => {
  const t = await abrir();
  t.get('credId-IFOOD').value = 'app-ifood-corrigido';
  t.get('credSecret-IFOOD').value = '';            // o dono só corrigiu o id

  await clicar(t, 'salvar', 'IFOOD');

  const put = t.chamadas.find((c) => c.metodo === 'PUT');
  assert.ok(put, 'o clique não chamou o servidor');
  assert.equal(put.url, '/admin-bora/credenciais/IFOOD');
  assert.deepEqual(put.corpo, { clientId: 'app-ifood-corrigido' },
    'mandou clientSecret vazio: o servidor recusa, e o dono acha que a tela quebrou');
});

test('com segredo digitado, ele VAI no corpo — aparado', async () => {
  const t = await abrir();
  t.get('credId-NOVE_NOVE').value = '  5764abc  ';
  t.get('credSecret-NOVE_NOVE').value = '  segredo-de-32-caracteres-aqui  ';

  await clicar(t, 'salvar', 'NOVE_NOVE');

  const put = t.chamadas.find((c) => c.metodo === 'PUT');
  assert.deepEqual(put.corpo, { clientId: '5764abc', clientSecret: 'segredo-de-32-caracteres-aqui' },
    'espaço colado junto quebra a credencial, e é fácil colar espaço de um portal');
});

test('sem Client ID, não chama o servidor', async () => {
  const t = await abrir();
  t.get('credId-IFOOD').value = '   ';
  await clicar(t, 'salvar', 'IFOOD');
  assert.ok(!t.chamadas.some((c) => c.metodo === 'PUT'), 'mandou salvar sem o id');
  assert.match(t.get('credMsg').textContent, /Client ID/, 'não explicou o que falta');
});

test('desistir da pergunta NÃO salva nada', async () => {
  const t = await abrir({ confirmar: false });
  t.get('credId-IFOOD').value = 'outro';
  await clicar(t, 'salvar', 'IFOOD');
  assert.ok(!t.chamadas.some((c) => c.metodo === 'PUT'),
    'salvou a credencial da plataforma inteira mesmo com o dono desistindo');
});

test('apagar chama DELETE, e desistir não chama', async () => {
  const t = await abrir();
  await clicar(t, 'apagar', 'IFOOD');
  assert.ok(t.chamadas.some((c) => c.metodo === 'DELETE' && c.url === '/admin-bora/credenciais/IFOOD'),
    'o botão de apagar não chamou o DELETE');

  const t2 = await abrir({ confirmar: false });
  await clicar(t2, 'apagar', 'IFOOD');
  assert.ok(!t2.chamadas.some((c) => c.metodo === 'DELETE'), 'apagou mesmo com o dono desistindo');
});

test('erro do servidor não deixa o botão travado, e DIZ o que houve', async () => {
  // Botão que fica `disabled` para sempre depois de um erro obriga a recarregar a página, e o dono
  // não sabe que foi isso — fica achando que a tela não faz nada.
  const t = await abrir({ falharNoPut: 'Client Secret longo demais' });
  t.get('credId-IFOOD').value = 'x';

  const b = await clicar(t, 'salvar', 'IFOOD');

  assert.equal(b.disabled, false, 'o botão ficou travado depois do erro');
  assert.match(t.get('credMsg').textContent, /Client Secret longo demais/,
    'engoliu a mensagem do servidor, que é a única pista do que o dono colou errado');
});

test('o campo do segredo DIZ que vazio mantém o atual', async () => {
  const t = await abrir();
  assert.match(t.get('credLista').innerHTML, /deixe em branco para manter o atual/,
    'sem esse texto o dono acha que precisa colar o segredo de novo para corrigir o id');
});

// ---------------------------------------------------------------- quem pode
test('SÓ o administrador da plataforma: para os outros, a tela não desenha nada', async () => {
  for (const papel of ['ADMINISTRADOR_LOJA', 'GERENTE', 'OPERADOR']) {
    const t = await abrir({ papel });
    assert.equal(t.get('credLista').innerHTML, '',
      papel + ' viu a credencial da plataforma inteira');
    assert.deepEqual(t.chamadas, [], papel + ' disparou a consulta da credencial');
  }
});

// ---------------------------------------------------------------- a consequência
test('AVISA antes de salvar, e o aviso do 99Food fala dos tokens esquecidos', () => {
  const codigo = semComentarios(TELA);
  assert.match(codigo, /if \(!confirm\(/, 'salva sem perguntar');
  assert.match(codigo, /esquecer os tokens atuais delas/,
    'trocar a credencial do 99Food faz o servidor esquecer os tokens de TODAS as lojas do canal; '
    + 'quem aperta o botão merece saber antes');
  assert.match(codigo, /TODAS as lojas/, 'não diz que o efeito é em toda a plataforma');
});

test('apagar também pergunta, e diz o que acontece depois', () => {
  const codigo = semComentarios(TELA);
  const fn = codigo.slice(codigo.indexOf('async function apagar'));
  assert.match(fn, /confirm\(/, 'apaga credencial da plataforma sem perguntar');
  assert.match(fn, /Volta a valer a do servidor/, 'não diz o que passa a valer');
  assert.match(fn, /param de receber/, 'não diz a consequência de não haver nenhuma');
});

test('o botão de apagar só existe quando há credencial SALVA AQUI', async () => {
  // Apagar o que veio do servidor não faz sentido: o DELETE só mexe no que a tela salvou.
  const t = await abrir({ resposta: [{ canal: 'IFOOD', label: 'iFood', clientId: 'x',
    temSecret: true, tamanhoSecret: 20, secretAtualizadoEm: null, origem: 'SERVIDOR' }] });
  assert.ok(!/data-apagar/.test(t.get('credLista').innerHTML),
    'ofereceu apagar uma credencial que a tela não salvou');

  const t2 = await abrir();
  assert.match(t2.get('credLista').innerHTML, /data-apagar="IFOOD"/,
    'não ofereceu apagar a credencial salva aqui');
});

test('diz DE ONDE a credencial em uso vem', async () => {
  // O que está salvo aqui GANHA do servidor. Ver "vem do servidor" com um valor errado salvo aqui
  // seria mentira — e é por isso que o botão de apagar existe.
  const t = await abrir({ resposta: [
    { canal: 'IFOOD', label: 'iFood', clientId: 'a', temSecret: true, tamanhoSecret: 9, origem: 'TELA' },
    { canal: 'NOVE_NOVE', label: '99Food', clientId: 'b', temSecret: true, tamanhoSecret: 9, origem: 'SERVIDOR' },
  ] });
  const html = t.get('credLista').innerHTML;
  assert.match(html, /salva aqui no painel/);
  assert.match(html, /vem do servidor/);
});

// ---------------------------------------------------------------- a fiação
test('PREMISSA: a página carrega este arquivo e tem onde desenhar', () => {
  assert.match(HTML, /assets\/js\/credenciais-plataforma\.js/,
    'a tela não é carregada pela página: o arquivo existe e não roda');
  assert.match(HTML, /id="credLista"/, 'falta o lugar onde a lista é desenhada');
  assert.match(HTML, /id="credMsg"/, 'falta o lugar das mensagens');
  // Dentro do cartão da plataforma, que é o que o administrador abre.
  const cartao = HTML.slice(HTML.indexOf('id="cardPlataforma"'));
  assert.ok(cartao.indexOf('id="credLista"') > 0
    && cartao.indexOf('id="credLista"') < cartao.indexOf('id="secFiscal"') + 4000,
    'a seção ficou fora do cartão da plataforma');
});

test('consulta o endpoint certo, e salva com PUT', async () => {
  const t = await abrir();
  assert.deepEqual(t.chamadas, [{ url: '/admin-bora/credenciais', metodo: 'GET', corpo: null }]);
  const codigo = semComentarios(TELA);
  assert.match(codigo, /'\/admin-bora\/credenciais\/' \+ encodeURIComponent\(canal\)/,
    'o canal tem de ir escapado na URL');
  assert.match(codigo, /method: 'PUT'/);
  assert.match(codigo, /method: 'DELETE'/);
});
