// O e-mail de acesso passa a poder ser trocado PELA TELA.
//
// Antes disto nao havia jeito nenhum: o `setEmail` do servico so rodava na criacao, e esta tela
// fazia `$('email').disabled = true` ao editar, com um aviso dizendo que nao mudava. A loja
// Doce Jardim foi aberta com login provisorio e ficaria presa a ele.
//
// O que este arquivo tranca: que o campo abra, que o valor SAIA no corpo do PUT, que ele saia
// NORMALIZADO (o login busca em minusculas -- gravar "Fulano@X.com" tranca a pessoa para fora
// sem erro nenhum), que "nao mudou nada" continue sendo detectado, e que trocar o PROPRIO login
// pergunte antes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const CRU = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'usuarios.js'), 'utf8');
const CODIGO = semComentarios(CRU);

test('o campo de e-mail ABRE na edicao', () => {
  assert.match(CODIGO, /\$\('email'\)\.disabled = false;\s*\/*/,
    'campo desabilitado e tela dizendo "nao da": era esse o defeito');
  assert.doesNotMatch(CODIGO, /\$\('email'\)\.disabled = true/,
    'sobrou um ponto que ainda desabilita o campo');
});

test('o aviso parou de dizer que o e-mail nao muda', () => {
  assert.doesNotMatch(CODIGO, /e-mail não mudam por aqui/,
    'aviso que mente e pior que aviso nenhum: o operador nem tenta');
});

test('o e-mail novo SAI no corpo do PUT', () => {
  assert.match(CODIGO, /\/api\/usuarios\/' \+ editando\.id \+ '\/email'/,
    'campo na tela que nao chama o endpoint e campo decorativo');
  assert.match(CODIGO, /body: JSON\.stringify\(\{ email: emailNovo \}\)/,
    'sem isso o servidor recebe corpo vazio e devolve 400');
});

test('o valor sai NORMALIZADO — e esse o defeito que tranca a pessoa para fora', () => {
  assert.match(CODIGO, /const emailNovo = \(\$\('email'\)\.value \|\| ''\)\.trim\(\)\.toLowerCase\(\)/,
    'o login busca por trim().toLowerCase(): mandar com maiuscula nao da erro, so deixa de entrar');
});

test('comparar para saber se mudou tambem normaliza', () => {
  // Sem isso, abrir a tela de alguem com "Fulano@X.com" ja contaria como mudanca e dispararia
  // um PUT a cada salvamento -- e a confirmacao de "este e o SEU login" apareceria sem motivo.
  assert.match(CODIGO, /emailNovo !== \(editando\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
});

test('e-mail sem formato e barrado antes de ir ao servidor', () => {
  assert.match(CODIGO, /test\(emailNovo\)/,
    'deixar o 400 do servidor ser a unica barreira joga erro tecnico na cara do operador');
});

test('campo apagado NAO vira troca para vazio', () => {
  // `!!emailNovo` na deteccao: apagar o campo sem querer nao pode mandar e-mail em branco.
  assert.match(CODIGO, /const trocaEmail = !!emailNovo &&/,
    'sem a guarda, limpar o campo mandaria string vazia e apagaria o login');
});

test('"nada para salvar" leva o e-mail em conta', () => {
  assert.match(CODIGO, /if \(!trocaPapel && !novaSenha && !trocaEmail\)/,
    'sem isso, trocar SO o e-mail cai no atalho de "nada mudou" e nao salva nada');
});

test('trocar o PROPRIO login pergunta antes', () => {
  assert.match(CODIGO, /const eMeu = meuId\(\) === null \|\| meuId\(\) === editando\.id/,
    'quando nao da para saber quem sou eu, tem de perguntar do mesmo jeito');
  assert.match(CODIGO, /trocaEmail && eMeu[\s\S]{0,40}confirm\(/,
    'erro de digitacao no proprio login tranca a pessoa para fora no proximo acesso');
});

test('meuId() nunca derruba a tela', () => {
  const m = /function meuId\(\) \{[\s\S]*?\n  \}/.exec(CODIGO);
  assert.ok(m, 'nao achei meuId(): este teste esta medindo nada');
  assert.match(m[0], /catch \(e\) \{ return null; \}/,
    'token ausente ou torto nao pode quebrar o salvamento inteiro');
});

test('meuId() executado de verdade: le o sub do token, e devolve null no lixo', async () => {
  const vm = await import('node:vm');
  const corpo = /function meuId\(\) \{[\s\S]*?\n  \}/.exec(CODIGO)[0];
  const payload = Buffer.from(JSON.stringify({ sub: '36', papel: 'X' })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const ctx = { localStorage: { getItem: () => 'cabeca.' + payload + '.assinatura' },
                atob: (b) => Buffer.from(b, 'base64').toString('binary'), Buffer };
  vm.createContext(ctx);
  vm.runInContext(corpo + '; var r1 = meuId();', ctx);
  assert.equal(ctx.r1, 36, 'nao leu o id do usuario de dentro do token');

  ctx.localStorage = { getItem: () => 'isto-nao-e-um-token' };
  vm.runInContext('var r2 = meuId();', ctx);
  assert.equal(ctx.r2, null, 'token torto tem de devolver null, nao estourar');

  ctx.localStorage = { getItem: () => null };
  vm.runInContext('var r3 = meuId();', ctx);
  assert.equal(ctx.r3, null, 'sem token tem de devolver null');
});
