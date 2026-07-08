// Gestão de cupons do cardápio digital (card na página de Promoções).
(function () {
  const $ = id => document.getElementById(id);
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

  async function lista() {
    const tb = $('cupLista'); if (!tb) return;
    try {
      const cs = await Bora.api('/api/cupons');
      tb.innerHTML = cs.map(c =>
        `<tr><td><b>${c.codigo}</b></td>
         <td>${c.tipo === 'VALOR' ? money(c.valor) : Number(c.valor) + '%'}</td>
         <td>${c.validade || 'Sem validade'}</td>
         <td style="text-align:right"><button onclick="__delCupom(${c.id})" style="border:0;background:#fef2f2;color:#dc2626;border-radius:8px;padding:5px 9px;cursor:pointer">✕</button></td></tr>`
      ).join('') || '<tr><td colspan="4" style="color:#94a3b8">Nenhum cupom ainda.</td></tr>';
    } catch (e) { tb.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">${e.message}</td></tr>`; }
  }

  window.__delCupom = async id => {
    if (!confirm('Excluir este cupom? Quem tentar usar receberá "cupom inválido".')) return;
    try { await Bora.api('/api/cupons/' + id, { method: 'DELETE' }); lista(); } catch (e) { alert(e.message); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('cupCriar')) return;
    $('cupCriar').onclick = async () => {
      const msg = $('cupMsg');
      try {
        await Bora.api('/api/cupons', { method: 'POST', body: JSON.stringify({
          codigo: $('cupCodigo').value.trim(), tipo: $('cupTipo').value,
          valor: $('cupValor').value, validade: $('cupValidade').value }) });
        msg.textContent = '✅ Criado!'; msg.style.color = '#059669';
        $('cupCodigo').value = ''; $('cupValor').value = ''; $('cupValidade').value = '';
        lista(); setTimeout(() => msg.textContent = '', 3000);
      } catch (e) { msg.textContent = '❌ ' + e.message; msg.style.color = '#dc2626'; }
    };
    lista();
  });
})();
