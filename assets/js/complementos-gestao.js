// Gestão de complementos/adicionais por produto (tamanho, borda, extras) — modal leve.
//
// Desde 21/10/2026 (V55, item 2.6 da varredura) o adicional pode apontar para um INSUMO: é assim que
// a granola e o leite em pó saem do estoque e entram no custo da venda. Numa açaiteria metade do
// valor está nos adicionais, e antes disso nada deles era contado.

/**
 * A quantidade que o lojista digitou, como numero.
 *
 * <p>Mora num lugar so porque DUAS coisas dependem dela: o corpo que vai para o servidor e o aviso de
 * "insumo escolhido sem quantidade". Enquanto a conta estava escrita nos dois, consertar um e esquecer
 * o outro faria o aviso discordar do que foi salvo -- o lojista veria "esta faltando a quantidade"
 * num adicional que baixa estoque, ou pior, nao veria aviso num que nao baixa.</p>
 *
 * <p>A virgula vira ponto porque o lojista digita "0,030". Sem isso o Number da NaN e o vinculo com o
 * insumo era descartado sem ninguem avisar.</p>
 */
window.__compQtd = (digitado) => Number(String(digitado ?? '').trim().replace(',', '.'));

/**
 * O corpo que vai para o servidor, a partir do que foi lido da tela.
 *
 * <p>Função pura, e é de propósito: a tela monta HTML e não dá para executar no teste, mas ESTA parte
 * é onde um erro fica calado. "Insumo escolhido sem quantidade" e "quantidade com vírgula" são
 * exatamente os casos em que o lojista salva, não vê erro nenhum, e o adicional continua sem baixar
 * estoque — ele conclui que o sistema não funciona.</p>
 *
 * <p>Os dois campos andam juntos: sem um dos dois, os dois vão nulos, que é o padrão "adicional que
 * não mexe no estoque". O servidor aplica a mesma regra (ComplementoController), porque esta tela não
 * é a única coisa que pode chamar a API — e o {@code __compQtd} é quem lê o que foi digitado.</p>
 */
window.__compCorpo = (lidos) => (lidos || []).map(g => ({
  nome: String(g.nome || '').trim(),
  minimo: Number(g.minimo || 0),
  maximo: Number(g.maximo || 1),
  itens: (g.itens || []).map(i => {
    const insumoId = i.insumoId === '' || i.insumoId == null ? null : Number(i.insumoId);
    const qtd = window.__compQtd(i.quantidade);
    const liga = insumoId > 0 && qtd > 0;
    return {
      nome: String(i.nome || '').trim(),
      preco: Number(i.preco || 0),
      insumoId: liga ? insumoId : null,
      quantidade: liga ? qtd : null,
    };
  }).filter(i => i.nome),
})).filter(g => g.nome);

/**
 * O que está errado no cadastro, em português, ou nulo quando está tudo bem.
 *
 * <p>Mínimo maior que o máximo, ou maior que o número de opções, faz o cliente nunca conseguir fechar
 * o pedido: o cardápio exige a escolha e não há opção suficiente para satisfazer. Barrar aqui é
 * melhor que descobrir pelo cliente que desistiu.</p>
 */
window.__compProblema = (corpo) => {
  const ruim = (corpo || []).find(g => g.minimo > g.maximo || g.minimo > g.itens.length);
  if (ruim) {
    return '❌ No grupo "' + ruim.nome + '" o mínimo (' + ruim.minimo + ') é maior que o máximo ou '
      + 'que o número de opções — o cliente nunca conseguiria fechar o pedido.';
  }
  return null;
};

/**
 * Aviso (não bloqueia) para o erro mais provável desta tela: escolher o insumo e esquecer a
 * quantidade.
 *
 * <p>Sem este aviso, o lojista escolhe "Granola", salva, vê "✅ Salvo!" — e o adicional continua não
 * baixando estoque, porque sem quantidade não há o que tirar. Ele não tem como descobrir sozinho.</p>
 *
 * <p>Avisa em vez de barrar porque pode ser proposital (o lojista ia preencher depois), e travar a
 * gravação por causa disso perderia o resto do cadastro que ele acabou de montar.</p>
 *
 * <p>Recebe o que foi LIDO da tela, não o corpo: o corpo já zerou os dois campos, então a informação
 * "tinha insumo escolhido" não existe mais nele.</p>
 */
window.__compAviso = (lidos) => {
  const faltando = [];
  (lidos || []).forEach(g => (g.itens || []).forEach(i => {
    const temInsumo = Number(i.insumoId) > 0;
    const qtd = window.__compQtd(i.quantidade);
    const nome = String(i.nome || '').trim();
    if (nome && temInsumo && !(qtd > 0)) faltando.push(nome);
  }));
  if (!faltando.length) return null;
  return '⚠️ ' + faltando.join(', ') + (faltando.length > 1 ? ' têm' : ' tem')
    + ' insumo escolhido mas sem quantidade, então não vão baixar estoque. '
    + 'Preencha quanto sai por unidade vendida.';
};

window.__comp = async (produtoId) => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let grupos, insumos;
  try {
    // Os insumos vão no mesmo carregamento: a tela precisa deles para montar a lista de escolha.
    // Loja que não cadastrou insumo nenhum continua usando a tela normalmente — a lista fica só com
    // a opção "não baixa estoque", que é o comportamento de sempre.
    [grupos, insumos] = await Promise.all([
      Bora.api('/api/produtos/' + produtoId + '/complementos'),
      Bora.insumos().catch(() => []),
    ]);
  } catch (e) { alert(e.message); return; }
  const old = document.getElementById('compGest'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'compGest';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:120;display:flex;align-items:center;justify-content:center;padding:16px';
  div.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:90vh;overflow:auto;padding:22px">
    <h2 style="margin:0 0 4px">🧩 Complementos do produto</h2>
    <p style="color:#64748b;font-size:13px;margin:0 0 12px">Ex.: grupo "Tamanho" (escolha 1), grupo "Adicionais" (até 5). Preço 0 = sem custo extra.</p>
    <div id="cgGrupos"></div>
    <button id="cgAddGrupo" style="margin-top:8px;padding:8px 14px;border:1px dashed #9333ea;background:#faf5ff;color:#9333ea;border-radius:8px;cursor:pointer;font-weight:700">+ Adicionar grupo</button>
    <div id="cgMsg" style="font-size:13px;margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button id="cgSalvar" class="btn" style="flex:1">Salvar complementos</button>
      <button id="cgFechar" style="flex:1;border:0;background:#f1f5f9;border-radius:8px;cursor:pointer">Fechar</button>
    </div></div>`;
  document.body.appendChild(div);
  const wrap = div.querySelector('#cgGrupos');

  /** A lista de insumos para escolher, com a opção "nenhum" primeiro. */
  function opcoesDeInsumo(escolhido) {
    const nenhum = `<option value=""${escolhido ? '' : ' selected'}>— não baixa estoque —</option>`;
    return nenhum + insumos.map(i =>
      `<option value="${i.id}"${Number(escolhido) === Number(i.id) ? ' selected' : ''}>`
      + `${esc(i.nome)} (${esc(i.unidade || 'un')})</option>`).join('');
  }

  function linhaItem(i) {
    // A unidade do insumo fica escrita ao lado da quantidade: sem ela o lojista digita 30 pensando em
    // gramas num insumo cadastrado em quilo, e o estoque derrete 1000x mais rapido.
    const un = i && i.insumoId ? (insumos.find(x => Number(x.id) === Number(i.insumoId)) || {}).unidade : '';
    return `<div style="border:1px solid #f1f5f9;border-radius:8px;padding:8px;margin:6px 0" class="cg-item">
      <div style="display:flex;gap:6px">
        <input placeholder="Nome (ex.: Borda catupiry)" value="${esc(i?.nome || '')}" class="cg-inome" style="flex:2;padding:7px;border:1px solid #e2e8f0;border-radius:6px">
        <input placeholder="+R$" type="number" step="0.01" min="0" value="${i?.preco ?? ''}" class="cg-ipreco" style="width:90px;padding:7px;border:1px solid #e2e8f0;border-radius:6px">
        <button onclick="this.closest('.cg-item').remove()" style="border:0;background:#fef2f2;color:#dc2626;border-radius:6px;cursor:pointer;padding:0 10px">✕</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
        <span style="font-size:12px;color:#64748b;white-space:nowrap">baixa do estoque:</span>
        <select class="cg-iinsumo" style="flex:1;min-width:0;padding:6px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px">${opcoesDeInsumo(i?.insumoId)}</select>
        <input placeholder="qtd" type="number" step="0.0001" min="0" value="${i?.quantidade ?? ''}" class="cg-iqtd" style="width:84px;padding:6px;border:1px solid #e2e8f0;border-radius:6px">
        <span class="cg-iun" style="font-size:12px;color:#94a3b8;width:34px">${esc(un || '')}</span>
      </div></div>`;
  }

  function blocoGrupo(g) {
    const b = document.createElement('div');
    b.className = 'cg-grupo';
    b.style.cssText = 'border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin:8px 0';
    b.innerHTML = `<div style="display:flex;gap:6px;align-items:center">
        <input placeholder="Nome do grupo (ex.: Tamanho)" value="${esc(g?.nome || '')}" class="cg-gnome" style="flex:2;padding:7px;border:1px solid #e2e8f0;border-radius:6px;font-weight:700">
        <label style="font-size:12px;color:#64748b">mín<br><input type="number" min="0" value="${g?.minimo ?? 0}" class="cg-gmin" style="width:52px;padding:6px;border:1px solid #e2e8f0;border-radius:6px"></label>
        <label style="font-size:12px;color:#64748b">máx<br><input type="number" min="1" value="${g?.maximo ?? 1}" class="cg-gmax" style="width:52px;padding:6px;border:1px solid #e2e8f0;border-radius:6px"></label>
        <button onclick="this.closest('.cg-grupo').remove()" style="border:0;background:#fef2f2;color:#dc2626;border-radius:6px;cursor:pointer;padding:6px 10px;align-self:end">✕</button></div>
      <div class="cg-itens" style="margin-top:6px">${(g?.itens || []).map(linhaItem).join('')}</div>
      <button class="cg-additem" style="margin-top:4px;padding:5px 10px;border:1px dashed #94a3b8;background:#f8fafc;border-radius:6px;cursor:pointer;font-size:13px">+ opção</button>`;
    b.querySelector('.cg-additem').onclick = ev => { ev.preventDefault(); b.querySelector('.cg-itens').insertAdjacentHTML('beforeend', linhaItem(null)); };
    // Trocar o insumo atualiza a unidade escrita ao lado da quantidade.
    b.addEventListener('change', ev => {
      const sel = ev.target.closest && ev.target.closest('.cg-iinsumo');
      if (!sel) return;
      const esc2 = (insumos.find(x => Number(x.id) === Number(sel.value)) || {}).unidade || '';
      const alvo = sel.closest('.cg-item').querySelector('.cg-iun');
      if (alvo) alvo.textContent = esc2;
    });
    return b;
  }

  (grupos.length ? grupos : []).forEach(g => wrap.appendChild(blocoGrupo(g)));
  div.querySelector('#cgAddGrupo').onclick = () => wrap.appendChild(blocoGrupo(null));
  div.querySelector('#cgFechar').onclick = () => div.remove();
  div.querySelector('#cgSalvar').onclick = async () => {
    // Ler a tela e montar o corpo sao duas coisas: a leitura e DOM, a montagem e regra. A regra mora
    // no __compCorpo, que tem teste.
    const lidos = [...wrap.querySelectorAll('.cg-grupo')].map(b => ({
      nome: b.querySelector('.cg-gnome').value,
      minimo: b.querySelector('.cg-gmin').value,
      maximo: b.querySelector('.cg-gmax').value,
      itens: [...b.querySelectorAll('.cg-item')].map(li => ({
        nome: li.querySelector('.cg-inome').value,
        preco: li.querySelector('.cg-ipreco').value,
        insumoId: li.querySelector('.cg-iinsumo').value,
        quantidade: li.querySelector('.cg-iqtd').value,
      })),
    }));
    const corpo = window.__compCorpo(lidos);
    const msg = div.querySelector('#cgMsg');
    const problema = window.__compProblema(corpo);
    if (problema) { msg.textContent = problema; msg.style.color = '#dc2626'; return; }
    try {
      await Bora.api('/api/produtos/' + produtoId + '/complementos', { method: 'PUT', body: JSON.stringify(corpo) });
      const aviso = window.__compAviso(lidos);
      msg.textContent = '✅ Salvo! Já vale no cardápio digital.' + (aviso ? ' ' + aviso : '');
      msg.style.color = aviso ? '#b45309' : '#059669';
    }
    catch (e) { msg.textContent = '❌ ' + e.message; msg.style.color = '#dc2626'; }
  };
};
