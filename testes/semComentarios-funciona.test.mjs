// O `semComentarios` do harness precisa funcionar, porque vários testes vão acreditar nele.
//
// POR QUE ELE EXISTE (25/10/2026): em dois dias eu escrevi TRÊS testes que procuravam um padrão no
// arquivo inteiro e acusavam o meu próprio comentário — os três falhavam com o código certo. Ajustar
// o escopo caso a caso não resolveu; na terceira vez virou classe de defeito.
//
// A PRIMEIRA VERSÃO DO AJUDANTE ERA PIOR QUE ESTA, e vale registrar por quê. Ela caminhava o fonte
// caractere a caractere acompanhando aspas, apóstrofo e crase, para não confundir `//` dentro de
// texto. Parecia mais correta. Mas entrou em "modo texto" numa REGEX com aspas dentro — o
// `/[&<>"]/g` do `esc`, que existe no configuracoes.html — e dali em diante ignorou todos os `//`
// do arquivo. O comentário sobreviveu, o teste continuou falhando, e agora com uma explicação
// errada do motivo.
//
// Ferramenta de teste que falha de maneira imprevisível é pior que ferramenta nenhuma, porque
// outros testes passam a confiar nela. A versão atual não acompanha estado de texto nenhum, então
// não tem como ser enganada — e o último teste deste arquivo prova isso contra os arquivos REAIS do
// projeto, que foi o que faltou na primeira vez.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');

// ---------------------------------------------------------------- o que ele tira
test('tira linha de comentário de barra dupla', () => {
  const r = semComentarios('const a = 1;\n// isto sai\nconst b = 2;');
  assert.ok(!r.includes('isto sai'), 'o comentário sobreviveu');
  assert.ok(r.includes('const a = 1;') && r.includes('const b = 2;'), 'comeu código');
  assert.equal(r.split('\n').length, 3, 'as linhas têm de continuar contáveis');
});

test('tira bloco e javadoc, inclusive as linhas do meio', () => {
  const r = semComentarios('/**\n * fala do defeito\n */\nconst a = 1;');
  assert.ok(!r.includes('defeito'), 'a linha do meio do javadoc sobreviveu');
  assert.ok(r.includes('const a = 1;'));
});

test('tira comentário de HTML, mesmo em várias linhas', () => {
  const r = semComentarios('<div>\n<!-- explica o $(\'iaImportar\')\n     em duas linhas -->\n<b>fica</b></div>');
  assert.ok(!r.includes('iaImportar'), 'o comentário de HTML sobreviveu');
  assert.ok(!r.includes('em duas linhas'), 'a segunda linha do comentário sobreviveu');
  assert.ok(r.includes('<b>fica</b>'));
});

// ---------------------------------------------------------------- o que ele NÃO pode comer
test('NÃO corta linha de código que contém //', () => {
  const codigo = 'const u = "https://borahapp.com.br/api";';
  assert.ok(semComentarios(codigo).includes(codigo),
    'comeu a URL: um teste que confere endereço passaria a mentir em silêncio');
});

test('NÃO se perde numa regex com aspas dentro — o defeito da versão anterior', () => {
  // Exatamente o padrão do `esc` do configuracoes.html. Era aqui que a primeira versão entrava em
  // modo texto e desistia de achar comentário no resto do arquivo.
  const fonte = [
    "const esc = s => String(s).replace(/[&<>\"]/g, c => c);",
    '// este comentário TEM de sair',
    "const vivo = 1;",
  ].join('\n');
  const r = semComentarios(fonte);
  assert.ok(!r.includes('TEM de sair'), 'a regex com aspas cegou o ajudante, como antes');
  assert.ok(r.includes('const vivo = 1;'));
  assert.ok(r.includes('replace(/[&<>"]/g'), 'comeu a própria regex');
});

test('o LIMITE declarado: comentário no fim da linha de código FICA', () => {
  // Não é descuido, é escopo. Os três acidentes eram linhas inteiras de comentário, que é como se
  // escreve explicação de verdade. Quem depender do outro caso tem de usar um parser, e este teste
  // existe para essa pessoa descobrir isso lendo, em vez de confiando.
  const codigo = 'const a = 1; // nota que permanece';
  assert.ok(semComentarios(codigo).includes('nota que permanece'),
    'o comportamento mudou: reveja os testes que dependem deste ajudante');
});

// ---------------------------------------------------------------- contra os arquivos REAIS
test('PREMISSA: funciona nos arquivos do projeto, e nao so nos exemplos', () => {
  // Isto é o que faltou na primeira versão. Os exemplos pequenos passavam todos; era só no arquivo
  // de verdade, com a regex do `esc` no meio, que o ajudante cegava. Exemplo que o autor escolhe
  // nunca prova o caso que o autor não imaginou.
  const casos = [
    ['configuracoes.html', 'ouvinte órfão aqui estouraria'],
    ['cardapio.html', 'O ZOOM DO IPHONE NO CHECKOUT'],
    ['produtos.html', 'MIGRAÇÃO POR FOTO'],
    ['assets/js/pedidos.js', 'ESCONDIA O CANAL'],
    ['assets/js/estoque.js', 'NÃO CONTADO não é ZERO'],
  ];
  for (const [arquivo, trechoDeComentario] of casos) {
    const fonte = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    assert.ok(fonte.includes(trechoDeComentario),
      arquivo + ': o comentário de referência mudou — este teste está medindo nada. Trecho: '
      + trechoDeComentario);
    assert.ok(!semComentarios(fonte).includes(trechoDeComentario),
      arquivo + ': o comentário sobreviveu ao semComentarios');
  }
});

test('PREMISSA: nos arquivos reais, o CÓDIGO sobrevive', () => {
  // O outro lado do risco: um ajudante que apaga demais faria todo teste de contrato passar por
  // medir um arquivo vazio.
  const casos = [
    ['configuracoes.html', "$('iaSalvarZap')"],
    ['assets/js/produtos.js', "'/api/ia/importar-cardapio'"],
    ['assets/js/estoque.js', 'definirEstoqueInsumo'],
    ['cardapio.html', 'id="ckNome"'],
  ];
  for (const [arquivo, codigo] of casos) {
    const fonte = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    assert.ok(semComentarios(fonte).includes(codigo),
      arquivo + ': o ajudante comeu código (' + codigo + ')');
  }
});
