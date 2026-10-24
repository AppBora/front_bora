// A FOLHA DESENHADA do cardápio (cardapio-folha.html).
//
// O teste roda a página num mundo de mentira, mas com o cardápio DE VERDADE da loja 18, capturado
// do endpoint público (testes/fixtures/cardapio-loja-18.json). Dado inventado não pega o que
// pega aqui: é o cadastro real que tem "Ziraniho" com um "n" a menos, seis recipientes em vez de
// quatro, e três especiais sem tamanho ainda.
//
// O que este teste protege, em ordem de estrago:
//
// 1) NÃO DESENHAR NADA quando o QR não veio. É o mesmo motivo do cardapio-impresso.js: uma folha
//    com buraco branco no lugar do código vai para a parede e ninguém mais confere.
//
// 2) PRODUTO QUE NÃO EXISTE NÃO VIRA ESPAÇO EM BRANCO. O arranjo da folha cita produto por NOME.
//    Se o nome mudar no cadastro, o certo é pular e avisar na tela — e não imprimir um cartão
//    vazio, nem um "R$ 0,00", que é o que o lojista só descobre depois de pagar a gráfica.
//
// 3) O PREÇO DO PAPEL É O PREÇO DO SISTEMA. Não existe segunda lista aqui dentro. Se este teste
//    passar a comparar com número escrito à mão, ele perde o sentido — por isso ele confere
//    contra o que está na fixture, não contra constante minha.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';

const PAGINA = fs.readFileSync(path.join(RAIZ, 'cardapio-folha.html'), 'utf8');

// O gerador de QR DE VERDADE, nao um duble: a folha so e desenhada se ele devolver o codigo, e
// um duble que sempre devolve string esconderia justamente o caso de ele estourar.
const ctxQr = { console, TextEncoder };
vm.createContext(ctxQr);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets/js/qr.js'), 'utf8'), ctxQr);
const BORA_QR = ctxQr.BoraQR;
const CARDAPIO = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'testes/fixtures/cardapio-loja-18.json'), 'utf8'));

/** O <script> de dentro da página. Se a página deixar de ter um, o teste precisa morrer. */
function fonteDaPagina() {
  const m = PAGINA.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'a pagina nao tem mais um <script> inline: este teste nao mede mais nada');
  return m[1];
}

const money = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
const acha = (nome) => {
  const p = CARDAPIO.produtos.find((x) => x.nome === nome);
  assert.ok(p, 'a fixture nao tem o produto ' + nome);
  return p;
};

/** Roda a página e devolve o HTML que ela desenhou, o recado da barra e o aviso de tela. */
async function abrir({ qrFalha = false, cardapio = CARDAPIO, status = 200,
                       alturaDaFolhaMm = 250 } = {}) {
  const els = {};
  const el = (id) => (els[id] = els[id] || {
    id, innerHTML: '', textContent: '', addEventListener() {},
  });

  // A página se mede para avisar quando a folha passa do A4. Aqui a régua é de mentira: o teste
  // diz quantos milímetros cada folha "tem", e confere os dois caminhos.
  const folhasFalsas = () => {
    const n = ((els.saida || {}).innerHTML || '').split('class="folha"').length - 1;
    return Array.from({ length: n }, () => ({
      getBoundingClientRect: () => ({ height: alturaDaFolhaMm * (96 / 25.4) }),
    }));
  };

  const ctx = {
    document: {
      getElementById: el, addEventListener() {}, title: '',
      querySelectorAll: (sel) => (sel === '.folha' ? folhasFalsas() : []),
    },
    location: { origin: 'https://borahapp.com.br', pathname: '/cardapio-folha.html', search: '?loja=18' },
    // O QR: ou monta, ou estoura. É o interruptor do teste.
    BoraQR: {
      dataUri: (texto, o) => {
        if (qrFalha) throw new Error('texto longo demais para o QR');
        return BORA_QR.dataUri(texto, o);
      },
    },
    fetch: async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => cardapio,
    }),
    URLSearchParams, Promise, setTimeout, clearTimeout, Date,
    console,
  };
  ctx.window = { print() {} };

  const nomes = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  new Function(...nomes, fonteDaPagina())(...nomes.map((n) => ctx[n]));

  // o IIFE não devolve a promessa; espero a tela parar de mudar
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 1));
    if (els.saida && (els.saida.innerHTML || (els.avisos && els.avisos.innerHTML))) break;
  }
  return {
    html: (els.saida || {}).innerHTML || '',
    estado: (els.estado || {}).textContent || '',
    aviso: (els.avisos || {}).innerHTML || '',
  };
}

// ---------------------------------------------------------------- a premissa
test('PREMISSA: QR que nao carrega NAO desenha folha nenhuma', async () => {
  const r = await abrir({ qrFalha: true });
  assert.equal(r.html, '',
    'desenhou a folha sem o QR: iria para a parede com o codigo em branco');
  assert.match(r.aviso, /n[aã]o montei/i);
  assert.match(r.aviso, /nada foi desenhado/i);
});

test('cardapio que responde erro nao vira folha pela metade', async () => {
  const r = await abrir({ status: 503 });
  assert.equal(r.html, '');
  assert.match(r.aviso, /503/);
});

test('loja sem produto ativo nao gera folha em branco', async () => {
  const r = await abrir({ cardapio: { ...CARDAPIO, produtos: [] } });
  assert.equal(r.html, '');
  assert.match(r.aviso, /nenhum produto ativo/i);
});

// ---------------------------------------------------------------- o que sai no papel
test('sao duas folhas A4, e as duas levam o QR', async () => {
  const r = await abrir();
  assert.equal((r.html.match(/class="folha"/g) || []).length, 2,
    'a folha mudou de quantidade de paginas');
  assert.equal((r.html.match(/data:image\/svg\+xml/g) || []).length, 2,
    'cada pagina precisa do seu QR: quem pega a folha 2 na mesa tambem tem de poder pedir');
});

test('o endereco sai escrito, nao so no codigo', async () => {
  const r = await abrir();
  assert.ok(r.html.includes('borahapp.com.br/cardapio.html?loja=18'),
    'quem nao conseguir ler o codigo precisa poder digitar');
});

test('os tres especiais saem com a foto e o preco DO CADASTRO', async () => {
  const r = await abrir();
  for (const nome of ['Barca de Açaí Gourmet', 'Titanic Tamanho Família', 'Roleta de Açaí Gourmet']) {
    const p = acha(nome);
    assert.ok(r.html.includes(nome), 'faltou ' + nome);
    assert.ok(r.html.includes(money(p.preco)),
      nome + ' saiu com preco diferente do cadastro (esperado ' + money(p.preco) + ')');
    assert.ok(r.html.includes(p.imagem), 'a foto de ' + nome + ' nao entrou');
  }
});

test('o Acai Puro sai com TODOS os recipientes do cadastro, nao com quatro na mao', async () => {
  const r = await abrir();
  const monte = acha('Monte Seu Açaí');
  const rec = monte.complementos.find((g) => g.nome === 'Recipientes');
  assert.ok(rec.itens.length >= 4);
  for (const i of rec.itens) {
    assert.ok(r.html.includes(money(Number(monte.preco) + Number(i.preco))),
      'o recipiente ' + i.nome + ' nao saiu na tira do Acai Puro pelo preco que se paga');
  }
});

test('PREMISSA: o preco do Acai Puro no papel e BASE + COPO, nao so o copo', async () => {
  // O recipiente e complemento do produto "Monte Seu Açaí": o carrinho cobra a base mais o copo.
  // Enquanto a base estiver em R$ 90,00, imprimir so o copo prometeria R$ 10,00 numa coisa que
  // sai R$ 100,00 no app -- o papel e a tela discordando no numero que mais importa.
  const monte = acha('Monte Seu Açaí');
  assert.ok(Number(monte.preco) > 0, 'a fixture zerou a base: este teste deixou de medir');
  const copo = monte.complementos.find((g) => g.nome === 'Recipientes')
    .itens.find((i) => i.nome === 'Copo 300ml Puro');

  const r = await abrir();
  assert.ok(r.html.includes(money(Number(monte.preco) + Number(copo.preco))),
    'o papel nao somou a base ao copo');
  assert.ok(!new RegExp('"vl">' + money(copo.preco).replace(/\$/, '\$')).test(r.html),
    'o papel imprimiu o preco do copo sozinho, que ninguem consegue pagar');
});

test('com a base zerada, o papel passa a mostrar o preco do copo — igual ao cardapio novo', async () => {
  const copia = JSON.parse(JSON.stringify(CARDAPIO));
  const m = copia.produtos.find((p) => p.nome === 'Monte Seu Açaí');
  m.preco = 0;
  m.complementos.find((g) => g.nome === 'Recipientes')
    .itens.find((i) => i.nome === 'Copo 300ml Puro').preco = 12.90;

  const r = await abrir({ cardapio: copia });
  assert.ok(r.html.includes('R$ 12,90'), 'com a base zerada o copo tem de sair pelo proprio preco');
  assert.ok(!/base \+ copo/.test(r.html), 'continuou dizendo "base + copo" sem base nenhuma');
});

test('a folha diz ONDE pedir o Acai Puro no app', async () => {
  // Quem le o papel procura "Açaí Puro 300ml" no celular e nao acha: no app aquilo e uma escolha
  // dentro de outro item. Sem esta linha, o papel manda o cliente procurar o que nao existe.
  const r = await abrir();
  assert.match(r.html, /No celular[\s\S]{0,80}Monte Seu Açaí[\s\S]{0,40}escolha o tamanho/,
    'a folha nao conta onde o Acai Puro fica no cardapio digital');
});

test('o "monte seu acai" separa fruta, calda e creme — e nao repete item entre colunas', async () => {
  const r = await abrir();
  const bloco = r.html.slice(r.html.indexOf('Monte seu Açaí'));
  for (const col of ['FRUTAS', 'CALDAS', 'CREMES', 'DOCES &amp; CROCANTES']) {
    assert.ok(bloco.includes(col), 'faltou a coluna ' + col);
  }
  // Banana e fruta, e so fruta: o mesmo adicional em duas colunas confunde quem le
  assert.equal((bloco.match(/>Banana</g) || []).length, 1,
    'Banana apareceu em mais de uma coluna');
  assert.equal((bloco.match(/>Creme de Avelã</g) || []).length, 1);
});

test('adicional desconhecido cai em DOCES em vez de desaparecer da folha', async () => {
  const copia = JSON.parse(JSON.stringify(CARDAPIO));
  const monte = copia.produtos.find((p) => p.nome === 'Monte Seu Açaí');
  monte.complementos.find((g) => g.nome === 'Adicionais Extras')
    .itens.push({ nome: 'Pistache Novo', preco: 6.5 });
  const r = await abrir({ cardapio: copia });
  assert.ok(r.html.includes('Pistache Novo'),
    'adicional novo no cadastro sumiu da folha: o lojista vende e o papel nao conta');
  assert.ok(r.html.includes('R$ 6,50'));
});

test('o Zira Tradicional sai com os quatro tamanhos', async () => {
  const r = await abrir();
  for (const nome of ['Copo de Açaí 300ml', 'Copo de Açaí 500ml', 'Copo de Açaí 770ml',
                      'Pote de Açaí 1L']) {
    assert.ok(r.html.includes(money(acha(nome).preco)), 'faltou o preco de ' + nome);
  }
});

test('a promocao sai com o preco do cadastro', async () => {
  const r = await abrir();
  const p = acha('Leve 5 Pague 4 Açaí');
  assert.match(r.html, /Pague 4, leve 5/);
  assert.ok(r.html.includes(money(p.preco)));
});

test('o selo de "4 adicionais gratis" so aparece onde o cadastro tem o grupo', async () => {
  const r = await abrir();
  const temGrupo = (n) => acha(n).complementos.some((g) => g.nome === '4 Adicionais Grátis');
  assert.ok(temGrupo('Barca de Açaí Gourmet'), 'a fixture mudou: a Barca perdeu o grupo gratis');
  assert.ok(!temGrupo('Titanic Tamanho Família'), 'a fixture mudou: o Titanic ganhou o grupo');

  // o selo fica DENTRO do cartao; conto quantos cartoes de destaque o tem
  const cartoes = r.html.split('<div class="card">');
  const barca = cartoes.find((c) => c.includes('Barca de Açaí Gourmet'));
  const titanic = cartoes.find((c) => c.includes('Titanic Tamanho Família'));
  assert.ok(barca.includes('4 adicionais grátis'), 'a Barca tem o grupo e nao saiu com o selo');
  assert.ok(!titanic.includes('4 adicionais grátis'),
    'o Titanic NAO tem o grupo e saiu com o selo: a folha promete de graca o que a loja cobra');
});

// ---------------------------------------------------------------- o que falta no cadastro
test('PREMISSA: produto do arranjo que nao existe e PULADO e AVISADO, nunca cartao vazio', async () => {
  const copia = JSON.parse(JSON.stringify(CARDAPIO));
  copia.produtos = copia.produtos.filter((p) => p.nome !== 'Leve 5 Pague 4 Açaí');
  const r = await abrir({ cardapio: copia });
  assert.ok(!r.html.includes('Pague 4, leve 5'),
    'desenhou a faixa da promocao sem a promocao existir');
  assert.ok(!r.html.includes('R$ 0,00'), 'saiu um preco zero no papel');
  assert.match(r.aviso, /Leve 5 Pague 4/, 'nao avisou na tela que pulou');
  assert.ok(r.html.includes('class="folha"'), 'o resto da folha tinha de sair normalmente');
});

test('os tres da casa saem mesmo sem os tamanhos ainda cadastrados, e a tela diz', async () => {
  // Hoje o cadastro tem "Ziraniho" solto (sem "Ziraninho 300ml" etc.). A folha tem de sair com um
  // preco so, e a TELA tem de contar isso -- e nao o papel.
  const r = await abrir();
  assert.ok(r.html.includes('Ziraçoca') && r.html.includes('Ziratella'),
    'os especiais da casa nao sairam');
  assert.ok(r.html.includes(money(acha('Ziraniho').preco)),
    'o Ziraninho saiu sem o preco que esta no cadastro');
  assert.match(r.aviso, /s[óo] existe um tamanho/i,
    'a tela nao avisou que os tamanhos ainda nao estao cadastrados');
  assert.ok(!r.aviso.includes('&amp;amp;'), 'o aviso saiu com escape duplo');
});

test('quando os tamanhos existirem, a folha passa a mostrar os tres precos', async () => {
  const copia = JSON.parse(JSON.stringify(CARDAPIO));
  const base = copia.produtos.find((p) => p.nome === 'Ziraniho');
  copia.produtos = copia.produtos.filter((p) => p.nome !== 'Ziraniho');
  for (const [t, v] of [['300ml', 24.90], ['500ml', 29.90], ['770ml', 34.90]]) {
    copia.produtos.push({ ...base, id: base.id * 100 + parseInt(t, 10), nome: 'Ziraninho ' + t, preco: v });
  }
  const r = await abrir({ cardapio: copia });
  const cartao = r.html.split('<div class="card">').find((c) => c.includes('>Ziraninho<'));
  assert.ok(cartao, 'o cartao do Ziraninho nao saiu');
  for (const v of ['R$ 24,90', 'R$ 29,90', 'R$ 34,90']) {
    assert.ok(cartao.includes(v), 'faltou ' + v + ' no cartao do Ziraninho');
  }
  assert.ok(!/Ziraninho[\s\S]{0,400}s[óo] existe um tamanho/.test(r.aviso),
    'avisou falta de tamanho quando os tres existem');
});

// ---------------------------------------------------------------- marca
test('a folha usa a marca da loja, e nao a da plataforma', async () => {
  const r = await abrir();
  assert.ok(r.html.includes('Zirá Açaíteria'));
  assert.ok(r.html.includes(CARDAPIO.marca.logoUrl), 'a logo da loja nao entrou');
  // o endereco borahapp.com.br TEM de estar na folha -- quem nao le o QR digita. O que nao pode
  // e a marca da plataforma aparecer como texto, fora do endereco.
  const semEndereco = r.html.replace(/borahapp\.com\.br/g, '');
  assert.ok(!/bora\s*happ/i.test(semEndereco), 'a folha saiu com a marca da plataforma escrita');
});

// ---------------------------------------------------------------- a regua da folha
test('quando a folha passa do A4, a TELA avisa antes de alguem imprimir', async () => {
  const r = await abrir({ alturaDaFolhaMm: 310 });
  assert.ok(r.html.includes('class="folha"'), 'a folha tinha de sair mesmo assim');
  assert.match(r.aviso, /n[aã]o cabe mais no A4/i);
  assert.match(r.aviso, /folha 1 passou 13mm/,
    'o aviso precisa dizer QUANTO passou, senao ninguem sabe o que tirar');
});

test('folha que cabe nao inventa aviso de estouro', async () => {
  const r = await abrir({ alturaDaFolhaMm: 290 });
  assert.ok(!/n[aã]o cabe mais no A4/i.test(r.aviso),
    'avisou estouro numa folha que cabe: aviso que mente deixa de ser lido');
});

test('PREMISSA: se a regua quebrar, a folha sai do mesmo jeito', async () => {
  // Antes uma folha sem o aviso do que nenhuma folha. Esta era uma regressao de verdade: a
  // primeira versao da regua derrubava a pagina inteira num ambiente sem querySelectorAll.
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, innerHTML: '', textContent: '', addEventListener() {} });
  const ctx = {
    document: {
      getElementById: el, addEventListener() {}, title: '',
      querySelectorAll: () => { throw new Error('sem regua'); },
    },
    location: { origin: 'https://borahapp.com.br', pathname: '/cardapio-folha.html', search: '?loja=18' },
    BoraQR: BORA_QR,
    fetch: async () => ({ ok: true, status: 200, json: async () => CARDAPIO }),
    URLSearchParams, Promise, setTimeout, clearTimeout, Date, console,
  };
  ctx.window = { print() {} };
  const nomes = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  new Function(...nomes, fonteDaPagina())(...nomes.map((n) => ctx[n]));
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 1));
    if (els.saida && els.saida.innerHTML) break;
  }
  assert.ok((els.saida || {}).innerHTML.includes('Barca de Açaí Gourmet'),
    'a regua derrubou a folha inteira');
});
