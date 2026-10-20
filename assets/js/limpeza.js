/**
 * Limpar a movimentação de teste da loja — só para o administrador da plataforma.
 *
 * Por que existe: quem vende o sistema testa dentro da conta do cliente, e o lixo fica no Relatório
 * da loja para sempre, misturado com a venda de verdade. A alternativa era `delete` na mão por ssh,
 * na produção de um cliente pagante.
 *
 * Três travas, e nenhuma é decoração:
 *   1. a seção só aparece para ADMINISTRADOR_BORA (e a API confere o papel de novo);
 *   2. o botão só liga quando o nome digitado bate com o da loja;
 *   3. antes de apagar, a tela mostra QUANTO vai sair e QUANTO vai ficar.
 */
(function () {
  if (typeof Bora === 'undefined') return;
  const u = Bora.user();
  if (!u || u.papel !== 'ADMINISTRADOR_BORA') return;   // o lojista não tem este gatilho

  const $ = id => document.getElementById(id);
  const secao = $('zonaDePerigo');
  if (!secao) return;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let loja = null;   // o nome que a API disse ser o desta loja

  function linha(rotulo, n, cor) {
    return '<span style="display:inline-block;margin-right:14px"><b style="color:' + cor + '">'
      + n + '</b> ' + rotulo + '</span>';
  }

  async function carregar() {
    secao.hidden = false;
    try {
      // Sem lojaId na URL: o endpoint usa a loja em que o admin está. É a mesma loja do relatório
      // que ele está olhando — justamente a que tem o lixo na tela.
      const d = await Bora.api('/admin-bora/lojas/' + (u.lojaId || 0) + '/dados-de-teste');
      loja = d.loja || '';
      $('lpNomeEsperado').textContent = loja;
      $('lpPrevia').innerHTML =
        '<div style="margin-bottom:6px"><b>Vai apagar:</b> '
        + linha('pedidos', d.pedidos, '#991b1b')
        + linha('itens', d.itens, '#991b1b')
        + linha('linhas de histórico', d.historico, '#991b1b')
        + linha('acertos de motoboy', d.acertos, '#991b1b') + '</div>'
        + '<div><b>Vai ficar:</b> '
        + linha('produtos no cardápio', d.produtosQueFicam, '#166534')
        + linha('clientes', d.clientes, '#166534')
        + ' <span style="color:#64748b">· e integrações, PIX, assinatura e usuários</span></div>'
        + (d.clientesComCashback > 0
          ? '<div style="margin-top:8px;color:#92400e"><b>Atenção:</b> ' + d.clientesComCashback
            + ' cliente(s) têm cashback a receber. Deixe a caixa abaixo desmarcada para não tirar isso deles.</div>'
          : '');
      $('lpForm').hidden = (d.pedidos || 0) + (d.historico || 0) + (d.acertos || 0) === 0;
      if ($('lpForm').hidden) {
        $('lpPrevia').innerHTML += '<div style="margin-top:8px;color:#166534">'
          + 'Não há movimentação nenhuma para apagar nesta loja.</div>';
      }
    } catch (e) {
      // 403 aqui quer dizer que o papel mudou entre carregar a tela e chamar a API. Some com a seção.
      if (/403|permitida|perfil/i.test(e.message || '')) { secao.hidden = true; return; }
      $('lpPrevia').innerHTML = '<span style="color:#dc2626">Não consegui ler o que existe: '
        + esc(e.message) + '</span>';
    }
  }

  // O botão só liga com o nome certo digitado. Nada de habilitar e deixar a API recusar depois.
  $('lpConfirma').addEventListener('input', () => {
    $('lpLimpar').disabled =
      $('lpConfirma').value.trim().toLowerCase() !== (loja || '\u0000').trim().toLowerCase();
  });

  $('lpLimpar').addEventListener('click', async () => {
    const zerar = $('lpZerar').checked;
    const aviso = 'Apagar a movimentação de "' + loja + '".\n\n'
      + (zerar ? 'O cashback dos clientes TAMBÉM será zerado.\n\n' : '')
      + 'Isto não tem como desfazer. Continuar?';
    if (!confirm(aviso)) return;

    const btn = $('lpLimpar'), msg = $('lpMsg');
    btn.disabled = true; btn.textContent = 'Apagando…';
    msg.style.color = '#475569'; msg.textContent = '';
    try {
      const r = await Bora.api('/admin-bora/lojas/' + (u.lojaId || 0) + '/limpar-dados-de-teste', {
        method: 'POST',
        body: JSON.stringify({ confirmacao: $('lpConfirma').value.trim(), zerarClientes: zerar })
      });
      msg.style.color = '#166534';
      msg.textContent = 'Pronto: ' + r.pedidos + ' pedidos, ' + r.itens + ' itens e '
        + r.historico + ' linhas de histórico apagados. '
        + r.produtosQueFicaram + ' produtos continuam no cardápio.';
      $('lpConfirma').value = '';
      $('lpZerar').checked = false;
      await carregar();
      // O relatório na tela ainda mostra os números velhos: recarrega para não mentir.
      setTimeout(() => location.reload(), 2500);
    } catch (e) {
      msg.style.color = '#dc2626';
      msg.textContent = e.message || 'Não consegui apagar.';
    } finally {
      btn.textContent = 'Apagar a movimentação';
      btn.disabled = $('lpConfirma').value.trim().toLowerCase() !== (loja || '\u0000').trim().toLowerCase();
    }
  });

  document.addEventListener('DOMContentLoaded', carregar);
  if (document.readyState !== 'loading') carregar();
})();
