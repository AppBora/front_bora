// Gestão de usuários (admin da loja). Backend exige papel ADMINISTRADOR_LOJA.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);

  const PAPEL = { OPERADOR: 'Operador', GERENTE: 'Gerente', ADMINISTRADOR_LOJA: 'Admin da loja', ADMINISTRADOR_BORA: 'Admin BoraHapp' };

  window.__ativo = async (id, ativo) => { try { await Bora.api(`/api/usuarios/${id}/ativo?ativo=${ativo}`, { method: 'PUT' }); lista(); } catch (e) { alert(e.message); } };

  // Lojas da empresa: só faz sentido falar em "rede" quando existe mais de uma unidade.
  let lojasEmpresa = [];

  window.__vincular = async (usuarioId, select) => {
    const lojaId = Number(select.value);
    if (!lojaId) return;
    try {
      await Bora.api(`/api/rede/usuarios/${usuarioId}/lojas`, { method: 'POST', body: JSON.stringify({ lojaId }) });
      lista();
    } catch (e) { alert(e.message); select.value = ''; }
  };

  window.__desvincular = async (usuarioId, lojaId, nomeLoja) => {
    if (!confirm(`Tirar o acesso desta pessoa à loja ${nomeLoja}?

O efeito é imediato: se ela estiver `
      + 'usando o painel dessa loja agora, cai na próxima ação.')) return;
    try {
      await Bora.api(`/api/rede/usuarios/${usuarioId}/lojas/${lojaId}`, { method: 'DELETE' });
      lista();
    } catch (e) { alert(e.message); }
  };

  // Uma pessoa, N lojas: chips do que ela já acessa + o que dá para somar.
  function celulaLojas(u) {
    if (lojasEmpresa.length < 2) return '<span style="color:#94a3b8">—</span>';
    const dela = u.lojas || [];
    const chips = dela.map(l => {
      const x = l.principal ? '' :
        `<a href="#" title="Tirar acesso" onclick="__desvincular(${u.id},${l.id},'${(l.nome || '').replace(/'/g, "")}');return false"
            style="margin-left:4px;color:#991b1b;text-decoration:none">×</a>`;
      return `<span style="display:inline-block;background:#f1f5f9;border-radius:999px;padding:2px 8px;margin:2px 3px 2px 0;font-size:12px">`
        + `${l.nome}${l.principal ? ' <b title="Loja principal">•</b>' : ''}${x}</span>`;
    }).join('');
    const faltam = lojasEmpresa.filter(l => !dela.some(d => d.id === l.id));
    const add = faltam.length === 0 ? '' :
      `<select onchange="__vincular(${u.id}, this)" style="font-size:12px;padding:3px;border:1px solid #e2e8f0;border-radius:6px;margin-top:2px">
         <option value="">+ dar acesso a…</option>
         ${faltam.map(l => `<option value="${l.id}">${l.nome}</option>`).join('')}
       </select>`;
    return chips + '<br>' + add;
  }

  async function lista() {
    const tb = $('lista');
    try {
      // A equipe traz as lojas de cada um; a lista de lojas da empresa diz o que dá para somar.
      const [us, equipe, daEmpresa] = await Promise.all([
        Bora.api('/api/usuarios'),
        Bora.api('/api/rede/equipe').catch(() => []),
        Bora.api('/api/rede/lojas-da-empresa').catch(() => [])
      ]);
      lojasEmpresa = Array.isArray(daEmpresa) ? daEmpresa : [];
      const porId = {};
      (Array.isArray(equipe) ? equipe : []).forEach(e => porId[e.id] = e);
      const aviso = document.getElementById('avisoRede');
      if (aviso) aviso.style.display = lojasEmpresa.length > 1 ? 'block' : 'none';

      tb.innerHTML = us.map(u => {
        const badge = u.ativo ? '<span class="badge b-entregue">Ativo</span>' : '<span class="badge b-cancelado">Inativo</span>';
        const toggle = `<button class="btn ghost" style="background:#e5e7eb;color:#111;padding:4px 8px;margin-left:6px" onclick="__ativo(${u.id},${!u.ativo})">${u.ativo ? 'Desativar' : 'Ativar'}</button>`;
        const comLojas = Object.assign({}, u, porId[u.id] || {});
        return `<tr><td>${u.nome || '—'}</td><td>${u.email}</td><td>${PAPEL[u.papel] || u.papel}</td>`
          + `<td>${celulaLojas(comLojas)}</td><td>${badge}${toggle}</td></tr>`;
      }).join('') || '<tr><td colspan="5" style="color:#94a3b8">Nenhum usuário.</td></tr>';
    } catch (e) {
      const m = e.message.includes('403') || /perfil|restrita/i.test(e.message) ? 'Apenas administradores da loja acessam esta tela.' : e.message;
      tb.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${m}</td></tr>`;
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
