// Tela de promoções: termômetro + criar/listar promoções.
(function () {
  if (!Bora.requireAuth()) return;

  const FAIXA = {
    SAUDAVEL: { cor: '#22c55e', txt: '#166534', label: 'Vendas saudáveis' },
    ATENCAO:  { cor: '#f59e0b', txt: '#92400e', label: 'Atenção — queda leve' },
    QUEDA:    { cor: '#ef4444', txt: '#991b1b', label: 'Queda nas vendas' },
    SEM_DADOS:{ cor: '#94a3b8', txt: '#475569', label: 'Sem dados suficientes' }
  };
  const money = v => v == null ? '—' : 'R$ ' + Number(v).toFixed(2);
  const dt = iso => iso ? new Date(iso).toLocaleString('pt-BR') : '—';

  async function renderTermometro() {
    const el = document.getElementById('termometro'); if (!el) return;
    try {
      const t = await Bora.termometro(); const f = FAIXA[t.faixa] || FAIXA.SEM_DADOS;
      el.innerHTML = `<p style="font-weight:800;color:${f.txt}">● ${f.label}</p>
        <p><b>Últimas 24h:</b> ${money(t.atual)} · <b>Esperado:</b> ${money(t.baseline)}${t.indice != null ? ` (${Math.round(t.indice*100)}%)` : ''}</p>
        <p style="color:var(--muted);font-size:13px">${t.recomendacao || ''}</p>`;
    } catch { el.innerHTML = '<p style="color:var(--muted)">Indisponível.</p>'; }
  }

  async function carregarLista() {
    const tbody = document.getElementById('lista'); if (!tbody) return;
    try {
      const ps = await Bora.promocoes();
      const agora = Date.now();
      tbody.innerHTML = ps.map(p => {
        const vigente = p.ativa && (!p.fim || new Date(p.fim).getTime() > agora);
        const status = vigente ? '<span class="badge b-entregue">Ativa</span>' : '<span class="badge b-cancelado">Encerrada</span>';
        return `<tr><td>${p.codigo || '—'}</td><td>${p.tipo || '—'}</td><td>${p.percentualDesconto != null ? p.percentualDesconto + '%' : '—'}</td>` +
          `<td>${dt(p.fim)}</td><td>${(p.usos || 0)}${p.limiteUsos ? '/' + p.limiteUsos : ''}</td><td>${p.origem || '—'}</td><td>${status}</td></tr>`;
      }).join('') || '<tr><td colspan="7" style="color:var(--muted)">Nenhuma promoção ainda.</td></tr>';
    } catch (e) { tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger)">${e.message}</td></tr>`; }
  }

  document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg'); msg.textContent = '';
    const horas = parseInt(document.getElementById('horas').value || '3', 10);
    const fim = new Date(Date.now() + horas * 3600 * 1000);
    try {
      await Bora.criarPromocao({
        tipo: document.getElementById('tipo').value,
        codigo: document.getElementById('codigo').value.trim() || 'BORA',
        percentualDesconto: Number(document.getElementById('desconto').value || 0),
        descricao: document.getElementById('descricao').value.trim(),
        inicio: new Date().toISOString(), fim: fim.toISOString(), limiteUsos: 20
      });
      document.getElementById('form').reset();
      carregarLista();
    } catch (ex) { msg.textContent = ex.message; }
  });

  document.addEventListener('DOMContentLoaded', () => { renderTermometro(); carregarLista(); });
})();
