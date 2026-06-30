// Contagem de estoque (inventário) — informa o contado, mostra a diferença e ajusta o estoque.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let produtos = [];

  window.__recalc = () => {
    let div = 0, impacto = 0;
    produtos.forEach(p => {
      const inp = $('c' + p.id); if (!inp) return;
      const cont = inp.value === '' ? null : Number(inp.value);
      const cel = $('d' + p.id);
      if (cont == null) { cel.textContent = '—'; cel.style.color = '#94a3b8'; return; }
      const dif = cont - p.estoque;
      cel.textContent = dif > 0 ? '+' + dif : dif;
      cel.style.color = dif === 0 ? '#059669' : '#dc2626';
      if (dif !== 0) { div++; impacto += dif * Number(p.custo || 0); }
    });
    $('kDiv').textContent = div;
    $('kImpacto').textContent = (impacto >= 0 ? '' : '-') + money(Math.abs(impacto));
  };

  async function aplicar() {
    const alterados = produtos.filter(p => { const inp = $('c' + p.id); return inp && inp.value !== '' && Number(inp.value) !== p.estoque; });
    if (!alterados.length) { $('msg').textContent = 'Nada para ajustar.'; return; }
    if (!confirm(`Ajustar ${alterados.length} produto(s) ao valor contado?`)) return;
    $('aplicar').disabled = true;
    for (const p of alterados) {
      await Bora.atualizarProduto(p.id, { nome: p.nome, categoria: p.categoria, preco: p.preco, custo: p.custo,
        estoque: Number($('c' + p.id).value), estoqueMinimo: p.estoqueMinimo, ativo: p.ativo }).catch(() => {});
    }
    $('msg').textContent = '✓ Estoque ajustado!'; $('aplicar').disabled = false;
    carregar();
  }

  async function carregar() {
    produtos = (await Bora.produtos()).filter(p => p.estoque != null);
    $('kItens').textContent = produtos.length;
    $('lista').innerHTML = produtos.length ? produtos.map(p =>
      `<tr><td><b>${esc(p.nome)}</b><br><small style="color:#94a3b8">${esc(p.categoria || '')}</small></td>
        <td><b>${p.estoque}</b></td>
        <td><input id="c${p.id}" type="number" step="1" placeholder="${p.estoque}" oninput="__recalc()" style="width:80px;padding:7px;border:1px solid #e5e7eb;border-radius:8px"></td>
        <td id="d${p.id}" style="font-weight:800;color:#94a3b8">—</td></tr>`).join('')
      : '<tr><td colspan="4" style="color:#94a3b8">Nenhum produto com estoque controlado. Defina o estoque em Produtos.</td></tr>';
    $('kDiv').textContent = '0'; $('kImpacto').textContent = money(0);
  }

  document.addEventListener('DOMContentLoaded', () => { $('aplicar').addEventListener('click', aplicar); carregar(); });
})();
