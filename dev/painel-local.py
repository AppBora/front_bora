# Painel do Bora rodando local com os dados reais de uma loja, para abrir as telas e testar o
# fluxo sem tocar em producao.
#
#   1) baixe o cardapio de uma loja:  curl -s https://borahapp.com.br/public/loja/18/cardapio -o zira.json
#   2) rode:                          python painel-local.py
#   3) no navegador, em 127.0.0.1:8099, finja a sessao:
#        localStorage.setItem('boraToken','mock');
#        localStorage.setItem('boraUser', JSON.stringify({nome:'QA',papel:'ADMINISTRADOR_LOJA',lojaId:18}));
#
# Serve os arquivos do frontend de verdade (RAIZ) e responde a API com dados plausiveis. Pedido
# criado cai em pedidos.log, para conferir o corpo que a tela montou.
import json, os, re, http.server, socketserver, urllib.parse

RAIZ = r"C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend"
DADOS = json.load(open(os.path.join(os.path.dirname(__file__), "zira.json"), encoding="utf-8"))

PRODUTOS, COMPLEMENTOS = [], {}
for p in DADOS["produtos"]:
    PRODUTOS.append({
        "id": p["id"], "nome": p["nome"], "categoria": p.get("categoria"),
        "preco": p["preco"], "custo": None, "estoque": None,
        "imagemUrl": p.get("imagem"), "ativo": True,
    })
    COMPLEMENTOS[p["id"]] = p.get("complementos") or []

CLIENTES = [
    {"id": 1, "nome": "Maria Eduarda", "telefone": "15981034318", "endereco": "R. Firmino Minelli, 751",
     "bairro": "Vila Mineirao", "cashback": 12.50},
    {"id": 2, "nome": "Joao da Silva", "telefone": "15999998888", "endereco": "R. das Flores, 20",
     "bairro": "Centro", "cashback": 0},
]
FORMAS = [{"id": 1, "descricao": "Pix", "ativo": True}, {"id": 2, "descricao": "Dinheiro", "ativo": True},
          {"id": 3, "descricao": "Cartao na entrega", "ativo": True}]
TAXAS = [{"id": 1, "bairro": "Centro", "taxa": 6.00, "ativo": True}]
PEDIDOS_CRIADOS = []

PLANO_SIMULADO = {
    "inicio": "2026-09-01", "fim": "2026-09-07",
    "resumo": "A rede faturou R$ 9.250 em 232 pedidos, com ticket de R$ 39,87. O buraco esta entre "
              "14h e 17h na Zira Centro e nos 9 cancelamentos da Montreal, que sozinhos levaram R$ 358.",
    "recomendacoes": [
        {"titulo": "Promocao relampago das 15h as 17h", "categoria": "HORARIO", "impacto": "ALTO",
         "porque": "Das 14h as 17h a rede fez 11 pedidos contra 68 no pico das 19h-21h. Sao 3 horas abertas com custo fixo rodando.",
         "comoFazer": "Em Promocoes, crie um cupom de 15% valido so nessa faixa e divulgue no status do WhatsApp.",
         "ganhoEstimado": "R$ 600 a R$ 900/mes",
         "acao": {"tela": "promocoes.html", "rotulo": "Criar promocao das 15h"}},
        {"titulo": "Entender os 9 cancelamentos da Montreal", "categoria": "CANCELAMENTO", "impacto": "ALTO",
         "porque": "9 cancelados em 121 pedidos (7,4%) contra 2,1% nas outras lojas. R$ 358 perdidos na semana.",
         "comoFazer": "Fale com os clientes cancelados: a causa mais provavel e o tempo de preparo, que esta em 38 min ali.",
         "ganhoEstimado": "R$ 1.400/mes",
         "acao": {"tela": "whatsapp", "telefone": "15981034318", "rotulo": "Falar com o cliente",
                  "mensagem": "Oi! Aqui e da Zira Acaiteria. Vi que seu pedido acabou cancelado e queria entender o que houve para melhorar. Pode me contar?"}},
        {"titulo": "Repor Leite Ninho antes de quinta", "categoria": "ESTOQUE", "impacto": "MEDIO",
         "porque": "Restam 12 unidades e a media e 4,3/dia: cobertura de 2,8 dias. E adicional de 38% dos pedidos.",
         "comoFazer": "Em Estoque, lance a reposicao. Sem esse adicional o ticket cai cerca de R$ 2,50.",
         "ganhoEstimado": None,
         "acao": {"tela": "estoque.html", "rotulo": "Abrir estoque"}},
        {"titulo": "Rever o Napolitano 770ml", "categoria": "PRODUTO", "impacto": "BAIXO",
         "porque": "3 vendas em 7 dias, o pior do cardapio, com preco 22% acima da media da categoria.",
         "comoFazer": "Em Produtos, teste baixar para R$ 32,90 por duas semanas ou tire da vitrine.",
         "ganhoEstimado": None,
         "acao": {"tela": "produtos.html", "rotulo": "Abrir produtos"}}
    ]
}


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=RAIZ, **kw)

    def log_message(self, *a):
        pass

    def _json(self, obj, status=200):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        rota = urllib.parse.urlparse(self.path).path
        m = re.match(r"^/api/produtos/(\d+)/complementos$", rota)
        if m:
            return self._json(COMPLEMENTOS.get(int(m.group(1)), []))
        tabela = {
            "/api/dashboard/resumo": {"recebidos": 3, "emPreparo": 1, "saiuEntrega": 0, "entregues": 12,
                                       "faturamentoHoje": 480.5, "ticketMedio": 40.0, "pedidosHoje": 12,
                                       "ultimos": [], "porStatus": {}, "topProdutos": []},
            "/api/relatorios": {"faturamento": 5200.0, "pedidos": 130, "ticketMedio": 40.0,
                                 "porDia": [], "porStatus": {}, "topProdutos": [], "porCanal": []},
            "/api/desempenho": {"inicio": "2026-09-01", "fim": "2026-09-07", "dias": 7, "escopo": "MINHAS_LOJAS",
                                 "lojas": [{"lojaId": 18, "loja": "Zira Acaiteria", "pedidos": 12, "faturamento": 480.5,
                                            "ticketMedio": 40.0, "cmv": 150.0, "entrega": 60.0, "cashback": 14.4,
                                            "imposto": 0, "custoFixo": 0, "mensalidade": 46.43, "custoTotal": 270.83,
                                            "lucro": 209.67, "margemPct": 43.6, "custosIncompletos": True,
                                            "semMovimento": False}],
                                 "total": {"faturamento": 480.5, "cmv": 150.0, "entrega": 60.0, "cashback": 14.4,
                                           "imposto": 0, "custoFixo": 0, "mensalidade": 46.43, "custoTotal": 270.83,
                                           "lucro": 209.67, "pedidos": 12, "ticketMedio": 40.0, "margemPct": 43.6},
                                 "custosIncompletos": True},
            "/api/vendas/termometro": {"nivel": "OK", "mensagem": "Vendas normais", "variacao": 3.2, "sugestoes": []},
            "/api/assinatura": {"status": "ATIVA", "valor": 199.0, "proximaCobranca": "2026-10-01"},
            "/api/onboarding": {"passos": [], "concluido": True, "percentual": 100},
            "/api/recebimento": {"saldo": 0, "aReceber": 0, "recebido": 0, "lancamentos": []},
            "/api/rede/balancete": {"lojas": [], "total": {}},
            "/api/analise/canais": {"canais": []}, "/api/analise/horario": {"horas": []},
            "/api/analise/tempos": {"etapas": [], "media": 0},
            "/api/acertos/previa": {"entregadores": [], "total": 0},
            "/api/rede/balancete": {"inicio": "2026-09-01", "fim": "2026-09-07",
                "lojas": [{"lojaId": 18, "loja": "Zira Acaiteria", "faturamento": 4820.0, "pedidos": 121,
                           "cancelados": 9, "ticketMedio": 39.83, "representatividade": 52.1}],
                "total": {"faturamento": 9250.0, "pedidos": 232, "cancelados": 14, "ticketMedio": 39.87}},
            "/api/produtos": PRODUTOS, "/api/clientes": CLIENTES,
            "/api/formas-pagamento": FORMAS, "/api/taxas": TAXAS,
            "/api/rede/lojas": [{"id": 18, "nome": "Zira Acaiteria", "ativo": True, "atual": True, "suporte": False}],
            "/api/configuracao": {"nomeLoja": "Zira Acaiteria", "corPrimaria": "#5B1A8B",
                                  "corSecundaria": "#FFD100", "cashbackPercentual": 3},
            "/api/plano": {"plano": "PRO"},
        }
        if rota in tabela:
            return self._json(tabela[rota])
        if rota.startswith("/api/") or rota.startswith("/auth/"):
            return self._json([])
        return super().do_GET()

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        corpo = json.loads(self.rfile.read(n) or "{}")
        rota = urllib.parse.urlparse(self.path).path
        if rota == "/api/clientes":
            novo = dict(corpo)
            novo["id"] = max(c["id"] for c in CLIENTES) + 1
            novo["cashback"] = 0
            CLIENTES.append(novo)
            return self._json(novo)
        if rota == "/api/ia/rede/analisar":
            return self._json(PLANO_SIMULADO)
        if rota == "/api/pedidos":
            PEDIDOS_CRIADOS.append(corpo)
            with open(os.path.join(os.path.dirname(__file__), "pedidos.log"), "a", encoding="utf-8") as fp:
                fp.write(json.dumps(corpo, ensure_ascii=False) + chr(10))
            return self._json({"id": 999, "codigo": corpo.get("codigo"), "valorTotal": 0})
        return self._json({"ok": True})


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8099), H) as s:
    print("mock em http://127.0.0.1:8099")
    s.serve_forever()
