// O JavaScript que vive DENTRO das páginas HTML também tem que compilar — e o do pagamento manual
// tem que perguntar antes de registrar dois.
//
// A LACUNA (achada em 21/10/2026): a suíte cobria só `assets/js/*.js`. O `configuracoes.html` tem
// quase 700 linhas de script inline, com o painel da plataforma inteiro — suspender loja, entrar
// como suporte, registrar pagamento recebido — e nada olhava para ele. Eu mesmo quebrei uma string
// ali (um `\n` que virou quebra de linha de verdade) e só descobri porque fui conferir à mão.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';

/** Os blocos <script> sem `src` de uma página — o código que mora no próprio HTML. */
function scriptsInline(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const blocos = [];
  let m;
  while ((m = re.exec(html))) if (m[1].trim()) blocos.push(m[1]);
  return blocos;
}

const PAGINAS = fs.readdirSync(RAIZ).filter(f => f.endsWith('.html'));

test('toda pagina com script inline compila', () => {
  assert.ok(PAGINAS.length > 5, 'esperava achar as paginas do painel, achei ' + PAGINAS.length);
  const quebradas = [];
  for (const pagina of PAGINAS) {
    const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
    scriptsInline(html).forEach((codigo, i) => {
      try {
        // new Function compila sem executar: pega erro de sintaxe, não de execução.
        new Function(codigo);
      } catch (e) {
        quebradas.push(pagina + ' (bloco ' + (i + 1) + '): ' + e.message);
      }
    });
  }
  assert.deepEqual(quebradas, [], 'script inline com erro de sintaxe:\n' + quebradas.join('\n'));
});

test('o teste esta REALMENTE olhando os scripts inline', () => {
  // Sem isto, um regex quebrado faria o teste acima passar medindo nada — a pior forma de falhar.
  const html = fs.readFileSync(path.join(RAIZ, 'configuracoes.html'), 'utf8');
  const blocos = scriptsInline(html);
  assert.ok(blocos.length >= 1, 'nao achei script inline no configuracoes.html');
  assert.ok(blocos.join('').length > 5000,
    'o script do configuracoes.html tem centenas de linhas; achei ' + blocos.join('').length + ' caracteres');
});

// ------------------------------------------------------------------ o pagamento manual

const CONFIG = fs.readFileSync(path.join(RAIZ, 'configuracoes.html'), 'utf8');

test('pagamento manual: pergunta antes de registrar o segundo do mesmo dia e valor', () => {
  // O servidor recusa com 409 e pede confirmação (item 9). Se a tela engolisse esse 409 como erro
  // genérico, o dono veria "Erro: já há um pagamento..." e não teria como registrar o segundo — o
  // conserto do servidor ficaria inútil.
  assert.match(CONFIG, /confirmarSegundoPagamento/,
    'a tela tem que saber mandar a confirmacao');
  assert.match(CONFIG, /Registrar os DOIS\?/,
    'e tem que PERGUNTAR, em portugues, antes de mandar');
});

test('pagamento manual: so o conflito do pagamento repetido pergunta', () => {
  // Qualquer outro erro (valor inválido, loja sem assinatura, Asaas fora) tem que subir como erro.
  // Perguntar "registrar os dois?" num erro de validação seria pedir confirmação de uma coisa que
  // não vai funcionar de jeito nenhum.
  assert.match(CONFIG, /if \(!\/j. h. um pagamento\/i\.test\(String\(e\.message \|\| ''\)\)\) throw e;/,
    'o reconhecimento do conflito tem que ser especifico, nao um catch que engole tudo');
});

test('pagamento manual: a primeira tentativa vai SEM confirmacao', () => {
  // A ordem importa: mandar confirmado de cara pularia a pergunta e um clique duplo contaria duas
  // vezes — o erro oposto, e igualmente caro.
  const bloco = CONFIG.match(/const enviar = \(confirmar\)[\s\S]*?r = await enviar\(true\);/);
  assert.ok(bloco, 'nao achei o fluxo do registro de pagamento');
  const primeira = bloco[0].indexOf('enviar(false)');
  const segunda = bloco[0].indexOf('enviar(true)');
  assert.ok(primeira >= 0 && segunda > primeira,
    'a primeira chamada tem que ser sem confirmacao, e a confirmada so depois da pergunta');
});

test('pagamento manual: desistir da pergunta nao manda nada e libera o botao', () => {
  assert.match(CONFIG, /\{ btn\.disabled = false; return; \}/,
    'quem responde "nao" na pergunta tem que poder clicar de novo');
});
