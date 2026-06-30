// Entregadores (motoboys) — cadastro + desempenho (entregas/rota/valor) calculado do board().
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ehHoje = iso => { if (!iso) return false; const d = new Date(iso), h = new Date(); return d.toDateString() === h.toDateString(); };
  const $ = id => document.getElementById(id);
  const veicIc = v => ({ Moto: '🏍️', Bike: '🚲', Carro: '🚗', 'A pé': '🚶' }[v] || '🏍️');

  let entregadores = [], board = [];

  function desempenho(nome) {
    const meus = board.filter(p => (p.entregador || '').trim() === nome);
    const entreguesHoje = meus.filter(p => p.status === 'ENTREGUE' && ehHoje(p.atualizadoEm || p.criadoEm));
    const emRota = meus.filter(p => p.status === 'SAIU_PARA_ENTREGA');
    const valor = entreguesHoje.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
    return { entregues: entreguesHoje.length, rota: emRota.length, valor };
  }

  function render() {
    // ordena por entregas de hoje (ranking)
    const lista = [...entregadores].map(e => ({ e, d: desempenho(e.nome) }))
      .sort((a, b) => b.d.entregues - a.d.entregues);
    $('lista').innerHTML = lista.length ? lista.map(({ e, d }, i) =>
      `<div class="moto">
        <div class="av">${veicIc(e.veiculo)}</div>
        <div class="nm"><b>${i === 0 && d.entregues > 0 ? '🏆 ' : ''}${esc(e.nome)}</b>
          <small>${esc(e.telefone || 'sem telefone')} · ${esc(e.veiculo || 'Moto')}</small></div>
        <div style="text-align:center;min-width:70px"><b style="font-size:18px">${d.entregues}</b><br><small style="color:#94a3b8">entregas</small></div>
        <div style="text-align:center;min-width:60px"><b style="font-size:18px;color:#8b5cf6">${d.rota}</b><br><small style="color:#94a3b8">em rota</small></div>
        <div style="text-align:center;min-width:90px"><b>${money(d.valor)}</b><br><small style="color:#94a3b8">hoje</small></div>
        <span class="st ${e.ativo === false ? 'off' : 'on'}">${e.ativo === false ? 'inativo' : 'ativo'}</span>
        <div class="linkbtns"><button onclick="__edit(${e.id})">✏</button><button onclick="__del(${e.id})">🗑</button></div>
      </div>`).join('') : '<p style="color:#94a3b8">Nenhum entregador cadastrado. Use o formulário ao lado.</p>';
  }

  window.__edit = id => { const e = entregadores.find(x => x.id === id); if (!e) return;
    $('id').value = e.id; $('nome').value = e.nome || ''; $('telefone').value = e.telefone || ''; $('veiculo').value = e.veiculo || 'Moto';
    $('formTitulo').textContent = 'Editar entregador'; $('cancelar').style.display = 'inline-block'; window.scrollTo(0, 0); };
  window.__del = async id => { if (!confirm('Remover este entregador?')) return;
    try { await Bora.excluirEntregador(id); await carregar(); } catch (e) { alert(e.message); } };

  function resetForm() { $('id').value = ''; $('form').reset(); $('formTitulo').textContent = 'Novo entregador'; $('cancelar').style.display = 'none'; $('msg').textContent = ''; }

  async function carregar() {
    [entregadores, board] = await Promise.all([Bora.entregadores(), Bora.board()]);
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('cancelar').addEventListener('click', resetForm);
    $('form').addEventListener('submit', async e => {
      e.preventDefault(); $('msg').textContent = '';
      const body = { nome: $('nome').value.trim(), telefone: $('telefone').value.trim(), veiculo: $('veiculo').value, ativo: true };
      if (!body.nome) { $('msg').textContent = 'Informe o nome'; return; }
      try {
        const id = $('id').value;
        if (id) await Bora.atualizarEntregador(id, body); else await Bora.criarEntregador(body);
        resetForm(); await carregar();
      } catch (ex) { $('msg').textContent = ex.message; }
    });
    carregar().catch(e => $('lista').innerHTML = `<p style="color:var(--danger)">${e.message}</p>`);
    setInterval(() => carregar().catch(() => {}), 12000);
  });
})();
