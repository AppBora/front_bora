// A migração por foto fica onde o lojista cadastra produtos — e não escondida em Configurações.
//
// O DEFEITO (item 19 da lista de 23/10, atacado em 25/10/2026): a funcionalidade EXISTIA e
// FUNCIONAVA (`POST /api/ia/importar-cardapio`), só estava no lugar errado. Morava dentro do
// acordeão "Módulo IA" em Configurações, como TERCEIRO item, atrás do WhatsApp do dono e do
// recuperador de clientes — e o acordeão nasce FECHADO.
//
// Quem vai cadastrar um cardápio está em Produtos, com a caixa de colar a lista na frente. Ninguém
// procura "cadastrar meus produtos" em Configurações.
//
// O QUE ISSO CUSTOU, medido em 24/10/2026: a Zirá (loja 18) é a ÚNICA loja com o módulo ligado, e a
// `BORA_CLAUDE_API_KEY` está configurada no servidor. Ou seja, a função esteve disponível para ela
// o tempo todo — enquanto o cardápio dela era transcrito à mão de duas fotos.
//
// POR QUE NÃO É TESTE DE CLIQUE NO BOTÃO: o `migracaoPorFoto` usa `FileReader` sobre um `File` de
// verdade, que o harness não monta. O que este teste mede é a corrente — cada elo que, se faltar,
// deixa a função invisível ou quebrada — mais o comportamento do portão do add-on, que é o único
// pedaço realmente executável e também o mais fácil de errar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { semComentarios } from './harness.mjs';

const RAIZ = path.join(import.meta.dirname, '..');
const PRODUTOS_HTML = fs.readFileSync(path.join(RAIZ, 'produtos.html'), 'utf8');
const PRODUTOS_JS = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'produtos.js'), 'utf8');
const CONFIG_HTML = fs.readFileSync(path.join(RAIZ, 'configuracoes.html'), 'utf8');

// ---------------------------------------------------------------- onde ela está
test('PREMISSA: a tela de Produtos tem a seção de importar cardápio', () => {
  // Se esta seção mudar de forma, o resto do teste mede o lugar errado.
  assert.match(PRODUTOS_HTML, /id="impTexto"/, 'não achei a caixa de colar a lista');
  assert.match(PRODUTOS_HTML, /Importar cardápio/, 'não achei o título da seção');
});

test('o bloco da foto está em PRODUTOS, dentro da seção de importar', () => {
  assert.match(PRODUTOS_HTML, /id="impFotoBloco"/, 'o bloco da foto não está na tela de Produtos');
  assert.match(PRODUTOS_HTML, /id="impFoto"/);
  assert.match(PRODUTOS_HTML, /id="impFotoEnviar"/);
  // Dentro da MESMA seção da caixa de colar: é o que faz as duas formas de importar serem
  // encontradas juntas, por quem já está procurando como importar.
  const secao = PRODUTOS_HTML.slice(PRODUTOS_HTML.indexOf('id="impTexto"'));
  const fim = secao.indexOf('</div>\n      <!--');
  assert.ok(secao.slice(0, fim > 0 ? fim : 4000).includes('id="impFotoBloco"'),
    'o bloco da foto saiu da seção de importar: deixa de ser achado por quem procura importar');
});

test('Configurações aponta para o novo lugar, e NÃO tem uma segunda cópia do controle', () => {
  // Duas cópias da mesma ação deixam o lojista sem saber qual usar, e a que ele escolher primeiro é
  // a que vamos ter de manter. O cartão de IA continua LISTANDO a função — isso é certo, ele existe
  // para dizer o que o módulo faz.
  assert.match(CONFIG_HTML, /Migração por foto/, 'o cartão de IA parou de mencionar a função');
  assert.match(CONFIG_HTML, /produtos\.html/, 'não há link para onde a função foi');
  assert.ok(!/id="iaFoto"/.test(CONFIG_HTML), 'sobrou o campo de arquivo antigo em Configurações');
  assert.ok(!/id="iaImportar"/.test(CONFIG_HTML), 'sobrou o botão antigo em Configurações');
});

test('a fiação antiga saiu junto com o controle', () => {
  // Ouvinte órfão apontando para um elemento que não existe mais estouraria e derrubaria TODO o
  // resto daquele bloco — o WhatsApp do dono e o recuperador de clientes incluídos.
  //
  // Procura no fonte SEM COMENTÁRIOS. A primeira versão varria o arquivo inteiro e acusava o meu
  // próprio comentário, que cita o nome do elemento para explicar por que a fiação saiu — ou seja,
  // falhava com o código certo. Foi a terceira vez que eu fiz isso em dois dias, e foi o que fez o
  // `semComentarios` existir.
  const codigo = semComentarios(CONFIG_HTML);
  assert.ok(!codigo.includes("$('iaImportar')"),
    'ficou fiação apontando para um elemento que não existe mais');
  assert.ok(!codigo.includes("$('iaImpMsg')"), 'ficou fiação do campo de mensagem antigo');
  // E a premissa, para este teste não passar por medir um fonte vazio:
  assert.ok(codigo.includes("$('iaSalvarZap')"),
    'o resto da fiação do cartão de IA tem de continuar lá — se não está, eu apaguei demais');
});

// ---------------------------------------------------------------- o portão do add-on
function subirProdutos(statusIa) {
  const els = new Map();
  const elemento = () => ({ innerHTML: '', textContent: '', value: '', hidden: true, disabled: false,
    style: {}, files: [], addEventListener() {}, querySelectorAll: () => [], appendChild() {} });
  const get = (id) => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };
  const chamadas = [];
  const Bora = {
    requireAuth: () => true,
    user: () => ({ papel: 'ADMINISTRADOR_LOJA', lojaId: 18, nome: 'Teste' }),
    produtos: async () => [],
    insumos: async () => [],
    api: async (url, opts) => {
      chamadas.push({ url, metodo: (opts && opts.method) || 'GET' });
      if (url === '/api/ia/status') {
        if (statusIa instanceof Error) throw statusIa;
        return statusIa;
      }
      return {};
    },
  };
  const ctx = {
    document: { getElementById: get, addEventListener() {}, createElement: elemento,
      querySelector: () => null, querySelectorAll: () => [], body: elemento(),
      documentElement: elemento() },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Bora, console, Date, Math, JSON, Number, String, Object, Array, Promise, setTimeout,
    alert: () => {}, confirm: () => true, FileReader: function () {}, window: {},
    encodeURIComponent,
  };
  vm.runInNewContext(PRODUTOS_JS, ctx);
  return { get, chamadas };
}

const assentar = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

test('loja COM o módulo: o bloco aparece', async () => {
  const t = subirProdutos({ contratado: true });
  await assentar();
  assert.equal(t.get('impFotoBloco').hidden, false,
    'a loja contratou o add-on e não vê a função — é o defeito original, de outro jeito');
});

test('loja SEM o módulo: o bloco NAO aparece', async () => {
  // Sem esta conferência, loja sem o add-on veria um botão que sempre devolve 403. Botão que erra
  // sempre é pior que botão nenhum: parece defeito nosso, e gera ligação para o suporte.
  const t = subirProdutos({ contratado: false });
  await assentar();
  assert.equal(t.get('impFotoBloco').hidden, true, 'ofereceu uma função que a loja não tem');
});

test('se a consulta do módulo FALHAR, fica escondido', async () => {
  // Oferecer e dar erro é pior que não oferecer.
  const t = subirProdutos(new Error('503'));
  await assentar();
  assert.equal(t.get('impFotoBloco').hidden, true, 'mostrou o bloco sem saber se a loja tem o módulo');
});

test('a tela PERGUNTA pelo módulo — e é o /api/ia/status que decide', async () => {
  // Sem este caso, os três acima passariam com um bloco que nasce escondido e nunca é ligado.
  const t = subirProdutos({ contratado: true });
  await assentar();
  assert.ok(t.chamadas.some((c) => c.url === '/api/ia/status'),
    'a tela não consultou o status do módulo: o bloco apareceria ou sumiria por acidente');
});

// ---------------------------------------------------------------- o que o envio tem de fazer
test('o envio chama o endpoint certo, com imagem e tipo', () => {
  assert.match(PRODUTOS_JS, /'\/api\/ia\/importar-cardapio'/, 'o envio não chama o endpoint');
  assert.match(PRODUTOS_JS, /imagemBase64: String\(rd\.result\)\.split\(','\)\[1\]/,
    'o corpo precisa do base64 SEM o prefixo data:, que é o que o servidor espera');
  assert.match(PRODUTOS_JS, /mediaType: f\.type \|\| 'image\/jpeg'/,
    'sem o mediaType a IA não sabe decodificar a imagem');
});

test('confere o TAMANHO antes de ler o arquivo', () => {
  // A imagem vai em base64 no corpo, o que a infla ~33%, e foto de celular passa de 5 MB fácil. Sem
  // o teto, o lojista espera a leitura inteira para levar um erro do servidor no fim.
  const fn = PRODUTOS_JS.slice(PRODUTOS_JS.indexOf('function migracaoPorFoto'));
  assert.match(fn, /MAX_MB/, 'não há teto de tamanho');
  const posTeto = fn.indexOf('f.size > MAX_MB');
  const posLeitura = fn.indexOf('readAsDataURL');
  assert.ok(posTeto > 0 && posLeitura > 0 && posTeto < posLeitura,
    'o teto tem de ser conferido ANTES de ler o arquivo, senão a espera acontece de qualquer forma');
});

test('o resultado manda CONFERIR OS PRECOS', () => {
  // É leitura de foto, e aqui é preço que o cliente paga. A versão antiga dizia só "Veja em
  // Produtos" -- e nem era onde o lojista estava.
  const fn = PRODUTOS_JS.slice(PRODUTOS_JS.indexOf('function migracaoPorFoto'));
  assert.match(fn, /Confira os preços/,
    'o lojista precisa ser mandado conferir: a IA leu de uma foto, e preço errado é dinheiro');
});

test('o bloco nasce escondido no HTML, e nao so pelo script', () => {
  // Se dependesse do script para esconder, a loja sem o módulo veria o bloco piscar antes de sumir
  // -- e, se o script falhasse, veria para sempre.
  const abertura = /<div id="impFotoBloco"([^>]*)>/.exec(PRODUTOS_HTML);
  assert.ok(abertura, 'não achei a abertura do bloco');
  assert.match(abertura[1], /\bhidden\b/, 'o bloco não nasce escondido no HTML');
});
