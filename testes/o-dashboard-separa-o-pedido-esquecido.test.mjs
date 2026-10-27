// O bloco de operação do Dashboard contava desde que a loja abriu. Achado pelo QA em 26/10/2026, e
// **está acontecendo**.
//
// "Na cozinha" e "Saiu p/ entrega" vêm de `count` por status, sem janela de dia nenhuma: pedido que o
// lojista esqueceu de avançar soma ali para sempre. O bloco que deveria dizer "o que está acontecendo
// agora" passa a dizer "o que já passou e ninguém fechou".
//
// MEDIDO NA PRODUÇÃO em 27/10/2026, somente leitura: os QUATRO pedidos abertos do sistema inteiro são
// de dias anteriores — a loja 1 tem um em SAIU_PARA_ENTREGA desde **19/09**, 38 dias. O painel dela
// diz "Saiu p/ entrega: 1" todo dia por causa dele.
//
// A escolha foi AVISAR, não esconder: filtrar o antigo fora trocaria um número inflado por um que
// mente para baixo, e o pedido esquecido deixaria de ter qualquer lugar onde aparecer — RECEBIDO,
// CONFIRMADO e PRONTO não têm mosaico próprio. O número continua inteiro e ganha, ao lado, quantos
// são de dias anteriores e o que fazer.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { subir, helpersDoApp } from './harness.mjs';

const ARQUIVO = path.join(import.meta.dirname, '..', 'assets', 'js', 'dashboard.js');

const HOJE = new Date();
const iso = d => d.toISOString();

function pedido(id, status, quandoDias = 0) {
  const d = new Date(HOJE.getTime() - quandoDias * 86400000);
  return {
    id, codigo: 'P' + id, status, origem: 'CARDAPIO', valorTotal: 50,
    clienteNome: 'Ana', criadoEm: iso(d), aguardandoPagamento: false,
  };
}

async function painel({ board = [], resumo = {} } = {}) {
  const app = subir(ARQUIVO, {
    Bora: {
      requireAuth: () => true,
      user: () => ({ papel: 'ADMINISTRADOR_LOJA' }),
      board: async () => board,
      resumo: async () => ({
        emPreparo: 0, emPreparoDeOutrosDias: 0, saiuParaEntrega: 0,
        saiuParaEntregaDeOutrosDias: 0, entreguesUltimaHora: 0, abertosDeOutrosDias: 0,
        ...resumo,
      }),
      api: async () => ({}),
      repetir: (fn) => { app.__tick = fn; },
      // O dublê tem de ter TODAS as funções que a tela usa. Faltava `statusLabel`, e o erro aparecia
      // como "a tela não escreveu o número" -- que é um defeito que não existe. Já custou tempo neste
      // projeto o bastante para estar escrito aqui.
      statusLabel: (st) => st,
      termometro: async () => ({ faixa: 'SEM_DADOS', recomendacao: '' }),
      criarPromocao: async () => ({}),
      _conexao() {},
      logout() {},
    },
    globais: { ...helpersDoApp(), boraToast() {}, boraCanal: () => ({ ic: '', key: 'Cardápio', cor: '#000' }) },
    comSeletores: true,
  });
  await app.carregarPagina();
  return app;
}

// ---------------------------------------------------------------- a premissa
test('PREMISSA: o painel escreve os números do bloco de operação', async () => {
  // Sem isto, um painel que não desenha nada faria todo assert abaixo passar vazio.
  const app = await painel({ resumo: { emPreparo: 3, saiuParaEntrega: 2, entreguesUltimaHora: 7 } });
  assert.equal(String(app.get('opPreparo').textContent), '3');
  assert.equal(String(app.get('opSaiu').textContent), '2');
  assert.equal(String(app.get('opHora').textContent), '7');
});

// ---------------------------------------------------------------- o aviso
test('o painel AVISA quando parte dos abertos é de dias anteriores', async () => {
  const app = await painel({
    resumo: { emPreparo: 1, saiuParaEntrega: 1, abertosDeOutrosDias: 4 },
  });
  const aviso = app.get('opEsquecidos').innerHTML;
  assert.match(aviso, /4 pedido\(s\) aberto\(s\) de dias anteriores/, 'aviso: ' + aviso);
  assert.match(aviso, /contam nestes números/,
    'tem de dizer que eles estão DENTRO dos números do mosaico, senão o lojista não liga uma coisa '
    + 'na outra');
});

test('o aviso diz o que fazer, e leva para o quadro', async () => {
  // Aviso que não diz o caminho é só mais um número na tela.
  const app = await painel({ resumo: { abertosDeOutrosDias: 1 } });
  const aviso = app.get('opEsquecidos').innerHTML;
  assert.match(aviso, /pedidos\.html/, 'o aviso não leva para o quadro');
  assert.match(aviso, /finalize ou cancele/, 'o aviso não diz o que fazer');
});

test('sem pedido antigo, NENHUM aviso', async () => {
  // Aviso que aparece sempre vira ruído e o lojista para de ler.
  const app = await painel({ resumo: { emPreparo: 2, abertosDeOutrosDias: 0 } });
  assert.equal(app.get('opEsquecidos').innerHTML, '');
});

test('API velha, sem o campo novo, não escreve aviso nem quebra', async () => {
  // Durante o deploy a tela nova conversa com a API anterior por alguns segundos.
  const app = await painel({ resumo: { emPreparo: 2, abertosDeOutrosDias: undefined } });
  assert.equal(app.get('opEsquecidos').innerHTML, '');
  assert.equal(String(app.get('opPreparo').textContent), '2', 'o resto da tela tem de continuar de pé');
});

// ---------------------------------------------------------------- o número NÃO é escondido
test('o número do mosaico continua sendo o total de abertos', async () => {
  // O pedido antigo está aberto de verdade e precisa de ação. Esconder trocaria um número inflado
  // por um que mente para baixo.
  const app = await painel({
    resumo: { emPreparo: 3, emPreparoDeOutrosDias: 2, saiuParaEntrega: 1, saiuParaEntregaDeOutrosDias: 1,
      abertosDeOutrosDias: 3 },
  });
  assert.equal(String(app.get('opPreparo').textContent), '3', 'o mosaico passou a esconder o antigo');
  assert.equal(String(app.get('opSaiu').textContent), '1');
});

// ---------------------------------------------------------------- o resto da tela não mudou
test('os números DE HOJE continuam filtrando por hoje', async () => {
  // O bloco de vendas sempre filtrou por data no cliente; isto trava que continua assim, porque o
  // `board` traz os abertos de qualquer dia junto.
  const app = await painel({
    board: [pedido(1, 'ENTREGUE', 0), pedido(2, 'ENTREGUE', 5), pedido(3, 'SAIU_PARA_ENTREGA', 38)],
    resumo: { saiuParaEntrega: 1, abertosDeOutrosDias: 1 },
  });
  // R$ 50 de UMA venda de hoje -- as de 5 e 38 dias atrás não entram.
  assert.match(app.get('kFat').textContent, /50/, 'faturamento: ' + app.get('kFat').textContent);
});
