// A FOLHA IMPRESSA NÃO PODE SAIR COM O NOME DE OUTRO CLIENTE.
//
// OS DOIS DEFEITOS (varredura de 18/11/2026, consertados em 19/11)
//
// 1) `cardapio-folha.html` resolvia a loja com `... || 18` — e a 18 é a Zirá. Abrir a página sem
//    `?loja=` imprimia a folha dela para quem abrisse.
//
// 2) Mais sério: `cardapio-qr.html` abria essa folha para QUALQUER loja, e **a folha é um desenho
//    feito à mão para a Zirá**. Os blocos, os nomes de produto ("Ziraninho", "Ziraçoca",
//    "Ziratella"), os cabeçalhos ("os três da Zirá", "Zirá Tradicional") e a paleta estão escritos
//    dentro do arquivo. A Pizzaria Bella Napoli clicando em "folha impressa" recebia um papel de
//    açaiteria, quase vazio, com o nome de outro cliente.
//
// O CONSERTO FOI EM DOIS PASSOS, no mesmo dia. Primeiro RECUSAR (melhor que o papel de outro
// cliente). Depois a folha GENÉRICA: montada das categorias reais da loja, na ordem do cardápio
// online dela, com a cor da marca dela. O desenho à mão continua valendo para a loja que o tem.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const FOLHA = fs.readFileSync(RAIZ + 'cardapio-folha.html', 'utf8');

/** Resolve o `lojaId` lido do arquivo, com a busca que se quiser. */
function resolver(busca) {
  const linhas = FOLHA.split('\n');
  const crua = linhas.find(l => l.includes('const lojaCrua'));
  const id = linhas.find(l => l.trim().startsWith('const lojaId'));
  assert.ok(crua && id, 'não achei as linhas que resolvem a loja na folha');
  const fonte = (crua + '\n' + id + '\nreturn lojaId;')
    .replace("new URLSearchParams(location.search)", "new URLSearchParams(busca)");
  return new Function('busca', fonte)(busca);
}

/** A lista de lojas para as quais a folha foi desenhada, lida do arquivo. */
function lojasDesenhadas() {
  const linha = FOLHA.split('\n').find(l => l.includes('const LOJAS_DESENHADAS'));
  assert.ok(linha, 'não achei LOJAS_DESENHADAS na folha');
  return new Function('return ' + linha.slice(linha.indexOf('[')).replace(/;.*$/, ''))();
}

// ----------------------------------------------------------------- a premissa

// A PREMISSA: a folha ainda abre para quem ela foi desenhada. Sem isto, um teste que exigisse
// recusa passaria com uma folha que não abre para ninguém — e a Zirá perderia o cardápio impresso
// que ela usa.
test('premissa: a folha ABRE para a loja que a tem desenhada', () => {
  const lojas = lojasDesenhadas();
  assert.ok(lojas.length > 0, 'a lista está vazia: a folha não abriria para ninguém');
  assert.ok(lojas.includes(18), 'a loja 18 (Zirá) é a dona deste desenho e tem de continuar abrindo');
  assert.equal(resolver('?loja=18'), 18);
});

// ----------------------------------------------------------------- o que importa

test('SEM ?loja= a folha NAO cai na Zira', () => {
  assert.equal(resolver(''), null,
    'link sem loja resolveu para alguma coisa: era o `|| 18` que imprimia a folha da Zirá');
  assert.equal(resolver('?loja='), null);
  assert.equal(resolver('?loja=abc'), null);
  assert.equal(resolver('?loja=0'), null);
});

// O CONSERTO EVOLUIU EM 19/11/2026, no mesmo dia.
//
// O primeiro passo foi RECUSAR a loja sem desenho próprio: melhor que entregar o papel de outro
// cliente. O segundo foi parar de recusar e entregar uma folha DE VERDADE — montada das categorias
// reais da loja, na ordem do cardápio online dela, com a cor da marca dela.
//
// Os testes abaixo trocaram de sentido junto: o que exigia a mensagem de recusa agora exige que a
// folha genérica exista e seja escolhida.
test('loja SEM desenho proprio recebe a folha GENERICA, nao uma recusa', () => {
  const lojas = lojasDesenhadas();
  assert.ok(!lojas.includes(23),
    'a loja 23 (Doce Jardim) está na lista de desenhadas, e o desenho é da Zirá');
  assert.ok(!lojas.includes(1), 'a loja 1 é a de teste');

  assert.ok(/function montarGenerica\(/.test(FOLHA), 'não existe folha genérica');
  assert.ok(/desenhada \? montar\(dados, link\) : montarGenerica\(dados, link\)/.test(FOLHA),
    'a escolha entre o desenho à mão e a folha genérica não está ligada');
  assert.ok(!/ainda n[ãa]o esta pronta para esta loja/i.test(FOLHA),
    'a mensagem de recusa ficou no arquivo: ou a folha genérica não está sendo usada, ou sobrou '
    + 'texto que contradiz o que o código faz');
});

test('a folha generica monta das CATEGORIAS reais, na ordem do cardapio online', () => {
  const i = FOLHA.indexOf('function montarGenerica(');
  const corpo = FOLHA.slice(i, FOLHA.indexOf('\\n  }', i));
  assert.ok(/p\.categoria \|\| 'Outros'/.test(corpo),
    "tem de agrupar por categoria com 'Outros' como sobra — a MESMA regra do cardapio.js, senão o "
    + 'papel sai numa ordem e a tela noutra');
  assert.ok(/grupos\.push/.test(corpo),
    'a ordem de chegada tem de ser preservada: é a ordem que o servidor usa no cardápio online');
  assert.ok(/esgotado/.test(corpo), 'produto esgotado não deve ir para o papel');
  assert.ok(/blocoDoQr\(link\)/.test(corpo), 'a folha genérica também precisa do QR');
});

test('a folha generica usa a COR da marca da loja', () => {
  assert.ok(/function aplicarCorDaLoja\(/.test(FOLHA), 'não existe aplicação da cor da loja');
  const i = FOLHA.indexOf('function montarGenerica(');
  const corpo = FOLHA.slice(i, FOLHA.indexOf('\\n  }', i));
  assert.ok(/aplicarCorDaLoja\(marca\.corPrimaria\)/.test(corpo),
    'a folha genérica não lê a cor da marca — era exatamente o achado: "zero leituras da cor da '
    + 'marca da loja", paleta de açaiteria impressa para quem vende pizza');
});

test('a cor so e aceita se for hexadecimal de verdade', () => {
  const i = FOLHA.indexOf('function aplicarCorDaLoja(');
  const corpo = FOLHA.slice(i, FOLHA.indexOf('\\n  }', i));
  const m = corpo.match(/\/\^#\(\[0-9a-f\]\{3\}\|\[0-9a-f\]\{6\}\)\$\/i/);
  assert.ok(m,
    'a cor vem do cadastro, que é texto que o lojista digita: sem validar, qualquer coisa entra '
    + 'numa propriedade CSS');
});

test('a guarda do link sem loja tambem para antes de desenhar', () => {
  const i = FOLHA.indexOf('if (!lojaId)');
  assert.ok(i > 0, 'não há guarda para o link sem loja');
  assert.ok(/return;/.test(FOLHA.slice(i, i + 500)));
});

// ----------------------------------------------------------------- as duas guardas vem ANTES

test('as duas guardas rodam ANTES de qualquer busca de dados', () => {
  const guardaLoja = FOLHA.indexOf('if (!lojaId)');
  const guardaDesenho = FOLHA.indexOf('if (!LOJAS_DESENHADAS.includes(lojaId))');
  const primeiraBusca = FOLHA.indexOf("fetch('/public/loja/");
  assert.ok(primeiraBusca > 0, 'não achei a busca do cardápio');
  assert.ok(guardaLoja < primeiraBusca,
    'a guarda do link sem loja roda DEPOIS de buscar dados — já teria pedido o cardápio da loja errada');
  assert.ok(guardaDesenho < primeiraBusca,
    'a guarda do desenho roda DEPOIS de buscar dados');
});

// ----------------------------------------------------------------- a repeticao

test('nenhum outro valor padrao de loja na folha', () => {
  const suspeitas = [];
  for (const linha of FOLHA.split('\n')) {
    const t = linha.trim();
    if (t.startsWith('//') || t.startsWith('*')) continue;
    if (/loja\w*\s*(=|\?\?|\|\|)\s*1?[0-9]\s*[;,)]/.test(t) && !t.includes('LOJAS_DESENHADAS')) {
      suspeitas.push(t.slice(0, 110));
    }
  }
  assert.deepEqual(suspeitas, [],
    'alguém voltou a resolver a loja com um valor padrão:\n' + suspeitas.join('\n'));
});
