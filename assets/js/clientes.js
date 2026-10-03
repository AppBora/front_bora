// CRUD de clientes (escopado por loja via token).
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // O telefone é GUARDADO só com dígitos, porque é assim que o cardápio e os marketplaces procuram o
  // cliente — com máscara, quem era cadastrado aqui não era encontrado lá e virava um segundo cadastro.
  // Guardar cru não quer dizer mostrar cru: aqui ele volta a ficar legível para o lojista.
  const fone = v => {
    const d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.startsWith('0')) return d; // 0800 das centrais de marketplace nao tem DDD
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return v;
  };

  async function lista() {
    const tb = $('lista');
    try {
      const cs = await Bora.clientes();
      tb.innerHTML = cs.map(c =>
        `<tr><td>${esc(c.nome) || '—'}</td><td>${esc(fone(c.telefone)) || '—'}</td><td>${esc(c.bairro) || '—'}</td>` +
        `<td style="text-align:right"><button class="btn ghost" style="background:#e5e7eb;color:#111;padding:4px 8px" onclick="__del(${c.id})">✕</button></td></tr>`
      ).join('') || '<tr><td colspan="4" style="color:#94a3b8">Nenhum cliente ainda.</td></tr>';
    } catch (e) { tb.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${esc(e.message)}</td></tr>`; }
  }
  window.__del = async (id) => { if (!confirm('Excluir cliente?')) return; try { await Bora.api('/api/clientes/' + id, { method: 'DELETE' }); lista(); } catch (e) { alert(e.message); } };

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('msg').textContent = '';
    try {
      await Bora.api('/api/clientes', { method: 'POST', body: JSON.stringify({
        nome: $('nome').value.trim(), telefone: $('telefone').value.trim(),
        endereco: $('endereco').value.trim(), bairro: $('bairro').value.trim(), referencia: $('referencia').value.trim()
      }) });
      $('form').reset(); lista();
    } catch (ex) { $('msg').textContent = ex.message; }
  });

  document.addEventListener('DOMContentLoaded', lista);
})();
