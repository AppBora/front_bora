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
    // Traz a situacao ATUAL. Sem isto a caixa abriria sempre marcada e salvar religaria o inativo.
    $('ativo').checked = e.ativo !== false;
    $('formTitulo').textContent = 'Editar entregador'; $('cancelar').style.display = 'inline-block'; window.scrollTo(0, 0); };
  window.__del = async id => { if (!confirm('Remover este entregador?')) return;
    try { await Bora.excluirEntregador(id); await carregar(); } catch (e) { alert(e.message); } };

  // `form.reset()` devolve a caixa ao valor do HTML, que e marcado -- entregador novo nasce
  // podendo rodar. Deixo explicito para nao depender desse detalhe.
  function resetForm() { $('id').value = ''; $('form').reset(); $('ativo').checked = true; $('formTitulo').textContent = 'Novo entregador'; $('cancelar').style.display = 'none'; $('msg').textContent = ''; }

  async function carregar() {
    // Antes somava a vida inteira da loja porque o board vinha completo. Agora o intervalo é dito.
    const desde = new Date(Date.now() - 30 * 86400000 - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
    [entregadores, board] = await Promise.all([Bora.entregadores(), Bora.board(null, desde)]);
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('cancelar').addEventListener('click', resetForm);
    $('form').addEventListener('submit', async e => {
      e.preventDefault(); $('msg').textContent = '';
      // `ativo: true` era FIXO aqui, no criar E no editar: mudar so o telefone de um motoboy
      // desligado o religava, e ele reaparecia no seletor de despacho (entregas.js:12 filtra
      // inativo). Mesmo defeito que ja foi pago no produto (item 13.4), em outra tela.
      const body = { nome: $('nome').value.trim(), telefone: $('telefone').value.trim(),
                     veiculo: $('veiculo').value, ativo: $('ativo').checked };
      if (!body.nome) { $('msg').textContent = 'Informe o nome'; return; }
      try {
        const id = $('id').value;
        if (id) await Bora.atualizarEntregador(id, body); else await Bora.criarEntregador(body);
        resetForm(); await carregar();
      } catch (ex) { $('msg').textContent = ex.message; }
    });
    carregar().catch(e => $('lista').innerHTML = `<p style="color:var(--danger)">${e.message}</p>`);
    Bora.repetir(() => carregar().catch(() => {}), 12000);
  });
})();
