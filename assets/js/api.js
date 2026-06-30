// Cliente de API do Bora — auth via JWT (Bearer), multi-tenant pelo token.
// Permite apontar a API por ?api=<url> (uso em link de teste/túnel); fica salvo p/ as próximas telas.
(function () { try { const p = new URLSearchParams(location.search).get('api'); if (p) localStorage.setItem('boraApiUrl', p.replace(/\/+$/, '')); } catch (e) {} })();
const BORA_API = localStorage.getItem('boraApiUrl') || 'https://bora-api.onrender.com';

const Bora = {
  token() { return localStorage.getItem('boraToken'); },
  setSession(resp) {
    localStorage.setItem('boraToken', resp.token);
    localStorage.setItem('boraUser', JSON.stringify({ nome: resp.nome, papel: resp.papel, lojaId: resp.lojaId }));
  },
  user() { try { return JSON.parse(localStorage.getItem('boraUser') || 'null'); } catch { return null; } },
  logout() { localStorage.removeItem('boraToken'); localStorage.removeItem('boraUser'); location.href = 'login.html'; },

  async api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const t = this.token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(BORA_API + path, { ...opts, headers });
    if (res.status === 401) { this.logout(); throw new Error('Sessão expirada'); }
    if (!res.ok) {
      let msg = 'Erro ' + res.status;
      try { const b = await res.json(); msg = b.message || b.error || msg; } catch {}
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  },

  // Atalhos
  login(email, senha) { return this.api('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) }); },
  pedidos() { return this.api('/api/pedidos'); },
  board() { return this.api('/api/pedidos/board'); },
  criarPedido(body) { return this.api('/api/pedidos', { method: 'POST', body: JSON.stringify(body) }); },
  mudarStatus(id, status, motivo) { let u = `/api/pedidos/${id}/status?status=${status}`; if (motivo) u += '&motivo=' + encodeURIComponent(motivo); return this.api(u, { method: 'PATCH' }); },
  definirEntregador(id, nome) { return this.api(`/api/pedidos/${id}/entregador${nome ? '?nome=' + encodeURIComponent(nome) : ''}`, { method: 'PATCH' }); },
  cardapioPublico(lojaId) { return this.api('/public/loja/' + lojaId + '/cardapio'); },
  resumo() { return this.api('/api/dashboard/resumo'); },
  clientes() { return this.api('/api/clientes'); },
  entregadores() { return this.api('/api/entregadores'); },
  criarEntregador(b) { return this.api('/api/entregadores', { method: 'POST', body: JSON.stringify(b) }); },
  atualizarEntregador(id, b) { return this.api('/api/entregadores/' + id, { method: 'PUT', body: JSON.stringify(b) }); },
  excluirEntregador(id) { return this.api('/api/entregadores/' + id, { method: 'DELETE' }); },
  produtos() { return this.api('/api/produtos'); },
  atualizarProduto(id, b) { return this.api('/api/produtos/' + id, { method: 'PUT', body: JSON.stringify(b) }); },
  relatorios(dias) { return this.api('/api/relatorios?dias=' + (dias || 30)); },
  insumos() { return this.api('/api/insumos'); },
  salvarInsumo(b) { return this.api('/api/insumos' + (b.id ? '/' + b.id : ''), { method: b.id ? 'PUT' : 'POST', body: JSON.stringify(b) }); },
  excluirInsumo(id) { return this.api('/api/insumos/' + id, { method: 'DELETE' }); },
  ficha(produtoId) { return this.api('/api/produtos/' + produtoId + '/ficha'); },
  salvarFicha(produtoId, itens) { return this.api('/api/produtos/' + produtoId + '/ficha', { method: 'PUT', body: JSON.stringify(itens) }); },
  configuracao() { return this.api('/api/configuracao'); },
  termometro() { return this.api('/api/vendas/termometro'); },
  promocoes() { return this.api('/api/promocoes'); },
  criarPromocao(body) { return this.api('/api/promocoes', { method: 'POST', body: JSON.stringify(body) }); },
  plano() { return this.api('/api/plano'); },
  taxas() { return this.api('/api/taxas'); },
  salvarTaxa(b) { return this.api('/api/taxas' + (b.id ? '/' + b.id : ''), { method: b.id ? 'PUT' : 'POST', body: JSON.stringify(b) }); },
  excluirTaxa(id) { return this.api('/api/taxas/' + id, { method: 'DELETE' }); },
  formasPagamento() { return this.api('/api/formas-pagamento'); },
  salvarForma(b) { return this.api('/api/formas-pagamento' + (b.id ? '/' + b.id : ''), { method: b.id ? 'PUT' : 'POST', body: JSON.stringify(b) }); },
  excluirForma(id) { return this.api('/api/formas-pagamento/' + id, { method: 'DELETE' }); },
  horarios() { return this.api('/api/horarios'); },
  salvarHorarios(lista) { return this.api('/api/horarios', { method: 'PUT', body: JSON.stringify(lista) }); },
  motivos() { return this.api('/api/motivos'); },
  salvarMotivo(b) { return this.api('/api/motivos' + (b.id ? '/' + b.id : ''), { method: b.id ? 'PUT' : 'POST', body: JSON.stringify(b) }); },
  excluirMotivo(id) { return this.api('/api/motivos/' + id, { method: 'DELETE' }); },
  integracoes() { return this.api('/api/integracoes'); },
  salvarIntegracao(canal, body) { return this.api('/api/integracoes/' + canal, { method: 'PUT', body: JSON.stringify(body) }); },
  apiBase() { return BORA_API; },

  // Protege páginas internas: sem token → vai para login
  requireAuth() { if (!this.token()) { location.href = 'login.html'; return false; } return true; },

  statusLabel(s) {
    return ({ RECEBIDO: 'Recebido', CONFIRMADO: 'Confirmado', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto',
      SAIU_PARA_ENTREGA: 'Saiu para entrega', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado' }[s] || s);
  }
};
