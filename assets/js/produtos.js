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
        `<tr><td><b>${esc(p.nome) || '—'}</b><br><small style="color:#94a3b8">${esc(p.categoria || '')}</small></td>` +
        `<td>${money(p.preco)}</td><td>${margem(p)}</td><td>${estoqueCel(p)}</td>` +
        `<td style="text-align:right"><button onclick="__ficha(${p.id})" title="Ficha técnica" style="border:0;background:#f5f3ff;color:#7c3aed;border-radius:8px;padding:5px 9px;cursor:pointer">🧪</button> ` +
        `<button onclick="__edit(${p.id})" style="border:0;background:#f1f5f9;border-radius:8px;padding:5px 9px;cursor:pointer">✏</button> ` +
        `<button onclick="__del(${p.id})" style="border:0;background:#fef2f2;color:#dc2626;border-radius:8px;padding:5px 9px;cursor:pointer">✕</button></td></tr>`
      ).join('') || '<tr><td colspan="5" style="color:#94a3b8">Nenhum produto ainda.</td></tr>';
    } catch (e) { tb.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${e.message}</td></tr>`; }
  }

  const num = v => v === '' || v == null ? null : Number(v);
  function payload() {
    return { nome: $('nome').value.trim(), categoria: $('categoria').value.trim(),
      preco: Number($('preco').value || 0), custo: num($('custo').value),
      estoque: num($('estoque').value), estoqueMinimo: num($('estoqueMinimo').value), ativo: true };
  }
  function reset() { $('form').reset(); $('id').value = ''; $('btnSalvar').textContent = 'Salvar produto'; $('cancelar').style.display = 'none'; $('msg').textContent = ''; }

  window.__edit = id => { const p = produtos.find(x => x.id === id); if (!p) return;
    $('id').value = p.id; $('nome').value = p.nome || ''; $('categoria').value = p.categoria || '';
    $('preco').value = p.preco ?? ''; $('custo').value = p.custo ?? ''; $('estoque').value = p.estoque ?? ''; $('estoqueMinimo').value = p.estoqueMinimo ?? '';
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
      if (id) await Bora.api('/api/produtos/' + id, { method: 'PUT', body: JSON.stringify(payload()) });
      else await Bora.api('/api/produtos', { method: 'POST', body: JSON.stringify(payload()) });
      reset(); lista();
    } catch (ex) { $('msg').textContent = ex.message; }
  });

  document.addEventListener('DOMContentLoaded', lista);
})();
