const state = {
  source: "live",
  tab: "todos",
  rows: [],
  filtered: [],
  lastPayload: null
};

const el = (id) => document.getElementById(id);
const els = {
  sync: el("sync-label"),
  uploadDistratos: el("upload-distratos"),
  uploadRotas: el("upload-rotas"),
  fonteRotas: el("fonte-rotas"),
  btnAtualizar: el("btn-atualizar"),
  btnExportar: el("btn-exportar"),
  btnLimpar: el("btn-limpar"),
  busca: el("busca"),
  filtroStatus: el("filtro-status"),
  filtroTipo: el("filtro-tipo"),
  filtroUf: el("filtro-uf"),
  filtroArea: el("filtro-area"),
  tbodyDistratos: el("tbody-distratos"),
  tbodyRotas: el("tbody-rotas"),
  modal: el("modal-overlay"),
  modalTitulo: el("modal-titulo"),
  modalBody: el("modal-body")
};

function get(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function distrato(row) {
  const d = row.distrato || {};
  return {
    id: state.rows.indexOf(row) + 1,
    cliente: get(d, ["CLIENTE"]),
    franqueado: get(d, ["FRANQUEADO"]),
    cidade: get(d, ["CIDADE"]),
    uf: get(d, ["UF"]),
    tipo: get(d, ["TIPO DO DISTRATO"]),
    status: get(d, ["STATUS"]),
    atendente: get(d, ["ATENDENTE"]),
    motivo: get(d, ["MOTIVO"]),
    area: get(d, ["AREA CAUSADORA"]),
    materiais: get(d, ["MATERIAIS"]),
    kwp: parseNumber(get(d, ["KWP"])),
    forma_pgt: get(d, ["FORMA DE PGT"]),
    financiadora: get(d, ["FINANCIADORA"]),
    data_contrato: get(d, ["DATA DO CONTRATO"]),
    data_lib_fin: get(d, ["DATA LIBERACAO FINANCEIRA"]),
    prazo_entrega: get(d, ["PRAZO ENTREGA/INSTALACAO"]),
    dias_atraso: parseNumber(get(d, ["DIAS DE ATRASO"])),
    valor_contrato: parseMoney(get(d, ["VALOR CONTRATO"])),
    valor_rebate: parseMoney(get(d, ["VALOR REBATE"])),
    valor_recebido: parseMoney(get(d, ["VALOR RECEBIDO"])),
    valor_pago: parseMoney(get(d, ["VALOR PAGO"])),
    resultado: get(d, ["RESULTADO"]),
    situacao: get(d, ["SITUACAO"]),
    data_situacao: get(d, ["DATA DA SITUACAO"]),
    data_finalizacao: get(d, ["DATA DA FINALIZACAO"]),
    termo_assinado: get(d, ["TERMO ASSINADO"])
  };
}

function rota(row) {
  const r = row.rota || {};
  const resumo = row.resumoRota || {};
  return {
    cliente: resumo.cliente || get(r, ["CLIENTES", "CLIENTE"]),
    cidade: resumo.cidade || get(r, ["CIDADE", "REGIAO"]),
    uf: resumo.uf || get(r, ["UF"]),
    rota: resumo.rota || get(r, ["ROTA", "ROTA FIXA", "PROGRAMACAO"]),
    programacao: resumo.programacao || get(r, ["PROGRAMACAO"]),
    tipo_prog: get(r, ["TIPO DE PROGRAMACAO"]),
    tipo_frete: resumo.tipoFrete || get(r, ["TIPO DE FRETE", "CATEGORIA DE FRETE"]),
    status: resumo.status || get(r, ["STATUS", "ETAPA DE PROGRAMACAO"]),
    previsao_carregamento: resumo.carregamento || get(r, ["PREVISAO DE CARREGAMENTO", "DATA NO CARREGAMENTO"]),
    cia_eletrica: get(r, ["CIA ELETRICA"]),
    tensao: get(r, ["TENSAO"]),
    kwp: parseNumber(get(r, ["KWP"])),
    valor: parseMoney(get(r, ["VALOR"])),
    etapa: get(r, ["ETAPA DE PROGRAMACAO"]),
    veiculo: get(r, ["VEICULO"]),
    roterizador: resumo.roterizador || get(r, ["ROTEIRIZADOR"]),
    observacao: get(r, ["OBSERVACAO"]),
    matchScore: row.matchScore,
    matchStatus: row.matchStatus
  };
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const normalized = String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function parseMoney(value) {
  return parseNumber(value);
}

function text(value) {
  return value === undefined || value === null || String(value).trim() === "" || value === "NaT" || value === "N/A" ? "-" : String(value);
}

function fmtMoeda(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "-";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtData(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "NaT" || raw === "N/A") return "-";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10).split("-").reverse().join("/");
  return raw;
}

function statusBadge(value) {
  const s = text(value);
  const low = s.toLowerCase();
  if (low.includes("final") || low.includes("entreg") || low.includes("conclu")) return `<span class="badge badge-green">${s}</span>`;
  if (low.includes("andamento") || low.includes("transito") || low.includes("program")) return `<span class="badge badge-blue">${s}</span>`;
  if (low.includes("pend") || low.includes("aguard")) return `<span class="badge badge-amber">${s}</span>`;
  if (low.includes("susp") || low.includes("cancel") || low.includes("sem-rota")) return `<span class="badge badge-red">${s}</span>`;
  return `<span class="badge badge-gray">${s}</span>`;
}

function resultBadge(value) {
  const r = text(value);
  const low = r.toLowerCase();
  if (low.includes("ganho")) return `<span class="badge badge-green">${r}</span>`;
  if (low.includes("prej")) return `<span class="badge badge-red">${r}</span>`;
  return `<span class="badge badge-gray">${r}</span>`;
}

function matchBadge(row) {
  if (row.matchStatus === "confiavel") return `<span class="badge badge-green">${row.matchScore}%</span>`;
  if (row.matchStatus === "revisar") return `<span class="badge badge-amber">${row.matchScore}%</span>`;
  return `<span class="badge badge-red">Sem rota</span>`;
}

async function upload(type, file) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api/upload/${type}`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Falha ao carregar arquivo");
  return body;
}

async function refreshLive() {
  els.sync.textContent = "Atualizando rotas em tempo real...";
  const response = await fetch("/api/live/refresh", { method: "POST" });
  const body = await response.json();
  if (body.error) els.sync.textContent = `Erro nas rotas em tempo real: ${body.error}`;
  else els.sync.textContent = `EcoPower Energia - ${body.rows.toLocaleString("pt-BR")} rotas em tempo real`;
}

async function loadMatches() {
  const response = await fetch(`/api/matches?source=${state.source}`);
  const payload = await response.json();
  state.lastPayload = payload;
  state.rows = payload.rows || [];
  updateKpis(payload);
  buildFilterOptions();
  applyFilters();
}

function buildFilterOptions() {
  const data = state.rows.map(distrato);
  fillSelect(els.filtroStatus, "Status", data.map((d) => d.status));
  fillSelect(els.filtroTipo, "Tipo de distrato", data.map((d) => d.tipo));
  fillSelect(els.filtroUf, "UF", data.map((d) => d.uf));
  fillSelect(els.filtroArea, "Area causadora", data.map((d) => d.area));
}

function fillSelect(select, label, values) {
  const current = select.value;
  const unique = [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  select.innerHTML = `<option value="">${label}</option>` + unique.map((v) => `<option>${escapeHtml(v)}</option>`).join("");
  if (unique.includes(current)) select.value = current;
}

function updateKpis(payload) {
  const distratos = state.rows.map(distrato);
  const total = distratos.length;
  const pendentes = distratos.filter((d) => d.status.toLowerCase().includes("pend")).length;
  const finalizados = distratos.filter((d) => d.status.toLowerCase().includes("final") || d.termo_assinado.toLowerCase() === "sim").length;
  const valor = distratos.reduce((sum, d) => sum + (d.valor_contrato || 0), 0);
  const rotas = state.rows.filter((r) => r.matchStatus !== "sem-rota").length;

  el("kpi-total").textContent = total.toLocaleString("pt-BR");
  el("kpi-pendentes").textContent = pendentes.toLocaleString("pt-BR");
  el("kpi-finalizados").textContent = finalizados.toLocaleString("pt-BR");
  el("kpi-valor").textContent = valor ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 1, notation: valor >= 1000000 ? "compact" : "standard" }) : "R$ 0";
  el("kpi-rotas").textContent = rotas.toLocaleString("pt-BR");
  el("kpi-rotas-sub").textContent = payload.source === "live" ? "via tempo real" : "via planilha";
  el("count-total").textContent = total.toLocaleString("pt-BR");
}

function applyFilters() {
  const busca = els.busca.value.trim().toLowerCase();
  const fStatus = els.filtroStatus.value;
  const fTipo = els.filtroTipo.value;
  const fUf = els.filtroUf.value;
  const fArea = els.filtroArea.value;

  state.filtered = state.rows.filter((row) => {
    const d = distrato(row);
    const bag = `${d.cliente} ${d.franqueado} ${d.cidade} ${d.uf} ${d.status} ${d.tipo} ${d.area}`.toLowerCase();
    const matchBusca = !busca || bag.includes(busca);
    const matchStatus = !fStatus || d.status === fStatus;
    const matchTipo = !fTipo || d.tipo === fTipo;
    const matchUf = !fUf || d.uf === fUf;
    const matchArea = !fArea || d.area === fArea;

    if (state.tab === "pendentes") return d.status.toLowerCase().includes("pend") && matchBusca && matchTipo && matchUf && matchArea;
    if (state.tab === "emandamento") return d.status.toLowerCase().includes("andamento") && matchBusca && matchTipo && matchUf && matchArea;
    if (state.tab === "finalizados") return (d.status.toLowerCase().includes("final") || d.termo_assinado.toLowerCase() === "sim") && matchBusca && matchTipo && matchUf && matchArea;
    return matchBusca && matchStatus && matchTipo && matchUf && matchArea;
  });

  renderTabela();
  renderRotas();
}

function renderTabela() {
  if (!state.filtered.length) {
    els.tbodyDistratos.innerHTML = `<tr><td colspan="14" class="empty-row">Envie a planilha de distratos ou ajuste os filtros.</td></tr>`;
  } else {
    els.tbodyDistratos.innerHTML = state.filtered.map((row) => {
      const d = distrato(row);
      const r = rota(row);
      return `
        <tr data-open="${state.rows.indexOf(row)}">
          <td><strong style="font-weight:500">${escapeHtml(text(d.cliente))}</strong></td>
          <td class="muted">${escapeHtml(text(d.franqueado))}</td>
          <td>${escapeHtml(text(d.cidade))} / ${escapeHtml(text(d.uf))}</td>
          <td><span class="badge badge-purple">${escapeHtml(text(d.tipo))}</span></td>
          <td>${statusBadge(d.status)}</td>
          <td class="muted">${escapeHtml(text(d.atendente))}</td>
          <td class="muted">${escapeHtml(text(d.motivo))}</td>
          <td><span class="badge badge-gray">${escapeHtml(text(d.area))}</span></td>
          <td>${d.kwp ? d.kwp.toLocaleString("pt-BR") + " kWp" : "-"}</td>
          <td>${fmtMoeda(d.valor_contrato)}</td>
          <td>${resultBadge(d.resultado)}</td>
          <td class="muted">${fmtData(d.data_finalizacao)}</td>
          <td><span class="badge badge-blue">${escapeHtml(text(d.situacao))}</span></td>
          <td>${row.matchStatus === "sem-rota" ? matchBadge(row) : `<strong>${escapeHtml(text(r.rota || r.programacao))}</strong> ${matchBadge(row)}`}</td>
        </tr>
      `;
    }).join("");
  }
  el("count-num").textContent = state.filtered.length.toLocaleString("pt-BR");
  els.tbodyDistratos.querySelectorAll("tr[data-open]").forEach((tr) => tr.addEventListener("click", () => openDetail(Number(tr.dataset.open))));
}

function renderRotas() {
  const linked = state.filtered.filter((row) => row.matchStatus !== "sem-rota");
  el("rotas-count").textContent = linked.length.toLocaleString("pt-BR");
  if (!linked.length) {
    els.tbodyRotas.innerHTML = `<tr><td colspan="11" class="empty-row">Nenhuma rota vinculada encontrada.</td></tr>`;
    return;
  }
  els.tbodyRotas.innerHTML = linked.map((row) => {
    const r = rota(row);
    const d = distrato(row);
    return `
      <tr data-open="${state.rows.indexOf(row)}">
        <td><strong style="font-weight:500">${escapeHtml(text(d.cliente || r.cliente))}</strong></td>
        <td>${escapeHtml(text(d.cidade || r.cidade))} / ${escapeHtml(text(d.uf || r.uf))}</td>
        <td><strong style="font-weight:500">${escapeHtml(text(r.rota || r.programacao))}</strong></td>
        <td class="muted">${escapeHtml(text(r.tipo_prog || r.programacao))}</td>
        <td class="muted">${escapeHtml(text(r.tipo_frete))}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${fmtData(r.previsao_carregamento)}</td>
        <td>${r.kwp ? r.kwp.toLocaleString("pt-BR") + " kWp" : "-"}</td>
        <td><span class="badge badge-blue">${escapeHtml(text(r.etapa || r.status))}</span></td>
        <td class="muted">${escapeHtml(text(r.roterizador || r.veiculo))}</td>
        <td>${matchBadge(row)}</td>
      </tr>
    `;
  }).join("");
  els.tbodyRotas.querySelectorAll("tr[data-open]").forEach((tr) => tr.addEventListener("click", () => openDetail(Number(tr.dataset.open))));
}

function openDetail(index) {
  const row = state.rows[index];
  const d = distrato(row);
  const r = rota(row);
  els.modalTitulo.textContent = `Distrato - ${text(d.cliente)}`;
  els.modalBody.innerHTML = `
    ${section("Dados do cliente", [
      ["Cliente", d.cliente], ["Franqueado", d.franqueado], ["Cidade / UF", `${text(d.cidade)} / ${text(d.uf)}`], ["Atendente", d.atendente]
    ])}
    ${section("Distrato", [
      ["Tipo de distrato", d.tipo], ["Status", statusBadge(d.status), true], ["Termo assinado", d.termo_assinado], ["Data de finalizacao", fmtData(d.data_finalizacao)],
      ["Motivo", d.motivo], ["Area causadora", d.area], ["Situacao", d.situacao], ["Data da situacao", fmtData(d.data_situacao)]
    ])}
    ${section("Contrato e financeiro", [
      ["Data do contrato", fmtData(d.data_contrato)], ["Data liberacao financeira", fmtData(d.data_lib_fin)], ["Prazo entrega/instalacao", fmtData(d.prazo_entrega)],
      ["Dias de atraso", d.dias_atraso > 0 ? `<span class="badge badge-red">${d.dias_atraso} dias</span>` : `<span class="badge badge-green">No prazo</span>`, true],
      ["Forma de pagamento", d.forma_pgt], ["Financiadora", d.financiadora], ["Materiais", d.materiais], ["kWp", d.kwp ? `${d.kwp.toLocaleString("pt-BR")} kWp` : "-"],
      ["Valor contrato", fmtMoeda(d.valor_contrato)], ["Valor rebate", fmtMoeda(d.valor_rebate)], ["Valor recebido", fmtMoeda(d.valor_recebido)], ["Valor pago", fmtMoeda(d.valor_pago)],
      ["Resultado", resultBadge(d.resultado), true]
    ])}
    <div class="modal-section">
      <div class="modal-section-title">Rota vinculada</div>
      ${row.matchStatus !== "sem-rota" ? rotaCard(r, row) : `<div class="empty-rota">Nenhuma rota vinculada a este cliente</div>`}
    </div>
  `;
  els.modal.classList.add("open");
}

function section(title, fields) {
  return `
    <div class="modal-section">
      <div class="modal-section-title">${title}</div>
      <div class="field-grid">
        ${fields.map(([label, value, html]) => `
          <div class="field"><span class="field-label">${label}</span><span class="field-value">${html ? value : escapeHtml(text(value))}</span></div>
        `).join("")}
      </div>
    </div>
  `;
}

function rotaCard(r, row) {
  return `
    <div class="rota-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:10px">
        <strong style="font-size:13px">${escapeHtml(text(r.rota || r.programacao))}</strong>
        ${statusBadge(r.status)}
      </div>
      <div class="rota-grid">
        <div class="field"><span class="field-label">Confianca do vinculo</span><span class="field-value">${matchBadge(row)}</span></div>
        <div class="field"><span class="field-label">Programacao</span><span class="field-value">${escapeHtml(text(r.programacao))}</span></div>
        <div class="field"><span class="field-label">Tipo frete</span><span class="field-value">${escapeHtml(text(r.tipo_frete))}</span></div>
        <div class="field"><span class="field-label">Previsao carregamento</span><span class="field-value">${fmtData(r.previsao_carregamento)}</span></div>
        <div class="field"><span class="field-label">CIA eletrica</span><span class="field-value">${escapeHtml(text(r.cia_eletrica))}</span></div>
        <div class="field"><span class="field-label">Tensao</span><span class="field-value">${escapeHtml(text(r.tensao))}</span></div>
        <div class="field"><span class="field-label">Etapa programacao</span><span class="field-value">${escapeHtml(text(r.etapa))}</span></div>
        <div class="field"><span class="field-label">Veiculo</span><span class="field-value">${escapeHtml(text(r.veiculo))}</span></div>
        <div class="field"><span class="field-label">Roteirizador</span><span class="field-value">${escapeHtml(text(r.roterizador))}</span></div>
        <div class="field"><span class="field-label">Observacao</span><span class="field-value">${escapeHtml(text(r.observacao))}</span></div>
      </div>
    </div>
  `;
}

function closeModal() {
  els.modal.classList.remove("open");
}

function limparFiltros() {
  els.busca.value = "";
  els.filtroStatus.value = "";
  els.filtroTipo.value = "";
  els.filtroUf.value = "";
  els.filtroArea.value = "";
  applyFilters();
}

function exportarDados() {
  const header = ["Cliente", "Franqueado", "Cidade", "UF", "Status", "Tipo", "Rota", "Status rota", "Confianca"];
  const lines = state.filtered.map((row) => {
    const d = distrato(row);
    const r = rota(row);
    return [d.cliente, d.franqueado, d.cidade, d.uf, d.status, d.tipo, r.rota || r.programacao, r.status, row.matchScore].map(csvCell).join(";");
  });
  const blob = new Blob([[header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "controle-distratos.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.tab = tab.dataset.tab;
    el("painel-distratos").classList.toggle("hidden", state.tab === "rotas");
    el("painel-rotas").classList.toggle("hidden", state.tab !== "rotas");
    applyFilters();
  });
});

els.uploadDistratos.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  els.sync.textContent = "Carregando planilha de distratos...";
  const result = await upload("distratos", file);
  els.sync.textContent = `${result.rows.toLocaleString("pt-BR")} distratos carregados - fonte de rotas: ${state.source === "live" ? "tempo real" : "planilha"}`;
  await loadMatches();
});

els.uploadRotas.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  els.sync.textContent = "Carregando planilha de rotas...";
  const result = await upload("rotas", file);
  state.source = "upload";
  els.fonteRotas.value = "upload";
  els.sync.textContent = `${result.rows.toLocaleString("pt-BR")} rotas carregadas via planilha`;
  await loadMatches();
});

els.fonteRotas.addEventListener("change", async () => {
  state.source = els.fonteRotas.value;
  await loadMatches();
});
els.btnAtualizar.addEventListener("click", async () => {
  if (state.source === "live") await refreshLive();
  await loadMatches();
});
els.btnExportar.addEventListener("click", exportarDados);
els.btnLimpar.addEventListener("click", limparFiltros);
[els.busca, els.filtroStatus, els.filtroTipo, els.filtroUf, els.filtroArea].forEach((node) => node.addEventListener("input", applyFilters));
el("btn-fechar").addEventListener("click", closeModal);
el("btn-fechar-rodape").addEventListener("click", closeModal);
els.modal.addEventListener("click", (event) => {
  if (event.target === els.modal) closeModal();
});

setInterval(async () => {
  if (state.source === "live") {
    await refreshLive();
    await loadMatches();
  }
}, 60000);

(async function init() {
  await refreshLive();
  await loadMatches();
})();
