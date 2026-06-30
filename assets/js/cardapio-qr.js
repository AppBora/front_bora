// Admin do cardápio digital — gera o link público e o QR Code da loja.
(function () {
  if (!Bora.requireAuth()) return;
  const u = Bora.user() || {};
  const lojaId = u.lojaId || 1;

  function montarLink() {
    const wa = (document.getElementById('wa').value || '').replace(/\D/g, '');
    const origin = location.origin + location.pathname.replace(/cardapio-qr\.html$/, '');
    let link = `${origin}cardapio.html?loja=${lojaId}`;
    if (wa) link += `&wa=${wa.length <= 11 ? '55' + wa : wa}`; // assume Brasil se faltar DDI
    document.getElementById('link').value = link;
    document.getElementById('abrir').href = link;
    document.getElementById('qr').src = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=' + encodeURIComponent(link);
    localStorage.setItem('boraCardapioWa', document.getElementById('wa').value);
  }

  window.__copiar = () => {
    const i = document.getElementById('link'); i.select();
    navigator.clipboard?.writeText(i.value).then(() => {
      const b = event.target; const t = b.textContent; b.textContent = '✓ Copiado'; setTimeout(() => b.textContent = t, 1200);
    }).catch(() => document.execCommand('copy'));
  };

  document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('boraCardapioWa'); if (saved) document.getElementById('wa').value = saved;
    document.getElementById('wa').addEventListener('input', montarLink);
    montarLink();
  });
})();
