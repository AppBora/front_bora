// A falha da API tem de chegar na faixa de "sem conexão". Achado pelo QA em 26/10/2026.
//
// O `Bora.repetir` é o lugar ÚNICO que mostra a faixa, e o comentário dele em `api.js` afirma cobrir
// "Pedidos, Dashboard, Entregas e Caixa". **Não cobria.** Quatro telas que recarregam sozinhas
// tratavam o erro por dentro e não relançavam:
//
//   - `caixa.js`      — escrevia "Erro:" no subtítulo e deixava os TOTAIS ANTIGOS na tela. É a tela
//                       de fechar o caixa: o lojista fecha contra números que já não são os de agora.
//   - `entregas.js`   — pintava o erro no painel de rotas.
//   - `canais.js`     — pintava o erro na tabela.
//   - `entregadores.js` — `carregar().catch(() => {})`, um catch VAZIO: silêncio completo.
//
// E engolir não é só "não aparece a faixa": o `repetir` chama `_conexao(true)` quando a tarefa não
// lança, e o `_conexao(true)` **REMOVE** a faixa e zera o contador de falhas. Ou seja, uma tela que
// engole apaga ativamente o aviso que outra tela colocou.
//
// Este arquivo roda cada tela de verdade, faz a API falhar, e mede o que o `repetir` recebeu.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { subir, helpersDoApp } from './harness.mjs';

const JS = p => path.join(import.meta.dirname, '..', 'assets', 'js', p);

/**
 * Sobe uma tela com a API QUEBRADA e devolve o que o `Bora.repetir` recebeu.
 *
 * O dublê do `repetir` guarda a tarefa em vez de rodar num intervalo. O teste então a executa e
 * observa se a promessa foi rejeitada — que é exatamente o que o `repetir` de verdade observa para
 * decidir entre `_conexao(true)` e `_conexao(false)`.
 */
async function telaComApiQuebrada(arquivo, extraBora = {}) {
  const erro = new Error('Falha de rede');
  let tarefa = null;
  const app = subir(JS(arquivo), {
    Bora: {
      requireAuth: () => true,
      user: () => ({ papel: 'ADMINISTRADOR_LOJA' }),
      board: async () => { throw erro; },
      resumo: async () => { throw erro; },
      entregadores: async () => { throw erro; },
      caixa: async () => { throw erro; },
      api: async () => { throw erro; },
      statusLabel: s => s,
      termometro: async () => { throw erro; },
      mudarStatus: async () => { throw erro; },
      repetir: (fn) => { tarefa = fn; },
      _conexao() {},
      logout() {},
    },
    globais: { ...helpersDoApp(), boraToast() {}, boraBeep() {}, boraPrintComanda() {},
      boraCanal: () => ({ ic: '', key: 'Cardápio', cor: '#000' }),
      // Algumas destas telas abrem o seu próprio `setInterval` (o cronômetro do KDS, por exemplo).
      // Sem anular aqui, o processo do `node --test` não encerra e o ARQUIVO aparece como falho
      // mesmo com todos os testes verdes — foi o que aconteceu na primeira execução. O intervalo
      // próprio da tela não é objeto deste teste.
      setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, clearTimeout: () => {} },
    comSeletores: true,
  });
  await app.carregarPagina();

  assert.ok(tarefa, arquivo + ' não registrou tarefa no Bora.repetir: este teste mediria nada');
  let subiu = false;
  try { await tarefa(); } catch (e) { subiu = true; }
  return { app, subiu };
}

// ---------------------------------------------------------------- a premissa
test('PREMISSA: o KDS já fazia certo — a falha SOBE para o repetir', async () => {
  // O padrão da casa, e a prova de que este teste sabe distinguir quem sobe de quem engole.
  const { subiu } = await telaComApiQuebrada('kds.js');
  assert.equal(subiu, true, 'o KDS parou de relançar: a cozinha volta a não saber que a API caiu');
});

// ---------------------------------------------------------------- as quatro telas
for (const [arquivo, oQueEra] of [
  ['caixa.js', 'escrevia "Erro:" no subtítulo e deixava os totais antigos na tela'],
  ['entregas.js', 'pintava o erro no painel de rotas'],
  ['canais.js', 'pintava o erro na tabela'],
  ['entregadores.js', 'tinha um catch VAZIO'],
]) {
  test(`${arquivo}: a falha da API SOBE para o repetir`, async () => {
    const { subiu } = await telaComApiQuebrada(arquivo);
    assert.equal(subiu, true,
      `${arquivo} engoliu a falha (antes: ${oQueEra}). Com isso o repetir chama _conexao(true), a `
      + 'faixa de "sem conexão" nunca aparece e, se outra tela a tinha posto, ela é REMOVIDA');
  });
}

// ---------------------------------------------------------------- e o aviso local continua
test('o Caixa avisa, no subtítulo, que os números podem estar velhos', async () => {
  // Relançar não pode ter tirado o aviso de perto do número. Nesta tela o estrago é fechar o caixa
  // contra total que não é mais o de agora, então o aviso tem de dizer isso com estas palavras.
  const { app } = await telaComApiQuebrada('caixa.js');
  const sub = app.get('sub').textContent;
  assert.match(sub, /Erro ao atualizar/, 'subtítulo: ' + sub);
  assert.match(sub, /podem estar velhos/,
    'tem de dizer que os números na tela não são de agora, senão o lojista fecha o caixa contra eles');
});

test('Entregas continua pintando o erro no painel de rotas', async () => {
  const { app } = await telaComApiQuebrada('entregas.js');
  assert.match(app.get('rotas').innerHTML, /Falha de rede/);
});

test('Canais continua pintando o erro na tabela', async () => {
  const { app } = await telaComApiQuebrada('canais.js');
  assert.match(app.get('rank').innerHTML, /Falha de rede/);
});

// ---------------------------------------------------------------- a trava contra o catch vazio
test('nenhuma tela de polling passa um catch VAZIO para o Bora.repetir', async () => {
  // O `entregadores.js` tinha `carregar().catch(() => {})` dentro do próprio `repetir`. É uma linha
  // que some na revisão e apaga o único aviso de API fora do ar — em TODAS as telas, porque o
  // _conexao(true) remove a faixa que outra tela pôs.
  const fs = await import('node:fs');
  const dir = path.join(import.meta.dirname, '..', 'assets', 'js');
  const suspeitos = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const fonte = fs.readFileSync(path.join(dir, f), 'utf8');
    // Só dentro da chamada ao repetir: catch vazio em outro lugar pode ser legítimo.
    const i = fonte.indexOf('Bora.repetir(');
    if (i < 0) continue;
    const trecho = fonte.slice(i, i + 200);
    if (/catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(trecho.replace(/\s+/g, ''))
        || /\.catch\(\(\)=>\{\}\)/.test(trecho.replace(/\s+/g, ''))) {
      suspeitos.push(f);
    }
  }
  assert.deepEqual(suspeitos, [],
    'estas telas engolem a falha antes do Bora.repetir: ' + suspeitos.join(', '));
});
