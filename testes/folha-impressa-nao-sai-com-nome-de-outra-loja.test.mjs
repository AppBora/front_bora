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
// O CONSERTO É RECUSAR, NÃO ADIVINHAR. Folha genérica — montada das categorias reais de cada loja —
// é recurso novo, está anotado como pendência, e não se resolve escondendo o problema. Até existir,
// dizer "ainda não tem" é melhor do que entregar o papel errado.
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

test('a folha RECUSA loja para a qual nao foi desenhada', () => {
  const lojas = lojasDesenhadas();
  assert.ok(!lojas.includes(23),
    'a loja 23 (Doce Jardim) está na lista de desenhadas, e o desenho é da Zirá');
  assert.ok(!lojas.includes(1), 'a loja 1 é a de teste');

  const i = FOLHA.indexOf('if (!LOJAS_DESENHADAS.includes(lojaId))');
  assert.ok(i > 0, 'não há guarda para loja sem desenho próprio');
  const bloco = FOLHA.slice(i, i + 900);
  assert.ok(/ainda n[ãa]o esta|ainda n[ãa]o está/i.test(bloco),
    'a mensagem tem de dizer que a folha ainda não existe para esta loja');
  assert.ok(/QR/.test(bloco),
    'a mensagem tem de dizer o que AINDA funciona para ela (o QR), senão parece que nada funciona');
  assert.ok(/return;/.test(bloco), 'a guarda tem de parar antes de desenhar');
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
