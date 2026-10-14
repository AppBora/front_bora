import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const API = process.env.API_JS || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/api.js';

/** Carrega api.js num contexto isolado, com navegador de mentira controlavel pelo teste. */
function carregar({ host = 'borahapp.com.br', search = '', pathname = '/pedidos.html', token = null, respostas = [], local = {} } = {}) {
  const store = new Map(Object.entries(local)); if (token) store.set('boraToken', token);
  const sessao = new Map();
  const chamadas = [];
  const location = { hostname: host, search, pathname, origin: 'https://' + host, href: '' };
  const ctx = vm.createContext({
    location, URLSearchParams, JSON, Promise, Error, console, setInterval, clearInterval, encodeURIComponent,
    document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    sessionStorage: { setItem: (k, v) => sessao.set(k, String(v)), getItem: k => sessao.get(k) ?? null },
    window: { location },
    fetch: async (url, opts) => {
      chamadas.push({ url, opts });
      const r = respostas.shift() ?? { status: 200, corpo: '{}' };
      return { status: r.status, ok: r.status >= 200 && r.status < 300,
        text: async () => r.corpo ?? '', json: async () => JSON.parse(r.corpo),
        clone() { return this; } };
    },
  });
  vm.runInContext(fs.readFileSync(API, 'utf8') + '\n;globalThis.__Bora = Bora;', ctx, { filename: API });
  return { Bora: ctx.__Bora, store, sessao, chamadas, location };
}

test('seguranca: ?api= nao desvia a API fora de ambiente de teste (phishing) e limpa desvio plantado', () => {
  const t = carregar({ host: 'borahapp.com.br', search: '?api=https://golpista.example', local: { boraApiUrl: 'https://golpista.example' } });
  assert.equal(t.store.get('boraApiUrl'), undefined);
  assert.equal(t.Bora.apiBase(), 'https://borahapp.com.br');
});

test('em localhost o desvio ?api= funciona (link de teste por tunel)', () => {
  const t = carregar({ host: 'localhost', search: '?api=http://127.0.0.1:8080/' });
  assert.equal(t.Bora.apiBase(), 'http://127.0.0.1:8080');
});

test('manda o Bearer quando ha token, e nao manda sem token', async () => {
  const a = carregar({ token: 'abc' }); await a.Bora.api('/api/x');
  assert.equal(a.chamadas[0].opts.headers.Authorization, 'Bearer abc');
  const b = carregar({}); await b.Bora.api('/api/x');
  assert.equal(b.chamadas[0].opts.headers.Authorization, undefined);
});

test('401 numa chamada normal = sessao expirada: limpa o login e manda para login.html', async () => {
  const t = carregar({ token: 'abc', respostas: [{ status: 401 }] });
  await assert.rejects(t.Bora.api('/api/pedidos'), /Sessão expirada/);
  assert.equal(t.store.get('boraToken'), undefined);
  assert.equal(t.location.href, 'login.html');
});

test('401 no login e senha errada, nao sessao expirada: mostra a mensagem e nao desloga', async () => {
  const t = carregar({ token: 'abc', respostas: [{ status: 401, corpo: '{"message":"Credenciais inválidas"}' }] });
  await assert.rejects(t.Bora.login('a@b.c', 'x'), /Credenciais inválidas/);
  assert.equal(t.location.href, '');
});

test('402 (prazo vencido) leva para planos.html com o recado, e nao entra em loop dentro de planos', async () => {
  const t = carregar({ respostas: [{ status: 402, corpo: '{"message":"O período de uso desta loja terminou."}' }] });
  await assert.rejects(t.Bora.api('/api/pedidos'), /terminou/);
  assert.equal(t.location.href, 'planos.html');
  assert.match(t.sessao.get('boraAvisoAssinatura'), /terminou/);
  const emPlanos = carregar({ pathname: '/planos.html', respostas: [{ status: 402, corpo: '{}' }] });
  await assert.rejects(emPlanos.Bora.api('/api/assinatura'));
  assert.equal(emPlanos.location.href, '', 'ja esta em planos: nao redireciona de novo');
});

test('corpo vazio, 204 e JSON quebrado nao derrubam a tela', async () => {
  const vazio = carregar({ respostas: [{ status: 200, corpo: '' }] });
  assert.equal(await vazio.Bora.api('/api/x'), null);
  const semCorpo = carregar({ respostas: [{ status: 204 }] });
  assert.equal(await semCorpo.Bora.api('/api/x'), null);
  const quebrado = carregar({ respostas: [{ status: 200, corpo: '<html>' }] });
  await assert.rejects(quebrado.Bora.api('/api/x'), /Resposta inesperada/);
});

test('erro do servidor: usa message, depois error, depois o codigo', async () => {
  const a = carregar({ respostas: [{ status: 409, corpo: '{"message":"Limite de usuários atingido"}' }] });
  await assert.rejects(a.Bora.api('/api/x'), /Limite de usuários/);
  const b = carregar({ respostas: [{ status: 500, corpo: '{"error":"Internal"}' }] });
  await assert.rejects(b.Bora.api('/api/x'), /Internal/);
  const c = carregar({ respostas: [{ status: 502, corpo: 'bad gateway' }] });
  await assert.rejects(c.Bora.api('/api/x'), /Erro 502/);
});

test('mudarStatus escapa o motivo na URL', async () => {
  const t = carregar({});
  await t.Bora.mudarStatus(7, 'CANCELADO', 'cliente & "desistiu"');
  assert.match(t.chamadas[0].url, /\/api\/pedidos\/7\/status\?status=CANCELADO&motivo=cliente%20%26%20%22desistiu%22$/);
  assert.equal(t.chamadas[0].opts.method, 'PATCH');
});
