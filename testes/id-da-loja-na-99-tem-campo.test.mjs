// O "ID do loja" numérico da 99 tem CAMPO na tela de Integrações.
//
// A COLUNA EXISTE DESDE A V67 (08/11/2026) E NENHUMA TELA ESCREVIA NELA. É a armadilha do
// "endpoint sem tela" ao contrário: coluna sem tela. O webhook da 99 acha a loja por qualquer um
// dos dois identificadores — o App Shop ID ou esse número — porque a documentação deles chama o
// header `X-App-MerchantId` apenas de "unique identifier for the merchant across different
// systems" e não diz qual dos dois manda. Escolher errado não dá erro visível: dá 404 no webhook e
// PEDIDO REAL PERDIDO, calado.
//
// Descoberto abrindo a 6ª unidade da Zirá: sem este campo, toda unidade nova nascia pela metade e
// ficava esperando alguém abrir o banco — e ninguém lembra de pedir o que não tem campo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const TELA = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'integracoes.js'), 'utf8');

/** O arquivo sem comentários: o comentário que eu escrevi acima do campo cita os mesmos nomes. */
const CODIGO = TELA.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('o campo existe, e com id próprio', () => {
  assert.match(CODIGO, /id="sid-\$\{i\.canal\}"/,
    'sem o input não há onde digitar o ID numérico da loja na 99');
});

test('o campo aparece SÓ na 99 — o iFood tem um identificador só', () => {
  assert.match(CODIGO, /i\.canal !== 'NOVE_NOVE' \? '' :/,
    'campo de 99 no cartão do iFood é campo que não serve para nada e confunde quem preenche');
});

test('o valor vai no corpo do salvar, com o nome que o servidor lê', () => {
  assert.match(CODIGO, /body\.shopIdCanal = val\('sid-' \+ canal\)/,
    'campo na tela que não entra no corpo é campo decorativo: o ID nunca chegaria ao banco');
});

test('só manda quando o campo EXISTE na tela', () => {
  // O cartão do WhatsApp e o do iFood não desenham o campo. Mandar string vazia nesses casos
  // apagaria o que já está gravado — o roteamento do webhook da loja.
  assert.match(CODIGO, /if \(document\.getElementById\('sid-' \+ canal\)\) body\.shopIdCanal/,
    'sem a guarda, salvar o cartão de outro canal apaga o ID da 99');
});

test('o valor atual é mostrado, e não um campo em branco', () => {
  assert.match(CODIGO, /value="\$\{esc\(i\.shopIdCanal \|\| ''\)\}"/,
    'campo que não mostra o que está gravado faz o operador digitar de novo — ou apagar sem ver');
});

test('o lojista não edita: o identificador é do suporte', () => {
  // Quem digita o código da loja no marketplace decide de quem são os pedidos que entram. O
  // servidor recusa (403) o lojista mexendo nisso em canal oficial; a tela não pode oferecer.
  const campo = /i\.canal !== 'NOVE_NOVE' \? '' : `[\s\S]*?`\}/.exec(CODIGO);
  assert.ok(campo, 'não achei o campo: este teste está medindo nada');
  assert.match(campo[0], /!ehPlataforma \? 'readonly/,
    'fora da plataforma o campo tem de vir somente-leitura');
});
