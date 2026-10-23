# Painel do Bora rodando local com os dados reais de uma loja, para abrir as telas e testar o
# fluxo sem tocar em producao.
#
#   1) baixe o cardapio da loja de demonstracao:
#        curl -s https://borahapp.com.br/public/loja/17/cardapio -o pizzaria.json
#   2) rode:                          python painel-local.py
#   3) no navegador, em 127.0.0.1:8099, finja a sessao:
#        localStorage.setItem('boraToken','mock');
#        localStorage.setItem('boraUser', JSON.stringify({nome:'QA',papel:'ADMINISTRADOR_LOJA',lojaId:17}));
#
# Serve os arquivos do frontend de verdade (RAIZ) e responde a API com dados plausiveis.
#
# ELE GUARDA O QUE VOCE FAZ. Pedido criado entra na lista, muda de status, baixa estoque e
# aparece no KDS, em Entregas, no Acerto e no Caixa -- em memoria, enquanto o processo esta de
# pe. Ate 23/10/2026 ele respondia 501 a PUT/PATCH/DELETE e o POST nao guardava nada: dos 325
# itens do roteiro, 214 voltaram BLOQUEADOS por causa disso. A memoria mora em estado_local.py,
# junto com a regra de avanco de status, que e a MESMA do servidor.
#
# Pedido criado tambem cai em pedidos.log, para conferir o corpo que a tela montou.
import json, os, re, sys, http.server, socketserver, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from estado_local import Estado, agora

RAIZ = r"C:/Users/user/OneDrive/Desktop/Bora/bora-fase-2-frontend"
DADOS = json.load(open(os.path.join(os.path.dirname(__file__), "pizzaria.json"), encoding="utf-8"))

PRODUTOS, COMPLEMENTOS = [], {}
for p in DADOS["produtos"]:
    PRODUTOS.append({
        "id": p["id"], "nome": p["nome"], "categoria": p.get("categoria"),
        # Custo e estoque de mentira, mas PLAUSIVEIS: sem eles as telas de Estoque, Contagem e
        # o CMV de Relatorios ficam vazias e nao da para testar nada. O custo e 38% do preco,
        # que e a margem tipica de pizzaria.
        "preco": p["preco"], "custo": round(p["preco"] * 0.38, 2),
        "estoque": 20, "estoqueMinimo": 5,
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

# A memoria do painel. Uma instancia so, viva enquanto o processo estiver de pe.
E = Estado(PRODUTOS, CLIENTES)

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

    def _erro(self, status, recado):
        return self._json({"erro": recado, "message": recado, "status": status}, status)

    def do_GET(self):
        rota = urllib.parse.urlparse(self.path).path
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        m = re.match(r"^/api/produtos/(\d+)/complementos$", rota)
        if m:
            return self._json(COMPLEMENTOS.get(int(m.group(1)), []))

        # ---- o cardapio publico, que o painel nao servia: abrir o link do QR dava 404 e os itens
        # de "mude no painel e confira no cardapio" eram todos inverificaveis.
        m = re.match(r"^/public/loja/(\d+)/cardapio$", rota)
        if m:
            return self._json({
                "loja": {"id": int(m.group(1)), "nome": "Pizzaria Bella Napoli"},
                "marca": {"nomeExibicao": "Pizzaria Bella Napoli", "corPrimaria": "#C8102E"},
                "aberta": True, "pixDisponivel": False,
                "bairros": [{"bairro": t["bairro"], "taxa": t["taxa"]} for t in TAXAS if t.get("ativo")],
                # Esgotado FICA no menu, marcado -- nao some. PublicController.java:240-250
                # ("Esgotado JA NO MENU"). Escondendo, eu sumia com a categoria inteira junto e
                # escondia a regressao 29.3, que e justamente sobre o selo de esgotado.
                "produtos": [dict(x, complementos=COMPLEMENTOS.get(x["id"], []),
                                  esgotado=(x.get("estoque") is not None and x["estoque"] <= 0))
                             for x in PRODUTOS if x.get("ativo")],
            })

        # ---- o que mora na memoria
        m = re.match(r"^/api/pedidos/(\d+)/itens$", rota)
        if m:
            ped = next((x for x in E.pedidos if x["id"] == int(m.group(1))), None)
            return self._json((ped or {}).get("itens", []))
        m = re.match(r"^/api/pedidos/(\d+)/historico$", rota)
        if m:
            ped = next((x for x in E.pedidos if x["id"] == int(m.group(1))), None)
            return self._json((ped or {}).get("historico", []))
        if rota in ("/api/pedidos", "/api/pedidos/board"):
            return self._json(E.board() if rota.endswith("board") else E.pedidos)
        if rota == "/api/entregadores":
            return self._json(E.entregadores)
        if rota == "/api/insumos":
            return self._json(E.insumos)
        if rota == "/api/promocoes" or rota == "/api/cupons":
            return self._json(E.promocoes)
        if rota == "/api/usuarios":
            return self._json(E.usuarios)
        if rota == "/api/motivos":
            return self._json(E.motivos)
        if rota == "/api/horarios":
            return self._json(E.horarios)
        if rota == "/api/caixa" or rota == "/api/caixa/fechamento":
            return self._json(E.fechar_caixa())
        if rota == "/api/acertos/previa":
            # A tela chama com ?inicio=&fim= e espera uma LISTA (api.js:141,
            # AcertoEntregadorController:24). O periodo e ignorado aqui porque a memoria so tem o
            # movimento desta sessao -- mas a FORMA e a do servidor, que e o que importa no duble.
            return self._json(E.previa_acerto())
        if rota == "/api/acertos/historico":
            return self._json(E.acertos)
        tabela = {
            # saiuParaEntrega / entreguesUltimaHora sao os nomes do servidor
            # (PedidoService.resumo). Com saiuEntrega/entregues os KPIs de Entregas vinham VAZIOS.
            "/api/dashboard/resumo": {"recebidos": 3, "emPreparo": 1,
                                       "saiuParaEntrega": 0, "entreguesUltimaHora": 0,
                                       "faturamentoHoje": 480.5, "ticketMedio": 40.0, "pedidosHoje": 12,
                                       "ultimos": [], "porStatus": {}, "topProdutos": []},
            "/api/relatorios": {"faturamento": 5200.0, "pedidos": 130, "ticketMedio": 40.0,
                                 "porDia": [], "porStatus": {}, "topProdutos": [], "porCanal": []},
            "/api/desempenho": {"inicio": "2026-09-01", "fim": "2026-09-07", "dias": 7, "escopo": "MINHAS_LOJAS",
                                 "lojas": [{"lojaId": 17, "loja": "Pizzaria Bella Napoli", "pedidos": 12, "faturamento": 480.5,
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
            # onboarding.js le prontidao/operavel; o mock mandava percentual/concluido e a faixa
            # mostrava "undefined% pronta para operar". O backend real manda prontidao/operavel.
            "/api/onboarding": {"passos": [], "operavel": True, "prontidao": 100},
            "/api/recebimento": {"saldo": 0, "aReceber": 0, "recebido": 0, "lancamentos": []},
            "/api/rede/balancete": {"lojas": [], "total": {}},
            "/api/analise/canais": {"canais": []}, "/api/analise/horario": {"horas": []},
            "/api/analise/tempos": {"etapas": [], "media": 0},
            "/api/acertos/previa": {"entregadores": [], "total": 0},
            "/api/rede/balancete": {"inicio": "2026-09-01", "fim": "2026-09-07",
                "lojas": [{"lojaId": 17, "loja": "Pizzaria Bella Napoli", "faturamento": 4820.0, "pedidos": 121,
                           "cancelados": 9, "ticketMedio": 39.83, "representatividade": 52.1}],
                "total": {"faturamento": 9250.0, "pedidos": 232, "cancelados": 14, "ticketMedio": 39.87}},
            "/api/produtos": PRODUTOS, "/api/clientes": CLIENTES,
            "/api/formas-pagamento": FORMAS, "/api/taxas": TAXAS,
            "/api/rede/lojas": [{"id": 17, "nome": "Pizzaria Bella Napoli", "ativo": True, "atual": True, "suporte": False}],
            # whitelabel.js le nomeExibicao; com nomeLoja ele nao trocava nada e TODAS as telas
            # ficavam com o texto fixo do HTML, "Sorveteria da Rosa". E faltava lojaId, que as
            # telas de respostas prontas e do cardapio QR usam para montar o link.
            "/api/configuracao": {"lojaId": 17, "nomeExibicao": "Pizzaria Bella Napoli",
                                  "corPrimaria": "#C8102E", "corSecundaria": "#FFD100",
                                  "cashbackPercentual": 3, "custoFixoMensal": 0},
            # PRO nao existe no enum Plano -- so UNICO. Com "PRO" a tela de Planos quebrava.
            "/api/plano": {"plano": "UNICO", "precoMensal": 199.0, "maxUsuarios": 15,
                           "maxPedidosMes": 0},
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
            # Antes devolvia id 999 fixo e nao guardava nada: o pedido nao aparecia em Pedidos, no
            # KDS, em Entregas nem no Caixa, e metade do roteiro ficava sem o que clicar.
            try:
                return self._json(E.criar_pedido(corpo))
            except ValueError as e:
                return self._erro(400, str(e))
        if rota == "/api/entregadores":
            novo = dict(corpo, id=max([e["id"] for e in E.entregadores] + [0]) + 1, ativo=True)
            E.entregadores.append(novo)
            return self._json(novo)
        if rota == "/api/insumos":
            novo = dict(corpo, id=max([i["id"] for i in E.insumos] + [0]) + 1)
            novo.setdefault("estoque", 0)
            E.insumos.append(novo)
            return self._json(novo)
        if rota in ("/api/promocoes", "/api/cupons"):
            novo = dict(corpo, id=max([x["id"] for x in E.promocoes] + [0]) + 1, usos=0, ativa=True)
            novo.setdefault("origem", "Painel")
            E.promocoes.append(novo)
            return self._json(novo)
        if rota == "/api/usuarios":
            novo = dict(corpo, id=max([u["id"] for u in E.usuarios] + [0]) + 1, ativo=True)
            novo.pop("senha", None)          # senha nao fica guardada nem no duble
            E.usuarios.append(novo)
            return self._json(novo)
        if rota == "/api/motivos":
            novo = dict(corpo, id=max([x["id"] for x in E.motivos] + [0]) + 1, ativo=True)
            E.motivos.append(novo)
            return self._json(novo)
        if rota == "/api/acertos":
            E.acertos.append(dict(corpo, id=len(E.acertos) + 1, quando=agora()))
            return self._json(E.acertos[-1])
        return self._json({"ok": True})

    # ------------------------------------------------------------------ PUT / PATCH / DELETE
    # Os tres respondiam 501 (Unsupported method). Por isso "salve e confira", "exclua" e "mude o
    # status" eram inverificaveis aqui, e as secoes 14, 15 e 23 do roteiro voltaram 100% bloqueadas.

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or "{}")

    def _lista_de(self, rota):
        # Qual colecao da memoria essa rota mexe, e com qual id.
        for prefixo, lista in (("/api/produtos", PRODUTOS), ("/api/clientes", CLIENTES),
                               ("/api/entregadores", E.entregadores), ("/api/insumos", E.insumos),
                               ("/api/promocoes", E.promocoes), ("/api/cupons", E.promocoes),
                               ("/api/usuarios", E.usuarios), ("/api/motivos", E.motivos),
                               ("/api/taxas", TAXAS), ("/api/formas-pagamento", FORMAS)):
            # A ancora de fim e o que impede /api/produtos/31/ficha e /complementos de cairem
            # neste ramo generico. Sem ela, o corpo (uma LISTA json) ia para corpo.items() e a
            # conexao morria com ERR_EMPTY_RESPONSE -- a tela parecia quebrada e nao estava.
            m = re.match(r"^" + prefixo + r"/(\d+)$", rota)
            if m:
                return lista, int(m.group(1))
        return None, None

    def _mexer_no_estoque(self, alvo, corpo):
        """
        DEFINIR poe o saldo exato; AJUSTAR soma (ou subtrai).

        O tipo e OBRIGATORIO, igual ao servidor: ProdutoService.java:144 devolve 400 quando ele
        vem nulo. Antes este duble olhava so `quantidade` e SEMPRE somava -- mandar
        {"tipo":"DEFINIR","quantidade":7} num produto com 20 deixava 27. Mais permissivo que a
        producao, que e o pior jeito de um duble errar: o teste passa e o lojista toma 400.
        """
        tipo = (corpo.get("tipo") or "").upper()
        if not tipo:
            return "Informe o tipo: DEFINIR ou AJUSTAR"
        qtd = corpo.get("quantidade")
        if tipo == "DEFINIR":
            valor = float(qtd or 0)
            if valor < 0:
                return "O estoque nao pode ser negativo"
            alvo["estoque"] = valor
        elif tipo == "AJUSTAR":
            alvo["estoque"] = (alvo.get("estoque") or 0) + float(qtd or 0)
        else:
            return "Informe o tipo: DEFINIR ou AJUSTAR"
        return None

    def do_PUT(self):
        corpo = self._corpo()
        rota = urllib.parse.urlparse(self.path).path

        m = re.match(r"^/api/produtos/(\d+)/estoque$", rota)
        if m:
            p = next((x for x in PRODUTOS if x["id"] == int(m.group(1))), None)
            if not p:
                return self._erro(404, "Produto nao encontrado")
            erro = self._mexer_no_estoque(p, corpo)
            return self._erro(400, erro) if erro else self._json(p)

        m = re.match(r"^/api/insumos/(\d+)/estoque$", rota)
        if m:
            i = next((x for x in E.insumos if x["id"] == int(m.group(1))), None)
            if not i:
                return self._erro(404, "Insumo nao encontrado")
            erro = self._mexer_no_estoque(i, corpo)
            return self._erro(400, erro) if erro else self._json(i)

        # Mesma familia do status/entregador: a tela manda na QUERY, nao no corpo.
        m = re.match(r"^/api/usuarios/(\d+)/(ativo|papel)$", rota)
        if m:
            u = next((x for x in E.usuarios if x["id"] == int(m.group(1))), None)
            if not u:
                return self._erro(404, "Usuario nao encontrado")
            campo = m.group(2)
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            valor = (q.get(campo) or [None])[0]
            if valor is None:
                valor = corpo.get(campo)
            if campo == "ativo":
                u["ativo"] = str(valor).lower() == "true"
            else:
                u["papel"] = valor
            return self._json(u)

        if rota == "/api/horarios":
            if isinstance(corpo, list):
                E.horarios = corpo
            return self._json(E.horarios)
        if rota == "/api/configuracao":
            return self._json(dict(corpo, lojaId=17))

        lista, ident = self._lista_de(rota)
        if lista is not None:
            alvo = next((x for x in lista if x["id"] == ident), None)
            if not alvo:
                return self._erro(404, "Nao encontrado")
            # O cadastro do produto NAO mexe no estoque: e a regra do servidor (ProdutoService
            # ignora o campo de proposito) e foi um bug caro -- corrigir o preco as 21h apagava o
            # consumo da noite inteira. O duble tem de ser fiel nisso, senao o teste 14.4 mente.
            # Vale para produto E para insumo. Era so para produto, e por isso o cadastro de
            # insumo sobrescrevia o saldo -- fazendo a regressao 15.2, que ja esta paga, PARECER
            # que voltou. InsumoService.java:62: "O ESTOQUE so entra na CRIACAO".
            proibidos = ({"estoque", "estoqueMinimo"}
                         if lista is PRODUTOS or lista is E.insumos else set())
            for k, v in corpo.items():
                if k != "id" and k not in proibidos:
                    alvo[k] = v
            return self._json(alvo)
        return self._json({"ok": True})

    def do_PATCH(self):
        corpo = self._corpo()
        partes = urllib.parse.urlparse(self.path)
        rota = partes.path
        # A TELA MANDA NA URL, nao no corpo: `PATCH /api/pedidos/5/status?status=PRONTO&motivo=...`
        # e `PATCH /api/pedidos/5/entregador?nome=Carlos` (api.js:67-68). O controller real recebe
        # assim, com @RequestParam (PedidoController.java:51,57). Este dublê lia do corpo, e com
        # isso TODO botao de mudar status e de escolher motoboy nao fazia nada -- 13 itens do
        # roteiro voltaram bloqueados por causa desta linha, e o pior era o entregador: a tela
        # recebia 200 OK e o nome era apagado, calado.
        q = urllib.parse.parse_qs(partes.query)

        def param(nome):
            # Query primeiro, porque e o que a tela usa. Corpo como reserva, para chamada por curl.
            if nome in q and q[nome]:
                return q[nome][0]
            return corpo.get(nome)

        m = re.match(r"^/api/pedidos/(\d+)/status$", rota)
        if m:
            ped, erro = E.mudar_status(int(m.group(1)), param("status"), param("motivo"))
            if erro:
                conflito = ("ja esta" in erro) or ("voltar" in erro)
                return self._erro(409 if conflito else 400, erro)
            return self._json(ped)

        m = re.match(r"^/api/pedidos/(\d+)/entregador$", rota)
        if m:
            ped = next((x for x in E.pedidos if x["id"] == int(m.group(1))), None)
            if not ped:
                return self._erro(404, "Pedido nao encontrado")
            # `?nome=`, nao `entregador` no corpo (api.js:68 / PedidoController.java:57).
            ped["entregador"] = (param("nome") or param("entregador") or "").strip() or None
            ped["atualizadoEm"] = agora()
            return self._json(ped)

        m = re.match(r"^/api/promocoes/(\d+)/encerrar$", rota)
        if m:
            pr = next((x for x in E.promocoes if x["id"] == int(m.group(1))), None)
            if not pr:
                return self._erro(404, "Promocao nao encontrada")
            pr["ativa"] = False
            return self._json(pr)
        return self._json({"ok": True})

    def do_DELETE(self):
        rota = urllib.parse.urlparse(self.path).path

        # Insumo em uso nao sai: o servidor recusa explicando onde ele esta sendo usado (item 15.4).
        m = re.match(r"^/api/insumos/(\d+)$", rota)
        if m:
            return self._erro(409, "Este insumo esta em uso numa ficha tecnica e nao pode ser "
                                   "excluido. Tire da ficha primeiro.")

        m = re.match(r"^/api/pedidos/(\d+)$", rota)
        if m:
            ped = next((x for x in E.pedidos if x["id"] == int(m.group(1))), None)
            if ped:
                E.pedidos.remove(ped)
            return self._json({"ok": True})

        lista, ident = self._lista_de(rota)
        if lista is not None:
            alvo = next((x for x in lista if x["id"] == ident), None)
            if not alvo:
                return self._erro(404, "Nao encontrado")
            lista.remove(alvo)
            return self._json({"ok": True, "id": ident})
        return self._json({"ok": True})


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8099), H) as s:
    print("mock em http://127.0.0.1:8099")
    s.serve_forever()
