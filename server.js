const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const cors = require("cors");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = Number(process.env.PORT || 8095);
const LIVE_API_BASE = process.env.LIVE_API_BASE || "http://10.1.100.10:5001/api";
const DISTRATOS_URL = process.env.DISTRATOS_URL || "https://ecopowerenergia.sharepoint.com/:x:/r/sites/DOCUMENTOSJURIDICOS/Documentos%20Compartilhados/CONTROLE%20JUR%C3%8DDICO%20-%20ONLINE.xlsx?d=wadaab69db0b84e9a8ec9b40c1d6cfc21&csf=1&web=1&e=yXTBmF";
const ROTAS_URL = process.env.ROTAS_URL || "https://ecopowerenergia-my.sharepoint.com/:x:/r/personal/leonardo_borges_ecopower_com_br/Documents/PLANILHA%20DE%20ROTAS%201.xlsx?d=wd1545cb620c3407d8153668e9c63f4a5&csf=1&web=1&e=zA0YEK";

const DISTRATO_COLUMNS = [
  "DATA DA FINALIZACAO", "TERMO ASSINADO", "TIPO DO DISTRATO", "STATUS", "CLIENTE",
  "ATENDENTE", "FRANQUEADO", "CIDADE", "UF", "MOTIVO", "AREA CAUSADORA", "MATERIAIS",
  "KWP", "FORMA DE PGT", "FINANCIADORA", "DATA DO CONTRATO", "DATA LIBERACAO FINANCEIRA",
  "PRAZO ENTREGA/INSTALACAO", "DIAS DE ATRASO", "VALOR CONTRATO", "VALOR REBATE",
  "VALOR RECEBIDO", "VALOR PAGO", "RESULTADO", "SITUACAO", "DATA DA SITUACAO", "RELATORIO"
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
let rotasLinked = [];
let linkedCache = { loadedAt: null, distratos: 0, rotas: 0, error: null };
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

function canonicalHeader(header) {
  const h = normalizeHeader(header);
  const compact = h.replace(/[^A-Z0-9]/g, "");

  if (compact.includes("DATA") && (compact.includes("FINALIZACAO") || compact.includes("FINALIZA"))) return "DATA DA FINALIZACAO";
  if (compact.includes("TERMO") && compact.includes("ASSINADO")) return "TERMO ASSINADO";
  if (compact.includes("TIPO") && compact.includes("DISTRATO")) return "TIPO DO DISTRATO";
  if (compact === "STATUS" || compact.includes("STATUS")) return "STATUS";
  if (compact === "CLIENTE") return "CLIENTE";
  if (compact === "CLIENTES") return "CLIENTES";
  if (compact.includes("ATENDENTE")) return "ATENDENTE";
  if (compact.includes("FRANQUEADO")) return "FRANQUEADO";
  if (compact === "CIDADE" || compact.includes("MUNICIPIO")) return "CIDADE";
  if (compact === "UF" || compact.endsWith("UF")) return "UF";
  if (compact.includes("MOTIVO")) return "MOTIVO";
  if (compact.includes("RELATORIO")) return "RELATORIO";
  if (compact.includes("CPF") || compact.includes("CNPJ")) return "CPF/CNPJ";
  if (compact.includes("PROTHEUS")) return "N PROTHEUS";
  if (compact.includes("CONTRATO") && compact.includes("PROPOSTA")) return "N CONTRATO/PROPOSTA";
  if (compact.includes("ASSINATURA") && compact.includes("CONTRATO")) return "DATA ASSINATURA DO CONTRATO";
  if (compact.includes("OBJETO") && compact.includes("CONTRATADO")) return "OBJETO CONTRATADO";
  if (compact.includes("CIDADE") && compact.includes("INSTALACAO")) return "CIDADE DE INSTALACAO";
  if (compact.includes("VALOR") && compact.includes("NEGOCIADO")) return "VALOR NEGOCIADO";
  if ((compact.includes("AREA") || compact.startsWith("REA")) && compact.includes("CAUSADORA")) return "AREA CAUSADORA";
  if (compact.includes("MATERIA")) return "MATERIAIS";
  if (compact === "KWP" || compact.includes("KWP")) return "KWP";
  if (compact.includes("FORM") && (compact.includes("PGT") || compact.includes("PAG"))) return "FORMA DE PGT";
  if (compact.includes("FINANCIADORA")) return "FINANCIADORA";
  if (compact.includes("DATADOCONTRATO")) return "DATA DO CONTRATO";
  if (compact.includes("LIBERACAO") && compact.includes("FINANCEIRA")) return "DATA LIBERACAO FINANCEIRA";
  if (compact.includes("PRAZO") && (compact.includes("ENTREGA") || compact.includes("INSTALACAO"))) return "PRAZO ENTREGA/INSTALACAO";
  if (compact.includes("DIAS") && compact.includes("ATRASO")) return "DIAS DE ATRASO";
  if (compact.includes("VALOR") && compact.includes("CONTRATO")) return "VALOR CONTRATO";
  if (compact.includes("VALOR") && compact.includes("REBATE")) return "VALOR REBATE";
  if (compact.includes("VALOR") && compact.includes("RECEBIDO")) return "VALOR RECEBIDO";
  if (compact.includes("VALOR") && compact.includes("PAGO")) return "VALOR PAGO";
  if (compact.includes("RESULTADO")) return "RESULTADO";
  if (compact.includes("SITUACAO") || compact.includes("SITUA")) return "SITUACAO";
  if (compact.includes("DATADASITUACAO") || compact.includes("DATADASITUA")) return "DATA DA SITUACAO";

  if (compact.includes("DATAINICIAL")) return "DATA INICIAL";
  if (compact.includes("TIPO") && compact.includes("PROGRAMA")) return "TIPO DE PROGRAMACAO";
  if (compact.includes("TIPO") && compact.includes("FRETE")) return "TIPO DE FRETE";
  if (compact.includes("CONFIRMACAO") && compact.includes("PAGAMENTO")) return "NECESSITA DE CONFIRMACAO DE PAGAMENTO?";
  if (compact.includes("CIA") && compact.includes("ELETRICA")) return "CIA ELETRICA";
  if (compact.includes("TENSAO")) return "TENSAO";
  if (compact.includes("PREVISAO") && compact.includes("CARREGAMENTO")) return "PREVISAO DE CARREGAMENTO";
  if (compact.includes("PROGRAMA")) return "PROGRAMACAO";
  if (compact === "ROTA") return "ROTA";
  if (compact.includes("OBSERVACAO")) return "OBSERVACAO";
  if (compact.includes("DATA") && compact.includes("NEGOCIACAO")) return "DATA DE NEGOCIACAO";
  if (compact.includes("DATACOMALTERACAO")) return "DATA COM ALTERACAO";
  if (compact.includes("DTINCPEDIDO") || compact.includes("TOTVS")) return "DT. INC. PEDIDO (TOTVS)";
  if (compact.includes("PRAZODIAS")) return "PRAZO DIAS";
  if (compact.includes("VENCIMENTODOCONTRATO")) return "VENCIMENTO DO CONTRATO";
  if (compact.includes("DIASPARAVENCIMENTO")) return "DIAS PARA VENCIMENTO";
  if (compact.includes("PEDIDO")) return "PEDIDO";
  if (compact.includes("CODIGO") && compact.includes("CLIENTE")) return "CODIGO DO CLIENTE";
  if (compact === "N") return "N";
  if (compact.includes("MESORREGIAO")) return "MESORREGIAO";
  if (compact.includes("MICRORREGIAO")) return "MICRORREGIAO";
  if (compact.includes("REGIAO") || compact.includes("REGIO")) return "REGIAO";
  if (compact.includes("CRM")) return "CRM";
  if (compact.includes("TIPO") && compact.includes("ESTRUTURA")) return "TIPO DE ESTRUTURA";
  if (compact.includes("CODIGO") && compact.includes("PRODUTO")) return "CODIGO DO PRODUTO";
  if (compact.includes("DESCRICAO") && compact.includes("KIT")) return "DESCRICAO DO KIT";
  if (compact.includes("ORDEM") && compact.includes("ENTREGA")) return "ORDEM DE ENTREGA";
  if (compact.includes("REPRESENTANTE")) return "REPRESENTANTE";
  if (compact.includes("EXECUTIVO")) return "EXECUTIVO";
  if (compact === "VALOR") return "VALOR";
  if (compact.includes("ROTAFIXA")) return "ROTA FIXA";
  if (compact.includes("CATEGORIA") && compact.includes("FRETE")) return "CATEGORIA DE FRETE";
  if (compact.includes("ETAPA") && compact.includes("PROGRAMACAO")) return "ETAPA DE PROGRAMACAO";
  if (compact.includes("DATANO") && compact.includes("CARREGAMENTO")) return "DATA NO CARREGAMENTO";
  if (compact.includes("ROTEIRIZADOR")) return "ROTEIRIZADOR";
  if (compact.includes("VEICULO")) return "VEICULO";

  return h;
}

function findSheetName(workbook, type) {
  if (type === "distratos") {
    const exact = workbook.SheetNames.find((name) => normalizeHeader(name) === "DISTRATOS");
    if (exact) return exact;
    const contains = workbook.SheetNames.find((name) => normalizeHeader(name).includes("DISTRATO"));
    if (contains) return contains;
  }
  return workbook.SheetNames[0];
}

function scoreHeaderRow(row, type) {
  const headers = row.map(canonicalHeader);
  const expected = type === "distratos"
    ? ["CLIENTE", "CIDADE", "FRANQUEADO", "MOTIVO"]
    : ["TIPO DE FRETE", "CLIENTES", "CIDADE", "PROGRAMACAO"];
  return expected.filter((name) => headers.includes(name)).length;
}

function parseWorkbook(buffer, type) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = findSheetName(workbook, type);
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  let headerIndex = 0;
  let bestScore = -1;

  matrix.forEach((row, index) => {
    const score = scoreHeaderRow(row, type);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  });

  const headers = (matrix[headerIndex] || []).map(canonicalHeader);

  return matrix
    .slice(headerIndex + 1)
    .map((cells) => {
      const normalized = {};
      headers.forEach((header, index) => {
        if (!header) return;
        const val = toDisplayValue(cells[index]);
        if (String(val).trim() === "") return;
        if (normalized[header] === undefined) normalized[header] = val;
        else normalized[`${header} ${index + 1}`] = val;
      });
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

function isRetornoRoute(rota) {
  const tipoFrete = normalizeText(value(rota, ["TIPO DE FRETE", "CATEGORIA DE FRETE"]));
  return tipoFrete.includes("RETORNO");
}

function cityMatches(a, b) {
  const ca = normalizeText(a);
  const cb = normalizeText(b);
  if (!ca || !cb) return false;
  return ca === cb || cb.includes(ca) || ca.includes(cb);
}

function matchScore(distrato, rota) {
  if (!isRetornoRoute(rota)) return 0;

  const clienteScore = nameScore(value(distrato, ["CLIENTE"]), value(rota, ["CLIENTES", "CLIENTE"]));
  if (!clienteScore) return 0;

  let score = clienteScore;
  const cidadeDistrato = normalizeText(value(distrato, ["CIDADE"]));
  const cidadeRota = normalizeText(value(rota, ["CIDADE", "REGIAO"]));
  const franqueadoDistrato = normalizeText(value(distrato, ["FRANQUEADO"]));
  const franqueadoRota = normalizeText(value(rota, ["FRANQUEADO", "REPRESENTANTE", "EXECUTIVO"]));
  const ufDistrato = normalizeText(value(distrato, ["UF"]));
  const ufRota = normalizeText(value(rota, ["UF"]));
  const cidadeOk = cityMatches(cidadeDistrato, cidadeRota);
  const franqueadoOk = franqueadoDistrato && franqueadoRota ? (franqueadoDistrato === franqueadoRota || hasTokenOverlap(franqueadoDistrato, franqueadoRota)) : false;

  if (cidadeDistrato && cidadeRota && !cidadeOk) return 0;
  if (franqueadoDistrato && franqueadoRota && !franqueadoOk) return 0;

  if (cidadeOk) score += 0.16;
  if (franqueadoOk) score += 0.14;
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
  const retornoRoutes = routeSource.filter(isRetornoRoute);
  return distratos.map((distrato) => {
    const matched = bestMatch(distrato, retornoRoutes);
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

function downloadUrl(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("download", "1");
  parsed.searchParams.delete("web");
  return parsed.toString();
}

async function fetchWorkbookBuffer(url) {
  const response = await fetch(downloadUrl(url), {
    headers: {
      "User-Agent": "Mozilla/5.0 ControleDistratos/1.0",
      "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*"
    },
    redirect: "follow"
  });
  if (!response.ok) throw new Error(`Falha ao baixar planilha (${response.status})`);
  const contentType = response.headers.get("content-type") || "";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const startsLikeZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!startsLikeZip && contentType.includes("text/html")) {
    throw new Error("SharePoint retornou HTML/login em vez de XLSX. Verifique permissao do link.");
  }
  return buffer;
}

async function refreshLinkedSheets() {
  try {
    const [distratosBuffer, rotasBuffer] = await Promise.all([
      fetchWorkbookBuffer(DISTRATOS_URL),
      fetchWorkbookBuffer(ROTAS_URL)
    ]);
    distratos = parseWorkbook(distratosBuffer, "distratos");
    rotasLinked = parseWorkbook(rotasBuffer, "rotas");
    linkedCache = {
      loadedAt: new Date().toISOString(),
      distratos: distratos.length,
      rotas: rotasLinked.length,
      error: null
    };
  } catch (error) {
    linkedCache = { ...linkedCache, error: error.message };
  }
  return linkedCache;
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
  const type = req.params.type;
  if (type !== "distratos" && type !== "rotas") return res.status(400).json({ error: "Tipo invalido" });
  const rows = parseWorkbook(req.file.buffer, type);
  if (type === "distratos") distratos = rows;
  else if (type === "rotas") rotasUpload = rows;
  else return res.status(400).json({ error: "Tipo invalido" });
  res.json({ rows: rows.length });
});

app.post("/api/live/refresh", async (_req, res) => {
  const cache = await refreshLiveRoutes();
  res.json({ rows: cache.rows.length, loadedAt: cache.loadedAt, error: cache.error });
});

app.post("/api/linked/refresh", async (_req, res) => {
  const cache = await refreshLinkedSheets();
  res.json(cache);
});

app.get("/api/state", (_req, res) => {
  res.json({
    distratos: distratos.length,
    rotasUpload: rotasUpload.length,
    rotasLinked: rotasLinked.length,
    linkedLoadedAt: linkedCache.loadedAt,
    linkedError: linkedCache.error,
    liveRoutes: liveCache.rows.length,
    liveLoadedAt: liveCache.loadedAt,
    liveError: liveCache.error
  });
});

app.get("/api/matches", (req, res) => {
  const sourceName = req.query.source === "upload" ? "upload" : req.query.source === "live" ? "live" : "linked";
  const source = sourceName === "upload" ? rotasUpload : sourceName === "live" ? liveCache.rows : rotasLinked;
  const rows = buildRows(source);
  const total = rows.length;
  const matched = rows.filter((r) => r.matchStatus !== "sem-rota").length;
  const revisar = rows.filter((r) => r.matchStatus === "revisar").length;
  res.json({
    generatedAt: new Date().toISOString(),
    source: sourceName,
    columns: { distratos: DISTRATO_COLUMNS, rotas: ROUTE_COLUMNS },
    totals: { total, matched, revisar, semRota: total - matched },
    rows
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

refreshLinkedSheets();
refreshLiveRoutes();

app.listen(PORT, () => {
  console.log(`Controle de Distratos em http://localhost:${PORT}`);
});
