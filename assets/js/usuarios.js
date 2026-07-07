// Gestão de usuários (admin da loja). Backend exige papel ADMINISTRADOR_LOJA.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);

  const PAPEL = { OPERADOR: 'Operador', GERENTE: 'Gerente', ADMINISTRADOR_LOJA: 'Admin da loja', ADMINISTRADOR_BORA: 'Admin BoraHapp' };

  window.__ativo = async (id, ativo) => { try { await Bora.api(`/api/usuarios/${id}/ativo?ativo=${ativo}`, { method: 'PUT' }); lista(); } catch (e) { alert(e.message); } };

  async function lista() {
    const tb = $('lista');
    try {
      const us = await Bora.api('/api/usuarios');
      tb.innerHTML = us.map(u => {
        const badge = u.ativo ? '<span class="badge b-entregue">Ativo</span>' : '<span class="badge b-cancelado">Inativo</span>';
        const toggle = `<button class="btn ghost" style="background:#e5e7eb;color:#111;padding:4px 8px;margin-left:6px" onclick="__ativo(${u.id},${!u.ativo})">${u.ativo ? 'Desativar' : 'Ativar'}</button>`;
        return `<tr><td>${u.nome || '—'}</td><td>${u.email}</td><td>${PAPEL[u.papel] || u.papel}</td><td>${badge}${toggle}</td></tr>`;
      }).join('') || '<tr><td colspan="4" style="color:#94a3b8">Nenhum usuário.</td></tr>';
    } catch (e) {
      const m = e.message.includes('403') || /perfil|restrita/i.test(e.message) ? 'Apenas administradores da loja acessam esta tela.' : e.message;
      tb.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${m}</td></tr>`;
    }
  }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault(); $('msg').textContent = '';
    try {
      await Bora.api('/api/usuarios', { method: 'POST', body: JSON.stringify({
        nome: $('nome').value.trim(), email: $('email').value.trim(),
        senha: $('senha').value, papel: $('papel').value
      }) });
      $('form').reset(); lista();
    } catch (ex) { $('msg').style.color = 'var(--danger)'; $('msg').textContent = ex.message; }
  });

  document.addEventListener('DOMContentLoaded', lista);
})();
