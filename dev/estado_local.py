# -*- coding: utf-8 -*-
"""
A memoria do painel local: pedidos, entregadores, insumos, promocoes e usuarios que o
`painel-local.py` guarda enquanto esta de pe.

POR QUE ISTO EXISTE
Ate 23/10/2026 o painel respondia 501 a PUT, PATCH e DELETE, e o POST devolvia "ok" sem guardar
nada. Resultado medido pelos quatro agentes de QA naquele dia: dos 325 itens do roteiro, 214
voltaram BLOQUEADOS, e das 130 regressoes so 36 foram realmente rodadas. Sem pedido na base, as
secoes de Pedidos, KDS, Entregas, Acerto, Caixa e o integrado I-A nao tem o que clicar.

A REGRA DESTE ARQUIVO: um dublê que mente custa mais caro que dublê nenhum. No mesmo dia os agentes
acharam "undefined%" em Relatorios e um balancete que nao fechava -- os dois eram buraco do mock, e
alguem ia sair consertando o que nao estava quebrado. Entao:

  - o formato segue o do backend de verdade (ver PedidoCard.java e StatusPedido.java);
  - a regra de avanco de status e a mesma do PedidoService (nao recua, nao repete, final e final);
  - quando nao da para ser fiel, o campo nao existe -- em vez de existir com valor inventado.

Isto nao e banco: some quando o processo cai. E de proposito: cada rodada de teste comeca limpa.
"""
import itertools
from datetime import datetime, timezone, timedelta

FUSO = timezone(timedelta(hours=-3))


def agora():
    return datetime.now(FUSO).isoformat()


# ---------------------------------------------------------------- a ordem do fluxo do pedido
# Igual a PedidoService.posicaoNoFluxo. CANCELADO fica de fora de proposito: cancelar nao e
# "avancar", e pode acontecer de qualquer estado nao-final.
FLUXO = ["RECEBIDO", "CONFIRMADO", "EM_PREPARO", "PRONTO", "SAIU_PARA_ENTREGA", "ENTREGUE"]
FINAIS = {"ENTREGUE", "CANCELADO"}


def pode_avancar(de, para):
    """(ok, recado) — a mesma regra do servidor, para o painel nao ser mais permissivo que ele."""
    if de in FINAIS:
        return False, "Pedido %s e um estado final e nao pode mudar de status" % de
    if para == "CANCELADO":
        return True, None
    if para not in FLUXO:
        return False, "Status desconhecido: %s" % para
    i_de, i_para = FLUXO.index(de), FLUXO.index(para)
    if i_para > i_de:
        return True, None
    if i_para == i_de:
        return False, "Este pedido ja esta em %s." % para
    return False, ("Nao da para voltar de %s para %s. O pedido ja passou dessa etapa, e o cliente "
                   "ja foi avisado -- se precisar desfazer, cancele o pedido." % (de, para))


class Estado:
    """Tudo o que o painel guarda. Uma instancia so, criada na subida."""

    def __init__(self, produtos, clientes):
        self.produtos = produtos
        self.clientes = clientes
        self.pedidos = []
        self.proximo_pedido = itertools.count(1001)
        self.proximo_id = itertools.count(500)

        self.entregadores = [
            {"id": 1, "nome": "Carlos Motoboy", "telefone": "15991110000", "ativo": True, "taxaPadrao": 6.0},
            {"id": 2, "nome": "Rita Entregas", "telefone": "15992220000", "ativo": True, "taxaPadrao": 6.0},
            {"id": 3, "nome": "Pedro (afastado)", "telefone": "15993330000", "ativo": False, "taxaPadrao": 6.0},
        ]
        self.insumos = [
            {"id": 1, "nome": "Farinha", "unidade": "kg", "custo": 5.50, "estoque": 40.0, "estoqueMinimo": 10.0},
            {"id": 2, "nome": "Queijo mussarela", "unidade": "kg", "custo": 38.00, "estoque": 12.0, "estoqueMinimo": 5.0},
            {"id": 3, "nome": "Molho de tomate", "unidade": "L", "custo": 9.90, "estoque": 8.0, "estoqueMinimo": 3.0},
            {"id": 4, "nome": "Catupiry", "unidade": "kg", "custo": 42.00, "estoque": 2.0, "estoqueMinimo": 3.0},
        ]
        self.promocoes = [
            {"id": 1, "codigo": "BORA10", "tipo": "CUPOM", "percentualDesconto": 10,
             "fim": None, "usos": 3, "limiteUsos": 50, "origem": "Painel", "ativa": True},
            {"id": 2, "codigo": "NOITE15", "tipo": "RELAMPAGO", "percentualDesconto": 15,
             "fim": (datetime.now(FUSO) + timedelta(hours=3)).isoformat(),
             "usos": 4, "limiteUsos": 5, "origem": "Painel", "ativa": True},
        ]
        self.usuarios = [
            {"id": 1, "nome": "Dona do negocio", "email": "dona@pizzaria.teste",
             "papel": "ADMINISTRADOR_LOJA", "ativo": True},
            {"id": 2, "nome": "Gerente do turno", "email": "gerente@pizzaria.teste",
             "papel": "GERENTE", "ativo": True},
            {"id": 3, "nome": "Balcao", "email": "balcao@pizzaria.teste",
             "papel": "OPERADOR", "ativo": True},
        ]
        self.motivos = [
            {"id": 1, "descricao": "Cliente desistiu", "ativo": True},
            {"id": 2, "descricao": "Produto em falta", "ativo": True},
            {"id": 3, "descricao": "Endereco fora da area", "ativo": True},
        ]
        self.horarios = [{"dia": d, "aberto": True, "abre": "18:00", "fecha": "23:00"} for d in range(7)]
        self.acertos = []

    # -------------------------------------------------------------------------------- pedidos

    def _cliente(self, cliente_id):
        if cliente_id is None:
            return None
        return next((c for c in self.clientes if c["id"] == cliente_id), None)

    def criar_pedido(self, corpo):
        """
        Monta o pedido como o servidor monta: quem soma o total e o servidor, nao a tela.

        Levanta ValueError no que o servidor recusa. Antes isto aceitava calado produto que nao
        existe e criava pedido VAZIO so com a taxa -- um dublê assim ensina o errado: o teste
        passaria e o servidor de verdade devolveria 400 "Produto invalido no pedido"
        (PedidoService.java:224).
        """
        pedidos_de_itens = corpo.get("itens") or []
        if not pedidos_de_itens:
            raise ValueError("Pedido sem itens")
        itens = []
        subtotal = 0.0
        for it in pedidos_de_itens:
            p = next((x for x in self.produtos if x["id"] == it.get("produtoId")), None)
            if not p:
                raise ValueError("Produto invalido no pedido")
            qtd = int(it.get("quantidade") or 1)
            subtotal += float(p["preco"]) * qtd
            itens.append({"produtoId": p["id"], "quantidade": qtd, "descricao": p["nome"],
                          "precoUnitario": p["preco"],
                          "complementos": it.get("complementos") or []})
            self.baixar_estoque(p["id"], qtd)

        c = self._cliente(corpo.get("clienteId"))
        taxa = float(corpo.get("taxaEntrega") or 0)
        pago_depois = bool(corpo.get("aguardandoPagamento"))
        ped = {
            "id": next(self.proximo_id),
            "codigo": corpo.get("codigo") or ("#%d" % next(self.proximo_pedido)),
            "status": "RECEBIDO",
            "valorTotal": round(subtotal + taxa, 2),
            "taxaEntrega": taxa,
            "formaPagamento": corpo.get("formaPagamento"),
            "origem": corpo.get("origem"),
            "observacao": corpo.get("observacao"),
            "criadoEm": agora(),
            "atualizadoEm": agora(),
            "clienteId": corpo.get("clienteId"),
            "clienteNome": (c or {}).get("nome"),
            "clienteTelefone": (c or {}).get("telefone"),
            "clienteEndereco": (c or {}).get("endereco"),
            "clienteBairro": (c or {}).get("bairro"),
            # O servidor usa o do pedido e, em branco, cai no do cadastro (primeiroNaoVazio).
            "enderecoEntrega": corpo.get("enderecoEntrega") or (c or {}).get("endereco"),
            "bairroEntrega": corpo.get("bairroEntrega") or (c or {}).get("bairro"),
            "tipoEntrega": corpo.get("tipoEntrega") or "ENTREGA",
            "entregador": None,
            "aguardandoPagamento": pago_depois,
            "itens": itens,
            "historico": [{"quando": agora(), "de": None, "para": "RECEBIDO"}],
        }
        self.pedidos.append(ped)
        return ped

    def mudar_status(self, pedido_id, novo, motivo=None):
        """(pedido, erro). O erro vem com o mesmo texto do servidor, para a tela ser testada de verdade."""
        ped = next((p for p in self.pedidos if p["id"] == pedido_id), None)
        if not ped:
            return None, "Pedido nao encontrado"
        ok, recado = pode_avancar(ped["status"], novo)
        if not ok:
            return None, recado
        if novo == "SAIU_PARA_ENTREGA" and ped.get("tipoEntrega") == "RETIRADA":
            return None, ("Este pedido e retirada no balcao: nao ha o que despachar. Marque como "
                          "ENTREGUE quando o cliente retirar.")
        if novo == "CANCELADO" and not (motivo or "").strip():
            return None, "Motivo do cancelamento e obrigatorio"

        de = ped["status"]
        ped["status"] = novo
        ped["atualizadoEm"] = agora()
        ped["historico"].append({"quando": agora(), "de": de, "para": novo, "motivo": motivo})
        if novo == "ENTREGUE":
            ped["entregueEm"] = agora()
        if novo == "CANCELADO":
            ped["canceladoEm"] = agora()
            ped["motivoCancelamento"] = motivo
            for it in ped["itens"]:
                self.devolver_estoque(it["produtoId"], it["quantidade"])
        return ped, None

    # -------------------------------------------------------------------------------- estoque

    def baixar_estoque(self, produto_id, qtd):
        p = next((x for x in self.produtos if x["id"] == produto_id), None)
        if p and p.get("estoque") is not None:
            p["estoque"] = p["estoque"] - qtd

    def devolver_estoque(self, produto_id, qtd):
        p = next((x for x in self.produtos if x["id"] == produto_id), None)
        if p and p.get("estoque") is not None:
            p["estoque"] = p["estoque"] + qtd

    # ------------------------------------------------------------------- numeros derivados

    def board(self):
        """Os pedidos do dia, como o board devolve. Cancelado sai da fila."""
        return [p for p in self.pedidos if p["status"] != "CANCELADO"]

    def fechar_caixa(self):
        """
        So conta o que E venda: cancelado fora, e PIX ainda nao pago fora do faturamento mas
        contado a parte -- a mesma regra que o Dashboard e o Caixa precisam concordar entre si.
        """
        vendas = [p for p in self.pedidos
                  if p["status"] != "CANCELADO" and not p.get("aguardandoPagamento")]
        esperando = [p for p in self.pedidos
                     if p["status"] != "CANCELADO" and p.get("aguardandoPagamento")]
        por_forma = {}
        for p in vendas:
            f = p.get("formaPagamento") or "(sem forma)"
            por_forma[f] = round(por_forma.get(f, 0) + p["valorTotal"], 2)
        return {
            "faturamento": round(sum(p["valorTotal"] for p in vendas), 2),
            "pedidos": len(vendas),
            "ticketMedio": round(sum(p["valorTotal"] for p in vendas) / len(vendas), 2) if vendas else 0,
            "porForma": por_forma,
            "esperandoPix": round(sum(p["valorTotal"] for p in esperando), 2),
            "esperandoPixPedidos": len(esperando),
            "cancelados": len([p for p in self.pedidos if p["status"] == "CANCELADO"]),
        }

    def previa_acerto(self, entregador):
        """O que o motoboy tem a receber e quanto de dinheiro esta com ele."""
        entregues = [p for p in self.pedidos
                     if p["status"] == "ENTREGUE" and p.get("entregador") == entregador]
        dinheiro = [p for p in entregues if (p.get("formaPagamento") or "").upper().startswith("DINHEIRO")]
        return {
            "entregador": entregador,
            "entregas": len(entregues),
            "taxas": round(sum(p.get("taxaEntrega") or 0 for p in entregues), 2),
            "dinheiroRecebido": round(sum(p["valorTotal"] for p in dinheiro), 2),
            "pedidos": [{"id": p["id"], "codigo": p["codigo"], "valorTotal": p["valorTotal"],
                         "taxaEntrega": p.get("taxaEntrega") or 0,
                         "formaPagamento": p.get("formaPagamento")} for p in entregues],
        }
