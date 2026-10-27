/*
 * Landing page do Meu ERP Freelas: o movimento-assinatura "o painel que liga".
 *
 * Na abertura o painel dá a partida sozinho (ponteiros varrem até o fim e
 * voltam, as luzes acendem). Na virada ele obedece à rolagem: cada etapa do
 * atendimento acende uma luz, os ponteiros sobem e o visor muda de status.
 * Os valores são de um atendimento de EXEMPLO (o mesmo da proposta do modo
 * demo), não números do produto.
 *
 * Fica fora do motor (sites-incriveis.js), que não deve ser editado.
 */
(function () {
  "use strict";

  // o app instalado (PWA) abria na raiz; agora o sistema mora em /app
  if (window.matchMedia("(display-mode: standalone)").matches) {
    location.replace("/app/");
    return;
  }

  var reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ETAPAS = ["Cliente", "Proposta", "Assinatura", "Cobrança", "Contrato", "Projeto", "Pronto"];
  var STATUS = [
    "Novo cliente",
    "Proposta enviada",
    "Proposta assinada",
    "Pagamento recebido",
    "Contrato ativo",
    "Projeto em andamento",
    "Projeto entregue"
  ];
  var VALOR = 18500;   // proposta de exemplo
  var ESCALA = 20000;  // fundo de escala dos mostradores
  var ARCO = 80 * (240 * Math.PI / 180); // comprimento do arco de 240° com raio 80

  var brl = function (v) {
    return "R$ " + Math.round(v).toLocaleString("pt-BR");
  };

  function limitar(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- montagem ---------- */

  function mostrador(rotulo) {
    var marcas = "";
    for (var i = 0; i <= 10; i++) {
      var ang = (-120 + i * 24) * Math.PI / 180;
      var x1 = 100 + 90 * Math.sin(ang), y1 = 100 - 90 * Math.cos(ang);
      var x2 = 100 + 97 * Math.sin(ang), y2 = 100 - 97 * Math.cos(ang);
      marcas += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
    }
    var arco = "M30.72 140 A80 80 0 1 1 169.28 140";
    return (
      '<div class="mostrador">' +
        '<svg viewBox="0 0 200 160" role="presentation">' +
          '<g class="marcas">' + marcas + "</g>" +
          '<path class="trilho" d="' + arco + '"/>' +
          '<path class="cheio" d="' + arco + '" stroke-dasharray="' + ARCO.toFixed(1) + '" stroke-dashoffset="' + ARCO.toFixed(1) + '"/>' +
          '<g class="ponteiro" style="transform: rotate(-120deg)"><line x1="100" y1="100" x2="100" y2="36"/><circle cx="100" cy="100" r="7"/></g>' +
        "</svg>" +
        '<span class="mostrador-valor">R$ 0</span>' +
        '<span class="mostrador-rotulo">' + rotulo + "</span>" +
      "</div>"
    );
  }

  function montar(alvo) {
    alvo.innerHTML =
      '<div class="painel">' +
        '<div class="painel-topo"><span>Atendimento</span><b class="painel-estado">Desligado</b></div>' +
        '<div class="painel-corpo">' +
          mostrador("Proposta") +
          '<div class="visor">' +
            '<span class="visor-exemplo">Exemplo</span>' +
            '<span class="visor-status">&nbsp;</span>' +
            '<span class="visor-cliente">Novo site institucional<br>Estúdio Aurora</span>' +
          "</div>" +
          mostrador("Recebido") +
        "</div>" +
        '<ol class="luzes">' + ETAPAS.map(function (e) { return "<li>" + e + "</li>"; }).join("") + "</ol>" +
      "</div>";

    var el = alvo.querySelector(".painel");
    var ms = alvo.querySelectorAll(".mostrador");
    return {
      el: el,
      estado: el.querySelector(".painel-estado"),
      status: el.querySelector(".visor-status"),
      luzes: el.querySelectorAll(".luzes li"),
      mostradores: [ms[0], ms[1]].map(function (m) {
        return { ponteiro: m.querySelector(".ponteiro"), cheio: m.querySelector(".cheio"), valor: m.querySelector(".mostrador-valor") };
      }),
      etapa: 0
    };
  }

  /* ---------- estado ---------- */

  function ponteiro(m, valor) {
    var f = limitar(valor / ESCALA, 0, 1);
    m.ponteiro.style.transform = "rotate(" + (-120 + 240 * f).toFixed(2) + "deg)";
    m.cheio.setAttribute("stroke-dashoffset", (ARCO * (1 - f)).toFixed(1));
    m.valor.textContent = brl(valor);
  }

  function luzes(p, etapa, todas) {
    p.luzes.forEach(function (li, i) {
      li.classList.toggle("acesa", todas || i < etapa);
      li.classList.toggle("atual", !todas && i === etapa - 1);
    });
  }

  function status(p, texto) {
    if (p.status.textContent !== texto) p.status.textContent = texto;
  }

  function ligar(p) {
    p.el.classList.add("ligado");
    p.estado.textContent = "Ligado";
  }

  /* valores do atendimento em cada ponto da história (etapa 1..7, t = 0..1 dentro da etapa) */
  function leitura(etapa, t) {
    var proposta = etapa < 2 ? 0 : etapa === 2 ? VALOR * limitar(t * 2, 0, 1) : VALOR;
    // 50% na aprovação, 50% na entrega (como a proposta de exemplo)
    var recebido = etapa < 4 ? 0
      : etapa === 4 ? VALOR / 2 * limitar(t * 2, 0, 1)
      : etapa < 7 ? VALOR / 2
      : VALOR / 2 + VALOR / 2 * limitar(t * 2, 0, 1);
    return { proposta: proposta, recebido: recebido };
  }

  function mostrar(p, etapa, t) {
    var l = leitura(etapa, t);
    ponteiro(p.mostradores[0], l.proposta);
    ponteiro(p.mostradores[1], l.recebido);
    luzes(p, etapa, false);
    status(p, STATUS[etapa - 1]);
  }

  /* ---------- abertura: a partida ---------- */

  var hero = document.querySelector('[data-painel="ignicao"]');
  if (hero) {
    var ph = montar(hero);
    if (reduzido) {
      ligar(ph);
      mostrar(ph, 3, 1);
    } else {
      setTimeout(function () {
        ph.el.classList.add("partindo");
        ph.mostradores.forEach(function (m) { ponteiro(m, ESCALA); });
        luzes(ph, 7, true);
        status(ph, "Dando a partida…");
        setTimeout(function () {
          ligar(ph);
          mostrar(ph, 3, 1);
          setTimeout(function () { ph.el.classList.remove("partindo"); }, 800);
        }, 900);
      }, 500);
    }
  }

  /* ---------- virada: o painel obedece à rolagem ---------- */

  var cena = document.querySelector(".virada");
  var alvo = document.querySelector('[data-painel="rolagem"]');
  if (cena && alvo) {
    var pv = montar(alvo);
    var textos = cena.querySelectorAll(".etapa");
    ligar(pv);

    var aplicar = function (etapa, t) {
      mostrar(pv, etapa, t);
      textos.forEach(function (li, i) {
        li.classList.toggle("ativa", i === etapa - 1);
        li.classList.toggle("passou", i < etapa - 1);
      });
    };

    if (reduzido) {
      mostrar(pv, 7, 1);
      luzes(pv, 7, true);
    } else {
      var agendado = false;
      var atualizar = function () {
        agendado = false;
        var ret = cena.getBoundingClientRect();
        var percurso = cena.offsetHeight - window.innerHeight;
        var prog = percurso > 0 ? limitar(-ret.top / percurso, 0, 1) : 0;
        var pos = prog * 7;
        var etapa = limitar(Math.floor(pos) + 1, 1, 7);
        aplicar(etapa, limitar(pos - (etapa - 1), 0, 1));
      };
      var pedir = function () {
        if (!agendado) { agendado = true; requestAnimationFrame(atualizar); }
      };
      window.addEventListener("scroll", pedir, { passive: true });
      window.addEventListener("resize", pedir);
      atualizar();
    }
  }

  /* ---------- convite fixo no celular: some quando outro convite já está na tela ---------- */

  var fixo = document.querySelector(".cta-fixo");
  var convites = document.querySelectorAll("[data-cta-visivel]");
  if (fixo && convites.length && "IntersectionObserver" in window) {
    var visiveis = new Set();
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) visiveis.add(e.target); else visiveis.delete(e.target);
      });
      fixo.classList.toggle("escondido", visiveis.size > 0);
    }, { threshold: 0.35 });
    convites.forEach(function (c) { obs.observe(c); });
  }
})();
