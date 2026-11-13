// Copiar cardápio entre unidades só existe se tiver TELA — e se a tela ENCHER a lista.
//
// A armadilha aqui é a que já custou quatro vezes em dois dias: endpoint pronto, regra testada no
// servidor, e nenhuma tela chamando. Mas tem uma segunda, específica deste recurso: a tela pode
// existir com o `<select>` vazio para sempre. Um campo que o operador abre, vê "— não copiar —" e
// nada mais, é pior que campo nenhum: ele conclui que o recurso não funciona para o cliente dele.
// Por isso aqui a função que enche a lista é EXECUTADA, com a lista real de clientes, e o teste
// conta as opções que saíram.
//
// Tudo é medido no HTML SEM COMENTÁRIOS. O comentário que eu mesmo escrevi acima do campo cita
// "copiar-cardapio" e "origemLojaId" — medindo o arquivo cru, o teste passaria com o comentário e
// zero tela, que é exatamente o erro que já me enganou três vezes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const CRU = fs.readFileSync(path.join(RAIZ, 'configuracoes.html'), 'utf8');
const CODIGO = semComentarios(CRU);

test('o campo de copiar cardápio existe na tela de loja nova', () => {
  assert.match(CODIGO, /<select id="nlCopiarDe"/, 'sem o select, o recurso não tem porta nenhuma');
  assert.match(CODIGO, /não copiar/, 'a opção de NÃO copiar tem de ser a primeira escolha possível');
});

test('a tela chama o endpoint certo, com a loja nova no caminho e a origem no corpo', () => {
  const trecho = /copiar-cardapio[\s\S]{0,200}/.exec(CODIGO);
  assert.ok(trecho, 'nenhuma chamada a /copiar-cardapio: endpoint sem tela');
  assert.match(CODIGO, /'\/admin-bora\/lojas\/' \+ r\.lojaId \+ '\/copiar-cardapio'/,
    'a cópia tem de ir para a loja ACABADA DE CRIAR, não para a origem');
  assert.match(CODIGO, /origemLojaId: Number\(origemCopia\)/,
    'o corpo precisa levar origemLojaId, que é o que o servidor lê');
});

test('a lista é enchida quando a tela de clientes carrega', () => {
  // Sem esta ligação o select nasce e morre com uma opção só. É o defeito "campo vazio para
  // sempre", e ele não aparece em nenhum teste de servidor.
  const carregar = /async function carregarLojas\(\) \{[\s\S]*?\n  \}/.exec(CODIGO);
  assert.ok(carregar, 'não achei carregarLojas: este teste está medindo nada');
  assert.match(carregar[0], /pintarCopiarDe\(\)/,
    'carregarLojas tem de encher a lista — senão o operador vê um campo vazio');
});

test('a escolha NÃO fica por inércia na unidade seguinte', () => {
  // Já aconteceu com o endereço: a 2ª unidade nascia no endereço da 1ª. Cardápio errado copiado
  // em cima é pior, porque a recusa do servidor só pega loja com cardápio vazio.
  assert.match(CODIGO, /nl\('nlCopiarDe'\)\.value = ''/,
    'depois de criar, o campo tem de voltar para "não copiar"');
});

/**
 * A função REAL do arquivo, rodando num DOM mínimo. Cópia dublada mediria outra coisa.
 */
function pintarReal(clientes) {
  const fonte = /\n(  function pintarCopiarDe\(\) \{[\s\S]*?\n  \})/.exec(CRU);
  assert.ok(fonte, 'não achei a pintarCopiarDe: este teste está medindo nada');

  const select = { id: 'nlCopiarDe', innerHTML: '', value: '' };
  const doc = { getElementById: (id) => (id === 'nlCopiarDe' ? select : null) };
  const ctx = vm.createContext({
    console, String, Object, Array, Number,
    document: doc,
    ultimaLista: clientes,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  });
  vm.runInContext(fonte[1] + '\nglobalThis.__p = pintarCopiarDe;', ctx);
  vm.runInContext('__p()', ctx);
  return select;
}

const CLIENTES = [
  { id: 18, nome: 'Zirá - Montreal', documento: '11222333000144', empresaId: 7 },
  { id: 19, nome: 'Zirá - Zona Norte', documento: '11222333000144', empresaId: 7 },
  { id: 31, nome: 'Loja solta sem empresa', documento: null, empresaId: null }
];

test('a lista mostra as lojas com empresa, com o CNPJ ao lado do nome', () => {
  const select = pintarReal(CLIENTES);
  const opcoes = select.innerHTML.match(/<option /g) || [];
  assert.equal(opcoes.length, 3, 'a opção de não copiar + as 2 lojas com empresa');
  assert.match(select.innerHTML, /#18 · Zirá - Montreal · CNPJ 11222333000144/,
    'o CNPJ precisa aparecer: "Montreal" e "Zona Norte" são nomes parecidos de clientes que podem não ser o mesmo');
  assert.match(select.innerHTML, /value="19"/);
});

test('loja sem empresa NÃO entra na lista', () => {
  const select = pintarReal(CLIENTES);
  assert.doesNotMatch(select.innerHTML, /value="31"/,
    'a cópia exige mesmo CNPJ; oferecer loja sem empresa é oferecer um erro garantido');
});

test('a escolha do operador sobrevive ao recarregamento da lista', () => {
  // carregarLojas() roda de novo a cada ação da tela (liberar acesso, trocar nome, arquivar).
  // Se o repinte zerasse o campo, o operador perderia a escolha sem perceber.
  const fonte = /\n(  function pintarCopiarDe\(\) \{[\s\S]*?\n  \})/.exec(CRU);
  assert.match(fonte[1], /const escolhido = s\.value;[\s\S]*s\.value = escolhido;/,
    'a função tem de guardar e devolver a escolha ao redesenhar');
});

test('a tela diz o que NÃO vem na cópia', () => {
  // A cópia traz cadastro, não saldo. Operador que acha que veio estoque vende o que não tem.
  assert.match(CODIGO, /saldo de estoque/, 'a tela tem de avisar que o estoque nasce zerado');
  assert.match(CODIGO, /iFood\/99/, 'o código do produto no marketplace é por loja e não é copiado');
});

test('a falha da cópia não vira silêncio: a loja criada é informada', () => {
  const trecho = /catch \(e\) \{[\s\S]{0,400}?cardápio NÃO foi copiado[\s\S]{0,200}/.exec(CODIGO);
  assert.ok(trecho, 'cópia que falha calada deixa o operador achando que o cardápio veio');
  assert.match(trecho[0], /cardápio vazio/,
    'tem de dizer em que estado a loja ficou, não só que deu erro');
});
