// Aplica a identidade da loja (white-label) a partir da API.

/**
 * Guarda a marca da loja para quem nao pode esperar a API.
 *
 * Dois consumidores, e os dois estavam quebrados porque NINGUEM gravava esta chave -- ela era lida
 * em quatro lugares e escrita em nenhum (so apagada no logout):
 *
 *  1. O PAPEL. A comanda da cozinha (app.js:145), o fechamento do caixa (caixa.js:22) e o recibo do
 *     motoboy (acerto-entregadores.js:144) abrem numa janela nova, sem API, e leem daqui. Saiam
 *     todos com "BoraHapp" enquanto o painel mostrava o nome certo na tela. E papel que vai para a
 *     mao do cliente e do motoboy.
 *  2. A ABERTURA. `applyTheme()` (app.js:2) roda ANTES da API responder, justamente para a pagina
 *     nao piscar o nome do HTML. Sem nada gravado, era codigo morto.
 *
 * So grava o que veio preenchido: nome vazio por cima faria o papel sair SEM nome nenhum, que e
 * pior que sair generico.
 */
function guardarTema(c) {
  try {
    const anterior = JSON.parse(localStorage.getItem('boraTheme') || '{}');
    const tema = { ...anterior };
    if (c.nomeExibicao) tema.name = c.nomeExibicao;
    if (c.corPrimaria) tema.primary = c.corPrimaria;
    if (c.corSecundaria) tema.secondary = c.corSecundaria;
    if (c.logoUrl) tema.logo = c.logoUrl;
    localStorage.setItem('boraTheme', JSON.stringify(tema));
  } catch (e) { /* navegador sem localStorage: a tela continua certa, so o papel sai generico */ }
}
async function aplicarWhiteLabel() {
  try {
    const c = await Bora.configuracao();
    // Cores da loja + as derivadas de contraste (ver assets/js/cores.js). O botao "Finalizar venda"
    // da Frente de Caixa tinha texto branco fixo em cima da secundaria: na Zira isso dava 1,46:1.
    BoraCores.aplicar(document.documentElement.style, c);
    // O nome da loja, com uma rede de seguranca.
    //
    // Era `if (c.nomeExibicao)`: apagar o campo em Configuracoes grava "", que e falsy, entao a
    // tela ficava com o texto do HTML -- que era "Sorveteria da Rosa", nome de uma loja de
    // verdade. O lojista via o nome de outra pessoa no proprio painel.
    //
    // Agora cai para o nome da sessao antes de desistir. Se nem isso houver, o HTML ja traz um
    // texto neutro.
    const nomeDaLoja = (c.nomeExibicao || '').trim()
      || (((window.Bora && Bora.user && Bora.user()) || {}).lojaNome || '').trim();
    if (nomeDaLoja) document.querySelectorAll('[data-store]').forEach(e => e.textContent = nomeDaLoja);
    if (c.logoUrl) document.querySelectorAll('.logo').forEach(e => {
      e.style.backgroundImage = `url(${c.logoUrl})`; e.style.backgroundSize = 'cover'; e.textContent = '';
    });
    // Marca Bora discreta conforme o plano
    document.querySelectorAll('[data-marca-bora]').forEach(e => {
      e.style.display = c.mostrarMarcaBora ? '' : 'none';
    });
    guardarTema(c);
  } catch (e) { /* mantém o que já estava guardado: erro de rede não pode apagar a marca */ }
}
document.addEventListener('DOMContentLoaded', () => { if (Bora.token()) aplicarWhiteLabel(); });
