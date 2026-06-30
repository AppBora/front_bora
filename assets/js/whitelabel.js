// Aplica a identidade da loja (white-label) a partir da API.
async function aplicarWhiteLabel() {
  try {
    const c = await Bora.configuracao();
    const root = document.documentElement.style;
    if (c.corPrimaria) root.setProperty('--primary', c.corPrimaria);
    if (c.corSecundaria) root.setProperty('--secondary', c.corSecundaria);
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
