// Admin do cardápio digital — gera o link público e o QR Code da loja.
(function () {
  if (!Bora.requireAuth()) return;
  const u = Bora.user() || {};

  // NAO cair para a loja 1. Quem entra pela plataforma (suporte, dono da Bora) fica sem loja na
  // sessao, e o `|| 1` fazia o link, o QR e o cardapio impresso sairem todos apontando para o
  // cardapio de OUTRA loja -- em silencio. Um QR errado colado na parede ninguem confere: o
  // cliente escaneia, ve o cardapio de outra loja e pede de la.
  let lojaId = u.lojaId || null;

  // Uma resposta so para a tela inteira: o QR, o link e o botao da folha impressa leem daqui.
  window.__lojaDoCardapio = () => lojaId;

  /** Pergunta de qual loja e o cardapio, quando a sessao nao diz. */
  async function pedirLoja() {
    const caixa = document.getElementById('semLoja');
    const sel = document.getElementById('escolhaLoja');
    const msg = document.getElementById('semLojaMsg');
    if (!caixa || !sel) return;
    caixa.hidden = false;
    try {
      const lojas = (await Bora.minhasLojas()) || [];
      if (!lojas.length) {
        msg.style.color = '#b91c1c';
        msg.textContent = 'Nenhuma loja aparece para esta conta. Troque a loja no menu à esquerda.';
        return;
      }
      sel.innerHTML = '<option value="">— escolha —</option>' + lojas.map((l) =>
        '<option value="' + l.id + '">' + String(l.nome == null ? l.id : l.nome)
          .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
        + (l.ativo === false ? ' (inativa)' : '') + '</option>').join('');
      sel.addEventListener('change', () => {
        lojaId = Number(sel.value) || null;
        msg.textContent = lojaId ? '' : 'Escolha uma loja.';
        montarLink();
      });
    } catch (e) {
      msg.style.color = '#b91c1c';
      msg.textContent = 'Não consegui carregar a lista de lojas: ' + (e && e.message || e);
    }
  }

  function montarLink() {
    const estado = document.getElementById('qrEstado');
    const abrir = document.getElementById('abrir');
    if (!lojaId) {
      // Sem loja, a tela NAO mostra link nem QR: mostrar o da loja 1 seria pior que mostrar nada.
      document.getElementById('link').value = '';
      document.getElementById('qr').removeAttribute('src');
      if (abrir) abrir.removeAttribute('href');
      if (estado) {
        estado.style.color = '#b45309';
        estado.textContent = 'Escolha a loja ali em cima para eu gerar o link e o QR.';
      }
      return;
    }
    // Com loja resolvida, o recado de "escolha a loja" sai JA. Ele nao e sobre o QR carregar:
    // deixa-lo para o onload da imagem fazia o aviso conviver com o QR pronto na tela.
    if (estado && /escolha a loja/i.test(estado.textContent)) estado.textContent = '';
    const wa = (document.getElementById('wa').value || '').replace(/\D/g, '');
    const origin = location.origin + location.pathname.replace(/cardapio-qr\.html$/, '');
    let link = `${origin}cardapio.html?loja=${lojaId}`;
    if (wa) link += `&wa=${wa.length <= 11 ? '55' + wa : wa}`; // assume Brasil se faltar DDI
    document.getElementById('link').value = link;
    document.getElementById('abrir').href = link;
    // O QR vem de um servico de FORA. Sem internet, ou com ele fora do ar, a imagem quebrava e a
    // tela continuava dizendo "Seu cardapio esta no ar" do lado de um icone quebrado -- o lojista
    // imprimia a folha com um buraco branco e colava no balcao. Agora a tela conta a verdade.
    const img = document.getElementById('qr');
    const recado = document.getElementById('qrEstado');
    img.onload = () => { if (recado) { recado.textContent = ''; } };
    img.onerror = () => {
      if (recado) {
        recado.style.color = '#b91c1c';
        recado.textContent = '⚠ Nao consegui carregar o QR (sem internet, ou o servico que o desenha '
          + 'esta fora). O LINK acima continua valendo: mande por WhatsApp enquanto isso. Nao imprima '
          + 'esta tela agora -- o codigo sairia em branco.';
      }
    };
    // O QR e desenhado AQUI, sem servico de fora. Antes vinha do api.qrserver.com: se aquele
    // site caisse, mudasse de endereco ou passasse a cobrar, nenhuma loja imprimia cardapio -- e
    // o endereco de cada loja era enviado para um terceiro a cada impressao.
    img.src = BoraQR.dataUri(link, { margem: 4 });
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
    if (!lojaId) pedirLoja();
  });
})();
