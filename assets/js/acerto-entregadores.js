// Acerto de Entregadores — soma taxas/valores das entregas realizadas por período e registra o pagamento.
(function () {
  if (!Bora.requireAuth()) return;
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dataBR = iso => { if (!iso) return '—'; const s = String(iso).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : iso; };
  const dataHoraBR = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const el = id => document.getElementById(id);
  let linhas = [];            // prévia atual
  let periodo = { inicio: '', fim: '' }; // período efetivamente buscado
  let selecionado = null;     // linha aberta no modal

  // ---- Carrega entregadores no filtro ----
  async function carregarEntregadores() {
    try {
      const ents = await Bora.entregadores();
      el('filtroEntregador').innerHTML = '<option value="">Todos</option>' +
        (ents || []).map(e => `<option>${esc(e.nome)}</option>`).join('');
    } catch (e) { /* segue sem filtro */ }
  }

  // ---- Prévia ----
  async function buscar() {
    const inicio = el('inicio').value, fim = el('fim').value;
    if (!inicio || !fim) { alert('Escolha as datas De e Até.'); return; }
    periodo = { inicio, fim };
    el('corpo').innerHTML = '<tr><td colspan="7" style="color:var(--muted)">Carregando...</td></tr>';
    try {
      linhas = await Bora.acertoPrevia(inicio, fim) || [];
      renderPrevia();
    } catch (e) {
      el('corpo').innerHTML = `<tr><td colspan="7" style="color:var(--danger)">${esc(e.message)}</td></tr>`;
    }
  }

  function renderPrevia() {
    const filtro = el('filtroEntregador').value;
    const lista = filtro ? linhas.filter(l => l.entregador === filtro) : linhas;
    if (!lista.length) {
      el('corpo').innerHTML = '<tr><td colspan="7" style="color:var(--muted)">Nenhuma entrega em aberto neste período.</td></tr>';
      el('rodape').innerHTML = '';
      return;
    }
    el('corpo').innerHTML = lista.map((l, i) => `<tr>
      <td><b>${esc(l.entregador)}</b></td>
      <td style="text-align:right">${l.qtdeEntregas}</td>
      <td style="text-align:right;color:var(--primary);font-weight:700">${money(l.valorTaxas)}</td>
      <td style="text-align:right">${money(l.valorDinheiro)}</td>
      <td style="text-align:right">${money(l.valorOutras)}</td>
      <td style="text-align:right">${money(l.valorTotal)}</td>
      <td style="text-align:right"><button class="btn" style="padding:7px 12px" data-i="${i}">💵 Fazer acerto</button></td>
    </tr>`).join('');

    const tot = lista.reduce((a, l) => ({
      qtd: a.qtd + Number(l.qtdeEntregas || 0),
      taxas: a.taxas + Number(l.valorTaxas || 0),
      din: a.din + Number(l.valorDinheiro || 0),
      out: a.out + Number(l.valorOutras || 0),
      total: a.total + Number(l.valorTotal || 0),
    }), { qtd: 0, taxas: 0, din: 0, out: 0, total: 0 });
    el('rodape').innerHTML = `<tr style="font-weight:700;border-top:2px solid #e2e8f0">
      <td>Total</td><td style="text-align:right">${tot.qtd}</td>
      <td style="text-align:right;color:var(--primary)">${money(tot.taxas)}</td>
      <td style="text-align:right">${money(tot.din)}</td>
      <td style="text-align:right">${money(tot.out)}</td>
      <td style="text-align:right">${money(tot.total)}</td><td></td></tr>`;

    // liga os botões (usa a lista filtrada corrente)
    el('corpo').querySelectorAll('button[data-i]').forEach(b =>
      b.addEventListener('click', () => abrirModal(lista[Number(b.dataset.i)])));
  }

  // ---- Modal fazer acerto ----
  function abrirModal(l) {
    selecionado = l;
    el('mResumo').textContent = `${l.entregador} · ${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)} · ${l.qtdeEntregas} entrega(s)`;
    el('mAPagar').value = money(l.valorTaxas);
    el('mPago').value = Number(l.valorTaxas || 0).toFixed(2);
    el('mDesc').value = '0';
    el('mObs').value = '';
    el('mErro').textContent = '';
    calcularSaldo();
    el('modal').style.display = 'flex';
  }
  function fecharModal() { el('modal').style.display = 'none'; selecionado = null; }
  function calcularSaldo() {
    if (!selecionado) return;
    const aPagar = Number(selecionado.valorTaxas || 0);
    const pago = Number(el('mPago').value || 0);
    const desc = Number(el('mDesc').value || 0);
    el('mSaldo').textContent = money(aPagar - pago - desc);
  }

  async function confirmar() {
    if (!selecionado) return;
    el('mErro').textContent = '';
    el('mConfirmar').disabled = true;
    try {
      await Bora.fazerAcerto({
        entregador: selecionado.entregador,
        inicio: periodo.inicio,
        fim: periodo.fim,
        valorPago: Number(el('mPago').value || 0),
        descontos: Number(el('mDesc').value || 0),
        observacao: el('mObs').value || null,
      });
      fecharModal();
      if (typeof boraToast === 'function') boraToast('Acerto de <b>' + esc(selecionado.entregador) + '</b> registrado ✓', 'ok');
      await buscar();
      await carregarHistorico();
    } catch (e) {
      el('mErro').textContent = e.message;
    } finally {
      el('mConfirmar').disabled = false;
    }
  }

  // ---- Histórico ----
  async function carregarHistorico() {
    try {
      const hs = await Bora.acertoHistorico() || [];
      if (!hs.length) { el('historico').innerHTML = '<tr><td colspan="8" style="color:var(--muted)">Sem acertos ainda.</td></tr>'; return; }
      el('historico').innerHTML = hs.map(a => `<tr>
        <td>${dataHoraBR(a.criadoEm)}</td>
        <td><b>${esc(a.entregador)}</b></td>
        <td>${dataBR(a.periodoInicio)} a ${dataBR(a.periodoFim)}</td>
        <td style="text-align:right">${a.qtdeEntregas}</td>
        <td style="text-align:right">${money(a.valorAPagar)}</td>
        <td style="text-align:right">${money(a.valorPago)}</td>
        <td style="text-align:right">${money(a.descontos)}</td>
        <td style="text-align:right;font-weight:700;color:${Number(a.saldo) > 0 ? 'var(--danger)' : 'var(--ok, #16a34a)'}">${money(a.saldo)}</td>
      </tr>`).join('');
    } catch (e) { el('historico').innerHTML = `<tr><td colspan="8" style="color:var(--danger)">${esc(e.message)}</td></tr>`; }
  }

  // ---- Impressão ----
  function imprimir() {
    const filtro = el('filtroEntregador').value;
    const lista = filtro ? linhas.filter(l => l.entregador === filtro) : linhas;
    if (!lista.length) { alert('Nada para imprimir. Busque um período com entregas.'); return; }
    const loja = (JSON.parse(localStorage.getItem('boraTheme') || '{}').name) || 'BoraHapp';
    const linhasHtml = lista.map(l => `<tr>
      <td>${esc(l.entregador)}</td><td class="r">${l.qtdeEntregas}</td>
      <td class="r">${money(l.valorTaxas)}</td><td class="r">${money(l.valorDinheiro)}</td>
      <td class="r">${money(l.valorOutras)}</td><td class="r">${money(l.valorTotal)}</td></tr>`).join('');
    const w = window.open('', '_print', 'width=800,height=700');
    w.document.write(`<html><head><title>Acerto de entregadores</title><style>
      body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}
      h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#555;font-size:13px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border-bottom:1px solid #ddd;padding:7px 8px;text-align:left}
      th{background:#f3f4f6}.r{text-align:right}</style></head><body>
      <h1>${esc(loja)} — Acerto de Entregadores</h1>
      <p>Período: ${dataBR(periodo.inicio)} a ${dataBR(periodo.fim)} · Emitido em ${new Date().toLocaleString('pt-BR')}</p>
      <table><thead><tr><th>Entregador</th><th class="r">Entregas</th><th class="r">Taxas (a pagar)</th>
      <th class="r">Recebeu dinheiro</th><th class="r">Recebeu outras</th><th class="r">Total entregue</th></tr></thead>
      <tbody>${linhasHtml}</tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  // ---- Eventos ----
  document.addEventListener('DOMContentLoaded', () => {
    el('inicio').value = hoje();
    el('fim').value = hoje();
    carregarEntregadores();
    carregarHistorico();
    el('buscar').addEventListener('click', buscar);
    el('imprimir').addEventListener('click', imprimir);
    el('filtroEntregador').addEventListener('change', renderPrevia);
    el('mPago').addEventListener('input', calcularSaldo);
    el('mDesc').addEventListener('input', calcularSaldo);
    el('mCancelar').addEventListener('click', fecharModal);
    el('mConfirmar').addEventListener('click', confirmar);
    el('modal').addEventListener('click', e => { if (e.target === el('modal')) fecharModal(); });
  });
})();
