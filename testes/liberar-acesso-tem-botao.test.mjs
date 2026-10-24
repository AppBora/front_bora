// O botão "🔓 Liberar acesso" é o único caminho de tela para devolver prazo a uma loja que vai sair
// do ar. Em 24/10/2026 a Zirá vencia em ~31 horas e o dono pediu para estender: foi aí que eu vi que
// o SERVIÇO tinha teste (LiberarAcessoNaoInventaPagamentoTest) e o BOTÃO não tinha nenhum.
//
// Por que isto não é um teste de clique: em `configuracoes.html` os botões são ligados por
// `wrap.querySelectorAll('button[data-acao]').forEach(b => b.onclick = ...)`, sobre HTML que o
// navegador PARSEOU. O harness daqui não monta DOM de verdade — `innerHTML` continua sendo string —
// então não existe elemento para receber o `onclick`. O que este teste mede é a CORRENTE: cada elo
// que, se desalinhar, deixa o botão morto na tela. Foi exatamente assim que morreram os dois botões
// dos importadores (`disabled` que ninguém tirava) e o arquivo de Acerto (sintaxe), os dois no mesmo
// dia. O elo que falta — o clique de verdade no navegador — só o dono fecha, e está dito no fim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.join(import.meta.dirname, '..');
const CONFIG = fs.readFileSync(path.join(RAIZ, 'configuracoes.html'), 'utf8');

test('PREMISSA: o painel da plataforma desenha botões por data-acao e os liga por esse mesmo atributo', () => {
  // Se o gerador e o seletor divergirem, TODOS os botões da lista de clientes morrem de uma vez —
  // liberar, suspender, arquivar, entrar na loja. Este é o elo mais barato de quebrar sem perceber.
  assert.match(CONFIG, /function botao\(acao, id, texto, cor\)/,
    'o gerador de botões do painel mudou de forma: o resto deste teste mede o lugar errado');
  assert.match(CONFIG, /data-acao="\$\{acao\}"/,
    'o botão parou de carregar data-acao — nada mais seria ligado');
  assert.match(CONFIG, /querySelectorAll\('button\[data-acao\]'\)/,
    'a fiação parou de procurar por button[data-acao]: os botões ficam desenhados e mortos');
  assert.match(CONFIG, /btn\.dataset\.acao/,
    'quem recebe o clique parou de ler dataset.acao');
});

test('o botão de liberar existe, com o nome que o dono procura na tela', () => {
  assert.match(CONFIG, /botao\('liberar', c\.id, '🔓 Liberar acesso'/,
    'o botão "🔓 Liberar acesso" saiu da tela — some o único caminho de devolver prazo sem '
    + 'dizer que entrou dinheiro que não entrou');
});

test('o botão APARECE para loja com data de vencimento — o caso da Zirá', () => {
  // Medido em produção em 24/10/2026: loja 18 com acesso_ate preenchido e motivo PAGAMENTO_MANUAL.
  // `temPrazo` é o que decide se o botão sai; se virasse só "assinatura cancelada", a loja que
  // pagou por fora e está vencendo ficaria SEM botão — justo o caso em que ele é necessário.
  assert.match(CONFIG, /const temPrazo = !!c\.acessoAte/,
    'a condição do botão parou de olhar a data de acesso: loja vencendo fica sem como ser liberada');
});

test('o campo que a condição lê é o que a API realmente manda', () => {
  // O elo entre back e front. A lista vem de ClienteView, e lá o campo se chama `acessoAte`. Se o
  // nome mudar de um lado só, `temPrazo` vira sempre falso e o botão desaparece em silêncio — sem
  // erro no console, sem nada na tela.
  const view = fs.readFileSync(
    path.join(RAIZ, '..', 'bora-fase-3-backend-java', 'src', 'main', 'java', 'br', 'com', 'bora',
      'dto', 'ClienteView.java'), 'utf8');
  assert.match(view, /OffsetDateTime acessoAte/,
    'ClienteView não manda mais acessoAte: o botão de liberar desaparece do painel');
});

test('o clique chama o endpoint certo, com data E motivo no corpo', () => {
  // O serviço recusa (400) sem motivo e sem data, de propósito: "acesso liberado sem motivo vira
  // mistério depois". Se a tela não mandar os dois, o dono só vê "Erro:" e o acesso não volta.
  assert.match(CONFIG, /'\/admin-bora\/lojas\/' \+ id \+ '\/liberar-acesso'/,
    'a tela parou de chamar /liberar-acesso');
  assert.match(CONFIG, /JSON\.stringify\(\{ ate: String\(ate\)\.trim\(\), motivo: String\(motivo\)\.trim\(\) \}\)/,
    'o corpo perdeu `ate` ou `motivo`: o servidor devolve 400 e o acesso não volta');
});

test('a tela cobra o motivo ANTES de chamar o servidor', () => {
  // Não é frescura: sem isto o dono digita a data, leva 400 do servidor e tem de adivinhar que o
  // que faltava era o motivo.
  assert.match(CONFIG, /Sem motivo não dá/,
    'a tela deixou de cobrar o motivo antes de chamar — o erro volta a ser um 400 sem explicação');
});

test('liberar NÃO registra pagamento — é isto que separa este botão do "Recebi o pagamento"', () => {
  // O risco de negócio: se este botão passasse a lançar receita, cortesia e negociação em andamento
  // entrariam no caixa como dinheiro que nunca entrou.
  const trecho = CONFIG.slice(CONFIG.indexOf("if (acao === 'liberar')"),
    CONFIG.indexOf("if (acao === 'entrar')"));
  assert.ok(trecho.length > 200, 'não achei o ramo do liberar: este teste está medindo nada');
  assert.doesNotMatch(trecho, /pagamento-recebido/,
    'o botão de liberar passou a registrar pagamento: vira receita que não existiu');
});
