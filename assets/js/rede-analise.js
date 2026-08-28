// Rede & Análise — consome /api/rede/balancete e /api/analise/* (canais, horário, tempos).
(function () {
  if (!Bora.requireAuth()) return;
  const $ = id => document.getElementById(id);
  const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const carregado = {};
  let atual = 'faturamento';

  function ini() { return $('dtIni').value; }
  function fim() { return $('dtFim').value; }

  const CANAL_COR = { 'iFood': '#EA1D2C', '99Food': '#d97706', 'Rappi': '#FF441F', 'Uber Eats': '#06C167',
    'Goomer': '#6d28d9', 'aiqfome': '#e11d48', 'WhatsApp': '#25D366', 'Instagram': '#C13584',
    'Telefone': '#3b82f6', 'Cardápio próprio': '#7c3aed', 'Balcão': '#8b5cf6', 'Delivery': '#7c3aed', 'Não informado': '#94a3b8' };
  const cor = c => CANAL_COR[c] || '#64748b';
  const STLABEL = { RECEBIDO: 'Recebido', CONFIRMADO: 'Confirmado', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto', SAIU_PARA_ENTREGA: 'Saiu para entrega' };
  const STCOR = { RECEBIDO: '#3b82f6', CONFIRMADO: '#0ea5e9', EM_PREPARO: '#f59e0b', PRONTO: '#8b5cf6', SAIU_PARA_ENTREGA: '#22c55e' };

  // ---------------- Faturamento da rede ----------------
  async function carregarFaturamento() {
    const corpo = $('balCorpo'); corpo.innerHTML = '<tr><td colspan="5" class="empty">Carregando…</td></tr>';
    try {
      const d = await Bora.balancete(ini(), fim());
      const lojas = d.lojas || [], t = d.total || {};
      $('kFat').textContent = money(t.faturamento);
      $('kPed').textContent = t.pedidos ?? 0;
      $('kTicket').textContent = money(t.ticketMedio);
      $('kCanc').textContent = t.cancelados ?? 0;
      const ordenadas = [...lojas].sort((a, b) => Number(b.faturamento) - Number(a.faturamento));
      corpo.innerHTML = ordenadas.map(l => {
        const rep = Number(l.representatividade || 0);
        const inativa = l.ativa === false ? ' <span style="color:var(--muted);font-size:12px">(inativa)</span>' : '';
        const zero = Number(l.faturamento) === 0 ? ' <span class="badge b-cancelado">sem vendas</span>' : '';
        return `<tr><td>${esc(l.loja)}${inativa}${zero}</td><td style="text-align:right">${l.pedidos}</td>
          <td style="text-align:right">${money(l.ticketMedio)}</td><td style="text-align:right"><b>${money(l.faturamento)}</b></td>
          <td><div class="rep"><i style="width:${Math.min(100, rep)}%"></i><span>${rep.toFixed(2)}%</span></div></td></tr>`;
      }).join('') || '<tr><td colspan="5" class="empty">Sem lojas na rede</td></tr>';
      $('balTotal').innerHTML = `<tr style="border-top:2px solid var(--primary);font-weight:800">
        <td>TOTAL DA REDE</td><td style="text-align:right">${t.pedidos ?? 0}</td><td style="text-align:right">${money(t.ticketMedio)}</td>
        <td style="text-align:right">${money(t.faturamento)}</td><td>100%</td></tr>`;
      // barras
      const max = Math.max(1, ...ordenadas.map(l => Number(l.faturamento)));
      $('balBars').innerHTML = ordenadas.map(l => {
        const h = Math.round(Number(l.faturamento) / max * 100);
        return `<div class="bar"><div class="fill" style="height:${h}%"><b>${money(l.faturamento)}</b></div><div class="lbl">${esc(l.loja)}</div></div>`;
      }).join('') || '<div class="empty">Sem dados</div>';
    } catch (e) {
      corpo.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--danger)">${esc(e.message || 'Erro ao carregar')}</td></tr>`;
    }
  }

  // ---------------- Canais & produtos ----------------
  async function carregarCanais() {
    $('canalLista').innerHTML = '<div class="empty">Carregando…</div>';
    try {
      const d = await Bora.analiseCanais(ini(), fim());
      const canais = d.canais || [];
      $('canalTotal').textContent = 'Total no período: ' + money(d.faturamentoTotal);
      $('canalLista').innerHTML = canais.map(c =>
        `<div class="channel" style="background:${cor(c.canal)}"><div class="pct">${Number(c.percentual).toFixed(0)}%</div>
         <div class="nm">${esc(c.canal)}${c.marketplace ? ` <span style="opacity:.85;font-size:12px">· taxa ${Number(c.taxaComissao).toFixed(0)}%</span>` : ''}</div>
         <div class="vl">${money(c.faturamento)}</div></div>`).join('') || '<div class="empty">Sem vendas no período</div>';
      $('canalRank').innerHTML = canais.map((c, i) =>
        `<div class="rankrow"><div class="pos ${i === 0 ? 'gold' : ''}">${i + 1}</div><div class="nm">${esc(c.canal)}</div><div class="vv">${Number(c.percentual).toFixed(1)}%</div></div>`).join('') || '<div class="empty">—</div>';
      // comparador
      const comissao = Number(d.comissaoTotal || 0), total = Number(d.faturamentoTotal || 0);
      const pct = total > 0 ? (comissao / total * 100) : 0;
      $('cmpComissao').textContent = '− ' + money(comissao);
      $('cmpLiquido').textContent = money(d.faturamentoLiquido);
      $('cmpPct').textContent = pct.toFixed(1) + '%';
      $('cmpNota').innerHTML = comissao > 0
        ? `Migrando parte desses pedidos para o WhatsApp/cardápio próprio do BoraHapp, você deixa de pagar boa parte de <b>${money(comissao)}</b> em comissão neste período.`
        : 'Nenhuma comissão de marketplace registrada no período — seus pedidos já vêm por canais próprios. 👏';
      $('prodMais').innerHTML = (d.produtosMais || []).map((p, i) =>
        `<div class="rankrow"><div class="pos ${i === 0 ? 'gold' : ''}">${i + 1}</div><div class="nm">${esc(p.produto)}</div><div class="vv">${p.quantidade} un</div></div>`).join('') || '<div class="empty">Sem itens registrados</div>';
      $('prodMenos').innerHTML = (d.produtosMenos || []).map((p, i) =>
        `<div class="rankrow"><div class="pos">${i + 1}</div><div class="nm">${esc(p.produto)}</div><div class="vv">${p.quantidade} un</div></div>`).join('') || '<div class="empty">Sem itens registrados</div>';
    } catch (e) {
      $('canalLista').innerHTML = `<div class="empty" style="color:var(--danger)">${esc(e.message || 'Erro')}</div>`;
    }
  }

  // ---------------- Horário ----------------
  function heat(el, faixas, palette) {
    const vals = {}; let max = 1;
    (faixas || []).forEach(f => { vals[f.hora] = Number(f.pedidos); if (f.pedidos > max) max = Number(f.pedidos); });
    // Faixa padrão 8h-23h, estendida quando há pedido fora dela (madrugada não pode sumir do gráfico).
    let hIni = 8, hFim = 23;
    Object.keys(vals).forEach(k => { const h = Number(k); if (!vals[k]) return; if (h < hIni) hIni = h; if (h > hFim) hFim = h; });
    const horas = []; for (let h = hIni; h <= hFim; h++) horas.push(h);
    let html = '<div class="hh"></div>' + horas.map(h => `<div class="hh">${h}h</div>`).join('');
    html += '<div class="day">Pedidos</div>';
    horas.forEach(h => {
      const v = (vals[h] || 0) / max;
      const c = palette[Math.min(palette.length - 1, Math.round(v * (palette.length - 1)))];
      const dark = v > 0.55;
      html += `<div class="cell" style="background:${c};color:${dark ? '#fff' : '#334155'}">${vals[h] ? vals[h] : ''}</div>`;
    });
    el.innerHTML = html;
    el.style.gridTemplateColumns = `52px repeat(${horas.length}, 1fr)`;
  }
  async function carregarHorario() {
    $('heatUteis').innerHTML = '<div class="empty">Carregando…</div>';
    try {
      const d = await Bora.analiseHorario(ini(), fim());
      heat($('heatUteis'), d.diasUteis, ['#f5f3ff', '#ede9fe', '#c4b5fd', '#a78bfa', '#7c3aed', '#5b21b6']);
      heat($('heatFds'), d.fimSemana, ['#f0fdf4', '#dcfce7', '#86efac', '#4ade80', '#22c55e', '#15803d']);
      const p = d.pico || {};
      const hu = p.horaPicoUteis, hf = p.horaPicoFimSemana;
      $('picoNota').innerHTML = `📌 Pico nos dias úteis por volta das <b>${hu}h</b> e no fim de semana das <b>${hf}h</b>. Reforce entregador e dispare promoção pouco antes do pico.`;
    } catch (e) {
      $('heatUteis').innerHTML = `<div class="empty" style="color:var(--danger)">${esc(e.message || 'Erro')}</div>`;
    }
  }

  // ---------------- Tempos & cancelamentos ----------------
  async function carregarTempos() {
    $('sflow').innerHTML = '<div class="empty">Carregando…</div>';
    try {
      const d = await Bora.analiseTempos(ini(), fim());
      const tempos = d.tempos || [];
      const max = Math.max(1, ...tempos.map(t => Number(t.minutosMedio)));
      let gargalo = null;
      $('sflow').innerHTML = tempos.map(t => {
        const min = Number(t.minutosMedio);
        if (!gargalo || min > Number(gargalo.minutosMedio)) gargalo = t;
        const w = Math.round(min / max * 100);
        return `<div class="st"><div class="nm">${STLABEL[t.status] || t.status}</div>
          <div class="track"><i style="width:${w}%;background:${STCOR[t.status] || '#7c3aed'}">${min > 0 ? min.toFixed(1) + ' min' : ''}</i></div>
          <div class="tm">${min.toFixed(1)} min</div></div>`;
      }).join('') || '<div class="empty">Sem histórico de status no período</div>';
      if (gargalo && Number(gargalo.minutosMedio) > 0) {
        $('gargalo').hidden = false;
        $('gargalo').innerHTML = `⚠ Maior tempo em <b>${STLABEL[gargalo.status] || gargalo.status}</b> (${Number(gargalo.minutosMedio).toFixed(1)} min). O alerta de atraso destaca esses pedidos em vermelho no quadro em tempo real.`;
      } else { $('gargalo').hidden = true; }

      const c = d.cancelamentos || {};
      $('cancResumo').textContent = `Total no período: ${c.total || 0} cancelamentos (${Number(c.percentual || 0).toFixed(1)}% dos pedidos)`;
      const motivos = c.porMotivo || [];
      const maxM = Math.max(1, ...motivos.map(m => Number(m.qtd)));
      $('cancMotivos').innerHTML = motivos.map((m, i) =>
        `<div class="rankrow"><div class="pos ${i === 0 ? 'gold' : ''}">${i + 1}</div><div class="nm">${esc(m.motivo)}</div><div class="vv">${m.qtd}</div></div>`).join('') || '<div class="empty">Nenhum cancelamento 🎉</div>';
      $('cancLojas').innerHTML = (c.porLoja || []).map(l => {
        const p = Number(l.percentual);
        const cls = p >= 12 ? 'b-cancelado' : p >= 6 ? 'b-preparo' : 'b-entregue';
        return `<tr><td>${esc(l.loja)}</td><td style="text-align:right">${l.cancelados}</td><td style="text-align:right"><span class="badge ${cls}">${p.toFixed(1)}%</span></td></tr>`;
      }).join('') || '<tr><td colspan="3" class="empty">—</td></tr>';
    } catch (e) {
      $('sflow').innerHTML = `<div class="empty" style="color:var(--danger)">${esc(e.message || 'Erro')}</div>`;
    }
  }

  const LOADERS = { faturamento: carregarFaturamento, canais: carregarCanais, horario: carregarHorario, tempos: carregarTempos };

  function mostrar(v, forcar) {
    atual = v;
    document.querySelectorAll('.subnav .chip').forEach(c => c.classList.toggle('active', c.dataset.v === v));
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'v-' + v));
    if (forcar || !carregado[v]) { carregado[v] = true; LOADERS[v](); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const hoje = new Date();
    $('dtIni').value = fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    $('dtFim').value = fmt(hoje);
    document.querySelectorAll('.subnav .chip').forEach(c => c.addEventListener('click', () => mostrar(c.dataset.v)));
    $('btnBuscar').addEventListener('click', () => { Object.keys(carregado).forEach(k => delete carregado[k]); mostrar(atual, true); });
    mostrar('faturamento');
  });
})();
