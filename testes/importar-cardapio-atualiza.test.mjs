// Importar cardápio: o que já existe é ATUALIZADO, não duplicado.
//
// O DEFEITO: o import só fazia POST. Colar o cardápio da loja — que é justamente o que o lojista
// faz quando os preços mudam — enchia o catálogo de produtos repetidos, e o cliente passava a ver
// o mesmo item duas vezes, com preços diferentes. A tela até avisava "seriam duplicados", e
// duplicava mesmo assim.
//
// O QUE ESTE TESTE PROTEGE:
// 1) Produto existente vira PUT, não POST.
// 2) O corpo do PUT não apaga custo, estoque mínimo, foto nem o "fora do cardápio".
// 3) Falha no meio não vira "pronto" — metade do cardápio com preço velho é pior que um erro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './harness.mjs';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const TELA = RAIZ + '/assets/js/produtos.js';

const CATALOGO = [
  { id: 60, nome: 'Barca de Açaí Gourmet', categoria: 'Açaí Gourmet e Sobremesa', preco: 39,
    custo: 14.5, estoque: 12, estoqueMinimo: 3, ativo: true,
    imagemUrl: '/public/loja/18/produto/60/imagem', codigoExterno: '7470' },
  { id: 61, nome: 'Roleta de Açaí Gourmet', categoria: 'Açaí Gourmet e Sobremesa', preco: 38,
    custo: null, estoque: null, estoqueMinimo: null, ativo: false,
    imagemUrl: null, codigoExterno: '' },
  { id: 62, nome: 'Copo de Açaí 300ml', categoria: 'Top 4 Mais Vendidos', preco: 19.90,
    custo: 6, estoque: 30, estoqueMinimo: 5, ativo: true, imagemUrl: null, codigoExterno: '' },
];

function montar({ catalogo = CATALOGO, falharEm = [], confirmar = true } = {}) {
  const chamadas = [];
  const Bora = {
    requireAuth: () => true,
    produtos: async () => JSON.parse(JSON.stringify(catalogo)),
    api: async (rota, opcoes) => {
      const corpo = JSON.parse(opcoes.body);
      const id = /\/api\/produtos\/(\d+)/.test(rota)
        ? Number(rota.match(/\/api\/produtos\/(\d+)/)[1]) : null;
      chamadas.push({ rota, metodo: opcoes.method || 'POST', id, corpo });
      if (id && falharEm.includes(id)) throw new Error('o servidor recusou');
      return { id: id || 999 };
    },
    definirEstoqueProduto: async () => ({}),
  };
  const t = subir(TELA, {
    Bora,
    globais: { confirm: () => confirmar, alert: () => {}, FileReader: function () {}, Image: function () {} },
  });
  return { ...t, chamadas };
}

async function assentar() { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); }

/** Cola o texto, confere e aplica. */
async function importar(t, texto, { sóConferir = false } = {}) {
  t.get('impTexto').value = texto;
  t.get('impConferir').onclick();
  await assentar();
  if (sóConferir) return;
  await t.get('impCriar').onclick();
  await assentar();
}

async function abrir(opts) {
  const t = montar(opts);
  await t.carregarPagina();
  await assentar();
  t.chamadas.length = 0;      // a carga da lista nao conta
  return t;
}

const LINHA_NOVA = 'Açaí Puro ; Açaí Puro 300ml ; 12,90';
const LINHA_MUDA = 'Especiais para Compartilhar ; Barca de Açaí Gourmet ; 47,90';
const LINHA_IGUAL = 'Top 4 Mais Vendidos ; Copo de Açaí 300ml ; 19,90';

// ---------------------------------------------------------------- a conferência
test('a conferencia separa: criar, atualizar e o que ja esta igual', async () => {
  const t = await abrir();
  await importar(t, [LINHA_NOVA, LINHA_MUDA, LINHA_IGUAL].join('\n'), { sóConferir: true });

  const prev = t.get('impPreview').innerHTML;
  assert.match(prev, /1 a criar/);
  assert.match(prev, /1 a atualizar/);
  assert.match(prev, /1 já está igual/);
  assert.match(prev, /R\$ 39,00[\s\S]{0,40}R\$ 47,90/,
    'a previa precisa mostrar o preco velho e o novo, senao ninguem confere');
  assert.equal(t.chamadas.length, 0, 'conferir gravou alguma coisa');
});

// ---------------------------------------------------------------- a aplicação
test('PREMISSA: produto que ja existe vira PUT, e NAO um produto novo', async () => {
  const t = await abrir();
  await importar(t, LINHA_MUDA);

  const posts = t.chamadas.filter((c) => c.metodo === 'POST');
  assert.equal(posts.length, 0,
    'criou de novo um produto que ja existe: o cliente passa a ver o mesmo item duas vezes');
  const put = t.chamadas.find((c) => c.metodo === 'PUT');
  assert.ok(put, 'nao atualizou nada');
  assert.equal(put.id, 60);
  assert.equal(put.corpo.preco, 47.90);
  assert.equal(put.corpo.categoria, 'Especiais para Compartilhar');
});

test('produto que nao existe e criado', async () => {
  const t = await abrir();
  await importar(t, LINHA_NOVA);

  const post = t.chamadas.find((c) => c.metodo === 'POST');
  assert.ok(post, 'nao criou o item que faltava');
  assert.equal(post.corpo.nome, 'Açaí Puro 300ml');
  assert.equal(post.corpo.preco, 12.90);
  assert.equal(post.corpo.categoria, 'Açaí Puro');
});

test('o que ja esta igual nao gera chamada nenhuma', async () => {
  const t = await abrir();
  await importar(t, LINHA_IGUAL);
  assert.equal(t.chamadas.length, 0, 'regravou um produto que nao mudou');
});

// ---------------------------------------------------------------- o corpo do PUT
test('PREMISSA: atualizar NAO manda estoque nem imagemUrl', async () => {
  const t = await abrir();
  await importar(t, LINHA_MUDA);
  const put = t.chamadas.find((c) => c.metodo === 'PUT');

  assert.ok(!('estoque' in put.corpo),
    'mandou estoque: o servidor ignora hoje, mas mandar e pedir para apagar as baixas do dia');
  assert.ok(!('imagemUrl' in put.corpo),
    'mandou imagemUrl: a lista devolve o ENDERECO da foto, e devolve-lo troca a foto por um link');
});

test('PREMISSA: atualizar preserva custo, estoque minimo e codigo externo', async () => {
  const t = await abrir();
  await importar(t, LINHA_MUDA);
  const put = t.chamadas.find((c) => c.metodo === 'PUT');

  assert.equal(put.corpo.custo, 14.5, 'apagou o custo — com ele vao o CMV e a margem');
  assert.equal(put.corpo.estoqueMinimo, 3);
  assert.equal(put.corpo.codigoExterno, '7470',
    'apagou o codigo do marketplace: o pedido do iFood deixa de casar');
});

test('PREMISSA: atualizar NAO religa produto tirado do cardapio', async () => {
  const t = await abrir();
  await importar(t, 'X ; Roleta de Açaí Gourmet ; 50,90');
  const put = t.chamadas.find((c) => c.metodo === 'PUT');
  assert.equal(put.corpo.ativo, false,
    'religou um produto que o lojista tinha tirado do cardapio');
});

test('o nome do cadastro e mantido, so o preco e a categoria mudam', async () => {
  const t = await abrir();
  await importar(t, 'Especiais para Compartilhar ; barca de açaí gourmet ; 47,90');
  const put = t.chamadas.find((c) => c.metodo === 'PUT');
  assert.ok(put, 'casar nome deveria ignorar maiuscula/minuscula');
  assert.equal(put.corpo.nome, 'Barca de Açaí Gourmet',
    'trocou a grafia do cadastro pela que o lojista digitou na pressa');
});

// ---------------------------------------------------------------- falhas
test('PREMISSA: falha no meio NAO vira "pronto"', async () => {
  const t = await abrir({ falharEm: [60] });
  await importar(t, [LINHA_NOVA, LINHA_MUDA].join('\n'));

  assert.match(t.get('impMsg').textContent, /1 de 2/);
  assert.match(t.get('impPreview').innerHTML, /não mudaram/i);
  assert.match(t.get('impPreview').innerHTML, /Barca de Açaí Gourmet/);
});

test('cancelar no confirm nao grava nada', async () => {
  const t = await abrir({ confirmar: false });
  await importar(t, LINHA_MUDA);
  assert.equal(t.chamadas.length, 0);
});

test('preco com ponto decimal continua entrando certo', async () => {
  // Item 7.6: "12.50" ja entrou como R$ 1.250,00 uma vez.
  const t = await abrir();
  await importar(t, 'Açaí Puro ; Açaí Puro 500ml ; 16.90');
  const post = t.chamadas.find((c) => c.metodo === 'POST');
  assert.equal(post.corpo.preco, 16.90);
});
