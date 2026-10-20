// O que conta como VENDA do dia: uma regra, um lugar.
//
// O DEFEITO (medido em 20/10/2026): a regra estava copiada em três telas, com DUAS versões:
//   caixa.js     -> status !== 'CANCELADO' && !aguardandoPagamento   (certo)
//   dashboard.js -> status !== 'CANCELADO'                           (contava PIX abandonado)
//   canais.js    -> status !== 'CANCELADO'                           (idem)
//
// O número grande da primeira tela ficava MAIOR que o fechamento de caixa do MESMO dia, e o lojista
// não tinha como saber qual acreditar. O servidor já fazia certo em três lugares
// (PedidoRepository.somaReceita, contaPedidosValidos, RelatorioService), então as duas telas também
// discordavam do relatório.
//
// O conserto não foi copiar a condição certa para as outras duas — foi tirar a condição das telas.
// Enquanto houver cópia, uma delas volta a divergir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const JS = RAIZ + 'assets/js/';
const ler = f => fs.readFileSync(JS + f, 'utf8');
/** Sem as linhas de comentário — para medir o que RODA, não o que está escrito sobre. */
const lerCodigo = f => ler(f).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

// ------------------------------------------------------------------ a regra em si

/** Reproduz a função do app.js, sem copiá-la: se alguém mudar lá, isto mede a versão de lá. */
function regraDoArquivo() {
  const fonte = ler('app.js');
  const m = fonte.match(/function boraEhVenda\(p\) \{([\s\S]*?)\n\}/);
  assert.ok(m, 'não achei o boraEhVenda no app.js');
  return new Function('p', m[1]);
}

test('venda: pedido normal conta', () => {
  const ehVenda = regraDoArquivo();
  assert.equal(ehVenda({ status: 'ENTREGUE', aguardandoPagamento: false }), true);
  assert.equal(ehVenda({ status: 'RECEBIDO', aguardandoPagamento: false }), true);
});

test('venda: CANCELADO não conta', () => {
  const ehVenda = regraDoArquivo();
  assert.equal(ehVenda({ status: 'CANCELADO', aguardandoPagamento: false }), false);
});

test('venda: PIX gerado e NÃO pago não conta', () => {
  // É o conserto. Checkout abandonado expira sozinho em 30 min; contar isso é fechar o caixa com
  // dinheiro que nunca entrou.
  const ehVenda = regraDoArquivo();
  assert.equal(ehVenda({ status: 'RECEBIDO', aguardandoPagamento: true }), false);
});

test('venda: PIX PAGO conta', () => {
  // Quando o Asaas confirma, o servidor zera o aguardandoPagamento (PublicController,
  // CobradorDePixService). Se não zerasse, esta regra derrubaria venda paga — e o faturamento ficaria
  // MENOR que a realidade, que é o erro oposto e igualmente ruim.
  const ehVenda = regraDoArquivo();
  assert.equal(ehVenda({ status: 'ENTREGUE', aguardandoPagamento: false }), true);
});

test('venda: pedido antigo, sem a marca, conta', () => {
  // Pedido anterior à coluna, ou de balcão/WhatsApp/marketplace: a marca vem nula ou ausente, e isso
  // significa "não espera PIX". Tratar nulo como pendente apagaria o faturamento inteiro de quem não
  // usa PIX online.
  const ehVenda = regraDoArquivo();
  assert.equal(ehVenda({ status: 'ENTREGUE' }), true);
  assert.equal(ehVenda({ status: 'ENTREGUE', aguardandoPagamento: null }), true);
});

test('esperandoPix: só o que está pendente E não cancelado', () => {
  const fonte = ler('app.js');
  const m = fonte.match(/function boraEsperandoPix\(p\) \{([\s\S]*?)\n\}/);
  assert.ok(m, 'não achei o boraEsperandoPix');
  const f = new Function('p', m[1]);

  assert.equal(f({ status: 'RECEBIDO', aguardandoPagamento: true }), true);
  assert.equal(f({ status: 'RECEBIDO', aguardandoPagamento: false }), false);
  assert.equal(f({ status: 'CANCELADO', aguardandoPagamento: true }), false,
    'PIX pendente de pedido cancelado não vai mais entrar — não é dinheiro em trânsito');
});

test('venda e esperandoPix são MUTUAMENTE exclusivos, e juntos não deixam nada de fora', () => {
  // Se um pedido pudesse ser os dois, ele apareceria no faturamento E no aviso — dinheiro contado
  // duas vezes na mesma tela.
  const ehVenda = regraDoArquivo();
  const fonte = ler('app.js');
  const esperando = new Function('p',
    fonte.match(/function boraEsperandoPix\(p\) \{([\s\S]*?)\n\}/)[1]);

  for (const status of ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO']) {
    for (const ag of [true, false, null, undefined]) {
      const p = { status, aguardandoPagamento: ag };
      assert.ok(!(ehVenda(p) && esperando(p)),
        `${status}/${ag} caiu nos dois: seria contado duas vezes`);
      if (status !== 'CANCELADO') {
        assert.ok(ehVenda(p) || esperando(p),
          `${status}/${ag} nao caiu em nenhum dos dois: sumiria da tela`);
      }
    }
  }
});

// ------------------------------------------------------------------ nenhuma tela tem sua própria

test('nenhuma tela decide SOZINHA o que é venda', () => {
  // A trava do desenho. Qualquer tela que volte a escrever a condição à mão reabre a divergência —
  // agora com um terceiro número.
  const arquivos = fs.readdirSync(JS).filter(f => f.endsWith('.js') && f !== 'app.js');
  const culpadas = arquivos.filter(f => {
    const js = lerCodigo(f);
    // A condição completa, ou a condição pela metade usada para FILTRAR faturamento.
    return /aguardandoPagamento[\s\S]{0,40}CANCELADO/.test(js)
        || /CANCELADO'[\s\S]{0,40}aguardandoPagamento/.test(js);
  });
  assert.deepEqual(culpadas, [],
    'estas telas voltaram a escrever a regra à mão em vez de usar boraEhVenda: ' + culpadas.join(', '));
});

test('as três telas de dinheiro usam a função compartilhada', () => {
  for (const f of ['dashboard.js', 'canais.js', 'caixa.js']) {
    assert.match(lerCodigo(f), /boraEhVenda/, `${f} tem que usar boraEhVenda`);
  }
});

test('toda tela que usa um helper do app.js carrega o app.js', () => {
  // `boraEhVenda` vive em app.js. Uma página que use o helper sem carregar o arquivo quebra na hora,
  // com a tela em branco — e o teste de sintaxe não pega isso.
  const falhas = [];
  for (const f of fs.readdirSync(JS).filter(x => x.endsWith('.js') && x !== 'app.js')) {
    if (!/bora(EhVenda|EsperandoPix|Canal|Sla)\(/.test(lerCodigo(f))) continue;
    const pagina = RAIZ + f.replace(/\.js$/, '.html');
    if (!fs.existsSync(pagina)) continue;
    if (!fs.readFileSync(pagina, 'utf8').includes('assets/js/app.js')) falhas.push(f);
  }
  assert.deepEqual(falhas, [], 'usam helper do app.js sem a página carregar app.js: ' + falhas.join(', '));
});

// ------------------------------------------------------------------ o aviso na tela

test('dashboard: mostra o que ficou esperando PIX, em vez de só diminuir o número', () => {
  // Sem isto o conserto parece um prejuízo: o lojista vê um faturamento menor que ontem e acha que
  // perdeu venda. O dinheiro não está perdido, está em trânsito.
  assert.match(lerCodigo('dashboard.js'), /boraEsperandoPix/,
    'o dashboard tem que separar o que está esperando PIX');
  assert.match(lerCodigo('dashboard.js'), /esperando PIX/,
    'e tem que dizer isso em português na tela');
  assert.match(fs.readFileSync(RAIZ + 'dashboard.html', 'utf8'), /id="kFatPix"/,
    'dashboard.html perdeu o lugar onde o aviso aparece');
});

test('dashboard: o aviso fica ESCONDIDO quando nao ha PIX pendente', () => {
  // Uma caixa amarela vazia todo dia vira ruído e o lojista para de ler.
  assert.match(lerCodigo('dashboard.js'), /avisoPix\.hidden = !esperandoPix\.length/);
});
