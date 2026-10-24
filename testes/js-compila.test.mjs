// Todo arquivo JS do painel precisa COMPILAR.
//
// POR QUE ISTO EXISTE, e é constrangedor: em 24/10/2026 eu escrevi um comentário de HTML DENTRO
// de uma template literal, em `acerto-entregadores.js`. As crases do comentário fecharam a
// template e o arquivo inteiro parou de compilar — a tela de Acerto de Entregadores ficou morta:
// nenhum ouvinte registrado, o botão Buscar sem reação, o seletor de entregador vazio.
//
// Os 438 testes do painel passaram verdes o tempo todo. Nenhum deles carregava aquele arquivo, e
// os que leem código o leem como TEXTO. Quem achou foi o QA abrindo a tela — e só não foi para
// produção porque o deploy não tinha acontecido ainda.
//
// Arquivo que não compila não é "um teste a menos": é a tela inteira fora do ar, sem erro
// visível além do console. Isto aqui é a rede mais barata que existe para isso.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const PASTA = path.join(RAIZ, 'assets/js');

test('PREMISSA: todo .js de assets/js compila', () => {
  const arquivos = fs.readdirSync(PASTA).filter((f) => f.endsWith('.js'));
  assert.ok(arquivos.length > 20, 'achei poucos arquivos — este teste parou de medir');

  const quebrados = [];
  for (const f of arquivos) {
    try {
      execFileSync(process.execPath, ['--check', path.join(PASTA, f)], { stdio: 'pipe' });
    } catch (e) {
      const saida = String(e.stderr || e.message).split('\n').find((l) => /Error/.test(l)) || '';
      quebrados.push(f + ' → ' + saida.trim());
    }
  }

  assert.deepEqual(quebrados, [],
    'arquivo que não compila derruba a tela inteira, e nenhum outro teste pega isso');
});

test('PREMISSA: o teste acima pega um arquivo quebrado de verdade', () => {
  // Sem esta prova, o teste acima poderia estar varrendo uma pasta vazia e passando sozinho.
  // Uso o mesmo defeito que me pegou: crase dentro de template literal.
  const tmp = path.join(PASTA, '__prova-de-sintaxe.js.tmp');
  fs.writeFileSync(tmp, 'const x = `abc <!-- `ruim` --> def`;\n', 'utf8');
  try {
    let estourou = false;
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (e) { estourou = true; }
    assert.ok(estourou, 'o node --check deixou passar um arquivo quebrado');
  } finally {
    fs.unlinkSync(tmp);
  }
});
