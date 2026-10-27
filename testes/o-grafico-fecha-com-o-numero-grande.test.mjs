// O gráfico "Vendas por dia" tem de fechar com o faturamento do cabeçalho, e a margem tem de dizer
// quando está incompleta. Dois defeitos achados pelo QA em 26/10/2026, nos dois lados.
//
// NO SERVIÇO (consertado no backend, e medido lá):
//   1. o corte da janela era no INSTANTE (`now().minusDays(30)`) e as barras são por DATA de São
//      Paulo: a venda entre o corte e a meia-noite seguinte entrava no faturamento e não tinha barra;
//   2. a série era cortada em 30 dias enquanto o faturamento somava a janela inteira — e a tela
//      oferece o botão de 90 dias. O cabeçalho dizia 90 e o gráfico mostrava 30, calado.
//
// NA TELA (o que este arquivo mede):
//   3. com os 90 dias vindo do serviço, 90 barras com legenda "dia do mês" repetiriam 1..31 três
//      vezes. O agrupamento por semana é desta camada, e a soma das barras tem de continuar sendo o
//      faturamento;
//   4. item sem custo cadastrado entra no CMV como ZERO. O CMV sai menor do que o real e a margem
//      maior, e a tela não dizia nada. Medido na produção em 26/10/2026: 26 dos 48 itens de pedido
//      estão sem custo unitário.
//
// Isto roda a tela de verdade pelo harness e lê o que ela escreveu — não é regex em cima do fonte.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { subir } from './harness.mjs';

const ARQUIVO = path.join(import.meta.dirname, '..', 'assets', 'js', 'relatorios.js');

/** Uma série diária de `n` dias terminando hoje, cada dia com `porDia` de faturamento. */
function serie(n, porDia) {
  const fora = {};
  const hoje = new Date('2026-10-26T12:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 86400000);
    fora[d.toISOString().slice(0, 10)] = porDia;
  }
  return fora;
}

function relatorio(extra = {}) {
  const porDia = extra.porDia || serie(30, 100);
  const soma = Object.values(porDia).reduce((t, v) => t + Number(v), 0);
  return {
    loja: 'Zirá Centro', dias: Object.keys(porDia).length,
    de: Object.keys(porDia)[0], ate: Object.keys(porDia).at(-1),
    faturamento: soma, porDiaSoma: soma, pedidos: 10, ticketMedio: soma / 10,
    cmv: 0, margem: soma, margemPct: 100, cancelados: 0, aguardandoPagamento: 0,
    taxaDoMarketplace: 0, itensSemCusto: 0, itensVendidos: 10,
    porDia, porCanal: {}, porProduto: {}, porEntregador: {},
    ...extra, ...(extra.porDia ? { porDia } : {}),
  };
}

async function tela(rel) {
  const app = subir(ARQUIVO, {
    Bora: {
      requireAuth: () => true,
      relatorios: async () => rel,
      minhasLojas: async () => [],
      logout() {},
    },
  });
  await app.carregarPagina();
  return app;
}

/** As barras que a tela desenhou: valor lido do title, que é o que o lojista passa o mouse e lê. */
function barrasDesenhadas(app) {
  const html = app.get('bars').innerHTML;
  return [...html.matchAll(/title="([^"]+)"/g)].map(m => {
    const t = m[1];
    const valor = Number(/R\$ ([\d.,]+)/.exec(t)[1].replace(/\./g, '').replace(',', '.'));
    return { title: t, valor };
  });
}

// ---------------------------------------------------------------- a premissa
test('PREMISSA: a tela desenha uma barra por dia quando são 30 dias', async () => {
  // Sem isto, um gráfico que não desenha nada faria todo assert abaixo passar vazio.
  const app = await tela(relatorio());
  assert.equal(barrasDesenhadas(app).length, 30, 'o gráfico de 30 dias não tem 30 barras');
  assert.equal(app.get('barsNota').textContent, '', '30 dias não precisa de nota de agrupamento');
});

// ---------------------------------------------------------------- 3. o agrupamento
test('90 dias viram 13 barras de semana, e não 90 riscos', async () => {
  const app = await tela(relatorio({ porDia: serie(90, 100) }));
  const b = barrasDesenhadas(app);
  assert.equal(b.length, 13, 'esperava 13 blocos de 7 dias (90 = 12x7 + 6), e vieram ' + b.length);
});

test('a soma das barras continua sendo o faturamento, agrupadas ou não', async () => {
  for (const dias of [7, 30, 90, 365]) {
    const rel = relatorio({ porDia: serie(dias, 100) });
    const app = await tela(rel);
    const soma = barrasDesenhadas(app).reduce((t, x) => t + x.valor, 0);
    assert.equal(soma, Number(rel.faturamento),
      `com ${dias} dias o gráfico soma ${soma} e o cabeçalho diz ${rel.faturamento}`);
  }
});

test('a ÚLTIMA barra é sempre a semana que acabou de passar', async () => {
  // Contar os blocos do começo deixaria um resto de 6 dias na frente e empurraria todas as semanas:
  // a última barra viraria um pedaço de semana, e é justamente a barra que o lojista olha primeiro.
  const porDia = serie(90, 0);
  const dias = Object.keys(porDia);
  dias.slice(-7).forEach(d => { porDia[d] = 10; });   // só a última semana vendeu
  const app = await tela(relatorio({ porDia }));
  const b = barrasDesenhadas(app);

  assert.equal(b.at(-1).valor, 70, 'a última barra não é a semana cheia que acabou de passar');
  assert.equal(b.slice(0, -1).reduce((t, x) => t + x.valor, 0), 0,
    'o valor da última semana vazou para outro bloco');
});

test('a barra de semana diz o INTERVALO, e não um dia só', async () => {
  const app = await tela(relatorio({ porDia: serie(90, 100) }));
  assert.match(barrasDesenhadas(app).at(-1).title, /\d\d\/\d\d a \d\d\/\d\d — R\$/,
    'o title da barra semanal precisa dizer de quando a quando');
});

test('a legenda da barra de semana leva o MÊS', async () => {
  // Num gráfico de 90 dias, só o número do dia apareceria repetido três vezes.
  const app = await tela(relatorio({ porDia: serie(90, 100) }));
  const caps = [...app.get('bars').innerHTML.matchAll(/class="cap">([^<]+)</g)].map(m => m[1]);
  assert.ok(caps.every(c => /^\d\d\/\d\d$/.test(c)), 'legendas: ' + caps.join(' '));
  assert.equal(new Set(caps).size, caps.length, 'legenda repetida: ' + caps.join(' '));
});

test('a tela AVISA que cada barra é uma semana', async () => {
  // Sem dizer, o lojista lê o gráfico de 90 dias como se fosse diário e acha que vendeu 7x mais.
  const app = await tela(relatorio({ porDia: serie(90, 100) }));
  assert.match(app.get('barsNota').textContent, /uma semana/);
  assert.match(app.get('barsNota').textContent, /soma das barras/);
});

// ---------------------------------------------------------------- 4. a margem incompleta
test('item sem custo cadastrado APARECE junto da margem', async () => {
  const app = await tela(relatorio({ cmv: 500, margem: 2500, itensSemCusto: 26, itensVendidos: 48 }));
  const aviso = app.get('kMargemAviso').textContent;
  assert.match(aviso, /26 de 48 itens sem custo/, 'aviso: ' + JSON.stringify(aviso));
  assert.match(aviso, /margem real é menor/,
    'tem de dizer PARA QUE LADO o número está errado, senão não serve para decidir preço');
});

test('com todos os custos cadastrados, nenhum aviso', async () => {
  // Aviso que aparece sempre vira ruído e o lojista para de ler.
  const app = await tela(relatorio({ itensSemCusto: 0, itensVendidos: 48 }));
  assert.equal(app.get('kMargemAviso').textContent, '');
});

test('o número da margem continua aparecendo', async () => {
  // O aviso não substitui o número: ele é o que o lojista tem.
  const app = await tela(relatorio({ margem: 2500, margemPct: 83.3, itensSemCusto: 26 }));
  assert.match(app.get('kMargem').textContent, /R\$ 2500,00/);
  assert.match(app.get('kMargem').textContent, /83\.3%/);
});

// ---------------------------------------------------------------- o período em datas
test('o subtítulo diz as DATAS do período, não só "últimos N dias"', async () => {
  // Era a dúvida de quem comparava o gráfico com o número grande: N dias contados de quando.
  const app = await tela(relatorio({ porDia: serie(30, 100) }));
  const sub = app.get('relSub').textContent;
  assert.match(sub, /Zirá Centro/);
  assert.match(sub, /30 dias \(\d\d\/\d\d a \d\d\/\d\d\)/, 'subtítulo: ' + sub);
});

test('serviço antigo, sem as datas, não quebra a tela', async () => {
  // Durante o deploy a tela nova conversa com a API velha por alguns segundos.
  const rel = relatorio();
  delete rel.de; delete rel.ate;
  const app = await tela(rel);
  assert.match(app.get('relSub').textContent, /últimos 30 dias/);
  assert.equal(barrasDesenhadas(app).length, 30);
});

test('relatório sem item nenhum não escreve aviso nem quebra', async () => {
  const rel = relatorio({ porDia: serie(30, 0), itensSemCusto: 0, itensVendidos: 0 });
  const app = await tela(rel);
  assert.equal(app.get('kMargemAviso').textContent, '');
  assert.equal(app.get('bars').innerHTML.includes('class="b'), true, 'as barras vazias somem');
});
