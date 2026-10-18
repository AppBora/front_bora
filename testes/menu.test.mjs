// O menu lateral mostra, para cada papel, só o que a API deixa aquela pessoa usar.
//
// O que aconteceu (18/10/2026): o dono criou `anazira@borahapp.com.br` como OPERADORA na Zirá
// Açaíteria e ela apareceu com "Usuários" no menu. A API sempre barrou — os cinco endpoints de
// `UsuarioService` exigem ADMINISTRADOR_LOJA —, então nada ficou exposto. Mas 15 dos 26 itens não
// tinham `roles`, e o menu prometia à operadora meia dúzia de telas que só devolviam
// "Ação não permitida para o seu perfil".
//
// Este teste trava a tabela: cada linha abaixo existe porque alguém mediu o `ctx.requirePapel` do
// serviço correspondente. Mudar o menu sem mudar aqui quebra o teste de propósito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const APP = path.join(import.meta.dirname, '..', 'assets', 'js', 'app.js');

/** Roda o app.js de VERDADE e devolve os hrefs que o menu monta para um papel. */
function menuDe(papel) {
  const nav = { innerHTML: '' };
  const document = {
    querySelector: sel => (sel === '.nav' ? nav : null),
    querySelectorAll: () => [],
    addEventListener() {},
    documentElement: { style: { setProperty() {} } },
    body: { classList: { add() {}, remove() {} }, appendChild() {} },
    head: { appendChild() {} },
    createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }),
  };
  const ctx = vm.createContext({
    document, console, Date, Math, JSON, Number, String, Object, Array, Promise,
    setTimeout, setInterval, clearInterval, fetch: async () => ({ ok: true, json: async () => ({}) }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/dashboard.html', search: '', origin: 'http://t' },
    window: { location: { origin: 'http://t' }, matchMedia: () => ({ matches: false }) },
    navigator: { serviceWorker: { register: async () => ({}) } },
    // O app.js faz mais coisa no carregamento (manifest, service worker, aviso de loja). Nada disso
    // interessa ao menu: os retornos abaixo so impedem que o arquivo real estoure dentro do vm.
    Bora: {
      user: () => ({ papel, nome: 'Fulano' }),
      token: () => null,
      api: async () => ({}),
      lojaAtual: () => null,
    },
  });
  vm.runInContext(fs.readFileSync(APP, 'utf8'), ctx, { filename: APP });
  vm.runInContext('renderNav()', ctx);
  return [...nav.innerHTML.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
}

/** O que o balconista precisa para trabalhar — e nada além. */
const DO_OPERADOR = [
  'dashboard.html', 'pedidos.html', 'pdv.html', 'caixa.html', 'kds.html',
  'canais.html', 'entregas.html', 'cardapio-qr.html', 'ajuda.html',
];

test('o OPERADOR nao ve Usuarios — era o defeito relatado', () => {
  assert.ok(!menuDe('OPERADOR').includes('usuarios.html'));
});

test('o OPERADOR ve exatamente o que usa no balcao', () => {
  assert.deepEqual(menuDe('OPERADOR').sort(), [...DO_OPERADOR].sort());
});

test('o OPERADOR nao ve numero de dono (faturamento, margem, lucro)', () => {
  const m = menuDe('OPERADOR');
  for (const tela of ['relatorios.html', 'desempenho.html', 'rede.html', 'planos.html']) {
    assert.ok(!m.includes(tela), tela + ' mostra resultado financeiro: RelatorioService exige GERENTE+');
  }
});

test('o OPERADOR nao ve Configuracoes — e a troca de senha mudou de lugar', () => {
  // Configuracoes mexe no nome, nas cores, no cashback e no custo fixo da loja, e
  // ConfiguracaoLojaService.atualizar exige ADMINISTRADOR_LOJA.
  //
  // Antes isto ficava a vista para todos porque era o unico lugar de trocar a propria senha. Deixou
  // de ser: a tela de login ganhou "Trocar minha senha", que exige a senha atual. Se este teste
  // voltar a falhar porque alguem devolveu Configuracoes ao operador, conferir ANTES se a troca de
  // senha no login continua de pe -- senao o operador fica sem nenhum caminho.
  assert.ok(!menuDe('OPERADOR').includes('configuracoes.html'));
  assert.ok(!menuDe('GERENTE').includes('configuracoes.html'));
  assert.ok(menuDe('ADMINISTRADOR_LOJA').includes('configuracoes.html'));
});

test('a tela de login tem a troca de senha, que e o caminho do operador agora', () => {
  // Sem isto, o teste de cima estaria trancando uma regressao: operador sem Configuracoes E sem
  // troca de senha no login nao consegue trocar a propria senha de jeito nenhum.
  const login = fs.readFileSync(path.join(import.meta.dirname, '..', 'login.html'), 'utf8');
  assert.ok(login.includes('id="formTroca"'), 'login.html perdeu o formulario de trocar senha');
  assert.ok(login.includes('id="tAtual"'), 'a troca de senha tem que exigir a senha ATUAL');
  assert.ok(login.includes("'/auth/trocar-senha'"), 'tem que chamar o endpoint que exige a senha atual');
  assert.ok(login.includes("'/auth/pedido-de-senha'"), 'quem nao sabe a senha precisa conseguir pedir ajuda');
});

test('o OPERADOR continua com PDV e Entregas: a API nao bloqueia o que essas telas fazem', () => {
  const m = menuDe('OPERADOR');
  // ProdutoService.listar() e EntregadorService.listar() nao tem requirePapel — so criar/editar tem.
  assert.ok(m.includes('pdv.html'), 'sem PDV a loja nao vende');
  assert.ok(m.includes('entregas.html'), 'sem Entregas ninguem despacha o motoboy');
});

test('o GERENTE ve cadastro e relatorio, mas nao Usuarios nem Planos', () => {
  const m = menuDe('GERENTE');
  for (const tela of ['produtos.html', 'estoque.html', 'relatorios.html', 'clientes.html', 'integracoes.html']) {
    assert.ok(m.includes(tela), 'GERENTE deveria ver ' + tela);
  }
  assert.ok(!m.includes('usuarios.html'), 'UsuarioService exige ADMINISTRADOR_LOJA');
  assert.ok(!m.includes('planos.html'), 'PlanoController exige ADMINISTRADOR_LOJA');
});

test('o ADMINISTRADOR_LOJA ve tudo', () => {
  const m = menuDe('ADMINISTRADOR_LOJA');
  assert.ok(m.includes('usuarios.html'));
  assert.ok(m.includes('planos.html'));
  assert.ok(m.length > menuDe('GERENTE').length);
});

test('o ADMINISTRADOR_BORA ve tudo, como o requirePapel ja faz', () => {
  // AuthContext.requirePapel devolve cedo para isAdminBora(): o menu segue a mesma regra.
  assert.deepEqual(menuDe('ADMINISTRADOR_BORA').sort(), menuDe('ADMINISTRADOR_LOJA').sort());
});

test('papel vazio ou desconhecido nao vira passe livre', () => {
  // Token velho, campo faltando, papel novo que ninguem mapeou: o menu tem que encolher, nao abrir.
  for (const p of ['', 'PAPEL_QUE_NAO_EXISTE', null, undefined]) {
    const m = menuDe(p);
    assert.ok(!m.includes('usuarios.html'), 'papel ' + p + ' nao pode ver Usuarios');
    assert.ok(!m.includes('relatorios.html'), 'papel ' + p + ' nao pode ver Relatorios');
  }
});

test('escada: cada papel ve tudo do papel de baixo', () => {
  const op = menuDe('OPERADOR'), ger = menuDe('GERENTE'), adm = menuDe('ADMINISTRADOR_LOJA');
  for (const t of op) assert.ok(ger.includes(t), 'GERENTE perdeu ' + t);
  for (const t of ger) assert.ok(adm.includes(t), 'ADMINISTRADOR_LOJA perdeu ' + t);
});

test('toda tela do menu existe como arquivo', () => {
  // Item de menu apontando para arquivo que nao existe vira 404 na cara do lojista.
  const raiz = path.join(import.meta.dirname, '..');
  for (const href of menuDe('ADMINISTRADOR_LOJA')) {
    assert.ok(fs.existsSync(path.join(raiz, href)), 'o menu aponta para ' + href + ', que nao existe');
  }
});
