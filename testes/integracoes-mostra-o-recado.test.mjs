// O recado do marketplace tem de APARECER na tela — e em todos os estados do cartão.
//
// O DEFEITO (achado pelo QA em 24/10/2026, consertado na V61): quando o marketplace recusava um
// status que o lojista avançou no painel, a explicação era gravada em `integracao_canal.ultimo_erro`
// e o polling — que roda a cada 30 segundos — apagava. O lojista tinha até meio minuto para ver, e
// só se estivesse com esta tela aberta naquele instante. Na prática, nunca via.
//
// POR QUE IMPORTA: na 99 (Open Delivery) a ordem dos status é obrigatória, então depois de um status
// recusado os seguintes DO MESMO PEDIDO também são recusados. O lojista avança o pedido no painel,
// vê tudo verde do lado dele, e lá dentro o pedido ficou parado — o cliente final continua vendo
// "em preparo" no aplicativo depois de ter recebido a comida.
//
// POR QUE NÃO É TESTE DE CLIQUE: a tela monta os cartões como string e joga em `innerHTML`; o
// harness daqui não monta DOM de verdade, então não existe botão para clicar. O que este teste mede
// é a corrente: cada elo que, se faltar, deixa o recado invisível. O clique de verdade no navegador
// é o elo que falta, e está dito aqui.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RAIZ = path.join(import.meta.dirname, '..');
const TELA = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'integracoes.js'), 'utf8');

test('PREMISSA: existe um lugar só que desenha erro e recado', () => {
  // A linha do "Último erro" aparecia copiada em 4 ramos do cartão. Acrescentar o recado em 3 e
  // esquecer 1 deixaria um estado da tela mudo — e seria invisível numa revisão.
  assert.match(TELA, /function recados\(i\)/,
    'o helper sumiu: o recado volta a ser copiado por ramo, e um ramo fica sem');
  const usos = TELA.match(/\$\{recados\(i\)\}/g) || [];
  assert.ok(usos.length >= 4,
    'o cartão tem 4 estados (app não liberado, sem merchantId, conectado, passo 1) e todos '
    + 'precisam mostrar o recado; achei ' + usos.length);
});

test('nenhum ramo do cartão ficou com a linha antiga, só de erro', () => {
  // Olha FORA do helper: a linha do "Último erro" tem de existir, mas só lá dentro. Se ela sobrar
  // num ramo do cartão, aquele estado da tela mostra o erro e engole o recado.
  //
  // A primeira versão deste teste varria o arquivo inteiro e acusava o próprio helper — ou seja,
  // falhava com o código certo. Teste que aponta para o lugar errado é pior que teste nenhum,
  // porque o próximo a ler acredita nele.
  const fim = TELA.indexOf('function corpoOficial(i)');
  assert.ok(fim > 0, 'não achei onde o helper termina: este teste está medindo nada');
  const foraDoHelper = TELA.slice(fim);
  assert.ok(!/Último erro: \$\{esc\(i\.ultimoErro\)\}/.test(foraDoHelper),
    'sobrou um ramo desenhando só o erro: naquele estado o recado não aparece');
});

test('o recado vem do campo PRÓPRIO, e não do campo de erro', () => {
  // O elo entre back e front. Se a tela voltasse a ler `ultimoErro`, o conserto do servidor viraria
  // inútil: o campo certo encheria e ninguém mostraria.
  const helper = TELA.slice(TELA.indexOf('function recados(i)'),
    TELA.indexOf('function corpoOficial(i)'));
  assert.ok(helper.length > 200, 'não achei o corpo do helper: este teste está medindo nada');
  assert.match(helper, /i\.ultimoAviso/, 'a tela não lê o campo do recado');
  assert.match(helper, /i\.ultimoErro/, 'o erro de integração continua tendo de aparecer');
});

test('o recado diz QUANDO foi, e explica a consequência', () => {
  const helper = TELA.slice(TELA.indexOf('function recados(i)'),
    TELA.indexOf('function corpoOficial(i)'));
  assert.match(helper, /ultimoAvisoEm/,
    'recado sem data não dá para usar: "ficou parado" é outra coisa se foi agora ou semana passada');
  assert.match(helper, /ficou parado/,
    'o lojista precisa entender a consequência, não só que "falhou"');
});

// ---------------------------------------------------------------- o diagnóstico, DE VERDADE
//
// Aqui o teste EXECUTA a função em vez de olhar o texto do arquivo. A primeira versão deste caso
// só conferia que a string `d.ultimoAviso` existia no fonte — e um mutante que desligasse o recado
// mantendo a string (`'' && d.ultimoAviso`) passava limpo. Conferir que o código MENCIONA um campo
// não é conferir que ele USA o campo.
//
// O `__diagnosticar` dá para rodar porque só precisa de `getElementById` e do `Bora`: ele não
// depende de DOM parseado, diferente dos cartões.

function subirTela(diagnostico) {
  const chamadas = [];
  const els = new Map();
  const elemento = () => ({ innerHTML: '', textContent: '', hidden: true, style: {},
    addEventListener() {}, querySelectorAll: () => [], appendChild() {} });
  const get = (id) => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };
  const janela = {};
  // Tudo o que a tela chama em `Bora` — conferido com
  // `grep -oP "Bora\.\w+" assets/js/integracoes.js | sort -u`, para o dublê não ficar atrás do
  // código e o teste morrer por falta de método em vez de por defeito.
  const Bora = {
    requireAuth: () => true,
    user: () => ({ papel: 'ADMINISTRADOR_LOJA', lojaId: 18, nome: 'Teste' }),
    apiBase: () => 'http://t',
    integracoes: async () => [],
    salvarIntegracao: async () => ({}),
    diagnosticoDoCanal: async (canal) => { chamadas.push(canal); return diagnostico; },
    api: async () => ({}),
  };
  const ctx = {
    document: { getElementById: get, addEventListener() {}, createElement: elemento,
      querySelector: () => null, querySelectorAll: () => [], body: elemento(),
      documentElement: elemento() },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Bora, console, Date, Math, JSON, Number, String, Object, Array, Promise, setTimeout,
    alert: () => {}, confirm: () => true, window: janela, encodeURIComponent,
  };
  ctx.window = janela;
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'integracoes.js'), 'utf8'), ctx);
  return { janela, get, chamadas };
}

test('o diagnóstico NÃO diz "nenhum erro" quando existe recado', async () => {
  // Este é o diagnóstico que o lojista abre justamente quando "não chega pedido". A tela afirmando
  // que está tudo bem é pior que a tela calada.
  const t = subirTela({
    canal: 'NOVE_NOVE', label: '99Food', status: 'CONECTADO', ativo: true, merchantId: 'boraloja2',
    onlineNoMarketplace: true, ultimoPollingEm: new Date().toISOString(), pedidosRecebidos: 4,
    ultimoErro: null,
    ultimoAviso: 'O 99Food nao aceitou o status PRONTO do pedido 1234. Lá dentro ele continua no status anterior.',
    ultimoAvisoEm: new Date().toISOString(),
  });

  await t.janela.__diagnosticar('NOVE_NOVE');
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  const html = t.get('diag-NOVE_NOVE').innerHTML;

  assert.match(html, /pedido 1234/,
    'o diagnóstico não mostrou o recado: o lojista lê "Nenhum erro registrado" com um pedido dele '
    + 'parado no marketplace');
  assert.match(html, /ficou parado/, 'tem de explicar a consequência, não só repetir o texto');
});

test('sem recado, o diagnóstico não inventa caixa de aviso', async () => {
  // O risco do outro lado: caixa de aviso vazia em toda abertura faz o lojista parar de olhar.
  const t = subirTela({
    canal: 'IFOOD', label: 'iFood', status: 'CONECTADO', ativo: true, merchantId: 'm-1',
    onlineNoMarketplace: true, ultimoPollingEm: new Date().toISOString(), pedidosRecebidos: 9,
    ultimoErro: null, ultimoAviso: null, ultimoAvisoEm: null,
  });

  await t.janela.__diagnosticar('IFOOD');
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  const html = t.get('diag-IFOOD').innerHTML;

  assert.match(html, /Nenhum erro registrado/, 'sem erro e sem recado, a tela diz que está tudo bem');
  assert.ok(!/ficou parado/.test(html), 'desenhou caixa de recado sem recado nenhum');
});

test('dispensar o recado chama o endpoint certo, e pergunta antes', () => {
  assert.match(TELA, /window\.__avisoLido = async canal =>/, 'não há como tirar o recado da tela');
  assert.match(TELA, /'\/api\/integracoes\/' \+ encodeURIComponent\(canal\) \+ '\/aviso-lido'/,
    'o botão não chama /aviso-lido');
  const fn = TELA.slice(TELA.indexOf('window.__avisoLido'), TELA.indexOf('window.__vincular'));
  assert.match(fn, /confirm\(/,
    'dispensar é definitivo e o recado não volta: tem de perguntar antes');
  assert.match(fn, /method: 'POST'/, 'tem de ser POST: muda estado no servidor');
});

test('o botão de dispensar sai junto com o recado, e não sozinho', () => {
  // Botão de dispensar sem recado nenhum é um controle que não faz nada; e recado sem botão é um
  // aviso que fica para sempre na tela.
  const helper = TELA.slice(TELA.indexOf('function recados(i)'),
    TELA.indexOf('function corpoOficial(i)'));
  assert.match(helper, /if \(!i\.ultimoAviso\) return erro;/,
    'sem recado, a tela não pode desenhar a caixa nem o botão');
  assert.match(helper, /__avisoLido\('\$\{i\.canal\}'\)/, 'a caixa do recado tem de trazer o botão');
});
