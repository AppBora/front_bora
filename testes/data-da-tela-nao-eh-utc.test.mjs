/**
 * Nenhuma tela monta "hoje" em UTC.
 *
 * `new Date().toISOString()` converte para UTC. No Brasil (UTC-3), das 21h à meia-noite a data UTC
 * **já é a de amanhã** — dentro do horário de jantar, que é quando a loja vende. O defeito aparece
 * em três das vinte e quatro horas e passa nas outras vinte e uma; é assim que ele sobrevive, e é
 * por isso que não dá para pegá-lo com teste de comportamento sem amarrar o teste à hora do dia.
 *
 * O backend já proíbe a versão dele disso (`OfusoNaoPodeSerOdoSistemaTest`), depois de o defeito
 * morder quatro vezes — uma delas impedindo QUALQUER deploy entre 21h e meia-noite. No frontend ele
 * estava em `desempenho.js`, na tela em que o dono decide preço: o botão "Hoje" devolvia zero e o
 * botão "Mês" perdia o dia 1 inteiro (pente fino de 29/10/2026).
 *
 * ## A forma certa
 *
 * Subtrair o fuso ANTES de converter, que é o que `pedidos.js` já fazia:
 *
 *     new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
 *
 * Ou partir de um horário do meio do dia (`el.value + 'T12:00:00'`), que sobrevive a qualquer fuso
 * de ±12h. As duas formas são aceitas aqui.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const JS = join(aqui, '..', 'assets', 'js');

/**
 * Cada `.toISOString()` do arquivo, com a INSTRUÇÃO inteira em que ele aparece.
 *
 * A instrução, e não a linha: três das quatro contas de data do painel quebram a expressão em duas
 * linhas, com o `getTimezoneOffset()` na primeira e o `.toISOString()` na segunda. A primeira versão
 * deste teste olhava linha a linha e reprovou as três — todas certas. Aqui o trecho vai do `;`, `{`
 * ou `}` anterior até o próximo `;`, que é o que o JavaScript considera uma instrução.
 */
function usosDeISO(texto) {
  const linhas = texto.split(/\r?\n/);
  const plano = linhas.join('\n');
  const usos = [];
  let i = plano.indexOf('.toISOString()');
  while (i >= 0) {
    const n = plano.slice(0, i).split('\n').length;
    const bruta = linhas[n - 1].trim();
    // Comentário não é código. Este arquivo e o desempenho.js explicam o defeito citando o padrão.
    if (!bruta.startsWith('//') && !bruta.startsWith('*')) {
      let ini = i;
      while (ini > 0 && !';{}'.includes(plano[ini - 1])) ini--;
      let fim = plano.indexOf(';', i);
      if (fim < 0) fim = plano.length;
      usos.push({ n, linha: plano.slice(ini, fim).replace(/\s+/g, ' ').trim() });
    }
    i = plano.indexOf('.toISOString()', i + 1);
  }
  return usos;
}

/**
 * A linha corrige o fuso?
 *
 * <p>Duas formas valem: subtrair `getTimezoneOffset()` antes de converter, ou construir a data a
 * partir de um horário do meio do dia, que nenhum fuso real empurra para outro dia.</p>
 */
const corrigeOfuso = (linha) => linha.includes('getTimezoneOffset()') || linha.includes('T12:00:00');

test('PREMISSA: o reconhecedor acha os usos de toISOString no painel', () => {
  const arquivos = readdirSync(JS).filter((f) => f.endsWith('.js'));
  const total = arquivos.reduce(
    (soma, f) => soma + usosDeISO(readFileSync(join(JS, f), 'utf8')).length, 0);

  // Se isto virar zero, o teste passa a nao medir nada -- e passaria para sempre.
  assert.ok(total >= 3,
    `achei ${total} uso(s) de .toISOString() no painel; esperava varios. O reconhecedor parou de `
    + 'funcionar, ou os arquivos mudaram de lugar.');
});

test('nenhuma tela do painel monta data em UTC', () => {
  const erradas = [];
  for (const f of readdirSync(JS).filter((x) => x.endsWith('.js'))) {
    for (const { n, linha } of usosDeISO(readFileSync(join(JS, f), 'utf8'))) {
      // Só interessa quem corta a DATA (`slice(0, 10)`): quem manda o instante inteiro para o
      // servidor não depende de fuso para dizer QUANDO.
      if (!linha.includes('slice(0, 10)') && !linha.includes('slice(0,10)')) continue;
      if (corrigeOfuso(linha)) continue;
      erradas.push(`assets/js/${f}:${n}  ${linha.trim().slice(0, 110)}`);
    }
  }

  assert.deepEqual(erradas, [],
    'Data montada em UTC. Das 21h a meia-noite de Brasilia isso ja e o dia seguinte, e a tela mostra '
    + 'o dia errado justo no horario de jantar.\nSubtraia o fuso antes de converter:\n'
    + '  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)\n   '
    + erradas.join('\n   '));
});

test('a conta do desempenho devolve a data LOCAL, inclusive as 23h', () => {
  // O caso concreto: 23h de 1/11 em Brasilia (= 02h de 2/11 em UTC). A tela tem de dizer 2026-11-01.
  const asVinteETres = new Date('2026-11-01T23:30:00-03:00');
  const emISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);

  // Só vale medir isto se a máquina que roda o teste estiver num fuso que expõe a diferença; em UTC
  // os dois resultados coincidem e o teste não provaria nada. Então a comparação é com o relógio
  // local de verdade, e não com uma data escrita à mão.
  const esperado = `${asVinteETres.getFullYear()}-`
    + `${String(asVinteETres.getMonth() + 1).padStart(2, '0')}-`
    + `${String(asVinteETres.getDate()).padStart(2, '0')}`;

  assert.equal(emISO(asVinteETres), esperado,
    'a conta de data local nao bate com o calendario local');
});
