const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const cors = require("cors");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = Number(process.env.PORT || 8095);
const LIVE_API_BASE = process.env.LIVE_API_BASE || "http://10.1.100.10:5001/api";

const DISTRATO_COLUMNS = [
  "DATA DA FINALIZACAO", "TERMO ASSINADO", "TIPO DO DISTRATO", "STATUS", "CLIENTE",
  "ATENDENTE", "FRANQUEADO", "CIDADE", "UF", "MOTIVO", "AREA CAUSADORA", "MATERIAIS",
  "KWP", "FORMA DE PGT", "FINANCIADORA", "DATA DO CONTRATO", "DATA LIBERACAO FINANCEIRA",
  "PRAZO ENTREGA/INSTALACAO", "DIAS DE ATRASO", "VALOR CONTRATO", "VALOR REBATE",
  "VALOR RECEBIDO", "VALOR PAGO", "RESULTADO", "SITUACAO", "DATA DA SITUACAO"
];

const ROUTE_COLUMNS = [
  "DATA INICIAL", "TIPO DE PROGRAMACAO", "TIPO DE FRETE", "STATUS",
  "NECESSITA DE CONFIRMACAO DE PAGAMENTO?", "CIA ELETRICA", "TENSAO",
  "PREVISAO DE CARREGAMENTO", "PROGRAMACAO", "ROTA", "OBSERVACAO", "DATA DE NEGOCIACAO",
  "DATA DE CONTRATO", "DATA COM ALTERACAO", "DT. INC. PEDIDO (TOTVS)", "PRAZO DIAS",
  "VENCIMENTO DO CONTRATO", "DIAS PARA VENCIMENTO", "PEDIDO", "CODIGO DO CLIENTE",
  "CLIENTES", "N", "REGIAO", "UF", "MESORREGIAO", "MICRORREGIAO", "CIDADE", "CRM",
  "TIPO DE ESTRUTURA", "CODIGO DO PRODUTO", "DESCRICAO DO KIT", "KWP", "OBSERVACAO",
  "ORDEM DE ENTREGA", "REPRESENTANTE", "EXECUTIVO", "VALOR", "ROTA FIXA",
  "CATEGORIA DE FRETE", "ETAPA DE PROGRAMACAO", "DATA NO CARREGAMENTO", "ROTEIRIZADOR",
  "VEICULO"
];

let distratos = [];
let rotasUpload = [];
let liveCache = { loadedAt: null, rows: [], error: null };

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[º°]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeText(value) {
  return normalizeHeader(value)
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LTDA|ME|EIRELI|SA|S A|CPF|CNPJ)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function value(row, names) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return "";
}

function toDisplayValue(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? "";
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  return rows
    .map((row) => {
      const normalized = {};
      for (const [key, val] of Object.entries(row)) {
        normalized[normalizeHeader(key)] = toDisplayValue(val);
      }
      return normalized;
    })
    .filter((row) => Object.values(row).some((cell) => String(cell).trim() !== ""));
}

function hasTokenOverlap(a, b) {
  const ta = new Set(normalizeText(a).split(" ").filter((x) => x.length > 2));
  const tb = normalizeText(b).split(" ").filter((x) => x.length > 2);
  if (!ta.size || !tb.length) return false;
  const hits = tb.filter((x) => ta.has(x)).length;
  return hits >= Math.min(2, Math.ceil(Math.min(ta.size, tb.length) * 0.55));
}

function nameScore(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 0.72;
  if (na.includes(nb) || nb.includes(na)) return 0.66;
  return hasTokenOverlap(na, nb) ? 0.52 : 0;
}

function matchScore(distrato, rota) {
  const clienteScore = nameScore(value(distrato, ["CLIENTE"]), value(rota, ["CLIENTES", "CLIENTE"]));
  if (!clienteScore) return 0;

  let score = clienteScore;
  const cidadeDistrato = normalizeText(value(distrato, ["CIDADE"]));
  const cidadeRota = normalizeText(value(rota, ["CIDADE", "REGIAO"]));
  const franqueadoDistrato = normalizeText(value(distrato, ["FRANQUEADO"]));
  const franqueadoRota = normalizeText(value(rota, ["FRANQUEADO", "REPRESENTANTE", "EXECUTIVO"]));
  const ufDistrato = normalizeText(value(distrato, ["UF"]));
  const ufRota = normalizeText(value(rota, ["UF"]));

  if (cidadeDistrato && cidadeRota && (cidadeDistrato === cidadeRota || cidadeRota.includes(cidadeDistrato) || cidadeDistrato.includes(cidadeRota))) score += 0.16;
  if (franqueadoDistrato && franqueadoRota && (franqueadoDistrato === franqueadoRota || hasTokenOverlap(franqueadoDistrato, franqueadoRota))) score += 0.14;
  if (ufDistrato && ufRota && ufRota.includes(ufDistrato)) score += 0.08;

  return Math.min(score, 1);
}

function bestMatch(distrato, rotas) {
  let best = null;
  for (const rota of rotas) {
    const score = matchScore(distrato, rota);
    if (score >= 0.58 && (!best || score > best.score)) best = { score, rota };
  }
  return best;
}

function buildRows(routeSource) {
  return distratos.map((distrato) => {
    const matched = bestMatch(distrato, routeSource);
    const rota = matched?.rota || {};
    const statusRota = value(rota, ["STATUS", "ETAPA DE PROGRAMACAO", "TIPO DE FRETE", "TIPO PROGRAMACAO"]);
    return {
      matchScore: matched ? Math.round(matched.score * 100) : 0,
      matchStatus: matched ? (matched.score >= 0.8 ? "confiavel" : "revisar") : "sem-rota",
      distrato,
      rota: matched ? rota : null,
      resumoRota: {
        status: statusRota,
        programacao: value(rota, ["PROGRAMACAO"]),
        rota: value(rota, ["ROTA", "ROTA FIXA", "PROGRAMACAO"]),
        cliente: value(rota, ["CLIENTES", "CLIENTE"]),
        cidade: value(rota, ["CIDADE", "REGIAO"]),
        uf: value(rota, ["UF"]),
        tipoFrete: value(rota, ["TIPO DE FRETE", "CATEGORIA DE FRETE"]),
        carregamento: value(rota, ["PREVISAO DE CARREGAMENTO", "DATA NO CARREGAMENTO"]),
        roterizador: value(rota, ["ROTEIRIZADOR"])
      }
    };
  });
}

function liveRowFromApi(row) {
  return {
    "DATA INICIAL": row.dataInicial,
    "TIPO DE PROGRAMACAO": row.tipoProgramacao,
    "TIPO DE FRETE": row.tipoFrete,
    "STATUS": row.tipoFrete,
    "PREVISAO DE CARREGAMENTO": row.previsaoCarregamento,
    "PROGRAMACAO": row.programacao,
    "ROTA": row.programacao,
    "CLIENTES": row.cliente,
    "REGIAO": row.regiao,
    "UF": row.uf,
    "CIDADE": row.cidade || row.regiao,
    "TIPO DE ESTRUTURA": row.tipoSistema,
    "CODIGO DO PRODUTO": row.codigoProduto,
    "DESCRICAO DO KIT": row.kit,
    "KWP": row.kwp,
    "PRAZO DIAS": row.prazoDias,
    "DATA COM ALTERACAO": row.dataComAlteracao
  };
}

async function refreshLiveRoutes() {
  const url = `${LIVE_API_BASE}/carteira/rotas/inversores-clientes?limit=50000&offset=0`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API de rotas retornou ${response.status}`);
    const json = await response.json();
    liveCache = {
      loadedAt: new Date().toISOString(),
      rows: (json.clientes || []).map(liveRowFromApi),
      error: null
    };
  } catch (error) {
    liveCache = { ...liveCache, error: error.message };
  }
  return liveCache;
}

app.post("/api/upload/:type", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Envie um arquivo .xlsx" });
  const rows = parseWorkbook(req.file.buffer);
  if (req.params.type === "distratos") distratos = rows;
  else if (req.params.type === "rotas") rotasUpload = rows;
  else return res.status(400).json({ error: "Tipo invalido" });
  res.json({ rows: rows.length });
});

app.post("/api/live/refresh", async (_req, res) => {
  const cache = await refreshLiveRoutes();
  res.json({ rows: cache.rows.length, loadedAt: cache.loadedAt, error: cache.error });
});

app.get("/api/state", (_req, res) => {
  res.json({
    distratos: distratos.length,
    rotasUpload: rotasUpload.length,
    liveRoutes: liveCache.rows.length,
    liveLoadedAt: liveCache.loadedAt,
    liveError: liveCache.error
  });
});

app.get("/api/matches", (req, res) => {
  const source = req.query.source === "upload" ? rotasUpload : liveCache.rows;
  const rows = buildRows(source);
  const total = rows.length;
  const matched = rows.filter((r) => r.matchStatus !== "sem-rota").length;
  const revisar = rows.filter((r) => r.matchStatus === "revisar").length;
  res.json({
    generatedAt: new Date().toISOString(),
    source: req.query.source === "upload" ? "upload" : "live",
    columns: { distratos: DISTRATO_COLUMNS, rotas: ROUTE_COLUMNS },
    totals: { total, matched, revisar, semRota: total - matched },
    rows
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

refreshLiveRoutes();

app.listen(PORT, () => {
  console.log(`Controle de Distratos em http://localhost:${PORT}`);
});
