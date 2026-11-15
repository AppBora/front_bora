// O aceite dos Termos passa a EXIGIR que o texto abra.
//
// Como era ate 15/11/2026: a faixa trazia um link "Ler os Termos" (outra aba) e, ao lado, um
// botao "Li e aceito os Termos". Dava para clicar em aceito sem nunca ter aberto nada -- e um
// "li e aceito" sem leitura nao prova leitura de coisa nenhuma. O dono pediu o caminho certo:
// clicar, o termo abrir ALI, e o aceite ficar no FIM do texto.
//
// O que este arquivo tranca: que o botao da faixa ABRA em vez de aceitar; que o aceite nasca
// desabilitado; que ele viva dentro da rolagem; que liberar dependa de chegar ao fim; que a
// conta do "fim" tenha folga (sem ela o botao nunca libera); que o HTML buscado passe por
// DOMParser e perca script/style/iframe; e que falha de rede NAO vire beco sem saida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const CRU = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'app.js'), 'utf8');
const CODIGO = semComentarios(CRU);

test('o botao da faixa ABRE o texto — nao aceita direto', () => {
  assert.match(CODIGO, /id="boraLerTermos"[\s\S]{0,200}Ler e aceitar os Termos/,
    'o botao tem de levar a leitura');
  assert.match(CODIGO, /querySelector\('#boraLerTermos'\)\.addEventListener\('click', abrirLeitura\)/,
    'sem isto o botao nao abre nada');
  assert.doesNotMatch(CODIGO, /faixa\([\s\S]{0,400}boraAceitarTermos[\s\S]{0,200}Li e aceito/,
    'o aceite nao pode mais morar na faixa: era ali que dava para aceitar sem ler');
});

test('o aceite nasce DESABILITADO', () => {
  assert.match(CODIGO, /b\.disabled = !liberado/,
    'botao que ja nasce clicavel transforma a janela em enfeite');
});

test('o aceite fica DENTRO da rolagem, no fim do texto', () => {
  // corpo e a area que rola; o rodape entra nela, depois do texto. Se entrasse na caixa, ficaria
  // fixo no rodape da janela e daria para clicar sem rolar nada -- o defeito de novo.
  assert.match(CODIGO, /corpo\.appendChild\(rod\)/,
    'o rodape do aceite tem de ser filho da area que rola');
});

test('liberar depende de chegar ao fim', () => {
  assert.match(CODIGO, /corpo\.addEventListener\('scroll', conferirFim\)/);
  assert.match(CODIGO, /if \(chegouAoFim\(corpo\)\)/);
});

test('texto que ja cabe na tela nao trava o lojista', () => {
  // Sem a chamada direta, um termo curto (ou uma tela grande) nunca dispararia scroll e o botao
  // ficaria desabilitado para sempre.
  assert.match(CODIGO, /corpo\.addEventListener\('scroll', conferirFim\);\s*\n\s*conferirFim\(\);/,
    'falta conferir uma vez logo depois de montar');
});

test('o HTML buscado passa por DOMParser e perde script/style/iframe', () => {
  assert.match(CODIGO, /new DOMParser\(\)\.parseFromString\(html, 'text\/html'\)/,
    'jogar a pagina inteira em innerHTML traria <script> e <link> junto');
  assert.match(CODIGO, /querySelectorAll\('script,style,link,iframe'\)/);
});

test('falha de rede nao vira beco sem saida', () => {
  // Prender o lojista fora do painel porque um fetch falhou seria pior que o problema original.
  assert.match(CODIGO, /rodape\(true, 'O texto não carregou nesta janela/,
    'sem texto, o aceite tem de ser liberado com aviso e os links para fora');
  assert.match(CODIGO, /\.catch\(function \(\) \{ return \[null, null\]; \}\)/,
    'o catch do Promise.all e o que faz a janela chegar nesse caminho');
});

test('aceitar fecha a janela de leitura', () => {
  assert.match(CODIGO, /aceitar\(this, fechar\)/);
  assert.match(CODIGO, /if \(typeof aoTerminar === 'function'\) aoTerminar\(\)/,
    'sem isto a janela fica aberta por cima da faixa de sucesso');
});

test('Esc e o fundo fecham a janela', () => {
  assert.match(CODIGO, /ev\.key === 'Escape'/);
  assert.match(CODIGO, /if \(ev\.target === fundo\) fechar\(\)/);
  assert.match(CODIGO, /document\.removeEventListener\('keydown', naTecla\)/,
    'ouvinte de tecla que sobra depois de fechar vaza e fecha janela que nao existe mais');
});

// --------------------------------------------------------------------------------------------
// A UNICA conta da regra, executada de verdade.
// --------------------------------------------------------------------------------------------
test('chegouAoFim: a folga existe, e e ela que impede o botao de nunca liberar', () => {
  const fonte = /function chegouAoFim\(el\) \{[\s\S]*?\n  \}/.exec(CODIGO);
  assert.ok(fonte, 'nao achei chegouAoFim: este teste esta medindo nada');
  const ctx = vm.createContext({});
  vm.runInContext(fonte[0] + '; var f = chegouAoFim;', ctx);
  const f = ctx.f;

  const caixa = (scrollTop, clientHeight, scrollHeight) => ({ scrollTop, clientHeight, scrollHeight });

  // no topo de um texto longo: nao chegou
  assert.equal(f(caixa(0, 600, 4000)), false);
  // no meio: nao chegou
  assert.equal(f(caixa(1700, 600, 4000)), false);
  // no fim exato: chegou
  assert.equal(f(caixa(3400, 600, 4000)), true);
  // ESTE e o caso que motivou a folga: faltam 12px que o navegador nao deixa rolar
  assert.equal(f(caixa(3388, 600, 4000)), true,
    'sem folga, zoom e subpixel deixam o botao desabilitado para sempre');
  // 41px antes do fim ainda NAO conta -- a folga nao pode virar "meio do texto serve"
  assert.equal(f(caixa(3359, 600, 4000)), false,
    'folga grande demais deixaria aceitar sem ler o fim');
  // texto que cabe inteiro na tela: ja esta no fim
  assert.equal(f(caixa(0, 600, 500)), true);
});
