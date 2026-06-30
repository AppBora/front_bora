// Ajustes da operação — taxas de entrega, formas de pagamento, horário e motivos de cancelamento.
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const chk = b => `<span style="color:${b ? '#059669' : '#cbd5e1'};font-weight:800">${b ? '✓' : '—'}</span>`;
  const del = (fn, id) => `<button onclick="${fn}(${id})" style="border:0;background:#fef2f2;color:#dc2626;border-radius:8px;padding:5px 9px;cursor:pointer">✕</button>`;

  // ---- Taxas ----
  async function loadTaxas() {
    const t = await Bora.taxas();
    $('taxasBody').innerHTML = t.length ? t.map(x =>
      `<tr><td><b>${esc(x.bairro)}</b></td><td>${money(x.taxa)}</td><td>${x.tempoMin ?? '—'}</td>
        <td>${chk(x.ativo)}</td><td style="text-align:right">${del('__delTaxa', x.id)}</td></tr>`).join('')
      : '<tr><td colspan="5" style="color:#94a3b8">Nenhuma taxa. Adicione os bairros que você atende.</td></tr>';
  }
  window.__delTaxa = async id => { if (confirm('Remover taxa?')) { await Bora.excluirTaxa(id); loadTaxas(); } };
  $('addTaxa').addEventListener('click', async () => {
    const bairro = $('tBairro').value.trim(); if (!bairro) return;
    await Bora.salvarTaxa({ bairro, taxa: Number($('tTaxa').value || 0), tempoMin: $('tTempo').value ? Number($('tTempo').value) : null, ativo: true });
    $('tBairro').value = ''; $('tTaxa').value = ''; $('tTempo').value = ''; loadTaxas();
  });

  // ---- Formas de pagamento ----
  async function loadFormas() {
    const f = await Bora.formasPagamento();
    $('formasBody').innerHTML = f.map(x =>
      `<tr><td><b>${esc(x.descricao)}</b></td><td>${chk(x.comTroco)}</td><td>${chk(x.online)}</td>
        <td><label class="switch ${x.ativo ? 'on' : ''}" style="display:inline-block" onclick="__toggleForma(${x.id},${!x.ativo})"></label></td>
        <td style="text-align:right">${del('__delForma', x.id)}</td></tr>`).join('');
  }
  window.__toggleForma = async (id, ativo) => { const f = (await Bora.formasPagamento()).find(x => x.id === id); if (!f) return;
    await Bora.salvarForma({ id, descricao: f.descricao, comTroco: f.comTroco, online: f.online, ativo, ordem: f.ordem }); loadFormas(); };
  window.__delForma = async id => { if (confirm('Remover forma de pagamento?')) { await Bora.excluirForma(id); loadFormas(); } };
  $('addForma').addEventListener('click', async () => {
    const descricao = $('fDesc').value.trim(); if (!descricao) return;
    await Bora.salvarForma({ descricao, comTroco: $('fTroco').checked, online: $('fOnline').checked, ativo: true });
    $('fDesc').value = ''; $('fTroco').checked = false; $('fOnline').checked = false; loadFormas();
  });

  // ---- Horário ----
  let horarios = [];
  async function loadHorario() {
    horarios = await Bora.horarios();
    $('horarioBody').innerHTML = horarios.map(h =>
      `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9">
        <span style="width:90px;font-weight:700">${DIAS[h.dia]}</span>
        <label class="switch ${h.aberto ? 'on' : ''}" onclick="__togDia(${h.dia})"></label>
        <input type="time" value="${h.abre || '18:00'}" onchange="__setH(${h.dia},'abre',this.value)" style="padding:7px;border:1px solid #e5e7eb;border-radius:8px">
        <span>até</span>
        <input type="time" value="${h.fecha || '23:00'}" onchange="__setH(${h.dia},'fecha',this.value)" style="padding:7px;border:1px solid #e5e7eb;border-radius:8px">
      </div>`).join('');
  }
  window.__togDia = dia => { const h = horarios.find(x => x.dia === dia); h.aberto = !h.aberto; loadRenderHorarioToggle(dia, h.aberto); };
  function loadRenderHorarioToggle(dia, on) { const rows = $('horarioBody').children; const r = [...rows].find(x => x.querySelector('span').textContent === DIAS[dia]); if (r) r.querySelector('.switch').classList.toggle('on', on); }
  window.__setH = (dia, campo, v) => { const h = horarios.find(x => x.dia === dia); h[campo] = v; };
  $('salvarHorario').addEventListener('click', async () => { await Bora.salvarHorarios(horarios); $('hMsg').textContent = '✓ Salvo'; setTimeout(() => $('hMsg').textContent = '', 1500); });

  // ---- Motivos ----
  async function loadMotivos() {
    const m = await Bora.motivos();
    $('motivosBody').innerHTML = m.map(x =>
      `<tr><td><b>${esc(x.descricao)}</b></td><td>${chk(x.ativo)}</td><td style="text-align:right">${del('__delMotivo', x.id)}</td></tr>`).join('');
  }
  window.__delMotivo = async id => { if (confirm('Remover motivo?')) { await Bora.excluirMotivo(id); loadMotivos(); } };
  $('addMotivo').addEventListener('click', async () => { const d = $('mDesc').value.trim(); if (!d) return;
    await Bora.salvarMotivo({ descricao: d, ativo: true }); $('mDesc').value = ''; loadMotivos(); });

  // ---- Tabs ----
  $('tabs').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return;
    document.querySelectorAll('#tabs .chip').forEach(x => x.classList.remove('active')); b.classList.add('active');
    document.querySelectorAll('.sec').forEach(s => s.style.display = s.dataset.sec === b.dataset.t ? 'block' : 'none');
  });

  document.addEventListener('DOMContentLoaded', () => {
    loadTaxas().catch(e => $('taxasBody').innerHTML = `<tr><td colspan="5" style="color:var(--danger)">${e.message}</td></tr>`);
    loadFormas(); loadHorario(); loadMotivos();
  });
})();
