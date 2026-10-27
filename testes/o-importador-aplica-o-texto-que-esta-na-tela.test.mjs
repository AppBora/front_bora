// Os dois importadores em lote aplicavam o TEXTO ANTERIOR. Achado pelo QA em 26/10/2026.
//
// O fluxo é: colar a lista → "Conferir" (interpreta e mostra a prévia) → "Importar". O botão de
// importar fazia `if (!lote.length) conferir()` — só reinterpretava quando a lista estava vazia.
//
// Então: o lojista cola a lista A, clica em Conferir, vê um erro, apaga tudo, cola a lista B e clica
// direto em Importar. O `lote` ainda é o A, e **a lista A é aplicada**. A prévia na tela também era a
// de A, então nada denunciava — ele confirma olhando para um resumo do texto que já apagou.
//
// No importador de PRODUTOS isso grava PREÇO no catálogo. No de insumos, cadastra insumo que ele não
// pediu. Os dois tinham o mesmo `if`.
//
// Dois consertos: interpretar SEMPRE o texto que está na caixa, e invalidar a prévia quando o texto
// muda — prévia de um texto que não está mais lá é pior que prévia nenhuma.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { subir, helpersDoApp } from './harness.mjs';

const JS = p => path.join(import.meta.dirname, '..', 'assets', 'js', p);

const LISTA_A = 'Açaí 500ml;Açaí;25,00';
const LISTA_B = 'Açaí 500ml;Açaí;31,00';

/** Sobe a tela de Produtos com o catálogo vazio e registra o que foi gravado. */
async function telaDeProdutos() {
  const gravados = [];
  const app = subir(JS('produtos.js'), {
    Bora: {
      requireAuth: () => true,
      user: () => ({ papel: 'ADMINISTRADOR_LOJA' }),
      produtos: async () => [],
      categorias: async () => [],
      complementos: async () => [],
      api: async (url, opt) => {
        if (opt && opt.method && opt.method !== 'GET') {
          gravados.push({ url, method: opt.method, corpo: JSON.parse(opt.body) });
          return {};
        }
        return [];
      },
      repetir: () => {},
      _conexao() {},
      logout() {},
    },
    globais: {
      ...helpersDoApp(),
      boraToast() {},
      confirm: () => true,
      alert() {},
      setInterval: () => 0, clearInterval: () => {},
    },
    comSeletores: true,
  });
  await app.carregarPagina();
  return { app, gravados };
}

const esperar = () => new Promise(r => setImmediate(r));

// ---------------------------------------------------------------- a premissa
test('PREMISSA: Conferir interpreta o texto e Importar grava o que foi conferido', async () => {
  // Sem isto, um importador que não grava nada faria todo assert abaixo passar vazio.
  const { app, gravados } = await telaDeProdutos();
  app.get('impTexto').value = LISTA_A;
  app.get('impConferir').onclick();
  assert.match(app.get('impPreview').innerHTML, /1 a criar/, 'a prévia não saiu');

  await app.get('impCriar').onclick();
  await esperar();

  assert.equal(gravados.length, 1, 'não gravou nada: este teste mediria nada');
  assert.equal(gravados[0].corpo.preco, 25, 'gravou outro preço: ' + JSON.stringify(gravados[0]));
});

// ---------------------------------------------------------------- o defeito
test('trocar o texto depois de Conferir aplica o texto NOVO', async () => {
  const { app, gravados } = await telaDeProdutos();
  const txt = app.get('impTexto');

  txt.value = LISTA_A;
  app.get('impConferir').onclick();      // confere a lista A
  txt.value = LISTA_B;                   // e troca o texto
  await txt.__disparar('input');

  await app.get('impCriar').onclick();
  await esperar();

  assert.equal(gravados.length, 1);
  assert.equal(gravados[0].corpo.preco, 31,
    'gravou R$ ' + gravados[0].corpo.preco + ': aplicou a lista ANTERIOR, e no catálogo isso é '
    + 'preço errado em produto de verdade');
});

test('trocar o texto SEM disparar o input também aplica o texto novo', async () => {
  // A trava não pode depender só do ouvinte: colar por menu de contexto, arrastar texto ou um
  // preenchimento automático do navegador podem não disparar `input`. Interpretar sempre cobre isso.
  const { app, gravados } = await telaDeProdutos();
  const txt = app.get('impTexto');

  txt.value = LISTA_A;
  app.get('impConferir').onclick();
  txt.value = LISTA_B;                   // nenhum evento

  await app.get('impCriar').onclick();
  await esperar();

  assert.equal(gravados[0].corpo.preco, 31, 'gravou ' + gravados[0].corpo.preco);
});

// ---------------------------------------------------------------- a prévia não fica mentindo
test('mexer no texto APAGA a prévia', async () => {
  // É olhando a prévia que ele confirma. Prévia de um texto que já não está na caixa é pior que
  // prévia nenhuma.
  const { app } = await telaDeProdutos();
  const txt = app.get('impTexto');

  txt.value = LISTA_A;
  app.get('impConferir').onclick();
  assert.match(app.get('impPreview').innerHTML, /a criar/);

  txt.value = LISTA_B;
  await txt.__disparar('input');

  assert.equal(app.get('impPreview').innerHTML, '', 'a prévia do texto antigo ficou na tela');
  assert.equal(app.get('impPreview').style.display, 'none');
});

// ---------------------------------------------------------------- o que continua valendo
test('colar e clicar direto em Importar continua funcionando', async () => {
  // Era outro defeito, já consertado: o botão morria calado. Travando junto para eu não ter
  // desfeito.
  const { app, gravados } = await telaDeProdutos();
  app.get('impTexto').value = LISTA_A;

  await app.get('impCriar').onclick();
  await esperar();

  assert.equal(gravados.length, 1, 'o botão voltou a morrer calado sem o Conferir');
});

test('caixa vazia não grava nada e diz por quê', async () => {
  const { app, gravados } = await telaDeProdutos();
  app.get('impTexto').value = '';

  await app.get('impCriar').onclick();
  await esperar();

  assert.equal(gravados.length, 0);
  assert.match(app.get('impMsg').textContent, /Cole a lista/, 'msg: ' + app.get('impMsg').textContent);
});

// ---------------------------------------------------------------- os dois importadores
test('os DOIS importadores interpretam sempre, e nenhum volta ao `if (!lote.length)`', async () => {
  // O mesmo `if` estava nos dois arquivos. É uma linha que volta fácil, e no de produtos ela grava
  // preço.
  const fs = await import('node:fs');
  for (const arquivo of ['produtos.js', 'importar-insumos.js']) {
    const fonte = fs.readFileSync(JS(arquivo), 'utf8');
    const codigo = fonte.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/if \(!lote\.length\)/.test(codigo),
      arquivo + ' voltou a só reinterpretar quando a lista está vazia: aplica o texto anterior');
  }
});

test('o importador de INSUMOS também invalida a prévia quando o texto muda', async () => {
  const fs = await import('node:fs');
  const fonte = fs.readFileSync(JS('importar-insumos.js'), 'utf8');
  const codigo = fonte.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.match(codigo, /\$\('insImpTexto'\)\.addEventListener\('input'/,
    'o importador de insumos não invalida a prévia');
  assert.match(codigo, /lote = \[\];/, 'o ouvinte não limpa o lote');
});
