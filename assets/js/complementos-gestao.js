// Gestão de complementos/adicionais por produto (tamanho, borda, extras) — modal leve.
window.__comp = async (produtoId) => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let grupos;
  try { grupos = await Bora.api('/api/produtos/' + produtoId + '/complementos'); }
  catch (e) { alert(e.message); return; }
  const old = document.getElementById('compGest'); if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'compGest';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:120;display:flex;align-items:center;justify-content:center;padding:16px';
  div.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:22px">
    <h2 style="margin:0 0 4px">🧩 Complementos do produto</h2>
    <p style="color:#64748b;font-size:13px;margin:0 0 12px">Ex.: grupo "Tamanho" (escolha 1), grupo "Adicionais" (até 5). Preço 0 = sem custo extra.</p>
    <div id="cgGrupos"></div>
    <button id="cgAddGrupo" style="margin-top:8px;padding:8px 14px;border:1px dashed #7c3aed;background:#f5f3ff;color:#7c3aed;border-radius:8px;cursor:pointer;font-weight:700">+ Adicionar grupo</button>
    <div id="cgMsg" style="font-size:13px;margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button id="cgSalvar" class="btn" style="flex:1">Salvar complementos</button>
      <button id="cgFechar" style="flex:1;border:0;background:#f1f5f9;border-radius:8px;cursor:pointer">Fechar</button>
    </div></div>`;
  document.body.appendChild(div);
  const wrap = div.querySelector('#cgGrupos');
  function linhaItem(i) {
    return `<div style="display:flex;gap:6px;margin:4px 0" class="cg-item">
      <input placeholder="Nome (ex.: Borda catupiry)" value="${esc(i?.nome || '')}" class="cg-inome" style="flex:2;padding:7px;border:1px solid #e2e8f0;border-radius:6px">
      <input placeholder="+R$" type="number" step="0.01" min="0" value="${i?.preco ?? ''}" class="cg-ipreco" style="width:90px;padding:7px;border:1px solid #e2e8f0;border-radius:6px">
      <button onclick="this.parentElement.remove()" style="border:0;background:#fef2f2;color:#dc2626;border-radius:6px;cursor:pointer;padding:0 10px">✕</button></div>`;
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
    return b;
  }
  (grupos.length ? grupos : []).forEach(g => wrap.appendChild(blocoGrupo(g)));
  div.querySelector('#cgAddGrupo').onclick = () => wrap.appendChild(blocoGrupo(null));
  div.querySelector('#cgFechar').onclick = () => div.remove();
  div.querySelector('#cgSalvar').onclick = async () => {
    const corpo = [...wrap.querySelectorAll('.cg-grupo')].map(b => ({
      nome: b.querySelector('.cg-gnome').value.trim(),
      minimo: Number(b.querySelector('.cg-gmin').value || 0),
      maximo: Number(b.querySelector('.cg-gmax').value || 1),
      itens: [...b.querySelectorAll('.cg-item')].map(li => ({
        nome: li.querySelector('.cg-inome').value.trim(),
        preco: Number(li.querySelector('.cg-ipreco').value || 0)
      })).filter(i => i.nome)
    })).filter(g => g.nome);
    const msg = div.querySelector('#cgMsg');
    try { await Bora.api('/api/produtos/' + produtoId + '/complementos', { method: 'PUT', body: JSON.stringify(corpo) });
      msg.textContent = '✅ Salvo! Já vale no cardápio digital.'; msg.style.color = '#059669'; }
    catch (e) { msg.textContent = '❌ ' + e.message; msg.style.color = '#dc2626'; }
  };
};
