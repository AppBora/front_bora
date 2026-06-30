// Dashboard premium — KPIs, vendas por hora, canais e mais vendidos, derivados do board() (sem custo extra de backend).
(function () {
  if (!Bora.requireAuth()) return;

  const money = v => v == null ? '—' : 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ehHoje = iso => { if (!iso) return false; const d = new Date(iso), h = new Date();
    return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate(); };

  const FAIXA = {
    SAUDAVEL: { cor: '#22c55e', bg: '#dcfce7', txt: '#166534', label: 'Vendas saudáveis' },
    ATENCAO:  { cor: '#f59e0b', bg: '#fef3c7', txt: '#92400e', label: 'Atenção — queda leve' },
    QUEDA:    { cor: '#ef4444', bg: '#fee2e2', txt: '#991b1b', label: 'Queda nas vendas' },
    SEM_DADOS:{ cor: '#94a3b8', bg: '#f1f5f9', txt: '#475569', label: 'Sem dados suficientes' }
  };

  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const isVenda = p => p.status !== 'CANCELADO';

  async function promoRelampago() {
    const agora = new Date(), fim = new Date(agora.getTime() + 3 * 3600 * 1000);
    try {
      await Bora.criarPromocao({ tipo: 'RELAMPAGO', descricao: 'Cupom relâmpago — 15% por 3h',
        codigo: 'BORA15', percentualDesconto: 15, inicio: agora.toISOString(), fim: fim.toISOString(), limiteUsos: 20 });
      await renderTermometro();
      alert('Promoção relâmpago aberta! Código BORA15 (15%, 3h).');
    } catch (e) { alert('Não foi possível abrir a promoção: ' + e.message); }
  }
  window.__promoRelampago = promoRelampago;

  async function renderTermometro() {
    const el = document.getElementById('termometro'); if (!el) return;
    try {
      const t = await Bora.termometro();
      const f = FAIXA[t.faixa] || FAIXA.SEM_DADOS;
      const podePromo = t.faixa === 'ATENCAO' || t.faixa === 'QUEDA';
      el.innerHTML =
        `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
           <span style="width:16px;height:16px;border-radius:50%;background:${f.cor};box-shadow:0 0 0 5px ${f.bg}"></span>
           <span style="font-weight:800;color:${f.txt};font-size:15px">${f.label}</span>
         </div>
         <div style="display:flex;gap:18px;margin:10px 0">
           <div><div style="font-size:12px;color:var(--muted)">Últimas 24h</div><div style="font-size:20px;font-weight:900">${money(t.atual)}</div></div>
           <div><div style="font-size:12px;color:var(--muted)">Média esperada</div><div style="font-size:20px;font-weight:900">${money(t.baseline)}</div></div>
         </div>
         ${t.indice != null ? `<div style="font-size:13px;color:var(--muted)">Índice: <b style="color:${f.txt}">${Math.round(t.indice * 100)}%</b> do esperado</div>` : ''}
         <p style="margin:10px 0 0;color:var(--muted);font-size:13px">${esc(t.recomendacao) || ''}</p>
         ${podePromo ? `<button class="btn" onclick="__promoRelampago()" style="margin-top:12px;width:100%">⚡ Abrir promoção relâmpago</button>` : ''}`;
    } catch (e) { el.innerHTML = `<p style="color:var(--muted)">Termômetro indisponível.</p>`; }
  }

  function canal(p) { const c = boraCanal(p.origem); return { k: c.key, ic: c.ic }; }

  function renderBarras(pedidosHoje) {
    const el = document.getElementById('bars'); if (!el) return;
    const porHora = new Array(24).fill(0);
    pedidosHoje.forEach(p => { if (isVenda(p) && p.valorTotal) porHora[new Date(p.criadoEm).getHours()] += Number(p.valorTotal); });
    // mostra janela operacional 8h–23h pra não poluir
    const horas = []; for (let h = 8; h <= 23; h++) horas.push(h);
    const max = Math.max(1, ...horas.map(h => porHora[h]));
    el.innerHTML = horas.map(h => {
      const v = porHora[h], pct = Math.round((v / max) * 100);
      const peak = v === max && v > 0;
      return `<div class="b ${peak ? 'peak' : ''}" title="${h}h — ${money(v)}">
        <div class="fill" style="height:${v > 0 ? Math.max(pct, 4) : 0}%"></div>
        <div class="cap">${h}</div>
      </div>`;
    }).join('');
  }

  function renderCanais(pedidosHoje) {
    const el = document.getElementById('canais'); if (!el) return;
    const agg = {};
    pedidosHoje.filter(isVenda).forEach(p => { const c = canal(p); agg[c.k] = agg[c.k] || { v: 0, ic: c.ic }; agg[c.k].v += Number(p.valorTotal || 0); });
    const linhas = Object.entries(agg).sort((a, b) => b[1].v - a[1].v);
    const max = Math.max(1, ...linhas.map(l => l[1].v));
    el.innerHTML = linhas.length
      ? linhas.map(([nm, o]) => `<div class="row2">
          <div class="nm">${o.ic} ${nm}</div>
          <div class="track"><div class="barfill" style="width:${Math.round((o.v / max) * 100)}%"></div></div>
          <div class="vl">${money(o.v)}</div></div>`).join('')
      : '<p style="color:var(--muted);font-size:13px">Sem vendas hoje ainda.</p>';
  }

  function renderTop(pedidosHoje) {
    const el = document.getElementById('topprod'); if (!el) return;
    const agg = {};
    pedidosHoje.filter(isVenda).forEach(p => (p.itens || []).forEach(i => {
      agg[i.descricao] = (agg[i.descricao] || 0) + (i.quantidade || 1);
    }));
    const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 6);
    el.innerHTML = top.length
      ? top.map(([nm, q], i) => `<div class="topitem">
          <div class="rk ${i === 0 ? 'gold' : ''}">${i + 1}</div>
          <div class="nm">${esc(nm)}</div>
          <div class="qt">${q} un</div></div>`).join('')
      : '<p style="color:var(--muted);font-size:13px">Sem itens vendidos hoje ainda.</p>';
  }

  async function carregar() {
    renderTermometro();
    try {
      const [board, resumo] = await Promise.all([Bora.board(), Bora.resumo()]);
      const hoje = board.filter(p => ehHoje(p.criadoEm));
      const vendasHoje = hoje.filter(isVenda);
      const fat = vendasHoje.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
      const ticket = vendasHoje.length ? fat / vendasHoje.length : 0;
      const canc = hoje.filter(p => p.status === 'CANCELADO').length;
      const pctCanc = hoje.length ? Math.round((canc / hoje.length) * 100) : 0;

      set('kFat', money(fat));
      set('kPed', vendasHoje.length);
      set('kTicket', money(ticket));
      set('kCanc', canc + (canc ? ` · ${pctCanc}%` : ''));

      const tr = document.getElementById('kFatTrend');
      if (tr) { tr.className = 'trend ' + (vendasHoje.length ? 'up' : 'flat'); tr.textContent = vendasHoje.length ? '● hoje' : '—'; }

      set('opPreparo', resumo.emPreparo);
      set('opAguard', board.filter(p => p.status === 'PRONTO').length);
      set('opSaiu', resumo.saiuParaEntrega);
      set('opHora', resumo.entreguesUltimaHora);

      renderBarras(hoje);
      renderCanais(hoje);
      renderTop(hoje);

      const tbody = document.getElementById('orders');
      if (tbody) {
        tbody.innerHTML = board.slice(0, 12).map(p => {
          const label = Bora.statusLabel(p.status);
          const cls = 'b-' + ({ Recebido: 'recebido', Confirmado: 'recebido', 'Em preparo': 'preparo', Pronto: 'pronto',
            'Saiu para entrega': 'entrega', Entregue: 'entregue', Cancelado: 'cancelado' }[label] || 'recebido');
          return `<tr><td>${esc(p.codigo) || '#' + p.id}</td><td>${esc(p.clienteNome) || '—'}</td>` +
            `<td><span class="badge ${cls}">${label}</span></td>` +
            `<td>${money(p.valorTotal)}</td><td>${canal(p).ic} ${canal(p).k}</td></tr>`;
        }).join('');
      }
    } catch (e) { console.warn('Falha ao carregar dashboard:', e.message); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    carregar();
    setInterval(carregar, 8000); // "tempo real" por polling — barato (FinOps)
  });
})();
