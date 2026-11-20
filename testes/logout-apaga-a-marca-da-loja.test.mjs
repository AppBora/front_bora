// SAIR DA CONTA TEM DE APAGAR A MARCA DA LOJA.
//
// O DEFEITO (varredura de 18/11/2026, consertado em 19/11)
// `Bora.logout` apagava `boraToken` e `boraUser` e **deixava `boraTheme`**. Quem entrasse em seguida
// no MESMO navegador via o nome, as cores e o logo da loja anterior. Foi assim que o painel da
// plataforma apareceu como "Zirá - Montreal" para o dono — e por um momento pareceu que as bases de
// clientes tinham se misturado. Não tinham: era uma chave de navegador.
//
// POR QUE ISSO É MAIS GRAVE QUE "A TELA FICA ESTRANHA"
// Três lugares leem esse nome guardado para PAPEL IMPRESSO:
//   - `app.js:205`         → comanda da cozinha
//   - `caixa.js:22`        → fechamento de caixa
//   - `acerto-entregadores.js:159` → recibo do motoboy
// Ou seja: o nome de um cliente saía impresso no papel de outro.
//
// E o comentário do `whitelabel.js` afirmava que a chave "só é apagada no logout". A frase era
// FALSA: quem apagava era só o seletor de loja e a tela de configurações. Quatro agentes acharam
// isso independentemente, mais eu — e o comentário foi corrigido junto com o código.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RAIZ = 'C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend/';
const API = fs.readFileSync(RAIZ + 'assets/js/api.js', 'utf8');

/**
 * Roda o `logout` LIDO DO ARQUIVO contra um localStorage de mentira.
 *
 * Extrai o corpo do método e o executa, então se alguém tirar a linha de lá, isto cai.
 */
function deslogar(chavesIniciais) {
  const i = API.indexOf('logout() {');
  assert.ok(i > 0, 'não achei o método logout em api.js');
  // do `{` do metodo ate a chave que o fecha
  let abre = API.indexOf('{', i);
  let nivel = 0, fim = -1;
  for (let k = abre; k < API.length; k++) {
    if (API[k] === '{') nivel++;
    else if (API[k] === '}') { nivel--; if (nivel === 0) { fim = k; break; } }
  }
  assert.ok(fim > abre, 'não consegui delimitar o corpo do logout');
  const corpo = API.slice(abre + 1, fim);

  const guardadas = new Map(Object.entries(chavesIniciais));
  const localStorage = {
    getItem: k => (guardadas.has(k) ? guardadas.get(k) : null),
    setItem: (k, v) => guardadas.set(k, String(v)),
    removeItem: k => guardadas.delete(k),
  };
  const location = { href: '' };
  new Function('localStorage', 'location', corpo)(localStorage, location);
  return { sobraram: [...guardadas.keys()], destino: location.href };
}

// ----------------------------------------------------------------- a premissa

// A PREMISSA: o harness realmente executa o logout. Sem isto, um teste que exigisse
// "boraTheme apagado" passaria com um corpo que não roda e não apaga nada... porque nada ficaria.
// Aqui eu exijo que uma chave NÃO relacionada sobreviva — prova de que o apagamento é seletivo.
test('premissa: o logout apaga o que deve e NAO apaga o que nao e dele', () => {
  const { sobraram, destino } = deslogar({
    boraToken: 'tok', boraUser: '{}', boraTheme: '{"name":"Zira"}',
    outraCoisaQualquer: 'fica',
  });
  assert.ok(sobraram.includes('outraCoisaQualquer'),
    'o logout apagou uma chave que não é dele — o harness ou o código estão errados');
  assert.equal(destino, 'login.html', 'o logout tem de levar para a tela de login');
});

// ----------------------------------------------------------------- o que importa

test('o logout APAGA a marca da loja (boraTheme)', () => {
  const { sobraram } = deslogar({ boraToken: 'tok', boraUser: '{}', boraTheme: '{"name":"Zira - Montreal"}' });
  assert.ok(!sobraram.includes('boraTheme'),
    'a marca da loja sobreviveu ao logout: o próximo que entrar neste navegador vê o nome, as cores '
    + 'e o logo da loja anterior — inclusive na comanda da cozinha e no recibo do motoboy');
});

test('o logout apaga o token e o usuario, como sempre fez', () => {
  const { sobraram } = deslogar({ boraToken: 'tok', boraUser: '{}', boraTheme: '{}' });
  assert.deepEqual(sobraram, [], 'nenhuma das três chaves de sessão pode sobrar');
});

test('logout com nada guardado nao estoura', () => {
  assert.doesNotThrow(() => deslogar({}));
});

// ----------------------------------------------------------------- o comentario que mentia

test('o comentario do whitelabel.js nao afirma mais o que era falso', () => {
  const wl = fs.readFileSync(RAIZ + 'assets/js/whitelabel.js', 'utf8');
  assert.ok(!/\(so apagada no logout\)|\(só apagada no logout\)/.test(wl),
    'o comentário voltou a afirmar que a chave "só é apagada no logout" sem qualificar. A frase só é '
    + 'verdadeira porque o logout passou a apagar — e ela já esteve errada uma vez.');
  assert.ok(/api\.js/.test(wl),
    'o comentário tem de apontar onde o apagamento acontece, para a próxima pessoa poder conferir');
});
