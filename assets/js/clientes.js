// CRUD de clientes (escopado por loja via token).
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);

  async function lista() {
    const tb = $('lista');
    try {
      const cs = await Bora.clientes();
      tb.innerHTML = cs.map(c =>
        `<tr><td>${c.nome || '—'}</td><td>${c.telefone || '—'}</td><td>${c.bairro || '—'}</td>` +
        `<td style="text-align:right"><button class="btn ghost" style="background:#e5e7eb;color:#111;padding:4px 8px" onclick="__del(${c.id})">✕</button></td></tr>`
      ).join('') || '<tr><td colspan="4" style="color:#94a3b8">Nenhum cliente ainda.</td></tr>';
    } catch (e) { tb.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${e.message}</td></tr>`; }
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
