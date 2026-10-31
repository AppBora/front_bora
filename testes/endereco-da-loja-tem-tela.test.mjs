// O endereço da loja (V66) só existe se tiver TELA.
//
// A armadilha que este arquivo protege é a que já custou quatro vezes em dois dias: endpoint pronto,
// regra testada no servidor, e nenhuma tela chamando — o dono conclui que "não dá pelo painel" e o
// dado nunca é cadastrado. Aqui o endereço nasceu com três portas (cadastro de loja nova, botão da
// lista de clientes, cartão do lojista) e as três precisam continuar ligadas.
//
// O segundo risco é mais sutil e já aconteceu com o preço da Zirá: a mesma ficha escrita três vezes
// vira três formulários diferentes na primeira correção. Por isso as três telas montam os campos
// pela mesma `FichaEndereco`, e o teste cobra isso.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const CONFIG = fs.readFileSync(path.join(RAIZ, 'configuracoes.html'), 'utf8');
const CODIGO = semComentarios(CONFIG);

/** A FichaEndereco real do arquivo, rodando num DOM mínimo. Cópia dublada mediria outra coisa. */
function fichaReal() {
  const fonte = /\n(const FichaEndereco = \(function \(\) \{[\s\S]*?\n\}\)\(\);)/.exec(CONFIG);
  assert.ok(fonte, 'não achei a FichaEndereco: este teste está medindo nada');

  const elementos = new Map();
  const doc = {
    getElementById: (id) => elementos.get(id) || null,
    criar: (id) => { const el = { id, value: '', disabled: false }; elementos.set(id, el); return el; }
  };
  const ctx = vm.createContext({ console, String, Object, Array, document: doc });
  vm.runInContext(fonte[1] + '\nglobalThis.__f = FichaEndereco;', ctx);
  return { ficha: vm.runInContext('__f', ctx), doc, elementos };
}

const ZIRA = {
  cep: '18087-000', logradouro: 'Rua Firmino Mineli', numero: '751', complemento: null,
  bairro: 'Vila Mineirão', cidade: 'Sorocaba', uf: 'SP'
};

test('PREMISSA: a ficha desenha os sete campos do endereço', () => {
  const { ficha } = fichaReal();
  const caixa = { innerHTML: '' };
  ficha.montar(caixa, 'x');
  ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf']
    .forEach(c => assert.ok(caixa.innerHTML.includes('id="x' + c + '"'), 'faltou o campo ' + c));
});

test('ler devolve null no campo em branco — e não string vazia', () => {
  const { ficha, doc } = fichaReal();
  ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach(c => doc.criar('y' + c));
  doc.getElementById('ylogradouro').value = '  Rua Antenor Maciel  ';
  const e = ficha.ler('y');
  // Em branco vai como null porque o servidor trata null como "sem endereço"; string vazia faria a
  // loja nascer com sete campos vazios gravados, que é diferente de não ter endereço.
  assert.equal(e.logradouro, 'Rua Antenor Maciel', 'o espaço em volta tem de sair');
  assert.equal(e.cep, null);
  assert.equal(e.complemento, null);
});

test('endereço vazio é reconhecido como vazio, e um só campo já não é', () => {
  const { ficha } = fichaReal();
  assert.equal(ficha.vazio(null), true);
  assert.equal(ficha.vazio({ cep: null, logradouro: null, numero: null, complemento: null,
    bairro: null, cidade: null, uf: null }), true);
  assert.equal(ficha.vazio({ bairro: 'Jardim Tropical' }), false);
});

test('a linha legível põe rua, número, bairro, cidade/UF e CEP, nesta ordem', () => {
  const { ficha } = fichaReal();
  assert.equal(ficha.emUmaLinha(ZIRA),
    'Rua Firmino Mineli, 751 - Vila Mineirão, Sorocaba/SP · 18087-000');
  assert.equal(ficha.emUmaLinha({ ...ZIRA, complemento: 'loja 2' }),
    'Rua Firmino Mineli, 751 (loja 2) - Vila Mineirão, Sorocaba/SP · 18087-000');
  // Endereço pela metade não pode sair com vírgula solta nem travessão sobrando.
  assert.equal(ficha.emUmaLinha({ bairro: 'Jardim Tropical' }), 'Jardim Tropical');
  assert.equal(ficha.emUmaLinha(null), '');
});

test('o cadastro de loja nova MANDA o endereço — e manda null quando ninguém preencheu', () => {
  const trecho = CODIGO.slice(CODIGO.indexOf("Bora.api('/admin-bora/lojas'"),
    CODIGO.indexOf("Bora.api('/admin-bora/lojas'") + 700);
  assert.match(trecho, /endereco:/, 'a criação de loja não manda endereço: a tela é enfeite');
  assert.match(trecho, /FichaEndereco\.vazio\(e\) \? null : e/,
    'endereço em branco precisa ir como null, e não como sete campos vazios');
});

test('o formulário de loja nova LIMPA o endereço depois de criar', () => {
  // Cadastrar cinco unidades seguidas é exatamente o caso de uso. Sem limpar, a segunda nasce no
  // endereço da primeira — e o erro é invisível, porque os campos ficam preenchidos na tela.
  assert.match(CODIGO, /FichaEndereco\.preencher\('nlEnd', null\)/,
    'sem isto a unidade seguinte herda o endereço da anterior');
});

test('a lista de clientes mostra o endereço, e DIZ quando falta', () => {
  assert.match(CODIGO, /sem endereço cadastrado/,
    'faltando endereço, a tela tem de dizer que falta — omitir esconde o buraco');
  assert.match(CODIGO, /data-acao="\$\{acao\}"/, 'os botões da lista mudaram de forma');
  assert.match(CODIGO, /botao\('endereco', c\.id/, 'falta o botão de endereço na lista');
  assert.match(CODIGO, /Bora\.api\('\/admin-bora\/lojas\/' \+ cliente\.id \+ '\/endereco'/,
    'o botão existe mas não chama o endpoint da plataforma');
});

test('o cartão do lojista lê e grava pela porta dele, não pela da plataforma', () => {
  assert.match(CODIGO, /Bora\.api\('\/api\/loja'\)/, 'o cartão não lê o endereço atual');
  assert.match(CODIGO, /Bora\.api\('\/api\/loja\/endereco',\s*\{ method: 'PUT'/,
    'o cartão não grava, ou grava pela porta errada');
});

test('quem não administra a loja vê o endereço, mas não edita', () => {
  const trecho = CODIGO.slice(CODIGO.indexOf("const card = document.getElementById('cardEndereco')"),
    CODIGO.indexOf("Troca da propria senha") > 0 ? CODIGO.indexOf("const btn = document.getElementById('btnTrocarSenha')") : undefined);
  assert.match(trecho, /podeGravar = u\.papel === 'ADMINISTRADOR_LOJA'/,
    'o cartão precisa saber quem pode gravar');
  assert.match(trecho, /if \(!podeGravar\)[\s\S]*disabled = true/,
    'sem travar os campos, o gerente preenche tudo e leva 403 no fim');
  assert.match(trecho, /salvar\.hidden = true/, 'o botão de salvar precisa sumir para quem não grava');
});
