// A autorização vencida tem de ser DITA, e não mostrada como uma data para o lojista comparar.
//
// O DEFEITO (achado em 25/10/2026, atacando o item 24): a Pizzaria (loja 17) estava com o iFood em
// `CONECTADO`, `ativo = true`, e o token vencido em **07/10** — dezoito dias antes. Medido no banco,
// e ela não tem `client_id` nem `client_secret` próprios, então nem havia como renovar.
//
// O que a tela dizia: o cartão mostrava a caixa normal, e o único lugar que falava do token era uma
// linha do diagnóstico escrita "Token expira em 07/10/2026" — sem a palavra "vencido", e só para
// quem abrisse o diagnóstico e fizesse a conta de cabeça. Este é justamente o diagnóstico que o
// suporte abre quando o lojista liga dizendo "não chega pedido": a resposta estava ali e não era
// legível.
//
// A frase que mais importa é a do cartão verde — "🟢 Conectado — os pedidos chegam sozinhos". É a
// promessa exata que deixou de ser verdade, e por isso ela some quando o token vence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RAIZ = path.join(import.meta.dirname, '..');
const TELA = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'integracoes.js'), 'utf8');

const ONTEM = new Date(Date.now() - 18 * 86400000).toISOString();   // como a loja 17
const DEPOIS = new Date(Date.now() + 40 * 86400000).toISOString();
const LOGO = new Date(Date.now() + 2 * 86400000).toISOString();     // dentro dos 3 dias

function subir(diagnostico) {
  const els = new Map();
  const elemento = () => ({ innerHTML: '', textContent: '', value: '', hidden: true,
    disabled: false, style: {}, files: [], addEventListener() {}, querySelectorAll: () => [],
    appendChild() {} });
  const get = (id) => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };
  const janela = {};
  const Bora = {
    requireAuth: () => true,
    user: () => ({ papel: 'ADMINISTRADOR_LOJA', lojaId: 17, nome: 'Teste' }),
    apiBase: () => 'http://t',
    integracoes: async () => [],
    salvarIntegracao: async () => ({}),
    diagnosticoDoCanal: async () => diagnostico,
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
  vm.runInNewContext(TELA, ctx);
  return { janela, get };
}

const assentar = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

const base = (tokenExpiraEm) => ({
  canal: 'IFOOD', label: 'iFood', status: 'CONECTADO', ativo: true, merchantId: null,
  onlineNoMarketplace: false, ultimoPollingEm: null, pedidosRecebidos: 0,
  ultimoErro: null, ultimoAviso: null, ultimoAvisoEm: null, integracaoOficial: true,
  appDaPlataformaConfigurado: true, tokenExpiraEm,
});

// ---------------------------------------------------------------- o diagnóstico
test('o diagnóstico DIZ "vencida", e não só a data', async () => {
  const t = subir(base(ONTEM));
  await t.janela.__diagnosticar('IFOOD');
  await assentar();
  const html = t.get('diag-IFOOD').innerHTML;

  assert.match(html, /VENCIDA/,
    'o diagnóstico mostrava só a data e o leitor tinha de comparar com o calendário de cabeça');
  assert.match(html, /nenhum pedido novo entra/i,
    'tem de dizer a consequência, que é o que o suporte precisa responder ao telefone');
});

test('token válido NÃO vira alarme', async () => {
  // O risco do outro lado: gritar em toda abertura faz o lojista parar de ler a tela.
  const t = subir(base(DEPOIS));
  await t.janela.__diagnosticar('IFOOD');
  await assentar();
  const html = t.get('diag-IFOOD').innerHTML;

  assert.ok(!/VENCIDA/.test(html), 'chamou de vencida uma autorização boa');
  assert.match(html, /válida até/, 'tem de dizer até quando vale');
});

test('avisa ANTES de vencer, que é o que evita a ligação', async () => {
  const t = subir(base(LOGO));
  await t.janela.__diagnosticar('IFOOD');
  await assentar();
  const html = t.get('diag-IFOOD').innerHTML;

  assert.match(html, /vence em \d+ dia/, 'não avisa na véspera: o lojista só descobre quebrado');
  assert.ok(!/VENCIDA/.test(html), 'ainda não venceu');
});

test('sem data de token, a linha não inventa nada', async () => {
  const t = subir(base(null));
  await t.janela.__diagnosticar('IFOOD');
  await assentar();
  const html = t.get('diag-IFOOD').innerHTML;
  assert.ok(!/VENCIDA/.test(html), 'tratou "não sei" como "vencida"');
  assert.ok(!/Invalid Date/.test(html), 'escreveu data inválida na tela do lojista');
});

// ---------------------------------------------------------------- o cartão
test('o cartão PARA de prometer que os pedidos chegam sozinhos', () => {
  // Contrato do fonte: a caixa verde e a frase da promessa só saem quando o token NÃO venceu. É a
  // asserção mais importante deste arquivo — a frase era a mentira.
  assert.match(TELA, /const tokenVencido = venc && venc\.getTime\(\) < Date\.now\(\)/,
    'a tela parou de calcular se o token venceu');
  assert.match(TELA, /tokenVencido \? '' : 'ok'/,
    'a caixa continua verde com o token vencido');
  assert.match(TELA, /tokenVencido \? '🟡 Conectado, mas a autorização venceu'/,
    'o título continua prometendo que os pedidos chegam sozinhos');
});

test('o aviso do token aparece nos DOIS ramos de conectado', () => {
  // Um com o ID da loja preenchido (caixa verde) e outro sem (caixa amarela do merchant ausente). A
  // loja 17 está no segundo: se o aviso só entrasse no primeiro, ela não veria nada.
  const usos = TELA.match(/\$\{avisoToken\}/g) || [];
  assert.ok(usos.length >= 2,
    'o aviso do token tem de sair nos dois estados de CONECTADO; achei ' + usos.length);
});

test('o aviso oferece o caminho de volta, e não só a má notícia', () => {
  const bloco = TELA.slice(TELA.indexOf('const avisoToken'), TELA.indexOf('if (!i.merchantId)'));
  assert.ok(bloco.length > 200, 'não achei o bloco do aviso: este teste está medindo nada');
  assert.match(bloco, /__vincular\('\$\{i\.canal\}'\)/, 'sem botão para reconectar');
  // A ação é diferente quando a credencial é da plataforma (renova sozinha) e quando é da loja
  // (não há como renovar sem o segredo, que é o caso da loja 17).
  assert.match(bloco, /appConfigurado/, 'a instrução tem de mudar conforme de quem é a credencial');
});
