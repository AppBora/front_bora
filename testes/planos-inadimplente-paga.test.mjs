// O lojista inadimplente tem que ver um botão que PAGA, não um que apaga a dívida.
//
// O DEFEITO (medido em 20/10/2026): a única ação oferecida a quem tinha fatura em aberto era
// "Reativar assinatura" — e era exatamente ela que cancelava a assinatura no Asaas (levando a fatura
// atrasada com ela) e criava outra com mais 7 dias de cortesia. Teste grátis infinito, e o caminho
// estava aberto de propósito para a loja bloqueada, ou seja, para quem tinha motivo de usar.
//
// Agora o servidor recusa (409) e manda o link da fatura no GET. A tela TEM que oferecer o caminho
// certo — recusar sem dar alternativa deixaria o lojista bloqueado sem nenhuma ação possível.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const JS = fs.readFileSync(
  'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/assets/js/planos.js', 'utf8');
const CODIGO = JS.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

test('planos: inadimplente COM fatura vê "Pagar a fatura", não "Reativar"', () => {
  assert.match(CODIGO, /Pagar a fatura/, 'o botão de pagar tem que existir');
  assert.match(CODIGO, /a\.status === 'INADIMPLENTE' && temFatura/,
    'o caminho do inadimplente com fatura tem que ser tratado ANTES do "reativar"');
});

test('planos: o botao de pagar usa o link que o servidor mandou', () => {
  assert.match(CODIGO, /href="\$\{encodeURI\(a\.faturaLink\)\}"/,
    'o link vem do servidor (AssinaturaView.faturaLink), não é montado na tela');
  assert.match(CODIGO, /rel="noopener"/, 'link externo em nova aba precisa de noopener');
});

test('planos: inadimplente com fatura NAO cai no "precisaReativar"', () => {
  // Se caísse, a tela mostraria o botão que o servidor agora recusa com 409 — o lojista clicaria e
  // levaria um erro, sem saber o que fazer.
  const m = CODIGO.match(/const precisaReativar = ([\s\S]*?);/);
  assert.ok(m, 'não achei o precisaReativar');
  assert.match(m[1], /INADIMPLENTE' && !temFatura/,
    'inadimplente só "reativa" quando NÃO há fatura para pagar');
});

test('planos: CANCELADA continua podendo reativar', () => {
  // O conserto não pode trancar quem realmente precisa reassinar.
  const m = CODIGO.match(/const precisaReativar = ([\s\S]*?);/);
  assert.match(m[1], /'CANCELADA'/, 'assinatura cancelada continua com o botão de reativar');
});

test('planos: a tela DIZ que criar assinatura nova nao apaga a fatura', () => {
  // É a parte que o lojista precisa entender, e era justamente o que o sistema fazia antes.
  assert.match(CODIGO, /não apaga esta/, 'tem que explicar por que não existe atalho');
});

test('planos: mostra valor e vencimento da fatura quando o servidor manda', () => {
  assert.match(CODIGO, /a\.faturaVencimento/);
  assert.match(CODIGO, /a\.faturaValor/);
  assert.match(CODIGO, /split\('-'\)\.reverse\(\)\.join\('\/'\)/,
    'a data tem que aparecer em dd/mm/aaaa, não no formato do banco');
});

test('planos: avisa quando ha cobranca em duplicidade', () => {
  // Quando o cancelamento da assinatura antiga falha, ficam duas vivas no Asaas e o lojista é cobrado
  // duas vezes. Ele tem que saber por aqui, não pelo extrato do banco.
  assert.match(CODIGO, /a\.cobrancaDuplicada/, 'a tela tem que ler a marca que o servidor manda');
  assert.match(CODIGO, /cobrado duas vezes/, 'e dizer isso em português');
});

test('planos: o aviso de duplicidade so aparece quando ha duplicidade', () => {
  const m = CODIGO.match(/const dobro = a\.cobrancaDuplicada([\s\S]*?): '';/);
  assert.ok(m, 'o aviso tem que ser condicional');
});
