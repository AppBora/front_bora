// #25: funções prontas no servidor que NENHUMA tela alcançava.
//
// O conferidor do roteiro (`roteiro-de-teste/conferir.py`) apontava três endpoints que existem,
// têm teste, e nenhuma tela chama. Não é defeito de código — é trabalho feito que não chega a
// ninguém, e que por isso vira chamado de suporte ou consulta no banco.
//
// Dois foram ligados aqui. O terceiro (`POST /api/fiscal/nfce/{pedidoId}`) continua sem tela de
// propósito: depende de o módulo fiscal ser LIGADO e de a chave da Focus ser configurada — ligar
// um botão que só sabe dar erro seria pior que não ter botão.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// ================================================================= o atalho do api.js
test('PREMISSA: o api.js sabe chamar os dois endpoints', () => {
  const js = ler('assets/js/api.js');
  assert.match(js, /\/api\/integracoes\/' \+ encodeURIComponent\(canal\) \+ '\/diagnostico/,
    'o diagnóstico perdeu o atalho');
  assert.match(js, /\/admin-bora\/marketplace\/pedido-bruto/,
    'o pedido bruto perdeu o atalho');
});

test('os parametros vao escapados na URL', () => {
  // Código de pedido do iFood tem hífen e pode ter qualquer coisa; sem escapar, um "&" no meio
  // quebraria a consulta e o suporte veria o pedido errado — ou nenhum.
  const js = ler('assets/js/api.js');
  const fn = js.match(/pedidoBrutoDoMarketplace\(lojaId, canal, pedido\) \{([\s\S]*?)\n  \}/);
  assert.ok(fn, 'não achei o pedidoBrutoDoMarketplace');
  assert.equal((fn[1].match(/encodeURIComponent/g) || []).length, 3,
    'os três parâmetros precisam ir escapados');
});

// ================================================================= o diagnóstico
function montarIntegracoes({ diagnostico, falha = null } = {}) {
  const Bora = {
    requireAuth: () => true,
    user: () => ({ lojaId: 18, papel: 'ADMINISTRADOR_LOJA' }),
    api: async () => [],
    integracoes: async () => [],
    diagnosticoDoCanal: async () => {
      if (falha) throw new Error(falha);
      return diagnostico;
    },
  };
  const janela = {};
  const t = subir(RAIZ + '/assets/js/integracoes.js', {
    Bora, globais: { window: janela, alert: () => {}, confirm: () => true },
  });
  return { ...t, janela };
}

const assentar = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

const DIAG = {
  canal: 'IFOOD', label: 'iFood', integracaoOficial: true, appDaPlataformaConfigurado: true,
  merchantId: 'abc-123', status: 'CONECTADO', ativo: true,
  ultimoPollingEm: '2026-10-24T13:00:00Z', ultimaSync: '2026-10-24T12:59:00Z',
  pedidosRecebidos: 42, ultimoErro: null, tokenExpiraEm: '2026-11-24T00:00:00Z',
  onlineNoMarketplace: true,
};

test('PREMISSA: o diagnostico desenha o que o servidor respondeu', async () => {
  const t = montarIntegracoes({ diagnostico: DIAG });
  await t.carregarPagina(); await assentar();

  await t.janela.__diagnosticar('IFOOD');
  await assentar();

  const cx = t.get('diag-IFOOD');
  assert.equal(cx.hidden, false, 'a caixa do diagnóstico ficou escondida');
  assert.match(cx.innerHTML, /iFood/);
  assert.match(cx.innerHTML, /abc-123/, 'não mostrou o código da loja no marketplace');
  assert.match(cx.innerHTML, /42/, 'não mostrou quantos pedidos entraram');
  assert.match(cx.innerHTML, /Nenhum erro registrado/);
});

test('PREMISSA: quando ha erro, ele aparece em destaque', async () => {
  // É a razão de o botão existir: o lojista vê "0 pedidos" e precisa saber POR QUE.
  const t = montarIntegracoes({ diagnostico: { ...DIAG, ultimoErro: 'token expirado', onlineNoMarketplace: false } });
  await t.carregarPagina(); await assentar();
  await t.janela.__diagnosticar('IFOOD');
  await assentar();

  const cx = t.get('diag-IFOOD');
  assert.match(cx.innerHTML, /[ÚU]ltimo erro/i);
  assert.match(cx.innerHTML, /token expirado/);
  assert.match(cx.innerHTML, /🔴/, 'o "recebendo agora" precisa mostrar que está parado');
});

test('merchantId vazio diz o que isso causa, em vez de um traco mudo', async () => {
  const t = montarIntegracoes({ diagnostico: { ...DIAG, merchantId: null } });
  await t.carregarPagina(); await assentar();
  await t.janela.__diagnosticar('IFOOD');
  await assentar();

  assert.match(t.get('diag-IFOOD').innerHTML, /nenhum pedido casa com esta loja/i);
});

test('se a chamada falhar, a tela diz — e nao fica em "Perguntando…"', async () => {
  const t = montarIntegracoes({ falha: 'esta loja não tem integração com IFOOD' });
  await t.carregarPagina(); await assentar();
  await t.janela.__diagnosticar('IFOOD');
  await assentar();

  const cx = t.get('diag-IFOOD');
  assert.ok(!/Perguntando/.test(cx.innerHTML), 'ficou pendurado no "Perguntando…"');
  assert.match(cx.innerHTML, /não tem integração/i);
});

test('o botao existe na tela, para o diagnostico nao virar funcao orfa de novo', () => {
  const js = ler('assets/js/integracoes.js');
  assert.match(js, /__diagnosticar\('\$\{i\.canal\}'\)/,
    'o botão sumiu do cartão: o endpoint volta a ser inalcançável');
});

// ================================================================= o pedido bruto
test('PREMISSA: a tela do pedido bruto existe e vive na area da plataforma', () => {
  const h = ler('configuracoes.html');
  const i = h.indexOf('id="cardPlataforma"');
  const j = h.indexOf('id="secPedidoBruto"');
  assert.ok(i >= 0 && j > i,
    'o pedido bruto precisa estar DENTRO do card da Plataforma: ele é ferramenta de suporte');
  for (const campo of ['pbLoja', 'pbCanal', 'pbPedido', 'pbBuscar', 'pbSaida']) {
    assert.ok(h.includes('id="' + campo + '"'), 'faltou o campo ' + campo);
  }
});

test('a tela avisa que a consulta fica registrada', () => {
  // O servidor grava linha de auditoria com quem consultou. Esconder isso de quem usa seria
  // desonesto — e é justamente o tipo de coisa que alguém só descobre quando é cobrado.
  const h = ler('configuracoes.html');
  assert.match(h, /registrado quem consultou/i);
});

test('sem loja ou sem pedido, nao chama o servidor', () => {
  const h = ler('configuracoes.html');
  const fn = h.match(/botao\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n  \}\);/);
  assert.ok(fn, 'não achei a fiação do botão');
  assert.match(fn[1], /if \(!loja \|\| !pedido\)/,
    'sem os dois campos a consulta não tem como dar certo — e o erro voltaria em inglês do servidor');
});
