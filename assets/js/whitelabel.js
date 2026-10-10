// Aplica a identidade da loja (white-label) a partir da API.
async function aplicarWhiteLabel() {
  try {
    const c = await Bora.configuracao();
    // Cores da loja + as derivadas de contraste (ver assets/js/cores.js). O botao "Finalizar venda"
    // da Frente de Caixa tinha texto branco fixo em cima da secundaria: na Zira isso dava 1,46:1.
    BoraCores.aplicar(document.documentElement.style, c);
    if (c.nomeExibicao) document.querySelectorAll('[data-store]').forEach(e => e.textContent = c.nomeExibicao);
    if (c.logoUrl) document.querySelectorAll('.logo').forEach(e => {
      e.style.backgroundImage = `url(${c.logoUrl})`; e.style.backgroundSize = 'cover'; e.textContent = '';
    });
    // Marca Bora discreta conforme o plano
    document.querySelectorAll('[data-marca-bora]').forEach(e => {
      e.style.display = c.mostrarMarcaBora ? '' : 'none';
    });
  } catch (e) { /* mantém o tema padrão se falhar */ }
}
document.addEventListener('DOMContentLoaded', () => { if (Bora.token()) aplicarWhiteLabel(); });
