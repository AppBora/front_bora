// CRUD de insumos (ingredientes) com custo e estoque por unidade.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let insumos = [];

  function estoqueCel(i) {
    if (i.estoque == null) return '<span style="color:#94a3b8">livre</span>';
    const baixo = i.estoqueMinimo != null && Number(i.estoque) <= Number(i.estoqueMinimo);
    return `<b style="color:${Number(i.estoque) <= 0 ? '#dc2626' : baixo ? '#f59e0b' : '#0f172a'}">${Number(i.estoque)} ${esc(i.unidade)}${baixo ? ' ⚠' : ''}</b>`;
  }

  async function lista() {
    insumos = await Bora.insumos();
    $('lista').innerHTML = insumos.length ? insumos.map(i =>
      `<tr><td><b>${esc(i.nome)}</b></td><td>${money(i.custo)}/${esc(i.unidade)}</td><td>${estoqueCel(i)}</td>
        <td style="text-align:right"><button onclick="__edit(${i.id})" style="border:0;background:#f1f5f9;border-radius:8px;padding:5px 9px;cursor:pointer">✏</button>
        <button onclick="__del(${i.id})" style="border:0;background:#fef2f2;color:#dc2626;border-radius:8px;padding:5px 9px;cursor:pointer">✕</button></td></tr>`).join('')
      : '<tr><td colspan="4" style="color:#94a3b8">Nenhum insumo. Cadastre os ingredientes (polpa, granola, copo…).</td></tr>';
  }
  const num = v => v === '' || v == null ? null : Number(v);
  function payload() { return { nome: $('nome').value.trim(), unidade: $('unidade').value, custo: Number($('custo').value || 0),
    estoque: num($('estoque').value), estoqueMinimo: num($('estoqueMinimo').value) }; }
  function reset() { $('form').reset(); $('id').value = ''; $('btnSalvar').textContent = 'Salvar insumo'; $('cancelar').style.display = 'none'; $('msg').textContent = ''; }

  window.__edit = id => { const i = insumos.find(x => x.id === id); if (!i) return;
    $('id').value = i.id; $('nome').value = i.nome || ''; $('unidade').value = i.unidade || 'un'; $('custo').value = i.custo ?? '';
    $('estoque').value = i.estoque ?? ''; $('estoqueMinimo').value = i.estoqueMinimo ?? '';
    $('btnSalvar').textContent = 'Atualizar insumo'; $('cancelar').style.display = 'inline-block'; window.scrollTo(0, 0); };
  window.__del = async id => { if (confirm('Excluir insumo?')) { await Bora.excluirInsumo(id); lista(); } };

  $('cancelar').addEventListener('click', reset);
  $('form').addEventListener('submit', async e => { e.preventDefault(); $('msg').textContent = '';
    try { const b = payload(); if ($('id').value) b.id = Number($('id').value); await Bora.salvarInsumo(b); reset(); lista(); }
    catch (ex) { $('msg').textContent = ex.message; } });

  document.addEventListener('DOMContentLoaded', () => lista().catch(e => $('lista').innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${e.message}</td></tr>`));
})();
