/**
 * Cardápio para imprimir, com o QR que leva ao cardápio digital.
 *
 * POR QUE EXISTE
 * A loja já tem o cardápio digital e o QR, mas o que ela cola na parede, entrega na mesa e manda
 * imprimir na gráfica é um cardápio de papel — e esse era feito fora, num editor, à mão. Toda vez
 * que um preço mudava, o papel ficava mentindo até alguém refazer o arquivo.
 *
 * Aqui o papel sai do MESMO cardápio que o cliente vê. Preço mudou no painel, o próximo impresso
 * já sai certo: não tem como divergir, porque não há duas fontes.
 *
 * DE ONDE VEM O CONTEÚDO
 * Do endpoint público `/public/loja/{id}/cardapio` — uma chamada só, que já traz marca, produtos
 * ativos e os adicionais de cada um. É literalmente o que o cliente enxerga.
 *
 * O QR
 * É desenhado AQUI DENTRO (assets/js/qr.js). Antes vinha de um serviço de fora
 * (api.qrserver.com): sem internet, ou com ele fora do ar, a tela dizia "Seu cardápio está no ar
 * 🎉" com um ícone de imagem quebrada do lado, e o lojista imprimia uma folha com um buraco
 * branco e colava no balcão.
 *
 * A trava continua: **sem QR montado, nada é impresso**. O endereço também sai escrito por
 * extenso — quem não conseguir ler o código, digita.
 */
(function () {
  if (!Bora.requireAuth()) return;

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const $ = (id) => document.getElementById(id);

  /** O endereço público do cardápio desta loja, igual ao que a tela do QR monta. */
  function linkPublico() {
    const campo = $('link');
    if (campo && campo.value) return campo.value;
    const lojaId = (Bora.user() || {}).lojaId || 1;
    const base = location.origin + location.pathname.replace(/cardapio-qr\.html$/, '');
    return base + 'cardapio.html?loja=' + lojaId;
  }

  /** O QR, desenhado aqui dentro. Ver assets/js/qr.js. */
  function urlDoQr(link) {
    return BoraQR.dataUri(link, { margem: 4 });
  }

  /**
   * Monta o QR e so devolve quando ele REALMENTE existe.
   *
   * Antes isto era uma espera de rede, porque a imagem vinha de fora. Agora o desenho e local --
   * mas a promessa continua: se o gerador estourar (texto longo demais, por exemplo), ninguem
   * imprime. Folha com buraco branco no lugar do codigo vai para a parede e ninguem mais confere.
   */
  function carregarQr(link) {
    return new Promise((ok, erro) => {
      try { ok(urlDoQr(link)); }
      catch (e) { erro(new Error('não consegui montar o QR: ' + (e && e.message || e))); }
    });
  }

  /**
   * Os adicionais, juntando o que aparece em todos os produtos.
   *
   * O mesmo grupo é copiado dentro de cada produto, e o preço pode divergir entre eles. Quando
   * diverge, o papel diz "a partir de" em vez de escolher um número e mentir nos outros.
   */
  function adicionais(produtos) {
    const grupos = new Map();
    for (const p of produtos) {
      for (const g of (p.complementos || [])) {
        if (!grupos.has(g.nome)) grupos.set(g.nome, new Map());
        const itens = grupos.get(g.nome);
        for (const i of (g.itens || [])) {
          if (!itens.has(i.nome)) itens.set(i.nome, new Set());
          itens.get(i.nome).add(Number(i.preco) || 0);
        }
      }
    }
    const out = [];
    for (const [nome, itens] of grupos) {
      const lista = [...itens].map(([item, precos]) => {
        const ps = [...precos].sort((a, b) => a - b);
        return { item, preco: ps[0], varia: ps.length > 1, gratis: ps[ps.length - 1] === 0 };
      }).sort((a, b) => a.item.localeCompare(b.item, 'pt-BR'));
      out.push({ nome, itens: lista });
    }
    return out;
  }

  function porCategoria(produtos) {
    const cats = new Map();
    for (const p of produtos) {
      const c = (p.categoria || '').trim() || 'Outros';
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(p);
    }
    return [...cats].map(([nome, itens]) => ({ nome, itens }));
  }

  function folha(dados, link, logo) {
    const marca = dados.marca || {};
    // A cor da loja vai para TEXTO em papel branco, e cor de marca nao nasce legivel: o amarelo
    // #FFD100 da 1,46:1 contra branco, e a norma pede 4,5:1. Quem ja resolve isso e o BoraCores,
    // que escurece ate passar -- usar a cor crua aqui faria o cardapio sair ilegivel justo nas
    // lojas de identidade clara, e so na impressao, que e onde ninguem testa.
    const legivel = (c, reserva) => {
      try { return window.BoraCores.legivelSobreBranco(window.BoraCores.paraRgb(c || reserva)); }
      catch (e) { return reserva; }   // sem o cores.js carregado, a reserva ja e escura
    };
    const cor = legivel(marca.corPrimaria, '#7e22ce');
    const cor2 = legivel(marca.corSecundaria, '#15803d');
    const nome = marca.nome || (dados.loja && dados.loja.nome) || 'Cardápio';

    const secoes = porCategoria(dados.produtos || []).map((c) => `
      <section class="sec">
        <h2>${esc(c.nome)}</h2>
        <ul class="itens">
          ${c.itens.map((p) => `<li><span class="n">${esc(p.nome)}</span><span class="pt"></span><span class="v">${money(p.preco)}</span></li>`).join('')}
        </ul>
      </section>`).join('');

    const extras = adicionais(dados.produtos || []).map((g) => `
      <div class="gcol">
        <h3>${esc(g.nome)}</h3>
        <ul class="itens mini">
          ${g.itens.map((i) => `<li><span class="n">${esc(i.item)}</span><span class="pt"></span><span class="v">${
            i.gratis ? 'grátis' : (i.varia ? 'a partir de ' : '') + money(i.preco)}</span></li>`).join('')}
        </ul>
      </div>`).join('');

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Cardápio · ${esc(nome)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; margin: 0; color: #1e293b; }
  header { text-align: center; border-bottom: 3px solid ${cor}; padding-bottom: 10px; margin-bottom: 16px; }
  header img { max-height: 70px; margin-bottom: 6px; }
  h1 { color: ${cor}; font-size: 36px; margin: 0; letter-spacing: -0.5px; font-weight: 900; }
  .sub { color: #64748b; font-size: 12px; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px; }
  .sec { break-inside: avoid; margin-bottom: 14px; }
  /* Titulo centralizado com filete dos dois lados -- e o jeito que cardapio de parede e
     impresso, e separa as secoes sem precisar de cor de fundo (que come tinta da impressora). */
  .sec h2 { color: ${cor2}; font-size: 15px; text-transform: uppercase; letter-spacing: 2px;
            margin: 0 0 8px; display: flex; align-items: center; gap: 10px; white-space: nowrap; }
  .sec h2::before, .sec h2::after { content: ''; flex: 1; border-top: 1px solid ${cor2}; opacity: .35; }
  .itens { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 26px; }
  .itens.mini { columns: 1; }
  .itens li { display: flex; align-items: baseline; gap: 4px; padding: 2px 0;
              font-size: 13px; break-inside: avoid; }
  .itens .n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* O pontilhado que leva o olho do nome ate o preco. Cinza claro demais some na impressao --
     o que na tela parece discreto, no papel vira nada. */
  .itens .pt { flex: 1; min-width: 12px; border-bottom: 1.5px dotted #94a3b8;
               transform: translateY(-4px); }
  .itens .v { font-weight: 700; white-space: nowrap; }
  .grupos { display: flex; flex-wrap: wrap; gap: 0 26px; break-inside: avoid; }
  .gcol { flex: 1 1 210px; margin-bottom: 10px; }
  .gcol h3 { color: ${cor}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; }
  footer { margin-top: 18px; border-top: 3px solid ${cor}; padding-top: 12px;
           display: flex; gap: 16px; align-items: center; break-inside: avoid; }
  /* 150px a 96dpi dao ~40mm impressos. Camera de celular le a partir de uns 20mm, entao sobra
     folga para papel um pouco borrado ou para quem fotografa de longe. */
  footer img { width: 150px; height: 150px; }
  .chamada { font-size: 19px; font-weight: 800; color: ${cor}; margin: 0 0 4px; }
  .passos { font-size: 12px; color: #475569; margin: 0 0 6px; }
  .url { font-family: ui-monospace, 'Courier New', monospace; font-size: 11px; color: #334155;
         word-break: break-all; background: #f1f5f9; padding: 4px 6px; border-radius: 4px; }
  @media print { .naoimprime { display: none !important; } }
  .naoimprime { position: fixed; top: 10px; right: 10px; }
  .naoimprime button { font: inherit; padding: 9px 14px; border: 0; border-radius: 8px;
                       background: ${cor}; color: #fff; font-weight: 700; cursor: pointer; }
</style></head><body>
<div class="naoimprime"><button onclick="window.print()">🖨 Imprimir</button></div>
<header>
  ${logo ? `<img src="${esc(logo)}" alt="">` : ''}
  <h1>${esc(nome)}</h1>
  <div class="sub">Cardápio</div>
</header>
${secoes}
${extras ? `<section class="sec"><h2>Monte o seu</h2><div class="grupos">${extras}</div></section>` : ''}
<footer>
  <img src="${esc(urlDoQr(link))}" alt="QR do cardápio">
  <div>
    <p class="chamada">Peça pelo celular</p>
    <p class="passos">Aponte a câmera para o código, escolha o que quiser e mande o pedido.
       Não precisa instalar nada.</p>
    <div class="url">${esc(link)}</div>
  </div>
</footer>
</body></html>`;
  }

  window.__gerarCardapioImpresso = async () => {
    const aviso = $('impMsg');
    const botao = $('btnImprimir');
    if (aviso) { aviso.textContent = 'Montando…'; aviso.style.color = 'var(--muted)'; }
    if (botao) botao.disabled = true;

    try {
      const lojaId = (Bora.user() || {}).lojaId || 1;
      const link = linkPublico();

      // O QR primeiro, de propósito: se ele não vier, não faz sentido abrir nada.
      const [dados] = await Promise.all([
        Bora.api('/public/loja/' + lojaId + '/cardapio'),
        carregarQr(link),
      ]);

      if (!dados || !(dados.produtos || []).length) {
        throw new Error('esta loja não tem nenhum produto ativo — cadastre antes de imprimir');
      }

      const logo = (dados.marca || {}).logoUrl || '';
      const w = window.open('', '_cardapio', 'width=900,height=1000');
      if (!w) {
        throw new Error('o navegador bloqueou a janela. Libere pop-ups para este site e tente de novo');
      }
      w.document.write(folha(dados, link, logo));
      w.document.close();

      if (aviso) {
        aviso.style.color = '#059669';
        aviso.textContent = '✅ Pronto: ' + (dados.produtos || []).length
          + ' produtos. Confira na janela que abriu e clique em Imprimir.';
      }
    } catch (e) {
      if (aviso) {
        aviso.style.color = '#b91c1c';
        aviso.textContent = '❌ Não gerei o cardápio: ' + (e && e.message || e)
          + '. Nada foi impresso — melhor isso que uma folha com o código em branco.';
      }
    } finally {
      if (botao) botao.disabled = false;
    }
  };
})();
