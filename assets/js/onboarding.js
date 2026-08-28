// Assistente "Comece por aqui" — mostra a prontidão da loja e conduz o lojista.
// Some sozinho quando os passos obrigatórios estão concluídos (ou se o lojista dispensar).
(function () {
  if (typeof Bora === 'undefined' || !Bora.token()) return;
  const mount = document.getElementById('onboardingMount');
  if (!mount) return;

  const CSS = `
  .ob-card{background:linear-gradient(135deg,#faf5ff,#eef2ff);border:1px solid #ddd6fe;border-radius:16px;padding:18px 20px;margin-bottom:16px;position:relative}
  .ob-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .ob-head h2{margin:0;font-size:18px;color:#5b21b6}
  .ob-x{position:absolute;top:12px;right:14px;border:0;background:transparent;color:#a78bfa;font-size:18px;cursor:pointer;line-height:1}
  .ob-bar{height:10px;background:#e9d5ff;border-radius:999px;overflow:hidden;margin:12px 0 4px}
  .ob-bar i{display:block;height:100%;background:linear-gradient(90deg,#7c3aed,#22c55e);transition:width .5s}
  .ob-pct{font-size:13px;color:#6b21a8;font-weight:700}
  .ob-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:14px}
  .ob-step{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #eef2f7;border-radius:12px;padding:10px 12px;text-decoration:none;color:inherit;transition:box-shadow .12s,transform .08s}
  .ob-step:hover{box-shadow:0 6px 16px rgba(124,58,237,.14);transform:translateY(-1px)}
  .ob-step.done{opacity:.62}
  .ob-mark{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:800;flex:0 0 26px;font-size:14px}
  .ob-mark.ok{background:#dcfce7;color:#166534}
  .ob-mark.no{background:#ede9fe;color:#6d28d9}
  .ob-step .t{font-weight:700;font-size:14px}
  .ob-step .d{font-size:12px;color:#64748b}
  .ob-opt{font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.03em}
  `;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);

  async function render() {
    if (localStorage.getItem('boraOnboardingHidden') === '1') return;
    let d;
    try { d = await Bora.onboarding(); } catch (e) { return; }
    if (!d || !Array.isArray(d.passos)) return;
    // Concluiu tudo que é obrigatório → não polui o painel.
    if (d.operavel) { localStorage.setItem('boraOnboardingHidden', '1'); return; }

    const passos = d.passos.map(p => {
      const cls = p.concluido ? 'done' : '';
      const mk = p.concluido ? '<span class="ob-mark ok">✓</span>' : '<span class="ob-mark no">' + (p.obrigatorio ? '!' : '+') + '</span>';
      const opt = p.obrigatorio ? '' : ' <span class="ob-opt">opcional</span>';
      const tag = p.concluido ? 'div' : 'a';
      const href = p.concluido ? '' : ` href="${p.link}"`;
      return `<${tag} class="ob-step ${cls}"${href}>${mk}<div><div class="t">${p.titulo}${opt}</div><div class="d">${p.descricao}</div></div></${tag}>`;
    }).join('');

    mount.innerHTML = `<div class="ob-card">
      <button class="ob-x" title="Dispensar" onclick="localStorage.setItem('boraOnboardingHidden','1');this.closest('.ob-card').remove()">✕</button>
      <div class="ob-head"><h2>🚀 Comece por aqui</h2><span class="ob-pct">${d.prontidao}% pronta para operar</span></div>
      <div class="ob-bar"><i style="width:${d.prontidao}%"></i></div>
      <div class="ob-steps">${passos}</div>
    </div>`;
  }

  document.addEventListener('DOMContentLoaded', render);
})();
