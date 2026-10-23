import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RAIZ = process.env.FRONT || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const paginas = fs.readdirSync(RAIZ).filter(f => f.endsWith('.html'));
const scripts = fs.readdirSync(path.join(RAIZ, 'assets/js')).filter(f => f.endsWith('.js'));

test('todo JS do painel compila (sem erro de sintaxe)', () => {
  for (const f of [...scripts.map(s => 'assets/js/' + s), 'sw.js']) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(RAIZ, f), 'utf8'), { filename: f }), f);
  }
});

test('nenhuma pagina aponta para script ou css que nao existe', () => {
  const quebrados = [];
  for (const p of paginas) {
    const html = fs.readFileSync(path.join(RAIZ, p), 'utf8');
    for (const m of html.matchAll(/<(?:script[^>]+src|link[^>]+href)="([^"#]+)"/g)) {
      const alvo = m[1].split('?')[0];
      if (/^(https?:|data:|\/\/)/.test(alvo)) continue;
      if (!fs.existsSync(path.join(RAIZ, alvo.replace(/^\//, '')))) quebrados.push(p + ' -> ' + alvo);
    }
  }
  assert.deepEqual(quebrados, []);
});

test('pagina com script proprio carrega api.js ANTES dele', () => {
  const erros = [];
  for (const p of paginas) {
    const html = fs.readFileSync(path.join(RAIZ, p), 'utf8');
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1].split('?')[0]);
    const propria = srcs.find(s => s.startsWith('assets/js/') && !/api\.js|app\.js|whitelabel\.js|mock-data\.js/.test(s));
    if (!propria) continue;
    const iApi = srcs.findIndex(s => s.endsWith('assets/js/api.js'));
    if (iApi < 0 || iApi > srcs.indexOf(propria)) erros.push(p);
  }
  assert.deepEqual(erros, []);
});

test('paginas de painel nao esquecem de exigir login (requireAuth)', () => {
  // Documento solto servido junto com o painel, igual ao guia: nao e tela do produto, nao tem sessao
  // e por isso nao chama requireAuth. O ROTEIRO-DE-TESTE.html e GERADO por roteiro-de-teste/gerar.py.
  const publicas = new Set(['index.html', 'login.html', 'cadastro.html', 'cardapio.html', 'acompanhar.html',
    'ajuda.html', 'guia-zira.html', 'cardapio-qr.html', 'ROTEIRO-DE-TESTE.html',
    // A folha impressa so mostra o que o cardapio.html ja mostra a qualquer um (o endpoint
    // publico da loja). Exigir login impediria o lojista de abrir no celular ou mandar o link
    // para a grafica, sem esconder nada que ja nao esteja aberto.
    'cardapio-folha.html']);
  const sem = [];
  for (const p of paginas.filter(f => !publicas.has(f))) {
    const html = fs.readFileSync(path.join(RAIZ, p), 'utf8');
    const js = [...html.matchAll(/src="(assets\/js\/[^"?]+)[^"]*"/g)].map(m => fs.readFileSync(path.join(RAIZ, m[1]), 'utf8')).join('\n');
    if (!/requireAuth\(/.test(html + js)) sem.push(p);
  }
  assert.deepEqual(sem, [], 'pagina do painel sem requireAuth abre sem token');
});
