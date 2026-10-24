// #21 e #19 da lista de 23/10.
//
// #21a A Ajuda não apontava para os termos nem para a privacidade. As duas páginas existem no
//      site desde sempre (`/termos.html`, `/privacidade.html`, conferido: http 200) — quem
//      procurava dentro do painel simplesmente não achava.
//
// #21b Nenhuma tela dizia com que CONTA e com que PAPEL você está. Quem opera com duas contas —
//      a do dono e a do balconista — não tinha como saber de qual lado estava, e o papel muda o
//      que cada tela deixa fazer. Descobrir por tentativa ("por que esse botão não aparece?")
//      custa mais caro que uma linha de texto.
//
// #19 A migração por foto é ADD-ON PAGO (`loja.moduloIa`, liberado só pelo adm). Trazê-la para
//     Produtos daria de graça um recurso cobrado — então o conserto é de DESCOBERTA: Produtos
//     aponta para onde ela fica, dizendo que é do módulo IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const RAIZ = process.env.BORA_FRONT
  || 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend';
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// ================================================================= #21a
test('#21a a Ajuda aponta para os termos e para a privacidade', () => {
  const h = ler('ajuda.html');
  assert.match(h, /borahapp\.com\.br\/termos\.html/);
  assert.match(h, /borahapp\.com\.br\/privacidade\.html/);
});

test('#21a os links abrem fora, sem derrubar o painel', () => {
  const h = ler('ajuda.html');
  const links = [...h.matchAll(/<a href="https:\/\/borahapp\.com\.br\/(termos|privacidade)\.html"[^>]*>/g)];
  assert.ok(links.length >= 2, 'faltou algum link');
  for (const l of links) {
    assert.match(l[0], /target="_blank"/, 'o link tira o lojista do painel no meio do trabalho');
    assert.match(l[0], /rel="noopener"/, 'target=_blank sem noopener entrega a janela para a outra página');
  }
});

// ================================================================= #21b
/** Roda só a função renderQuemSouEu do app.js, com um DOM de mentira. */
function rodarQuemSouEu(user) {
  const criados = [];
  const brand = {
    inserido: null,
    insertAdjacentElement(_pos, el) { this.inserido = el; },
  };
  const elemento = () => {
    const e = { id: '', style: {}, innerHTML: '', textContent: '',
      set cssText(v) { this.style.cssText = v; } };
    criados.push(e);
    return e;
  };
  const ctx = {
    Bora: { token: () => 'x', user: () => user },
    document: {
      querySelector: (sel) => (sel.includes('brand') ? brand : null),
      getElementById: () => null,
      createElement: () => {
        const e = elemento();
        e.style = {};
        return e;
      },
      addEventListener() {},
      head: { appendChild() {} }, body: { appendChild() {} },
      documentElement: { style: {} },
    },
    window: {}, location: { pathname: '/dashboard.html', origin: 'http://t' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {}, console, Date, JSON, Math, setTimeout, clearTimeout,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('assets/js/app.js') + '\n;renderQuemSouEu();', ctx,
    { filename: 'app.js' });
  return brand.inserido;
}

test('PREMISSA: #21b o menu passa a dizer QUEM esta logado e com que papel', () => {
  // OPERADOR de proposito: e um papel que EXISTE no enum, e e o mais comum na loja. Este teste
  // usava "BALCONISTA", que eu tinha inventado -- e por isso nao pegou o defeito.
  const box = rodarQuemSouEu({ nome: 'Maria Souza', papel: 'OPERADOR', lojaId: 18 });
  assert.ok(box, 'nada foi inserido no menu');
  assert.match(box.innerHTML, /Maria Souza/);
  assert.match(box.innerHTML, /Operador/, 'o papel saiu em CAIXA_ALTA_DE_BANCO para o lojista ler');
  assert.ok(!/OPERADOR/.test(box.innerHTML), 'saiu o nome interno do papel');
});

test('#21b o papel e traduzido, nao o nome interno', () => {
  const box = rodarQuemSouEu({ nome: 'João', papel: 'ADMINISTRADOR_LOJA' });
  assert.match(box.innerHTML, /Administrador/);
  assert.ok(!/ADMINISTRADOR_LOJA/.test(box.innerHTML));
});

test('#21b papel desconhecido nao vira caixa vazia', () => {
  const box = rodarQuemSouEu({ nome: 'Ana', papel: 'PAPEL_NOVO' });
  assert.match(box.innerHTML, /Ana/);
  assert.match(box.innerHTML, /PAPEL_NOVO/, 'papel novo tem de aparecer cru, e não sumir');
});

test('#21b o nome do usuario e escapado', () => {
  const box = rodarQuemSouEu({ nome: '<img src=x onerror=alert(1)>', papel: 'GERENTE' });
  assert.ok(!/<img/.test(box.innerHTML), 'o nome entrou como HTML');
  assert.match(box.innerHTML, /&lt;img/);
});

test('#21b sem sessao, nada e inserido', () => {
  const box = rodarQuemSouEu(null);
  assert.equal(box, null);
});

// ================================================================= #19
test('#19 Produtos aponta para a migracao por foto', () => {
  const h = ler('produtos.html');
  assert.match(h, /migra[çc][ãa]o por foto/i, 'o lojista não descobre que isso existe');
  assert.match(h, /configuracoes\.html#cardIA/, 'o ponteiro precisa levar direto ao lugar');
});

test('PREMISSA: #19 a migracao por foto NAO foi trazida para Produtos', () => {
  // Ela é add-on pago (`loja.moduloIa`). Trazer o controle para cá daria o recurso de graça.
  const h = ler('produtos.html');
  assert.ok(!/id="iaFoto"/.test(h),
    'o campo de upload da migração por foto veio para Produtos — é recurso cobrado');
  assert.match(h, /m[óo]dulo IA/i, 'precisa dizer que faz parte do add-on, senão vira promessa falsa');
});

test('PREMISSA: #21b alguem CHAMA o renderQuemSouEu na carga da pagina', () => {
  // Os testes acima chamam a função direto. Sem esta trava, desligar a fiação não quebraria
  // nenhum deles — e a caixa simplesmente não apareceria em tela nenhuma. É a mesma brecha que
  // já deixou cinco testes medindo nada antes (ver AlistagemDeConfigPassaPelaListaBrancaTest).
  const js = ler('assets/js/app.js');
  const carga = js.match(/addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{([^}]*)\}/);
  assert.ok(carga, 'não achei o handler de DOMContentLoaded do app.js');
  assert.match(carga[1], /renderQuemSouEu\(\)/,
    'ninguém chama o renderQuemSouEu: a caixa não aparece em tela nenhuma');
});

test('PREMISSA: #21b o mapa de papeis bate com o enum do servidor', () => {
  // Eu tinha inventado "BALCONISTA" e "ENTREGADOR" aqui. Os testes acima passavam assim: eles
  // mediam o FALLBACK (papel desconhecido sai cru), e por isso o OPERADOR -- o papel mais comum
  // da loja -- aparecia em CAIXA ALTA na tela, que e exatamente o que a caixa queria evitar.
  // Quem achou foi o QA de tela, abrindo o painel com esse papel.
  const java = fs.readFileSync(
    'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-3-backend-java/src/main/java/br/com/bora/entity/Papel.java',
    'utf8');
  const doServidor = [...java.matchAll(/\b(ADMINISTRADOR_BORA|ADMINISTRADOR_LOJA|GERENTE|OPERADOR)\b/g)]
    .map((m) => m[1]);
  const reais = [...new Set(doServidor)].sort();
  assert.ok(reais.length >= 4, 'não consegui ler os papéis do enum — este teste parou de medir');

  const js = ler('assets/js/app.js');
  const mapa = js.match(/const papeis = \{([\s\S]*?)\};/);
  assert.ok(mapa, 'não achei o mapa de papéis');
  const noMapa = [...mapa[1].matchAll(/^\s*([A-Z_]+):/gm)].map((m) => m[1]).sort();

  assert.deepEqual(noMapa, reais,
    'o mapa de papéis não bate com o enum do servidor — papel real sai em CAIXA ALTA na tela, '
    + 'e papel inventado fica aqui enganando quem ler');
});
