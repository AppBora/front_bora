// White-label: carrega e salva a configuração da loja via API.
// Campos liberados dependem do plano — o backend ignora os não permitidos.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);

  function arquivoParaDataUrl(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }

  let atual = {};
  async function carregar() {
    try {
      atual = await Bora.configuracao() || {};
      $('nomeExibicao').value = atual.nomeExibicao || '';
      if (atual.corPrimaria) $('corPrimaria').value = atual.corPrimaria;
      if (atual.corSecundaria) $('corSecundaria').value = atual.corSecundaria;
      $('bannerUrl').value = atual.bannerUrl || '';
      $('planoInfo').textContent = 'Alguns recursos (cor secundária, banner, subdomínio) dependem do seu plano — o que não estiver liberado é ignorado ao salvar.';
    } catch (e) { $('planoInfo').textContent = e.message; }
  }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('msg'); msg.textContent = 'Salvando...'; msg.style.color = 'var(--muted)';
    try {
      let logoUrl = atual.logoUrl || null;
      const file = $('logoFile').files[0];
      if (file) logoUrl = await arquivoParaDataUrl(file);

      const body = {
        nomeExibicao: $('nomeExibicao').value.trim(),
        corPrimaria: $('corPrimaria').value,
        corSecundaria: $('corSecundaria').value,
        bannerUrl: $('bannerUrl').value.trim() || null,
        logoUrl
      };
      atual = await Bora.api('/api/configuracao', { method: 'PUT', body: JSON.stringify(body) });
      msg.style.color = '#16a34a'; msg.textContent = 'Identidade salva!';
      if (typeof aplicarWhiteLabel === 'function') aplicarWhiteLabel();
    } catch (ex) { msg.style.color = 'var(--danger)'; msg.textContent = ex.message; }
  });

  document.addEventListener('DOMContentLoaded', carregar);
})();
