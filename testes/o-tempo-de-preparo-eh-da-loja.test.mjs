// ITEM 5 DA SECAO 4 DA VARREDURA (confirmado em 19/11/2026, consertado em 20/11).
//
// O DEFEITO: o tempo prometido estava cravado no `app.js` -- a tabela `BORA_SLA`, por canal, que
// NENHUMA loja escolhia. A pizzaria cujo forno leva 45 minutos via TODO pedido marcado "Atrasado":
// o cartao da cozinha ficava vermelho sempre, e um alerta que acende sempre deixa de ser alerta.
// O acai que sai em 5 minutos nunca acendia nada.
//
// Estes testes rodam o `app.js` DE VERDADE (via helpersDoApp), nao uma copia da regra: e o mesmo
// arquivo que o navegador do lojista carrega.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { helpersDoApp, semComentarios } from './harness.mjs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';

const entrega = (origem) => ({ origem, tipoEntrega: 'ENTREGA' });
const retirada = (origem) => ({ origem, tipoEntrega: 'RETIRADA' });

// ============================================================================ a premissa

// SEM ISTO, todo teste abaixo passaria com um boraSla que devolve um numero fixo -- e o alerta de
// atraso do quadro inteiro pararia de funcionar com a suite verde.
test('premissa: sem tempo configurado, vale a tabela por canal de sempre', () => {
  const { boraSla } = helpersDoApp(RAIZ);          // nada guardado: e o estado das 23 lojas hoje
  assert.equal(boraSla('Balcão'), 12);
  assert.equal(boraSla('WhatsApp'), 25);
  assert.equal(boraSla('iFood'), 40);
  assert.equal(boraSla('canal que nao existe'), 30, 'o padrao de 30 min continua sendo o padrao');
});

// ============================================================================ o conserto

test('com o preparo da loja, o pedido de RETIRADA usa so o preparo', () => {
  const { boraSla } = helpersDoApp(RAIZ, { tema: { preparo: 45, entrega: 20 } });
  assert.equal(boraSla('Site', retirada('Site')), 45,
    'quem vem buscar no balcao nao tem rua: somar a entrega era o motivo de serem DOIS campos');
});

test('com o preparo da loja, a ENTREGA soma a rua', () => {
  const { boraSla } = helpersDoApp(RAIZ, { tema: { preparo: 45, entrega: 20 } });
  assert.equal(boraSla('Site', entrega('Site')), 65);
  assert.equal(boraSla('iFood', entrega('iFood')), 65,
    'o canal deixa de mandar no tempo: quem manda e a cozinha da loja');
});

test('a pizzaria de 45 min deixa de ver todo pedido atrasado', () => {
  // O caso que originou o item. Antes: SLA 35 (Delivery) com um pedido de 40 minutos = ATRASADO,
  // sempre, em cozinha nenhuma que leve 45. Agora o prazo e o da loja.
  const semConfig = helpersDoApp(RAIZ).boraSla;
  const comConfig = helpersDoApp(RAIZ, { tema: { preparo: 45, entrega: 15 } }).boraSla;
  const pedido = entrega('Delivery');
  const minutosDecorridos = 40;

  assert.ok(minutosDecorridos >= semConfig('Delivery', pedido),
    'antes: 40 min contra SLA 35 -- marcado como atrasado');
  assert.ok(minutosDecorridos < comConfig('Delivery', pedido),
    'agora: 40 min contra 60 (45 de forno + 15 de rua) -- no prazo');
});

test('o Balcao nunca soma a rua, qualquer que seja o pedido', () => {
  const { boraSla } = helpersDoApp(RAIZ, { tema: { preparo: 10, entrega: 25 } });
  assert.equal(boraSla('Balcão', { origem: 'Balcão' }), 10);
  assert.equal(boraSla('Balcão', entrega('Balcão')), 10,
    'pedido de balcao marcado como entrega continua sem rua: ele e entregue no proprio balcao');
});

test('sem saber se vai para a rua, soma a entrega (o lado seguro)', () => {
  // Pedido anterior a V48 nao tem `tipoEntrega` nem texto de retirada. SLA maior do que o real
  // atrasa o alerta; menor acende alerta em pedido que esta no prazo -- que e o defeito deste item.
  const { boraSla } = helpersDoApp(RAIZ, { tema: { preparo: 30, entrega: 15 } });
  assert.equal(boraSla('Site', { origem: 'Site' }), 45);
  assert.equal(boraSla('Site'), 45, 'chamada com um argumento so (compatibilidade) tambem');
});

test('a retirada tambem e reconhecida pelo texto do pedido antigo', () => {
  const { boraSla } = helpersDoApp(RAIZ, { tema: { preparo: 30, entrega: 15 } });
  assert.equal(boraSla('Site', { origem: 'Site', observacao: 'RETIRADA NO BALCÃO - cliente avisa' }), 30);
});

// ============================================================================ voltar atras

test('preparo vazio ou zerado volta ao automatico', () => {
  // O campo limpo tem de VOLTAR ao padrao -- e por isso o whitelabel.js APAGA a chave em vez de
  // manter a antiga, e o servidor grava NULL quando a tela manda 0.
  assert.equal(helpersDoApp(RAIZ, { tema: { entrega: 20 } }).boraSla('Site', entrega('Site')), 30,
    'sem preparo, a entrega sozinha nao inventa prazo nenhum');
  assert.equal(helpersDoApp(RAIZ, { tema: { preparo: 0, entrega: 20 } }).boraSla('Site', entrega('Site')), 30,
    'preparo 0 nao pode virar SLA 0: isso marcaria todo pedido como atrasado na entrada');
  assert.equal(helpersDoApp(RAIZ, { tema: { preparo: null } }).boraSla('WhatsApp'), 25);
  assert.equal(helpersDoApp(RAIZ, { tema: { preparo: 'quarenta' } }).boraSla('WhatsApp'), 25,
    'texto no lugar do numero nao pode virar NaN minutos');
});

test('entrega vazia e entrega zero dao o mesmo resultado', () => {
  const comZero = helpersDoApp(RAIZ, { tema: { preparo: 30, entrega: 0 } }).boraSla;
  const semNada = helpersDoApp(RAIZ, { tema: { preparo: 30 } }).boraSla;
  assert.equal(comZero('Site', entrega('Site')), 30);
  assert.equal(semNada('Site', entrega('Site')), 30);
});

// ============================================================================ a fiacao

test('as duas telas que mostram atraso passam o PEDIDO para o boraSla', () => {
  // ESTE TESTE GUARDA A FIACAO, nao um calculo. Chamar `boraSla(p.origem)` sem o pedido volta a
  // somar a rua em toda retirada -- e isso nao faz nenhum outro teste ficar vermelho.
  for (const arquivo of ['assets/js/kds.js', 'assets/js/pedidos.js']) {
    const fonte = semComentarios(fs.readFileSync(RAIZ + arquivo, 'utf8'));
    assert.ok(/boraSla\(p\.origem,\s*p\)/.test(fonte),
      arquivo + ' chama boraSla sem passar o pedido: a retirada volta a somar o tempo de rua');
  }
});

test('o whitelabel APAGA os tempos quando a loja limpa o campo', () => {
  // Mantidos, o lojista que limpasse o campo continuaria com o tempo antigo valendo na tela da
  // cozinha, e a unica saida seria limpar o navegador. Ja houve um defeito desta familia aqui: o
  // NOME de uma loja sobrando no navegador e saindo impresso na comanda de outra.
  const fonte = semComentarios(fs.readFileSync(RAIZ + 'assets/js/whitelabel.js', 'utf8'));
  assert.ok(/delete tema\.preparo/.test(fonte), 'o preparo nao e apagado quando vem vazio');
  assert.ok(/delete tema\.entrega/.test(fonte), 'a entrega nao e apagada quando vem vazia');
  assert.ok(/tempoPreparoMin/.test(fonte) && /tempoEntregaMin/.test(fonte),
    'o whitelabel nao le os campos da API: a tela da cozinha nunca saberia do tempo da loja');
});

test('a tela de configuracoes tem os dois campos, e manda os dois', () => {
  const html = fs.readFileSync(RAIZ + 'configuracoes.html', 'utf8');
  assert.ok(/id="tempoPreparoMin"/.test(html), 'sem campo na tela, o endpoint fica sem dono');
  assert.ok(/id="tempoEntregaMin"/.test(html));
  const js = semComentarios(fs.readFileSync(RAIZ + 'assets/js/configuracoes.js', 'utf8'));
  assert.ok(/tempoPreparoMin:/.test(js) && /tempoEntregaMin:/.test(js),
    'os campos existem na tela mas nao vao no corpo do PUT');
  assert.ok(/num\('tempoPreparoMin'/.test(js),
    'a tela nao recarrega o que foi salvo: o lojista nao ve o proprio valor ao voltar');
});
