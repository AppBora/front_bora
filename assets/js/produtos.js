// CRUD de produtos com ficha técnica (custo, estoque, margem) — escopado por loja via token.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let produtos = [];

  function margem(p) {
    if (p.preco == null || p.custo == null || Number(p.preco) === 0) return '—';
    const m = (Number(p.preco) - Number(p.custo)) / Number(p.preco) * 100;
    const cor = m < 20 ? '#dc2626' : m < 40 ? '#f59e0b' : '#059669';
    return `<b style="color:${cor}">${m.toFixed(0)}%</b>`;
  }
  function estoqueCel(p) {
    if (p.estoque == null) return '<span style="color:#94a3b8">livre</span>';
    const baixo = p.estoqueMinimo != null && p.estoque <= p.estoqueMinimo;
    const zero = p.estoque <= 0;
    const cor = zero ? '#dc2626' : baixo ? '#f59e0b' : '#0f172a';
    const tag = zero ? ' ⛔' : baixo ? ' ⚠' : '';
    return `<b style="color:${cor}">${p.estoque}${tag}</b>`;
  }

  async function lista() {
    const tb = $('lista');
    try {
      produtos = await Bora.produtos();
      tb.innerHTML = produtos.map(p =>
        `<tr><td>${p.imagemUrl ? `<img src="${p.imagemUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:8px">` : ''}<b>${esc(p.nome) || '—'}</b>${p.ativo === false ? ' <span style="background:#f1f5f9;color:#64748b;border-radius:4px;padding:1px 5px;font-size:11px;font-weight:700">fora do cardápio</span>' : ''}<br><small style="color:#94a3b8">${esc(p.categoria || '')}</small></td>` +
        `<td>${money(p.preco)}</td><td>${margem(p)}</td><td>${estoqueCel(p)}</td>` +
        `<td style="text-align:right"><button onclick="__comp(${p.id})" title="Complementos (tamanho, borda, extras)" style="border:0;background:#ecfdf5;color:#059669;border-radius:8px;padding:5px 9px;cursor:pointer">🧩</button> ` +
        `<button onclick="__ficha(${p.id})" title="Ficha técnica" style="border:0;background:#f5f3ff;color:#7c3aed;border-radius:8px;padding:5px 9px;cursor:pointer">🧪</button> ` +
        `<button onclick="__edit(${p.id})" style="border:0;background:#f1f5f9;border-radius:8px;padding:5px 9px;cursor:pointer">✏</button> ` +
        `<button onclick="__del(${p.id})" style="border:0;background:#fef2f2;color:#dc2626;border-radius:8px;padding:5px 9px;cursor:pointer">✕</button></td></tr>`
      ).join('') || '<tr><td colspan="5" style="color:#94a3b8">Nenhum produto ainda.</td></tr>';
    } catch (e) { tb.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${e.message}</td></tr>`; }
  }

  const num = v => v === '' || v == null ? null : Number(v);
  let fotoAtual = null; // data URL comprimida da foto escolhida (null = manter a existente)
  // O estoque que a tela carregou para o produto em edicao. null tambem quando se esta criando.
  let estoqueNaTela = null;

  /**
   * Manda o estoque SO SE O LOJISTA MUDOU o numero.
   *
   * O defeito que isto fecha: o formulario mandava o estoque sempre, com o valor carregado na abertura
   * da tela. Abrir Produtos as 18h, vender 12 durante a noite e corrigir so o PRECO as 21h apagava as
   * 12 baixas, sem log e sem aviso. Agora, nao mexer no campo = nao mandar nada.
   *
   * Mudou de proposito? E uma contagem: o lojista esta dizendo quanto tem. Vai pelo endpoint de
   * estoque, que existe so para isso.
   */
  async function salvarEstoqueSeMudou(id) {
    const agora = num($('estoque').value);
    if (agora === estoqueNaTela) return;
    await Bora.definirEstoqueProduto(id, agora);
  }
  function payload() {
    const p = { nome: $('nome').value.trim(), categoria: $('categoria').value.trim(),
      preco: Number($('preco').value || 0), custo: num($('custo').value),
      estoqueMinimo: num($('estoqueMinimo').value),
      // Item 7.7: isto era `ativo: true` FIXO. Produto que o lojista tirou do cardapio voltava a
      // aparecer na primeira vez que alguem editasse o preco -- e nao havia como desativar pelo
      // painel, entao ele nem tinha como desfazer. Agora a tela tem a caixinha, e editar preserva o
      // que esta nela. Cadastro novo nasce ativo, que e o que se espera.
      ativo: $('ativo') ? $('ativo').checked : true,
      // `estoque` SO vai na CRIACAO, onde ele e a quantidade inicial. Na edicao ele nao e mandado:
      // o servidor ja ignora o campo de proposito (ProdutoService.java:73), mas mandar assim mesmo
      // deixava a armadilha armada -- quem "consertar" o backend para honrar o corpo ressuscita o
      // bug das 21h, em que corrigir o preco a noite apagava as vendas do dia.
      //
      // Quem mexe em estoque e o PUT /api/produtos/{id}/estoque, numa chamada separada e so quando
      // o lojista realmente mudou o numero. Ver `salvarEstoqueSeMudou`.
      // Vazio vai como string vazia de proposito: o servidor converte para nulo. Mandar sempre
      // permite APAGAR o codigo de um produto que ja tinha um.
      codigoExterno: $('codigoExterno').value.trim() };
    if (!$('id').value) p.estoque = num($('estoque').value);   // so na criacao
    if (fotoAtual !== null) p.imagemUrl = fotoAtual;
    return p;
  }
  function reset() { $('form').reset(); $('id').value = ''; fotoAtual = null; estoqueNaTela = null; $('fotoPrev').hidden = true;
    $('btnSalvar').textContent = 'Salvar produto'; $('cancelar').style.display = 'none'; $('msg').textContent = ''; }

  // Comprime a foto no navegador (máx. 640px, JPEG 80%) para caber no banco sem pesar o cardápio.
  document.addEventListener('DOMContentLoaded', () => {
    const inp = $('fotoProduto'); if (!inp) return;
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) { fotoAtual = null; return; }
      const img = new Image();
      img.onload = () => {
        const esc = Math.min(1, 640 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * esc); cv.height = Math.round(img.height * esc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        fotoAtual = cv.toDataURL('image/jpeg', 0.8);
        $('fotoPrev').src = fotoAtual; $('fotoPrev').hidden = false;
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(f);
    });
  });

  window.__edit = id => { const p = produtos.find(x => x.id === id); if (!p) return;
    fotoAtual = null; $('fotoProduto').value = '';
    if (p.imagemUrl) { $('fotoPrev').src = p.imagemUrl; $('fotoPrev').hidden = false; } else $('fotoPrev').hidden = true;
    $('id').value = p.id; $('nome').value = p.nome || ''; $('categoria').value = p.categoria || '';
    $('preco').value = p.preco ?? ''; $('custo').value = p.custo ?? ''; $('estoque').value = p.estoque ?? ''; $('estoqueMinimo').value = p.estoqueMinimo ?? '';
    $('codigoExterno').value = p.codigoExterno ?? '';
    // Traz o estado atual para a caixinha: sem isto, salvar religaria o produto desativado.
    if ($('ativo')) $('ativo').checked = p.ativo !== false;
    // O valor que a tela ESTA MOSTRANDO. Na hora de salvar, comparamos com o que esta no campo: se
    // nao mudou, nao mandamos nada de estoque, e as vendas que aconteceram enquanto a tela estava
    // aberta ficam de pe.
    estoqueNaTela = p.estoque ?? null;
    $('btnSalvar').textContent = 'Atualizar produto'; $('cancelar').style.display = 'inline-block'; window.scrollTo(0, 0); };
  window.__del = async id => { if (!confirm('Excluir produto?')) return; try { await Bora.api('/api/produtos/' + id, { method: 'DELETE' }); lista(); } catch (e) { alert(e.message); } };

  // ---- Ficha técnica (composição por insumos) ----
  window.__ficha = async (produtoId) => {
    const prod = produtos.find(p => p.id === produtoId);
    let insumos, ficha;
    try { [insumos, ficha] = await Promise.all([Bora.insumos(), Bora.ficha(produtoId)]); }
    catch (e) { alert(e.message); return; }
    if (!insumos.length) { alert('Cadastre insumos primeiro (menu Insumos).'); return; }
    const qtdDe = id => { const f = ficha.find(x => Number(x.insumoId) === id); return f ? Number(f.quantidade) : 0; };

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:grid;place-items:center';
    ov.innerHTML = `<div style="background:#fff;border-radius:16px;padding:22px;max-width:520px;width:92%;max-height:86vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3)">
      <h3 style="margin:0 0 4px">🧪 Ficha técnica — ${esc(prod ? prod.nome : '')}</h3>
      <p style="color:#94a3b8;font-size:13px;margin:0 0 14px">Quanto de cada insumo este produto consome por unidade vendida.</p>
      <table class="table"><thead><tr><th>Insumo</th><th>Qtd por unidade</th><th>Custo</th></tr></thead><tbody>
        ${insumos.map(i => `<tr><td>${esc(i.nome)} <small style="color:#94a3b8">(${esc(i.unidade)})</small></td>
          <td><input id="fi${i.id}" type="number" step="0.0001" min="0" value="${qtdDe(i.id) || ''}" placeholder="0" data-custo="${i.custo}" oninput="__fichaCalc()" style="width:90px;padding:7px;border:1px solid #e5e7eb;border-radius:8px"></td>
          <td style="color:#94a3b8;font-size:12px">${money(i.custo)}/${esc(i.unidade)}</td></tr>`).join('')}
      </tbody></table>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
        <span style="font-weight:800">CMV do produto: <span id="fichaCmv" style="color:#059669">R$ 0,00</span></span>
        <div style="display:flex;gap:8px"><button id="fichaCancel" class="btn secondary">Cancelar</button><button id="fichaSave" class="btn">Salvar ficha</button></div>
      </div>
    </div>`;
    document.body.appendChild(ov);
    window.__fichaCalc = () => { let t = 0; insumos.forEach(i => { const v = Number(document.getElementById('fi' + i.id).value || 0); t += v * Number(i.custo || 0); });
      document.getElementById('fichaCmv').textContent = money(t); };
    window.__fichaCalc();
    ov.querySelector('#fichaCancel').addEventListener('click', () => ov.remove());
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#fichaSave').addEventListener('click', async () => {
      const itens = insumos.map(i => ({ insumoId: i.id, quantidade: Number(document.getElementById('fi' + i.id).value || 0) }))
        .filter(x => x.quantidade > 0);
      try { await Bora.salvarFicha(produtoId, itens); ov.remove(); lista(); } catch (e) { alert(e.message); }
    });
  };

  $('cancelar').addEventListener('click', reset);
  $('form').addEventListener('submit', async e => {
    e.preventDefault(); $('msg').textContent = '';
    try {
      const id = $('id').value;
      if (id) {
        await Bora.api('/api/produtos/' + id, { method: 'PUT', body: JSON.stringify(payload()) });
        await salvarEstoqueSeMudou(id);
      }
      else await Bora.api('/api/produtos', { method: 'POST', body: JSON.stringify(payload()) });
      reset(); lista();
    } catch (ex) { $('msg').textContent = ex.message; }
  });

  document.addEventListener('DOMContentLoaded', lista);

  // ---- Importação de cardápio em massa ----------------------------------------------------
  // O cadastro de loja nova é feito pela plataforma: digitar 30 produtos um a um é o gargalo.
  (function importador() {
    const txt = document.getElementById('impTexto');
    if (!txt) return;
    const msg = document.getElementById('impMsg');
    const prev = document.getElementById('impPreview');
    const btnCriar = document.getElementById('impCriar');
    let lote = [];

    /**
     * O preço de uma linha do import, aceitando vírgula OU ponto como decimal.
     *
     * Item 7.6 da varredura, medido em 21/10/2026: a versão anterior era
     * `Number(bruto.replace(/[R$\s.]/g,'').replace(',','.'))` — ela apagava TODO ponto, tratando-o
     * como separador de milhar. Então "12,50" entrava certo e **"12.50" entrava como R$ 1.250,00**,
     * cem vezes mais caro. E o import roda no onboarding, que é exatamente quando o lojista cola uma
     * planilha — que pode vir em qualquer um dos dois formatos.
     *
     * A regra: o ÚLTIMO separador manda, porque é sempre o decimal. "1.234,56" e "1,234.56" são a
     * mesma quantia escrita nos dois padrões, e as duas chegam em 1234.56. Separador sozinho com três
     * casas depois ("1.250") é milhar, não decimal — ninguém cadastra preço com três decimais.
     */
    function precoDoImport(bruto) {
      const limpo = String(bruto == null ? '' : bruto).replace(/[R$\s]/g, '');
      const corte = Math.max(limpo.lastIndexOf(','), limpo.lastIndexOf('.'));
      if (corte < 0) return Number(limpo);
      const depois = limpo.slice(corte + 1);
      // So um TIPO de separador e tres digitos depois dele = milhar ("1.250", "1.250.000"): ninguem
      // cadastra preco com tres casas decimais. Com os dois tipos ("1.234,56"), o ultimo e o decimal.
      const tipos = new Set(limpo.match(/[.,]/g) || []);
      if (tipos.size === 1 && depois.length === 3) return Number(limpo.replace(/[.,]/g, ''));
      return Number(limpo.slice(0, corte).replace(/[.,]/g, '') + '.' + depois);
    }
    window.__precoDoImport = precoDoImport;

    // Aceita ";", tab ou "|" — quem copia de planilha ou do bloco de notas não deve ter que pensar.
    function parse(texto) {
      const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
      const itens = [], erros = [];
      linhas.forEach((linha, n) => {
        const p = linha.split(/[;|	]/).map(x => x.trim()).filter(x => x !== '');
        if (p.length < 2) { erros.push('linha ' + (n + 1) + ': faltou o preço — ' + linha); return; }
        const precoBruto = p[p.length - 1];
        const preco = precoDoImport(precoBruto);
        if (!isFinite(preco) || preco <= 0) { erros.push('linha ' + (n + 1) + ': preço inválido "' + precoBruto + '"'); return; }
        const nome = p.length >= 3 ? p[1] : p[0];
        const categoria = p.length >= 3 ? p[0] : 'Geral';
        if (!nome) { erros.push('linha ' + (n + 1) + ': faltou o nome'); return; }
        itens.push({ nome, categoria, preco, ativo: true });
      });
      return { itens, erros };
    }

    /**
     * O produto que já existe com aquele nome.
     *
     * O import SÓ criava. Colar o cardapio da loja -- que é o que o lojista faz quando o preço
     * muda -- enchia o catálogo de produtos repetidos, e o cliente passava a ver o mesmo item duas
     * vezes, com preços diferentes. Agora o que já existe é ATUALIZADO.
     */
    function existente(nome) {
      const n = String(nome || '').trim().toLowerCase();
      return produtos.find(p => String(p.nome || '').trim().toLowerCase() === n) || null;
    }

    /**
     * O corpo da edição: o que já estava no produto, mudando só preço e categoria.
     *
     * `estoque` e `imagemUrl` ficam FORA. O servidor ignora o estoque na edição justamente para
     * não apagar as baixas do dia, e grava a imagemUrl quando ela vem -- e o que a lista devolve
     * é o ENDEREÇO da foto, não a foto, então devolvê-lo trocaria a foto por um link para si
     * mesma. Já `custo` e `estoqueMinimo` o servidor grava SEM CONDIÇÃO: vão de volta com o valor
     * exato que vieram, senão o import apagaria o custo e, com ele, o CMV e a margem.
     */
    function corpoDeEdicao(p, item) {
      return {
        nome: p.nome,                      // mantém a grafia do cadastro
        categoria: item.categoria,
        preco: item.preco,
        custo: p.custo,
        estoqueMinimo: p.estoqueMinimo,
        ativo: p.ativo !== false,          // não religa o que foi tirado do cardápio
        codigoExterno: p.codigoExterno || '',
      };
    }

    /**
     * PRODUTO ACABADO NAO E ITEM DE ESTOQUE.
     *
     * Em 23/10 eu fiz o import nascer com `estoque: 0`, por ter entendido errado um pedido. Isso
     * esta desfeito. O que se estoca numa acaiteria e copo, agua, leite condensado, polpa -- e
     * isso sao INSUMOS, ligados ao produto pela ficha tecnica. O produto em si nasce livre.
     *
     * Vale lembrar por que importava: o servidor marca esgotado quando
     * `estoque != null && estoque < 1` (PublicController). Entao nascer com 0 punha o item
     * recem-importado no cardapio APAGADO, escrito "Esgotado" e sem botao -- a loja inteira
     * esgotada logo depois de importar o cardapio.
     */
    /** Separa o que vai ser criado, o que muda e o que já está certo. */
    function separar(itens) {
      const novos = [], mudam = [], iguais = [];
      for (const i of itens) {
        const p = existente(i.nome);
        if (!p) { novos.push(i); continue; }
        const mesmoPreco = Math.abs(Number(p.preco) - i.preco) < 0.005;
        const mesmaCat = String(p.categoria || '').trim() === String(i.categoria || '').trim();
        if (mesmoPreco && mesmaCat) iguais.push({ item: i, p });
        else mudam.push({ item: i, p });
      }
      return { novos, mudam, iguais };
    }

    document.getElementById('impConferir').onclick = () => {
      const r = parse(txt.value);
      lote = r.itens;
      const s = separar(lote);
      prev.style.display = 'block';
      const linha = (cor, html) => '<div style="color:' + cor + '">' + html + '</div>';
      prev.innerHTML =
        '<b>' + s.novos.length + ' a criar · ' + s.mudam.length + ' a atualizar · '
        + s.iguais.length + ' já está igual</b>'
        + (r.erros.length ? '<br><span style="color:#dc2626">' + r.erros.length
            + ' linha(s) com problema:<br>' + r.erros.join('<br>') + '</span>' : '')
        + '<hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0">'
        + s.novos.map(i => linha('#166534', '➕ <b>' + esc(i.nome) + '</b> · '
            + esc(i.categoria) + ' · ' + money(i.preco))).join('')
        + s.mudam.map(o => linha('#b45309', '✎ <b>' + esc(o.p.nome) + '</b>'
            + (Math.abs(Number(o.p.preco) - o.item.preco) < 0.005 ? ''
               : ' · ' + money(o.p.preco) + ' → <b>' + money(o.item.preco) + '</b>')
            + (String(o.p.categoria || '').trim() !== String(o.item.categoria || '').trim()
               ? ' · ' + esc(o.p.categoria || '(sem categoria)') + ' → <b>'
                 + esc(o.item.categoria) + '</b>' : ''))).join('')
        + s.iguais.map(o => linha('#94a3b8', '= ' + esc(o.p.nome) + ' (sem mudança)')).join('');
      msg.textContent = '';
    };

    btnCriar.onclick = async () => {
      // Mesmo defeito do import de insumo: o botao nascia `disabled` e so ligava depois do
      // Conferir. Quem colava e clicava direto em Importar via a tela nao fazer NADA, calada.
      if (!lote.length) document.getElementById('impConferir').onclick();
      const s = separar(lote);
      const total = s.novos.length + s.mudam.length;
      if (!total) {
        msg.style.color = '#b45309';
        msg.textContent = lote.length
          ? 'Nada a fazer: os ' + lote.length + ' itens da lista já estão iguais no catálogo.'
          : 'Cole a lista na caixa acima primeiro.';
        return;
      }
      if (!confirm('Criar ' + s.novos.length + ' e atualizar ' + s.mudam.length
          + ' produto(s) nesta loja?')) return;
      btnCriar.disabled = true;
      let ok = 0; const falhas = [];
      const andar = () => { msg.style.color = 'var(--muted)';
        msg.textContent = 'aplicando… ' + (ok + falhas.length) + '/' + total; };

      for (const item of s.novos) {
        try { await Bora.api('/api/produtos', { method: 'POST', body: JSON.stringify(item) }); ok++; }
        catch (e) { falhas.push(item.nome + ': ' + (e && e.message || e)); }
        andar();
      }
      for (const o of s.mudam) {
        try {
          await Bora.api('/api/produtos/' + o.p.id,
            { method: 'PUT', body: JSON.stringify(corpoDeEdicao(o.p, o.item)) });
          ok++;
        } catch (e) { falhas.push(o.p.nome + ': ' + (e && e.message || e)); }
        andar();
      }

      msg.style.color = falhas.length ? '#b45309' : '#166534';
      msg.textContent = ok + ' de ' + total + ' aplicado(s)'
        + (falhas.length ? ' · ' + falhas.length + ' falharam' : ' ✓');
      if (falhas.length) {
        // Dizer "pronto" com falha no meio deixaria metade do cardápio com o preço velho.
        prev.innerHTML = '<span style="color:#dc2626"><b>Estes não mudaram:</b><br>'
          + falhas.join('<br>') + '<br><br>Conferir e aplicar de novo refaz só o que falta.</span>';
      } else { prev.style.display = 'none'; txt.value = ''; lote = []; }
      btnCriar.disabled = false;
      await lista();
    };
  })();

  /**
   * MIGRAÇÃO POR FOTO — veio de Configurações para cá em 25/10/2026.
   *
   * A funcionalidade existia e funcionava: `POST /api/ia/importar-cardapio`. Só estava no lugar
   * errado — dentro do acordeão "Módulo IA" em Configurações, como terceiro item, depois do
   * WhatsApp do dono e do recuperador de clientes, e o acordeão nasce FECHADO. Quem vai cadastrar
   * um cardápio está nesta tela, com a caixa de colar na frente.
   *
   * Medido em 24/10/2026: a Zirá (loja 18) é a única com o módulo ligado e a chave da IA está no
   * servidor. Estava disponível para ela o tempo todo, enquanto o cardápio era digitado à mão.
   *
   * O bloco só aparece se a loja contratou o add-on. Sem essa conferência, loja sem o módulo veria
   * um botão que sempre devolve 403 — pior que não ter botão, porque parece defeito nosso.
   */
  (function migracaoPorFoto() {
    const bloco = document.getElementById('impFotoBloco');
    if (!bloco) return;                      // tela antiga em cache: nada a fazer, sem estourar
    const campo = document.getElementById('impFoto');
    const botao = document.getElementById('impFotoEnviar');
    const msg = document.getElementById('impFotoMsg');

    // Só mostra para quem tem o módulo. Falha na consulta deixa escondido: oferecer e dar erro é
    // pior que não oferecer.
    Bora.api('/api/ia/status')
      .then(st => { if (st && st.contratado) bloco.hidden = false; })
      .catch(() => {});

    botao.onclick = () => {
      const f = campo.files && campo.files[0];
      if (!f) { msg.style.color = '#b45309'; msg.textContent = 'Escolha a foto primeiro.'; return; }
      // Teto de tamanho ANTES de ler o arquivo. A imagem vai em base64 no corpo, o que a infla ~33%,
      // e foto de celular passa de 5 MB fácil: sem isto o lojista esperava a leitura inteira para
      // levar um erro do servidor no fim.
      const MAX_MB = 5;
      if (f.size > MAX_MB * 1024 * 1024) {
        msg.style.color = '#b45309';
        msg.textContent = 'Foto de ' + (f.size / 1048576).toFixed(1) + ' MB — o limite é ' + MAX_MB
          + ' MB. Tire a foto em qualidade menor ou mande um print.';
        return;
      }
      const rd = new FileReader();
      rd.onerror = () => { msg.style.color = '#dc2626'; msg.textContent = 'Não consegui ler esse arquivo.'; };
      rd.onload = async () => {
        botao.disabled = true;
        msg.style.color = 'var(--muted)';
        msg.textContent = 'Lendo o cardápio com IA… isso pode levar um minuto.';
        try {
          const r = await Bora.api('/api/ia/importar-cardapio', {
            method: 'POST',
            body: JSON.stringify({
              imagemBase64: String(rd.result).split(',')[1],
              mediaType: f.type || 'image/jpeg',
            }),
          });
          msg.style.color = '#166534';
          // "Confira os preços" não é formalidade: é leitura de foto, e aqui é preço que o cliente
          // paga. A versão de Configurações dizia só "Veja em Produtos", que nem era onde o lojista
          // estava.
          msg.textContent = '✅ ' + (r.produtosCriados || 0) + ' produto(s) cadastrado(s). '
            + 'Confira os preços na lista abaixo antes de divulgar.';
          campo.value = '';
          await lista();                      // a lista desta tela, para ele ver o que entrou
        } catch (e) {
          msg.style.color = '#dc2626';
          msg.textContent = '❌ ' + e.message;
        } finally {
          botao.disabled = false;
        }
      };
      rd.readAsDataURL(f);
    };
  })();

})();
