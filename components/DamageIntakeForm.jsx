import React, { useEffect, useMemo, useState, useCallback } from "react";

/* ==========================
   Damage Intake – STEP WIZARD (1..12)
   BALTA pricing via public/prices/balta.v2.json (falls back to balta.json)
   UI hides ALL prices; expert enters ONLY quantities/units.
   Excel export uses a BALTA-style template with styles & VAT.
   ========================== */

const INSURERS = ["Swedbank", "Gjensidige", "Compensa", "IF", "BTA", "Balta"];
const LOCATION_TYPES = ["Komerctelpa", "Dzīvojamā ēka"];
const DWELLING_SUBTYPES = ["Privātmāja", "Daudzdzīvokļu māja", "Rindu māja", "Cits"];
const INCIDENT_TYPES = ["CTA", "Plūdi", "Uguns", "Koks", "Cits"];
const YES_NO = ["Jā", "Nē"];

const ROOM_TYPES = [
  "Virtuve","Guļamistaba","Koridors","Katla telpa","Dzīvojamā istaba",
  "Vannas istaba","Tualete","Garderobe","Cits",
];

// numeric key sets for robust parsing
const LABOR_KEYS      = ["labor","darbs"];
const MATERIAL_KEYS = [
  "materials","materiāli","materiali","materjali",
  "materiālu izmaksas","materialu izmaksas",
  "mater.","mater", "materiāli (eur)", "materiāli eur" // <- add if you saw these
];

const MECHANISM_KEYS = [
  "mechanisms","mehānismi","mehanismi","mehānismu","meh",
  "meh izmaksas","mehizmaksas","mehānismu izmaksas",
  "mehānismi (eur)", "mehānismi eur" // <- add if you saw these
];

const UNIT_PRICE_KEYS = [
  "unit_price","unitprice","vienības cena","vienibas cena","cena",
  "vienc","vienības cena eur" // <- add if present
];

// default units shown in the UI
const DEFAULT_UNITS = ["m2","m3","m","gab","kpl","diena","obj","c/h"];

// --- Strong normalizers ---
const _raw = (s) => String(s ?? "");

const deburr = (s) =>
  _raw(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const squish = (s) =>
  _raw(s)
    .replace(/\s+/g, " ")
    .trim();

const cleanKey = (k) =>
  deburr(k)
    .replace(/[^a-z0-9]+/g, "")        // keep only a-z0-9
    .replace(/(izmaksas|izdevumi|summa|cena|eur|bezpvn|pvn|kopā|kopa)+/g, ""); // strip suffixes often appended


// --- Smart number picker: first try exact provided keys; if not found, fuzzy match by regex buckets ---
function pickNumSmart(obj, exactKeys = [], type = "unknown") {
  if (!obj || typeof obj !== "object") return 0;

  // 1) Exact keys (your previous behavior)
  for (const k of exactKeys) {
    for (const key of Object.keys(obj)) {
      if (deburr(key) === deburr(k)) {
        const v = parseDec(obj[key]);
        if (Number.isFinite(v)) return v;
      }
    }
  }

  // 2) Fuzzy: detect by typical stems
  //    - labor: darb… (darbs, darba, darba izmaksas, …)
  //    - materials: mater… (materiāli, materialu izmaksas, …)
  //    - mechanisms: meh… (mehānismi, meh izmaksas, mehānismu izdevumi, …)
  //    - unit price: unit, vienibas, cena (but avoid totals)
  const want = type; // "labor"|"materials"|"mechanisms"|"unit"
  const stems = {
    labor:      [/^darb/, /^darba/, /^darbi/, /^darbin/i],
    materials:  [/^mater/, /^mat\b/],
    mechanisms: [/^meh/, /^mekh/],
    unit:       [/^unit/, /^vienib/, /^vienības/, /^cena$/, /^cenas?$/],
  }[want] || [];

  // Exclude words that look like totals/subtotals to avoid grabbing wrong fields
  const blacklist = /kop|kopa|total|sum|visa|visa?m|pavisam|pvn|bezpvn|ar pvn|transport|virsizdev|pelna/i;

  let bestKey = null;
  for (const key of Object.keys(obj)) {
    const ck = cleanKey(key); // aggressive cleaner
    if (!ck || blacklist.test(key)) continue;
    if (stems.some((re) => re.test(ck))) { bestKey = key; break; }
  }
  if (bestKey) {
    const v = parseDec(obj[bestKey]);
    if (Number.isFinite(v)) return v;
  }

  return 0;
}

// --- Robust finder for any embedded children array ---
// helper: detect any plausible children array on a legacy parent row
function findAnyChildrenArray(it) {
  if (!it || typeof it !== "object") return [];
  const candidates = [
    "children", "komponentes", "apaks", "apakšpozīcijas", "apakspozicijas"
  ];
  for (const key of candidates) {
    const arr = it[key];
    if (Array.isArray(arr) && arr.length) return arr;
  }
  return [];
}
async function loadArrayish(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const j = await res.json();
  return Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : []);
}

// helper: attach legacy children (from rawLegacy) onto base parents (from v2)
function attachChildrenFromLegacy(baseParents, rawLegacy) {
  // index legacy parents by id and by cat+name
  const byId = new Map();
  const byCatName = new Map();
  const keyCN = (cat, name) =>
    `${String(cat||"").trim().toLowerCase()}|${String(name||"").trim().toLowerCase()}`;

  for (const leg of rawLegacy) {
    const kids = findAnyChildrenArrayDeep(leg);
    if (!kids.length) continue;
    const id = String(leg.id ?? "");
    if (id) byId.set(id, leg);
    byCatName.set(keyCN(leg.category, leg.name), leg);
  }

  // attach
  let attached = 0;
  for (const p of baseParents) {
    const fromId = byId.get(String(p.id));
    const fromCN = byCatName.get(keyCN(p.category, p.name));
    const donor = fromId || fromCN;
    if (!donor) continue;

    const kids = findAnyChildrenArrayDeep(donor);
    if (!kids.length) continue;

    p.children = kids.map(ch => ({
      name: (ch.name || ch.title || "").trim(),
      unit: normalizeUnit(ch.unit || donor.unit || p.unit || ""),
      coeff: parseDec(ch.coeff ?? ch.multiplier ?? 1) || 1,
      labor:      pickNum(ch, LABOR_KEYS),
      materials:  pickNum(ch, MATERIAL_KEYS),
      mechanisms: pickNum(ch, MECHANISM_KEYS),
      unit_price: pickNum(ch, UNIT_PRICE_KEYS),
    })).filter(c => c.name);

    if (p.children.length) attached++;
  }

  return attached; // how many parents got children
}



/* ---------- generic helpers (pure; safe at top-level) ---------- */
// ---- GJENSIDIGE Excel parsing (client-side; supports .xls & .xlsx via SheetJS) ----
// ==== GJENSIDIGE: parse XLSX and detect categories + underpositions (right aligned) ====

// Find the header row in sheet "Objekts"
function gjFindHeaderRow(ws, XLSX) {
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 200); r++) {
    const cName = XLSX.utils.encode_cell({ r, c: 1 }); // column B (Darba nosaukums)
    const cUnit = XLSX.utils.encode_cell({ r, c: 2 }); // column C (Mērv.)
    const v1 = (ws[cName]?.v || "").toString().toLowerCase();
    const v2 = (ws[cUnit]?.v || "").toString().toLowerCase();
    if (v1.includes("darba") && v1.includes("nosauk") && (v2.includes("mērv") || v2.includes("merv"))) {
      return r;
    }
  }
  return null;
}

function gjNormalizeUnit(u) {
  const x = String(u||"").trim().toLowerCase().replace("²","2").replace("\u00A0"," ");
  if (["gb.","gab.","gab"].includes(x)) return "gab";
  if (["m2","m 2","m^2","m²"].includes(x)) return "m2";
  if (["m3","m 3","m^3","m³"].includes(x)) return "m3";
  if (x === "m") return "m";
  if (["kpl","kpl."].includes(x)) return "kpl";
  if (x === "diena") return "diena";
  if (x === "c/h") return "c/h";
  if (["obj.","obj"].includes(x)) return "obj";
  return x;
}
const gjNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(/\s+/g,"").replace(",","."));
  return Number.isFinite(n) ? n : 0;
};

// Visi nosaukumi, kas child_hints.json definēti kā apakšpozīcijas (child-only)

/**
 * Load /prices/GJENSIDIGE_*.xlsx with cell styles. We rely on horizontal alignment:
 * - main position: left (or general)
 * - underposition: right
 * We also infer categories from header rows (no unit + zero prices) like "Griesti", "Sienas", ...
 */
async function loadGjensidigeFromXlsx(assetBase) {
  const candidates = [
    `${assetBase}/prices/GJENSIDIGE_01.03.2024_ar transportu 7%.xlsx`,
    `${assetBase}/prices/GJENSIDIGE_01.03.2024_ar%20transportu%207%25.xlsx`,
    `${assetBase}/prices/gjensidige.xlsx`,
  ];
  // dynamic import (client)
  const XLSXmod = await import(/* webpackChunkName: "xlsx" */ "xlsx");
  const XLSX = XLSXmod?.default || XLSXmod;

  let ab = null, urlUsed = "";
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      ab = await res.arrayBuffer();
      urlUsed = url;
      break;
    } catch {}
  }
  if (!ab) throw new Error("Gjensidige XLSX nav atrodams");

  const wb = XLSX.read(ab, { type: "array", cellStyles: true }); // << keep styles
  const ws = wb.Sheets["Objekts"] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Gjensidige XLSX: trūkst lapa 'Objekts'");

  const headerR = gjFindHeaderRow(ws, XLSX);
  if (headerR == null) throw new Error("Gjensidige XLSX: nav atrasta virsraksta rinda");

  // Column indices relative to header row
  const C = {
    nr: 0, name: 1, unit: 2, qty: 3,
    uLabor: 4, uMat: 5, uMech: 6, uPrice: 7,
    tLabor: 8, tMat: 9, tMech: 10, tSum: 11
  };

  const range = XLSX.utils.decode_range(ws['!ref']);
  const out = [];
  let currentCategory = "";
  let lastMain = null;

  for (let r = headerR + 1; r <= range.e.r; r++) {
    const cell = (c) => ws[XLSX.utils.encode_cell({ r, c })]?.v;
    const style = (c) => ws[XLSX.utils.encode_cell({ r, c })]?.s;

    const name = String(cell(C.name) ?? "").trim();
    if (!name) continue;

    const unit = gjNormalizeUnit(cell(C.unit) ?? "");
    const uLabor = gjNum(cell(C.uLabor));
    const uMat   = gjNum(cell(C.uMat));
    const uMech  = gjNum(cell(C.uMech));
    const uPrice = gjNum(cell(C.uPrice));

    const isZero = (uLabor + uMat + uMech + uPrice) === 0;
    const nameStyle = style(C.name);
    const hAlign = nameStyle?.alignment?.horizontal || ""; // "left" | "right" | "center" | ""
    const rightAligned = hAlign.toLowerCase() === "right";

    // Section header (category): no unit + no prices
    if ((!unit || unit === "") && isZero) {
      currentCategory = name;
      lastMain = null;
      // we also emit the section (will be hidden in UI via is_section)
      out.push({
        id: `sec-${r}`,
        uid: `GJ::section::${r}::${name}`,
        name, category: currentCategory, subcategory: "",
        unit: "", unit_price: 0, labor: 0, materials: 0, mechanisms: 0,
        is_child: false, parent_uid: null, coeff: 1,
        is_section: true
      });
      continue;
    }

    // Build row
    const id = `r${r}`;
    const base = {
      id,
      uid: `GJ::${currentCategory}::${id}::${name}`,
      name,
      category: currentCategory || "",
      subcategory: "",
      unit,
      unit_price: uPrice,
      labor: uLabor,
      materials: uMat,
      mechanisms: uMech,
      coeff: 1,
    };

    if (rightAligned && lastMain) {
      // Underposition: hide in UI, link to last main
      out.push({
        ...base,
        is_child: true,
        parent_uid: lastMain.uid,
        is_section: false,
      });
    } else {
      // Main position (left or general align)
      const row = {
        ...base,
        is_child: false,
        parent_uid: null,
        is_section: false,
      };
      out.push(row);
      lastMain = row; // anchor for following right-aligned children
    }
  }

  return { rows: out, source: urlUsed.split("/").pop() };
}

// header normalizer like normTxt but for columns
function normHeader(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// pick the first matching value by trying multiple header names
function pickCol(obj, candidates = []) {
  const map = new Map(Object.entries(obj).map(([k, v]) => [normHeader(k), v]));
  for (const c of candidates) {
    const key = normHeader(c);
    if (map.has(key)) {
      const v = map.get(key);
      // numeric columns go through parseDec downstream; return raw here
      return v;
    }
  }
  return undefined;
}

// Parse a SheetJS workbook into our unified row shape
function parseGjensidigeWorkbook(XLSX, wb) {
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  // get JSON rows with header row inferred
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  // candidate header labels (extend if your sheet uses other words)
  const H = {
    category:   ["Kategorija", "Category", "Darbu grupa"],
    subcat:     ["Apakškategorija", "Subcategory", "Grupa", "Apakšgrupa"],
    name:       ["Nosaukums", "Darba nosaukums", "Pozīcija", "Darbs"],
    unit:       ["Mērv.", "Merv.", "Mērvienība", "Unit"],
    labor:      ["Darbs", "Darba izmaksas", "Work"],
    materials:  ["Materiāli", "Mater.", "Materiālu izmaksas", "Materials"],
    mechanisms: ["Mehānismi", "Meh.", "Mehānismu izmaksas", "Mechanisms"],
    unitPrice:  ["Vienības cena", "Cena", "Unit price", "EUR/vien"],
    parent:     ["Vecāks", "Parent", "Parent ID", "Piesaistīts pie"],
    coeff:      ["Koef.", "Coeff", "Daudzuma koef.", "Qty coef"],
    id:         ["ID", "Kods", "Pozīcijas kods"],
  };

  const out = [];
  rows.forEach((r, i) => {
    const category   = squish(pickCol(r, H.category) ?? "");
    const subcat     = squish(pickCol(r, H.subcat) ?? "");
    const name       = squish(pickCol(r, H.name) ?? "");
    const unit       = normalizeUnit(pickCol(r, H.unit) ?? "");
    const labor      = parseDec(pickCol(r, H.labor));
    const materials  = parseDec(pickCol(r, H.materials));
    const mechanisms = parseDec(pickCol(r, H.mechanisms));
    const unit_price = parseDec(pickCol(r, H.unitPrice));
    const parentRaw  = squish(pickCol(r, H.parent) ?? "");
    const coeff      = parseDec(pickCol(r, H.coeff) ?? 1) || 1;
    const idStr      = String(pickCol(r, H.id) ?? i + 1);

    if (!name) return; // skip empty

    const base = {
      id: idStr,
      uid: [category, subcat, idStr, name].join("::"),
      name,
      category,
      subcategory: subcat,
      unit,
      unit_price,
      labor,
      materials,
      mechanisms,
      is_child: !!parentRaw,
      parent_uid: parentRaw || null,
      coeff,
    };
    out.push(base);
  });

  return out;
}

// Fetch + parse client-side Excel (xls/xlsx) using SheetJS
async function loadGjensidigeExcel(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();

  // dynamic import SheetJS only when needed
  const XLSXmod = await import(/* webpackChunkName: "xlsx" */ "xlsx");
  const XLSX = XLSXmod?.default || XLSXmod;

  const wb = XLSX.read(ab, { type: "array" });
  return parseGjensidigeWorkbook(XLSX, wb);
}

function prettyDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

function normalizeUnit(u) {
  if (!u) return "";
  const x = String(u).trim().toLowerCase().replace("²", "2").replace("\u00A0", " ").replace(/\s{2,}/g, " ");
  if (["gb.","gab.","gab"].includes(x)) return "gab";
  if (["m2","m 2","m^2"].includes(x)) return "m2";
  if (["m3","m 3","m^3"].includes(x)) return "m3";
  if (x === "m") return "m";
  if (["kpl","kpl."].includes(x)) return "kpl";
  if (x === "diena") return "diena";
  if (x === "c/h") return "c/h";
  if (["obj.","obj"].includes(x)) return "obj";
  if (/^\d+\s*gb\.$/.test(x)) return "gab";
  return x;
}

function parseDec(x) {
  if (x === null || x === undefined || x === "") return 0;
  const n = parseFloat(String(x).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isSectionRow(row) {
  if (!row) return false;
  const name = (row.name || "").trim();
  if (!name) return false;

  const unit = normalizeUnit(row.unit || "");
  const sum =
    parseDec(row.labor ?? 0) +
    parseDec(row.materials ?? 0) +
    parseDec(row.mechanisms ?? 0) +
    parseDec(row.unit_price ?? 0);

  // Jābūt "virsraksta" tipa rindai: nav mērvienības + nav cenu
  const looksLikeHeader = (!unit || unit === "nan" || unit === "-") && sum === 0;
  if (!looksLikeHeader) return false;

  // Bet izmetam ārā kopsavilkuma/finanšu rindas no beigām
  const lower = name.toLowerCase();
  const blacklist = [
    "transports",
    "tiešās izmaksas kopā",
    "tiesas izmaksas kopa",
    "virsizdevumi",
    "virsizdevumi",
    "peļņa",
    "pelna",
    "sociālais nodoklis",
    "socialais nodoklis",
    "kopā",           // "KOPĀ:", "PAVISAM KOPĀ" utt.
    "pvn",
    "sastādīja",
    "sastadija",
    "sia \"lv group\"",
    "sert."
  ];

  if (blacklist.some((bad) => lower.includes(bad))) {
    return false;
  }

  return true;
}


// diacritic-insensitive, preserves real 0 values
// diacritic-insensitive, preserves real 0 values
// drop-in replacement
function pickNum(obj, keys) {
  if (!obj || typeof obj !== "object") return 0;

  // normalize: lowercase, strip accents, remove all non letters/digits
  const norm = (s) =>
    String(s ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .trim();

  // build normalized map of keys -> raw value
  const entries = Object.entries(obj).map(([k, v]) => [norm(k), v]);
  const wantExact = keys.map(norm);

  // 1) exact key match (most precise)
  for (const [k, v] of entries) {
    if (wantExact.includes(k)) {
      const n = parseDec(v);
      if (Number.isFinite(n)) return n;
    }
  }

  // 2) substring fallback (handles weird abbreviations/punctuation)
  // derive substrings to search for from the keys you passed in
  const wants = wantExact.flatMap((w) => {
    if (w.includes("labor") || w.includes("darbs")) return ["labor", "darbs"];
    if (w.includes("material")) return ["material", "materiali", "mater"];
    if (w.includes("mechanism") || w.includes("meh")) return ["mechanism", "meh"];
    if (w.includes("cena") || w.includes("unitprice")) return ["cena", "unitprice"];
    return [w];
  });

  for (const [k, v] of entries) {
    if (wants.some((w) => k.includes(w))) {
      const n = parseDec(v);
      if (Number.isFinite(n)) return n;
    }
  }

  return 0;
}



// strong string normalizer for matching names/categories
const normTxt = (s) => String(s ?? "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

// Gjensidige grupu virsraksti, kurus nevajag rādīt kā pozīcijas
const GJ_GROUP_BLACKLIST = new Set([
  normTxt("Ģipškartona konstrukcija"),
  normTxt("Griestu sagatavošanas darbi"),
  normTxt("Balsinājums"),
  normTxt("Balinājums"),
]);


function deburrLower(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.,;:()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBool(v) {
  return (
    v === true || v === 1 || v === "1" ||
    (typeof v === "string" && ["true","yes","y","jā"].includes(v.trim().toLowerCase()))
  );
}

function isChildItem(it) {
  return (
    parseBool(it.is_child) || parseBool(it.child) ||
    !!it.parent_uid || !!it.parentUid || !!it.parent_id || !!it.parentId ||
    !!it.parent || !!it.parent_name || !!it.parentName || !!it.childOf ||
    !!it.parentKey || !!it.parent_key
  );
}

function linkMatchesParent(child, parent) {
  const parentKeys = new Set(
    [parent.uid, parent.id, parent.name, `${parent.category}::${parent.name}`]
      .map(deburrLower)
      .filter(Boolean)
  );
  const childLinks = [
    child.parent_uid, child.parentUid, child.parent_id, child.parentId,
    child.parent, child.parent_name, child.parentName, child.childOf,
    child.parent_key, child.parentKey
  ].map(deburrLower).filter(Boolean);

  return childLinks.some(k => parentKeys.has(k));
}

function mapChildFromFlat(x, fallbackUnit) {
  const labor = Number(x?.labor ?? 0) || 0;
  const mech  = Number(x?.mechanisms ?? 0) || 0;
  const unitPriceRaw = Number(x?.unit_price ?? 0) || 0;

  const materials =
    Number(
      x?.materials ??
      ((labor || mech) ? 0 : unitPriceRaw) // no split -> push unit price into materials
    ) || 0;

  return {
    name: x?.name || "",
    unit: normalizeUnit(x?.unit || fallbackUnit || ""),
    coeff: Number(x?.coeff ?? x?.multiplier ?? 1) || 1,
    labor,
    materials,
    mechanisms: mech,
    unit_price_raw: unitPriceRaw,
  };
}

// tries to find any array of objects with a "name" inside the raw item
function findAnyChildrenArrayDeep(rawItem) {
  const candidates = [
    "children","komponentes","apaks","apakšpozīcijas",
    "components","componentes","subitems","sub_items","items",
    "pozicijas","pozīcijas"
  ];
  for (const key of candidates) {
    if (Array.isArray(rawItem[key])) return rawItem[key];
  }
  // heuristic fallback:
  for (const [k, v] of Object.entries(rawItem)) {
    if (Array.isArray(v) && v.some(o => o && typeof o === "object" && (o.name || o.title))) {
      return v;
    }
  }
  return [];
}


function findRowByNameFuzzy(rawName, rawCategory, catalog) {
  const nName = normTxt(rawName);
  const nCat  = normTxt(rawCategory);

  let hit = catalog.find(it => normTxt(it.name) === nName && normTxt(it.category) === nCat);
  if (hit) return hit;

  hit = catalog.find(it => normTxt(it.name) === nName);
  if (hit) return hit;

  hit = catalog.find(it => normTxt(it.category) === nCat && normTxt(it.name).includes(nName));
  if (hit) return hit;

  hit = catalog.find(it => normTxt(it.name).includes(nName));
  return hit || null;
}

/* ---------- LocalStorage helpers ---------- */
const STORAGE_KEY = "tames_profils_saglabatie";
function loadSaved() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

/* ---------- UI bits ---------- */
const LabeledRow = React.memo(function LabeledRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
});

const StepShell = React.memo(function StepShell({ title, children }) {
  return (
    <div style={{ background: "white", padding: 16, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
});

/* ======================================================================
   COMPONENT
   ====================================================================== */
export default function DamageIntakeForm() {
  const [step, setStep] = useState(1);

  // GitHub Pages base path (/eksperti) for assets
  const assetBase = useMemo(() => {
    if (typeof window === "undefined") return "";
    const hasPrefix = Boolean(window.__NEXT_DATA__?.assetPrefix);
    const onEksperti = window.location.pathname.startsWith("/eksperti");
    return hasPrefix || onEksperti ? "/eksperti" : "";
  }, []);

  // Profile
  const [claimNumber, setClaimNumber] = useState("");

  // Core fields
  const [address, setAddress] = useState("");
  const [insurer, setInsurer] = useState("Balta");
  const [locationType, setLocationType] = useState("");
  const [dwellingSubtype, setDwellingSubtype] = useState("");
  const [dwellingOther, setDwellingOther] = useState("");
  const [incidentType, setIncidentType] = useState("");
  const [incidentOther, setIncidentOther] = useState("");
  const [electricity, setElectricity] = useState("Nē");
  const [needsDrying, setNeedsDrying] = useState("Nē");
  const [commonPropertyDamaged, setCommonPropertyDamaged] = useState("Nē");
  const [lossKnown, setLossKnown] = useState("Nē");
  const [lossAmount, setLossAmount] = useState("");

  // Rooms
  const [rooms, setRooms] = useState(
    ROOM_TYPES.reduce((acc, r) => { acc[r] = { checked: false, count: 1, custom: "" }; return acc; }, {})
  );
  const [roomInstances, setRoomInstances] = useState([]); // {id,type,index,note?}[]
  const [roomActions, setRoomActions] = useState({});     // per-room rows
  const [editingRoomId, setEditingRoomId] = useState(null);

  // Catalog
  const [priceCatalog, setPriceCatalog] = useState([]);  // parents + children (children hidden in UI)
  const [catalogError, setCatalogError] = useState("");

  // Adjacency fallback: parent.uid -> array of compact children
  const [adjChildrenByParent, setAdjChildrenByParent] = useState(new Map());

  // Name indexes (for fast findRowByName)
    const [nameIndex, setNameIndex] = useState(new Map());
  const [catNameIndex, setCatNameIndex] = useState(new Map());

  const byId = useMemo(() => {
    const m = new Map();
    for (const it of priceCatalog) m.set(String(it.id), it);
    return m;
  }, [priceCatalog]);

  const byName = useMemo(() => {
    const m = new Map();
    for (const it of priceCatalog) {
      const key = normTxt(it.name);
      if (key) m.set(key, it);
    }
    return m;
  }, [priceCatalog]);

  const byCatAndName = useMemo(() => {
    const m = new Map();
    for (const it of priceCatalog) {
      const key = `${normTxt(it.category)}||${normTxt(it.name)}`;
      if (key) m.set(key, it);
    }
    return m;
  }, [priceCatalog]);
  
// Optional name-based child hints from /prices/child_hints.json
const [childHints, setChildHints] = useState({});
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      // Choose correct hints file depending on insurer
      let url = `${assetBase}/prices/child_hints.json`; // default → Balta
      if (insurer === "Gjensidige") {
        url = `${assetBase}/prices/gjensidige_child_hints.json`;
      }
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        // Hints are optional, so just return silently
        return;
      }
      const json = await res.json();
      if (cancelled || !json || typeof json !== "object") return;
      const m = {};
      const nk = (s) => normTxt(s); // same normalizer used in getChildrenFor()
      for (const [k, v] of Object.entries(json)) {
        m[nk(k)] = Array.isArray(v) ? v : [];
      }
      setChildHints(m);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [assetBase, insurer]);
// Expose current catalog for DevTools debugging
useEffect(() => {
  if (typeof window !== "undefined") {
    window.__PC = priceCatalog;
  }
}, [priceCatalog]);
useEffect(() => {
  if (typeof window !== "undefined") {
    window.dumpPC = () => {
      const pc = window.__PC || [];
      return {
        rows: pc.length,
        withMaterials: pc.filter(r => (r.materials||0)>0).length,
        withMechanisms: pc.filter(r => (r.mechanisms||0)>0).length,
        sample: pc.slice(0,3)
      };
    };
  }
}, []);

  /* ---------- Load pricing ---------- */
useEffect(() => {
  if (!["Balta", "Gjensidige", "Swedbank"].includes(insurer)) {
    setAdjChildrenByParent(new Map());
    setNameIndex(new Map());
    setCatNameIndex(new Map());
    setPriceCatalog([]);
    return;
  }
  setCatalogError("");

(async () => {
    try {
      const loadArrayish = async (url) => {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const j = await res.json();
        return Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : []);
      };

      // ---- choose source by insurer (BALTA or GJENSIDIGE) ----
      let raw = [];
      let source = "";

      if (insurer === "Balta") {
        // Prefer v2 -> fallback to legacy
        try {
          raw = await loadArrayish(`${assetBase}/prices/balta.v2.json`);
          source = "balta.v2.json";
        } catch (e) {}
        if (!raw.length) {
          try {
            raw = await loadArrayish(`${assetBase}/prices/balta.json`);
            source = "balta.json";
          } catch (e2) {
            setCatalogError(`Neizdevās ielādēt BALTA cenas: ${e2.message}`);
            return;
          }
        }
} else if (insurer === "Gjensidige") {
  try {
    const gjRaw = await loadArrayish(`${assetBase}/prices/gjensidige.json`);
    if (!Array.isArray(gjRaw) || !gjRaw.length) {
      setCatalogError("Neizdevās ielādēt GJENSIDIGE cenrādi (gjensidige.json ir tukšs vai bojāts).");
      return;
    }

    const num = (v) => {
      const n = parseDec(v);
      return Number.isFinite(n) ? n : 0;
    };

    let base = gjRaw
      .filter((r) => r && (r.name || r.Nosaukums))
      .map((r, i) => {
        const name = String(r.name ?? r.Nosaukums ?? "").trim();
        const category = String(r.category ?? r.Kategorija ?? "").trim();
        const subcategory = String(
          r.subcategory ?? r.Apakkategorija ?? r["Apakškategorija"] ?? ""
        ).trim();
        const unit = normalizeUnit(r.unit ?? r["Mērv."] ?? r.Merv ?? "");
        const id = String(r.id ?? i);
        const uid = String(r.uid ?? [category, subcategory, id, name].join("::"));

        return {
          id,
          uid,
          name,
          category,   // will be overridden by header logic below
          subcategory,
          unit,
          unit_price: num(r.unit_price ?? r["Vienības cena"] ?? r.cena),
          labor:      num(r.labor ?? r.Darbs),
          materials:  num(r.materials ?? r.Materiāli ?? r["Materiāli.1"]),
          mechanisms: num(r.mechanisms ?? r["Mehā-nismi"] ?? r.Mehanismi ?? r["Mehā-nismi.1"]),
          is_child: !!(r.is_child || r.parent_uid),
          parent_uid: r.parent_uid || null,
          coeff: num(r.coeff ?? 1) || 1,
        };
      });

    // 🔧 FIX: propagate header name as category
    let currentCat = "";
    base = base.map((row) => {
      if (isSectionRow(row)) {
        currentCat = (row.name || "").trim();
        return {
          ...row,
          category: currentCat,
        };
      }
      const cat = (row.category || currentCat || "").trim();
      return {
        ...row,
        category: cat,
      };
    });

    raw = base;
    source = "gjensidige.json";
  } catch (e) {
    setCatalogError(`Neizdevās ielādēt GJENSIDIGE cenrādi: ${e.message}`);
    return;
  }
} else if (insurer === "Swedbank") {
        try {
          raw = await loadArrayish(`${assetBase}/prices/swedbank.json`);
          if (!Array.isArray(raw) || !raw.length) {
            setCatalogError("Neizdevās ielādēt SWEDBANK cenrādi (swedbank.json ir tukšs vai bojāts).");
            return;
          }
          source = "swedbank.json";
        } catch (e) {
          setCatalogError(`Neizdevās ielādēt SWEDBANK cenrādi: ${e.message}`);
          return;
        }
      }



       const parents = [];
      const childrenFlat = [];
      const ordered = [];

      // helper: detect any embedded child array shape
      const findAnyChildrenArray = (it) =>
        (Array.isArray(it.children) && it.children) ||
        (Array.isArray(it.komponentes) && it.komponentes) ||
        (Array.isArray(it.apaks) && it.apaks) ||
        (Array.isArray(it["apakšpozīcijas"]) && it["apakšpozīcijas"]) ||
        [];

      raw.forEach((it, i) => {
        const category = (it.category || "").trim();
        const subcat =
          (it.subcategory || it.subcat || it.group || it.grupa || it["apakškategorija"] || "").trim();
        const idStr = String(it.id ?? i);
        const name = (it.name || "").trim();
        const uid = [category, subcat, idStr, name].join("::");

        const parent_uid =
          it.parent_uid || it.parentUid || it.parent_id || it.parentId ||
          it.parent || it.parent_name || it.parentName || it.childOf || null;
        const childFlag = /* row itself is a child in flat files? */ false || !!parent_uid;

        const base = {
          id: idStr,
          uid,
          name,
          category,
          subcategory: subcat,
          unit: normalizeUnit(it.unit),

          unit_price: pickNum(it, UNIT_PRICE_KEYS),
          labor:      pickNum(it, LABOR_KEYS),
          materials:  pickNum(it, MATERIAL_KEYS),
          mechanisms: pickNum(it, MECHANISM_KEYS),

          is_child: childFlag,
          parent_uid: parent_uid || null,

          // 🔴 ŠIS BIJA PAZUDIS – saglabājam header flagu no Gjensidige loadera
          is_section: !!it.is_section,
        };


        // We treat input rows as parents unless they explicitly carry a parent link
        if (childFlag) {
          const childRow = { ...base, coeff: parseDec(it.coeff ?? it.multiplier ?? 1) || 1 };
          childrenFlat.push(childRow);
          ordered.push(childRow);
        } else {
          const parent = { ...base, is_child: false, parent_uid: null };
          parents.push(parent);
          ordered.push(parent);

          // Embedded children (if any)
// Embedded children (if any)
const kidsArr = findAnyChildrenArray(it);
if (kidsArr.length) {
  parent.children = [];
  kidsArr.forEach((ch, idxCh) => {
    const chName = (ch.name || ch.title || "").trim();
    if (!chName) return;

const chEntry = {
  id: `${idStr}-c${idxCh}`,
  uid: [category, subcat, `${idStr}-c${idxCh}`, chName].join("::"),
  name: chName,
  category,
  subcategory: subcat,
  unit: normalizeUnit(ch.unit || it.unit),

  unit_price: pickNum(ch, UNIT_PRICE_KEYS),
  labor:      pickNum(ch, LABOR_KEYS),
  materials:  pickNum(ch, MATERIAL_KEYS),
  mechanisms: pickNum(ch, MECHANISM_KEYS),

  is_child: true,
  parent_uid: uid,
  coeff: parseDec(ch.coeff ?? ch.multiplier ?? 1) || 1,

  // bērni nekad nav kategoriju virsraksti
  is_section: false,
};


    childrenFlat.push(chEntry);
    ordered.push(chEntry);

    // compact version on parent
    parent.children.push({
      name: chEntry.name,
      unit: chEntry.unit,
      coeff: chEntry.coeff || 1,
      labor: chEntry.labor || 0,
      materials: chEntry.materials || 0,
      mechanisms: chEntry.mechanisms || 0,
    });
  });
}
        }
      });
if (source === "balta.v2.json" && childrenFlat.length === 0) {
  try {
    const legacyRaw = await loadArrayish(`${assetBase}/prices/balta.json`);
    const attachedCount = attachChildrenFromLegacy(parents, legacyRaw);
    if (attachedCount > 0) {
      for (const p of parents) {
        if (!Array.isArray(p.children) || !p.children.length) continue;
        p.children.forEach((ch, idxCh) => {
          const chEntry = {
            id: `${p.id}-c${idxCh}`,
            uid: [p.category || "", p.subcategory || "", `${p.id}-c${idxCh}`, ch.name].join("::"),
            name: ch.name,
            category: p.category || "",
            subcategory: p.subcategory || "",
            unit: normalizeUnit(ch.unit || p.unit),

            unit_price: Number(ch.unit_price || 0),
            labor:      Number(ch.labor || 0),
            materials:  Number(ch.materials || 0),
            mechanisms: Number(ch.mechanisms || 0),

            is_child: true,
            parent_uid: p.uid,
            coeff: Number(ch.coeff || 1) || 1,
            is_section: false,
          };
          childrenFlat.push(chEntry);
          ordered.push(chEntry);
        });
      }
    }
  } catch {
    // legacy is optional; ignore if missing
  }
}
      // Adjacency fallback map (if v2 had grouped rows)
      const adj = new Map();
      let currentParent = null;
      for (const row of ordered) {
        if (!row.is_child) { currentParent = row; continue; }
        if (currentParent &&
            row.category === currentParent.category &&
            row.subcategory === currentParent.subcategory) {
          const arr = adj.get(currentParent.uid) || [];
          const ch = mapChildFromFlat(row, currentParent.unit);
          const dupe = arr.some(a => normTxt(a.name) === normTxt(ch.name) && normalizeUnit(a.unit) === normalizeUnit(ch.unit));
          if (!dupe) arr.push(ch);
          adj.set(currentParent.uid, arr);
        }
      }
      // If parent has embedded children (from legacy attach), ensure adj map has them too
      for (const p of parents) {
        if (!Array.isArray(p.children) || !p.children.length) continue;
        const arr = adj.get(p.uid) || [];
        for (const ch of p.children) {
          const mapped = mapChildFromFlat(ch, p.unit);
          const dupe = arr.some(a => normTxt(a.name) === normTxt(mapped.name) && normalizeUnit(a.unit) === normalizeUnit(mapped.unit));
          if (!dupe) arr.push(mapped);
        }
        if (arr.length) adj.set(p.uid, arr);
      }
      const full = [...parents, ...childrenFlat];

      // Indexes
      const nmIdx = new Map();
      const cnIdx = new Map();
      for (const row of full) {
        const nName = normTxt(row.name);
        const nCat  = normTxt(row.category);
        if (!nmIdx.has(nName)) nmIdx.set(nName, []);
        nmIdx.get(nName).push(row);
        cnIdx.set(`${nCat}|${nName}`, row);
      }

      setPriceCatalog(full);
      setNameIndex(nmIdx);
      setCatNameIndex(cnIdx);
      setAdjChildrenByParent(adj);

      // ⬇️ DEBUG: expose catalog to DevTools
if (typeof window !== "undefined") {
  window.__PC = full;
  console.log("[BALTA] exposed __PC:", {
    rows: full.length,
    withMaterials: full.filter(r => (r.materials||0) > 0).length,
    withMechanisms: full.filter(r => (r.mechanisms||0) > 0).length,
    children: childrenFlat.length,
    adjParents: [...adj.keys()].length
  });
}

      // 🔎 Debug summary in console
      console.log("[BALTA] loaded:", {
        source,
        full: full.length,
        parents: parents.length,
        children: childrenFlat.length,
        splitParents: parents.filter(p => (p.labor||0)+(p.materials||0)+(p.mechanisms||0) > 0).length,
        splitChildren: childrenFlat.filter(p => (p.labor||0)+(p.materials||0)+(p.mechanisms||0) > 0).length,
        adjParents: [...adj.keys()].length
      });

    } catch (e) {
      setCatalogError(`Neizdevās ielādēt BALTA cenas: ${e.message}`);
    }
  })();
}, [insurer, assetBase]);

  // Visi nosaukumi, kas child_hints.json definēti kā apakšpozīcijas (child-only)
const gjChildOnlyNames = useMemo(() => {
  const s = new Set();
  if (!childHints || typeof childHints !== "object") return s;
  for (const hints of Object.values(childHints)) {
    if (!Array.isArray(hints)) continue;
    for (const h of hints) {
      const name = typeof h === "string" ? h : h?.name;
      if (!name) continue;
      s.add(normTxt(name));
    }
  }
  return s;
}, [childHints]);

  // fast exact-ish name finder using the indexes above
  const findRowByName = useCallback((rawName, rawCategory) => {
    const nName = normTxt(rawName);
    const nCat  = normTxt(rawCategory);
    const catKey = `${nCat}|${nName}`;
    if (catNameIndex.has(catKey)) return catNameIndex.get(catKey);

    const candidates = nameIndex.get(nName);
    if (Array.isArray(candidates) && candidates.length) return candidates[0];

    for (const [key, row] of catNameIndex.entries()) {
      const [cCat, cName] = key.split("|");
      if (cCat === nCat && cName.includes(nName)) return row;
    }
    return null;
  }, [nameIndex, catNameIndex]);

  // small alias
  const normKey = (s) => normTxt(s);

  // children resolver used by Excel export
  const getChildrenFor = useCallback((parent) => {
    if (!parent) return [];

    const out = [];
    const seen = new Set(); // de-dupe by name+unit
    const keyOf = (x) => `${normTxt(x?.name)}::${normalizeUnit(x?.unit || "")}`;

    const pushMapped = (raw, fallbackUnit) => {
      const mapped = mapChildFromFlat(raw, fallbackUnit);
      const k = keyOf(mapped);
      if (mapped.name && !seen.has(k)) {
        seen.add(k);
        out.push(mapped);
      }
    };

    // A) embedded children already attached to parent
    if (Array.isArray(parent.children) && parent.children.length) {
      for (const ch of parent.children) pushMapped(ch, parent.unit);
    }

    // B) explicit flat links (rows that reference this parent)
    for (const row of priceCatalog) {
      if (!isChildItem(row)) continue;
      if (!linkMatchesParent(row, parent)) continue;
      pushMapped(row, parent.unit);
    }

    // C) adjacency fallback (children that followed parent in raw order)
    const adj = adjChildrenByParent.get(parent.uid);
    if (Array.isArray(adj) && adj.length) {
      for (const ch of adj) pushMapped(ch, parent.unit);
    }

    // D) name-based hints (merge by *catalog* row to keep split/unit_price)
    const hints = childHints[normKey(parent.name)];
    if (Array.isArray(hints)) {
      for (const hint of hints) {
        const hintName = typeof hint === "string" ? hint : hint?.name;
        if (!hintName) continue;
        const coeff = Number(typeof hint === "object" && hint?.coeff ? hint.coeff : 1) || 1;
        const unitHint = typeof hint === "object" && hint?.unit ? hint.unit : undefined;

        // Prefer same category; fall back to any
        const match =
          findRowByName(hintName, parent.category) ||
          findRowByNameFuzzy(hintName, parent.category, priceCatalog);

        if (match) {
          pushMapped(
            {
              ...match,
              unit: unitHint || match.unit || parent.unit,
              coeff,
              labor:      pickNum(match, LABOR_KEYS),
              materials:  pickNum(match, MATERIAL_KEYS),
              mechanisms: pickNum(match, MECHANISM_KEYS),
              unit_price: pickNum(match, UNIT_PRICE_KEYS),
            },
            parent.unit
          );
        } else {
          // synthetic child if we don't have a real catalog row
          pushMapped({
            name: hintName,
            unit: unitHint || parent.unit,
            coeff,
            labor: 0, materials: 0, mechanisms: 0,
            unit_price: 0
          }, parent.unit);
        }
      }
    }

    return out;
  }, [priceCatalog, childHints, adjChildrenByParent, findRowByName]);

const categories = useMemo(() => {
  if (!priceCatalog.length) return [];

  // Gjensidige: categories = section headers ("Griesti", "Sienas", utt.)
  if (insurer === "Gjensidige") {
    const sectionNames = priceCatalog
      .filter((r) => isSectionRow(r))
      .map((r) => (r.name || "").trim())
      .filter(Boolean);

    if (sectionNames.length) {
      return Array.from(new Set(sectionNames));
    }
  }

  // Default (Balta, BTA, IF, Compensa...)
   const set = new Set(
    priceCatalog
      .map((i) => (i.category || "").trim())
      .filter(Boolean)
  );
  return Array.from(set);
}, [priceCatalog, insurer]);



  const allUnits = useMemo(() => {
    const set = new Set(DEFAULT_UNITS);
    priceCatalog.forEach((i) => i.unit && set.add(normalizeUnit(i.unit)));
    return Array.from(set);
  }, [priceCatalog]);

  /* ---------- Saved estimates ---------- */
  const [saved, setSaved] = useState([]);
  useEffect(() => setSaved(loadSaved()), []);

  /* ---------- Build room instances when rooms change ---------- */
  useEffect(() => {
    const instances = [];
    Object.entries(rooms).forEach(([type, meta]) => {
      if (!meta.checked) return;
      const cnt = Math.max(1, Number(meta.count) || 1);
      for (let i = 1; i <= cnt; i++) {
        const id = `${type}-${i}`;
        const existing = roomInstances.find((r) => r.id === id);
        instances.push({
          id,
          type: type === "Cits" ? meta.custom || "Cits" : type,
          index: i,
          note: existing?.note || "",
        });
      }
    });
    setRoomInstances(instances);
    setRoomActions((prev) => {
      const next = {};
      instances.forEach((ri) => {
        next[ri.id] = prev[ri.id] || [
          { category: "", itemUid: "", itemId: "", itemName: "", quantity: "", unit: "", unit_price: null },
        ];
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  /* ---------- Action row helpers ---------- */
  function addActionRow(roomId, presetCategory = "") {
    setRoomActions((ra) => ({
      ...ra,
      [roomId]: [
        ...(ra[roomId] || []),
        { category: presetCategory || "", itemUid: "", itemId: "", itemName: "", quantity: "", unit: "", unit_price: null },
      ],
    }));
  }
  function removeActionRow(roomId, idx) {
    setRoomActions((ra) => {
      const list = ra[roomId] || [];
      if (list.length <= 1) return ra;
      return { ...ra, [roomId]: list.filter((_, i) => i !== idx) };
    });
  }
  function setRowField(roomId, idx, key, value) {
    setRoomActions((ra) => {
      const list = [...(ra[roomId] || [])];
      const nextRow = { ...list[idx], [key]: value };
      list[idx] = nextRow;
      return { ...ra, [roomId]: list };
    });
  }
  function setRowCategory(roomId, idx, category) {
    setRoomActions((ra) => {
      const list = [...(ra[roomId] || [])];
      list[idx] = { ...list[idx], category, itemUid: "", itemId: "", itemName: "", unit: "", unit_price: null, labor: 0, materials: 0, mechanisms: 0 };
      return { ...ra, [roomId]: list };
    });
  }
  function setRowItem(roomId, idx, uid) {
    const item = priceCatalog.find((i) => i.uid === uid);
    setRoomActions((ra) => {
      const list = [...(ra[roomId] || [])];
      if (item) {
        list[idx] = {
          ...list[idx],
          category: item.category || list[idx].category || "",
          itemUid: item.uid,
          itemId: item.id,
          itemName: item.name,
          unit: item.unit || "",
          unit_price: pickNum(item, UNIT_PRICE_KEYS),
          labor:      pickNum(item, LABOR_KEYS),
          materials:  pickNum(item, MATERIAL_KEYS),
          mechanisms: pickNum(item, MECHANISM_KEYS),
        };
      } else {
        list[idx] = { ...list[idx], itemUid: "", itemId: "", itemName: "", unit: "", unit_price: null, labor: 0, materials: 0, mechanisms: 0 };
      }
      return { ...ra, [roomId]: list };
    });
  }

  function setRoomNote(roomId, note) {
    setRoomInstances((arr) => arr.map((ri) => (ri.id === roomId ? { ...ri, note } : ri)));
  }

  function removeRoomInstance(roomId) {
    const [baseType, idxStr] = String(roomId).split("-");
    const idx = parseInt(idxStr, 10) || 1;

    setRoomActions((ra) => {
      const next = { ...ra };
      const curCount = rooms[baseType]?.checked ? Number(rooms[baseType]?.count || 1) : 0;
      if (curCount <= 0) return next;
      for (let i = idx + 1; i <= curCount; i++) {
        const fromKey = `${baseType}-${i}`;
        const toKey = `${baseType}-${i - 1}`;
        if (next[fromKey]) next[toKey] = next[fromKey];
      }
      delete next[`${baseType}-${curCount}`];
      return next;
    });

    setRooms((prev) => {
      const cur = prev[baseType];
      if (!cur) return prev;
      const nextCount = (Number(cur.count) || 1) - 1;
      const copy = { ...prev };
      if (nextCount <= 0) copy[baseType] = { ...cur, checked: false, count: 1 };
      else copy[baseType] = { ...cur, checked: true, count: nextCount };
      return copy;
    });

    setEditingRoomId((id) => (id === roomId ? null : id));
  }

  /* ---------- Step validation ---------- */
  const totalSteps = 12;
  const stepValid = useMemo(() => {
    switch (step) {
      case 1: return !!address.trim();
      case 2: return !!insurer;
      case 3: return !!locationType && (locationType !== "Dzīvojamā ēka" || !!dwellingSubtype);
      case 4: return !!incidentType && (incidentType !== "Cits" || !!incidentOther.trim());
      case 5: return ["Jā","Nē"].includes(electricity);
      case 6: return ["Jā","Nē"].includes(needsDrying);
      case 7: return ["Jā","Nē"].includes(commonPropertyDamaged);
      case 8: return lossKnown === "Nē" || (lossKnown === "Jā" && !!lossAmount && Number(lossAmount) >= 0);
      case 9: return Object.values(rooms).some((r) => r.checked);
      default: return true;
    }
  }, [step,address,insurer,locationType,dwellingSubtype,incidentType,incidentOther,electricity,needsDrying,commonPropertyDamaged,lossKnown,lossAmount,rooms]);

  const suggestedCategoriesFor = () => [];

  /* ==========================
     Excel export (BALTA template; expands children)
     ========================== */
  async function exportToExcel() {
    try {
      const pad2 = (n) => String(n).padStart(2, "0");
      const ExcelJSImport = await import("exceljs/dist/exceljs.min.js");
      const ExcelJS = ExcelJSImport?.default || ExcelJSImport;

      // template path using same base as the app
      const tplUrl = `${assetBase}/templates/balta_template.xlsx`;
      const resp = await fetch(tplUrl);
      if (!resp.ok) {
        alert(`Neizdevās ielādēt ${tplUrl}. Pārliecinies, ka fails ir public/templates/balta_template.xlsx`);
        return;
      }
      const arrayBuf = await resp.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(arrayBuf);

      // base & output worksheets
      const src = wb.getWorksheet("Tāme") || wb.worksheets[0];
      const ws  = wb.addWorksheet("Tāme (izvade)", { views: [{ showGridLines: false }] });

      // Styles
      const FONT = { name: "Calibri", size: 11 };
      const MONEY = "#,##0.00";
      const QTY   = "#,##0.00";
      const thin = { style: "thin" };
      const borderAll = { top: thin, left: thin, bottom: thin, right: thin };
      const SECTION_BG = "FFF3F6FD";
      const HEADER_BG  = "FFEFEFEF";
      const ZEBRA_BG   = "FFF9FAFB";
      const sectionFill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_BG } };
      const headerFill  = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
      const ZEBRA = true;

      // Header
      const d = new Date();
      const dateStamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
      const tameId    = insurer === "Balta" ? `B-${dateStamp}` : dateStamp;
      const tameTitle = insurer === "Balta" ? `LOKĀLĀ TĀME NR.${tameId}` : `TĀMES NR.: ${tameId}`;
      const humanDate = d.toLocaleDateString("lv-LV", { year: "numeric", month: "long", day: "numeric" });

      ws.getCell("A1").value = `Pasūtītājs: ${insurer || "Balta"}`;
      ws.getCell("A2").value = `Objekts: ${locationType || ""}${dwellingSubtype ? " – " + dwellingSubtype : ""}`;
      ws.getCell("A3").value = `Objekta adrese: ${address || ""}`;
      ws.getCell("A8").value = `Rīga, ${humanDate}`;
      ws.getCell("A9").value = `Pamatojums: apdrošināšanas lieta Nr. ${claimNumber || "—"}`;

      ws.getCell("J1").value = "LV GROUP SIA";
      ws.getCell("J2").value = "Reģ. Nr.: LV40003216553";
      ws.getCell("J3").value = "Banka: Luminor";
      ws.getCell("J4").value = "Konts: LV12RIKO0002012345678";

      ws.mergeCells(6, 2, 6, 12);
      const tCell = ws.getCell(6, 2);
      tCell.value = tameTitle;
      tCell.font = { ...FONT, size: 16, bold: true };
      tCell.alignment = { horizontal: "center", vertical: "middle" };

      // Build selections (parents + auto-added children)
      const selections = [];
      roomInstances.forEach((ri) => {
        const list = roomActions[ri.id] || [];
        list.forEach((a) => {
          const qty = parseDec(a.quantity);
          if (!qty) return;

          const parent =
            priceCatalog.find((i) => i.uid === a.itemUid) ||
            priceCatalog.find((i) => i.id === a.itemId);
          if (!parent) return;

          const unit = normalizeUnit(a.unit || parent.unit || "");
          const pLabor = parseDec(a.labor ?? parent.labor ?? 0);
          const pMat   = parseDec(a.materials ?? parent.materials ?? 0);
          const pMech  = parseDec(a.mechanisms ?? parent.mechanisms ?? 0);
          const pSplit = pLabor + pMat + pMech;
          const pUnitPrice = pSplit ? pSplit : parseDec(a.unit_price ?? parent.unit_price ?? 0);

          // Parent row
          selections.push({
            isChild: false,
            room: `${ri.type} ${ri.index}`,
            name: a.itemName || parent.name || "",
            unit,
            qty,
            labor: pLabor,
            materials: pMat,
            mechanisms: pMech,
            unitPrice: pUnitPrice,
          });

          // auto-append children (indented, no numbering)
          const kids = getChildrenFor(parent);
          for (const ch of kids) {
            const cQty    = parseDec(ch.coeff ?? 1) * qty;
            const cLabor  = parseDec(ch.labor ?? 0);
            const cMat    = parseDec(ch.materials ?? 0);
            const cMech   = parseDec(ch.mechanisms ?? 0);
            const cSplit  = cLabor + cMat + cMech;
            const cUprice = cSplit ? cSplit : parseDec(ch.unit_price ?? ch.unit_price_raw ?? 0);

            selections.push({
              isChild: true,
              room: `${ri.type} ${ri.index}`,
              name: ch.name || "",
              unit: normalizeUnit(ch.unit || unit),
              qty: cQty,
              labor: cLabor,
              materials: cMat,
              mechanisms: cMech,
              unitPrice: cUprice,
            });
          }
        });
      });

      if (!selections.length) {
        alert("Nav nevienas pozīcijas ar daudzumu.");
        return;
      }

      // Headers
      const START = 15;
      const HEAD1 = START - 2;
      const HEAD2 = START - 1;
      const COLS  = 12;

      ws.getCell(HEAD1, 1).value = "Nr.";
      ws.getCell(HEAD1, 2).value = "Darbu nosaukums";
      ws.getCell(HEAD1, 3).value = "Mērv.";
      ws.getCell(HEAD1, 4).value = "Daudz.";
      ws.mergeCells(HEAD1, 5, HEAD1, 8);  ws.getCell(HEAD1, 5).value = "Vienības cena, EUR";
      ws.mergeCells(HEAD1, 9, HEAD1, 12); ws.getCell(HEAD1, 9).value = "Summa, EUR";

      ws.getCell(HEAD2, 5).value = "Darbs";
      ws.getCell(HEAD2, 6).value = "Materiāli";
      ws.getCell(HEAD2, 7).value = "Mehānismi";
      ws.getCell(HEAD2, 8).value = "Cena";
      ws.getCell(HEAD2, 9).value = "Darbs";
      ws.getCell(HEAD2,10).value = "Materiāli";
      ws.getCell(HEAD2,11).value = "Mehānismi";
      ws.getCell(HEAD2,12).value = "Kopā";

      for (const rr of [HEAD1, HEAD2]) {
        const row = ws.getRow(rr);
        for (let c = 1; c <= COLS; c++) {
          const cell = row.getCell(c);
          cell.font = { ...FONT, bold: true };
          cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
          cell.fill = headerFill;
          cell.border = borderAll;
        }
        row.height = 22;
      }

      // Data rows
      let r = START, nr = 1;
      let first = null, last = null;

      // group selections by room
      const groups = new Map();
      selections.forEach((s) => {
        if (!groups.has(s.room)) groups.set(s.room, []);
        groups.get(s.room).push(s);
      });

      for (const [roomName, rows] of groups.entries()) {
        // section header
        ws.mergeCells(r, 2, r, 12);
        const sec = ws.getCell(r, 2);
        sec.value = roomName;
        sec.fill = sectionFill;
        sec.font = { ...FONT, bold: true };
        sec.alignment = { wrapText: true, vertical: "middle" };
        sec.border = { bottom: thin };
        ws.getRow(r).height = 18;
        r++;

        for (const s of rows) {
          const row = ws.getRow(r);

          row.getCell(1).value = s.isChild ? "" : nr++;
          row.getCell(2).value = s.isChild ? `    ${s.name}` : s.name;
          row.getCell(3).value = s.unit;
          row.getCell(4).value = s.qty;

          // split (E/F/G) with robust fallback
          const e = Number(s.labor || 0);
          const f = Number(s.materials || 0);
          const g = Number(s.mechanisms || 0);
          const hasSplit = (e + f + g) > 0;

          if (hasSplit) {
            ws.getCell(r, 5).value = e; // E Darbs
            ws.getCell(r, 6).value = f; // F Materiāli
            ws.getCell(r, 7).value = g; // G Mehānismi
          } else {
            // no split -> treat unitPrice as materials (BALTA convention we’re using)
            const fallback = Number(s.unitPrice || 0);
            ws.getCell(r, 5).value = 0;
            ws.getCell(r, 6).value = fallback;
            ws.getCell(r, 7).value = 0;
          }

          // H = E+F+G ; I..L = per split * qty ; L = H * qty
          ws.getCell(r, 8).value  = { formula: `ROUND(SUM(E${r}:G${r}),2)` };
          ws.getCell(r, 9).value  = { formula: `ROUND(E${r}*D${r},2)` };
          ws.getCell(r,10).value  = { formula: `ROUND(F${r}*D${r},2)` };
          ws.getCell(r,11).value  = { formula: `ROUND(G${r}*D${r},2)` };
          ws.getCell(r,12).value  = { formula: `ROUND(H${r}*D${r},2)` };

          row.getCell(4).numFmt = QTY;
          for (const c of [5,6,7,8,9,10,11,12]) row.getCell(c).numFmt = MONEY;

          const isZebra = ((r - START) % 2) === 1;
          for (let c = 1; c <= COLS; c++) {
            const cell = row.getCell(c);
            if (ZEBRA && isZebra) {
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_BG } };
            }
            cell.border = borderAll;
            cell.font = { ...FONT, italic: !!s.isChild };
            cell.alignment = c === 2
              ? { wrapText: true, vertical: "middle" }
              : { vertical: "middle", horizontal: "right" };
          }

          if (first === null) first = r;
          last = r;
          r++;
        }
      }

      const boldCell = (addr) => { ws.getCell(addr).font = { ...FONT, bold: true }; };

      // Totals block
      const rowKopa = r + 1;
      ws.getCell(`B${rowKopa}`).value = "Kopā";
      ws.getCell(`I${rowKopa}`).value = { formula: first ? `SUM(I${first}:I${last})` : "0" };
      ws.getCell(`J${rowKopa}`).value = { formula: first ? `SUM(J${first}:J${last})` : "0" };
      ws.getCell(`K${rowKopa}`).value = { formula: first ? `SUM(K${first}:K${last})` : "0" };
      ws.getCell(`L${rowKopa}`).value = { formula: first ? `SUM(L${first}:L${last})` : "0" };
      for (const c of [9,10,11,12]) ws.getCell(rowKopa, c).numFmt = MONEY;
      boldCell(`B${rowKopa}`);

      const rowTrans = rowKopa + 1;
      ws.getCell(`B${rowTrans}`).value = "Materiālu, grunts apmaiņas un būvgružu transporta izdevumi";
      ws.getCell(`C${rowTrans}`).value = 0.07;
      ws.getCell(`J${rowTrans}`).value = { formula: `ROUND(J${rowKopa}*C${rowTrans},2)` };
      ws.getCell(`L${rowTrans}`).value = { formula: `J${rowTrans}` };
      ws.getCell(`J${rowTrans}`).numFmt = MONEY;
      ws.getCell(`L${rowTrans}`).numFmt = MONEY;

      const rowDirect = rowTrans + 1;
      ws.getCell(`B${rowDirect}`).value = "Tiešās izmaksas kopā";
      ws.getCell(`I${rowDirect}`).value = { formula: `I${rowKopa}` };
      ws.getCell(`J${rowDirect}`).value = { formula: `ROUND(J${rowKopa}+J${rowTrans},2)` };
      ws.getCell(`K${rowDirect}`).value = { formula: `K${rowKopa}` };
      ws.getCell(`L${rowDirect}`).value = { formula: `ROUND(I${rowDirect}+J${rowDirect}+K${rowDirect},2)` };
      for (const c of [9,10,11,12]) ws.getCell(rowDirect, c).numFmt = MONEY;
      boldCell(`B${rowDirect}`);

      const rowOver = rowDirect + 1;
      ws.getCell(`B${rowOver}`).value = "Virsizdevumi";
      ws.getCell(`C${rowOver}`).value = 0.09;
      ws.getCell(`L${rowOver}`).value = { formula: `ROUND(L${rowDirect}*C${rowOver},2)` };
      ws.getCell(`L${rowOver}`).numFmt = MONEY;

      const rowProfit = rowOver + 1;
      ws.getCell(`B${rowProfit}`).value = "Peļņa";
      ws.getCell(`C${rowProfit}`).value = 0.07;
      ws.getCell(`L${rowProfit}`).value = { formula: `ROUND(L${rowDirect}*C${rowProfit},2)` };
      ws.getCell(`L${rowProfit}`).numFmt = MONEY;

      const rowDDSN = rowProfit + 1;
      ws.getCell(`B${rowDDSN}`).value = "Darba devēja sociālais nodoklis";
      ws.getCell(`C${rowDDSN}`).value = 0.2359;
      ws.getCell(`I${rowDDSN}`).value = { formula: `ROUND(I${rowKopa}*C${rowDDSN},2)` };
      ws.getCell(`L${rowDDSN}`).value = { formula: `I${rowDDSN}` };
      ws.getCell(`I${rowDDSN}`).numFmt = MONEY;
      ws.getCell(`L${rowDDSN}`).numFmt = MONEY;

      const rowTotal = rowDDSN + 1;
      ws.getCell(`B${rowTotal}`).value = "Kopējās izmaksas";
      ws.getCell(`L${rowTotal}`).value = { formula: `ROUND(L${rowDirect}+L${rowOver}+L${rowProfit}+L${rowDDSN},2)` };
      ws.getCell(`L${rowTotal}`).numFmt = MONEY;
      boldCell(`B${rowTotal}`); boldCell(`L${rowTotal}`);

      const rowPVN = rowTotal + 1;
      ws.getCell(`B${rowPVN}`).value = "PVN";
      ws.getCell(`C${rowPVN}`).value = 0.21;
      ws.getCell(`L${rowPVN}`).value = { formula: `ROUND(L${rowTotal}*C${rowPVN},2)` };
      ws.getCell(`L${rowPVN}`).numFmt = MONEY;

      const rowGrand = rowPVN + 1;
      ws.getCell(`B${rowGrand}`).value = "Pavisam kopā";
      ws.getCell(`L${rowGrand}`).value = { formula: `ROUND(L${rowTotal}+L${rowPVN},2)` };
      ws.getCell(`L${rowGrand}`).numFmt = MONEY;
      boldCell(`B${rowGrand}`); boldCell(`L${rowGrand}`);

      ws.getCell("J9").value = "Tāmes summa euro :";
      ws.getCell("L9").value = { formula: `L${rowTotal}` }; ws.getCell("L9").numFmt = MONEY;
      ws.getCell("J10").value = "PVN 21%:";            ws.getCell("L10").value = { formula: `L${rowPVN}` };  ws.getCell("L10").numFmt = MONEY;
      ws.getCell("J11").value = "Pavisam kopā euro:";  ws.getCell("L11").value = { formula: `L${rowGrand}` }; ws.getCell("L11").numFmt = MONEY;

      const sumRows = [rowKopa,rowTrans,rowDirect,rowOver,rowProfit,rowDDSN,rowTotal,rowPVN,rowGrand];
      for (const rr of sumRows) {
        for (let c = 1; c <= COLS; c++) {
          const cell = ws.getCell(rr, c);
          cell.border = borderAll;
          cell.font = { ...FONT, bold: cell.font?.bold || false };
          cell.alignment = c === 2 ? { wrapText: true, vertical: "middle" } : { vertical: "middle", horizontal: "right" };
        }
      }

      // Notes
      const notesTitleRow = rowGrand + 3;
      ws.getCell(`B${notesTitleRow}`).value = "Piezīmes:";
      ws.getCell(`B${notesTitleRow}`).font = { ...FONT, bold: true };
      ws.mergeCells(notesTitleRow, 2, notesTitleRow, 12);

      const notes = [
        "1. Tāmes derīguma termiņš – 1 mēnesis.",
        "2. Tāme sastādīta provizoriski, atbilstoši bojātā īpašuma apskates protokolam un bildēm.",
        "3. Iespējami slēpti defekti, kuri atklāsies remontdarbu laikā.",
        `4. Tāme ir sagatavota elektroniski un ir autorizēta ar Nr.${tameId}.`,
      ];

      let rowN = notesTitleRow + 1;
      for (const line of notes) {
        ws.mergeCells(rowN, 2, rowN, 12);
        const c = ws.getCell(rowN, 2);
        c.value = line;
        c.font = FONT;
        c.alignment = { wrapText: true, vertical: "top" };
        rowN++;
      }

      const extraNotes = roomInstances.map((ri) => (ri.note || "").trim()).filter(Boolean);
      for (const n of extraNotes) {
        ws.mergeCells(rowN, 2, rowN, 12);
        const c = ws.getCell(rowN, 2);
        c.value = n;
        c.font = FONT;
        c.alignment = { wrapText: true, vertical: "top" };
        rowN++;
      }

      // SASTĀDĪJA / SASKAŅOTS
      const blockStart = rowN + 2;
      ws.mergeCells(blockStart, 2, blockStart, 6);
      ws.getCell(blockStart, 2).value = "SASTĀDĪJA:";
      ws.getCell(blockStart, 2).font = { ...FONT, bold: true };

      ws.getCell(blockStart + 1, 2).value = "Būvkomersanta Nr.:";
      ws.mergeCells(blockStart + 1, 3, blockStart + 1, 6);
      ws.getCell(blockStart + 2, 2).value = "Vārds, uzvārds:";
      ws.mergeCells(blockStart + 2, 3, blockStart + 2, 6);
      ws.getCell(blockStart + 3, 2).value = "sert. nr.:";
      ws.mergeCells(blockStart + 3, 3, blockStart + 3, 6);

      const rightOrg = insurer === "Balta" ? "AAS BALTA" : insurer || "";
      ws.mergeCells(blockStart, 9, blockStart, 12);
      ws.getCell(blockStart, 9).value = "SASKAŅOTS:";
      ws.getCell(blockStart, 9).font = { ...FONT, bold: true };

      ws.mergeCells(blockStart + 1, 9, blockStart + 1, 12);
      ws.getCell(blockStart + 1, 9).value = rightOrg;
      ws.mergeCells(blockStart + 2, 9, blockStart + 2, 12);
      ws.getCell(blockStart + 2, 9).value = "";

      // Column widths
      const baseW = [6, 56, 12, 10, 14, 14, 14, 14, 16, 16, 16, 18];
      for (let c = 1; c <= 12; c++) ws.getColumn(c).width = baseW[c - 1];

      // finalize
      wb.removeWorksheet(src.id);
      ws.name = "Tāme";

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Tame_Balta_${prettyDate()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel export error:", err);
      alert("Neizdevās izveidot Excel failu. Skaties konsolē kļūdu.");
    }
  }

  /* ---------- Input helpers (stable) ---------- */
  const onText = useCallback((setter) => (e) => setter(e.target.value), []);
  const onNum  = useCallback((setter) => (e) => setter(e.target.value), []);

  const progressPct = Math.round(((step - 1) / (totalSteps - 1)) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "#f7fafc", color: "#111827" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        {/* Lietas Nr. */}
        <div style={{ background: "white", padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <LabeledRow label="Lietas Nr.">
            <input
              value={claimNumber ?? ""}
              onChange={onText(setClaimNumber)}
              placeholder="piem., CLV1234567"
              autoComplete="off"
              spellCheck={false}
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
            />
          </LabeledRow>
        </div>

    <header style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
  <div>
    <div style={{ fontSize: 22, fontWeight: 800 }}>Apskates forma – solis {step}/{totalSteps}</div>
    <div style={{ fontSize: 13, color: "#4b5563" }}>
      Tāmētājs ievada tikai daudzumu. Cenas netiek rādītas formā un parādīsies tikai gala tāmē.
    </div>
  </div>
</header>


        {/* Progress bar */}
        <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999, marginBottom: 16 }}>
          <div style={{ width: `${progressPct}%`, height: 8, background: "#10b981", borderRadius: 999 }} />
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <StepShell title="1. Objekta adrese">
            <LabeledRow label="Objekta adrese">
              <input
                value={address ?? ""}
                onChange={onText(setAddress)}
                placeholder="Iela 1, Pilsēta"
                autoComplete="off"
                spellCheck={false}
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
              />
            </LabeledRow>
          </StepShell>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <StepShell title="2. Apdrošināšanas kompānija">
            <LabeledRow label="Izvēlies kompāniju">
              <select
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
              >
                {INSURERS.map((i) => (<option key={i} value={i}>{i}</option>))}
              </select>
            </LabeledRow>
            {insurer === "Balta" && (
              <div style={{ fontSize: 12, color: catalogError ? "#b91c1c" : "#065f46" }}>
                {catalogError ? catalogError
                  : priceCatalog.length ? `Ielādēts BALTA cenrādis (${priceCatalog.length} pozīcijas)`
                  : "Notiek BALTA cenrāža ielāde..."}
              </div>
            )}
            {insurer === "Gjensidige" && (
  <div style={{ fontSize: 12, color: catalogError ? "#b91c1c" : "#065f46" }}>
    {catalogError ? catalogError
      : priceCatalog.length ? `Ielādēts GJENSIDIGE cenrādis (${priceCatalog.length} pozīcijas)`
      : "Notiek GJENSIDIGE cenrāža ielāde..."}
  </div>
            )}
  {insurer === "Swedbank" && (
  <div style={{ fontSize: 12, color: catalogError ? "#b91c1c" : "#065f46" }}>
    {catalogError ? catalogError
      : priceCatalog.length ? `Ielādēts SWEDBANK cenrādis (${priceCatalog.length} pozīcijas)`
      : "Notiek SWEDBANK cenrāža ielāde..."}
  </div>
)}

          </StepShell>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <StepShell title="3. Kur notika negadījums?">
            <LabeledRow label="Vieta">
              <select
                value={locationType}
                onChange={(e) => setLocationType(e.target.value)}
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
              >
                <option value="">— Izvēlies —</option>
                {LOCATION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </LabeledRow>
            {locationType === "Dzīvojamā ēka" && (
              <>
                <LabeledRow label="3.1. Dzīvojamās ēkas tips">
                  <select
                    value={dwellingSubtype}
                    onChange={(e) => setDwellingSubtype(e.target.value)}
                    style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
                  >
                    <option value="">— Izvēlies —</option>
                    {DWELLING_SUBTYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </LabeledRow>
                {dwellingSubtype === "Cits" && (
                  <LabeledRow label="3.1.1. Norādi">
                    <input
                      value={dwellingOther ?? ""}
                      onChange={onText(setDwellingOther)}
                      placeholder="NI tips"
                      autoComplete="off"
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
                    />
                  </LabeledRow>
                )}
              </>
            )}
          </StepShell>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <StepShell title="4. Kas notika ar nekustamo īpašumu?">
            <LabeledRow label="Notikuma veids">
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
              >
                <option value="">— Izvēlies —</option>
                {INCIDENT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </LabeledRow>
            {incidentType === "Cits" && (
              <LabeledRow label="4.1. Norādi">
                <input
                  value={incidentOther ?? ""}
                  onChange={onText(setIncidentOther)}
                  placeholder="Notikuma apraksts"
                  autoComplete="off"
                  style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
                />
              </LabeledRow>
            )}
          </StepShell>
        )}

        {/* Step 5 */}
        {step === 5 && (
          <StepShell title="5. Elektrības traucējumi">
            <LabeledRow label="Elektrības traucējumi">
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 16 }}>
                <input type="radio" name="el" checked={electricity === "Jā"} onChange={() => setElectricity("Jā")} /> Ir
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input type="radio" name="el" checked={electricity === "Nē"} onChange={() => setElectricity("Nē")} /> Nav
              </label>
            </LabeledRow>
          </StepShell>
        )}

        {/* Step 6 */}
        {step === 6 && (
          <StepShell title="6. Vai nepieciešama žāvēšana?">
            <LabeledRow label="Žāvēšana">
              {YES_NO.map((yn) => (
                <label key={yn} style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 16 }}>
                  <input type="radio" name="dry" checked={needsDrying === yn} onChange={() => setNeedsDrying(yn)} /> {yn}
                </label>
              ))}
            </LabeledRow>
          </StepShell>
        )}

        {/* Step 7 */}
        {step === 7 && (
          <StepShell title="7. Vai bojāts kopīpašums?">
            <LabeledRow label="Kopīpašums">
              {YES_NO.map((yn) => (
                <label key={yn} style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 16 }}>
                  <input type="radio" name="common" checked={commonPropertyDamaged === yn} onChange={() => setCommonPropertyDamaged(yn)} /> {yn}
                </label>
              ))}
            </LabeledRow>
          </StepShell>
        )}

        {/* Step 8 */}
        {step === 8 && (
          <StepShell title="8. Zaudējuma novērtējums pēc klienta vārdiem">
            <LabeledRow label="Vai ir zināma summa?">
              {YES_NO.map((yn) => (
                <label key={yn} style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 16 }}>
                  <input type="radio" name="loss" checked={lossKnown === yn} onChange={() => setLossKnown(yn)} /> {yn}
                </label>
              ))}
            </LabeledRow>
            {lossKnown === "Jā" && (
              <LabeledRow label="Summa EUR">
                <input
                  type="number" inputMode="decimal" step="0.01"
                  value={lossAmount ?? ""} onChange={onNum(setLossAmount)}
                  autoComplete="off"
                  style={{ width: 200, border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
                  placeholder="€ summa"
                />
              </LabeledRow>
            )}
          </StepShell>
        )}

        {/* Step 9 */}
        {step === 9 && (
          <StepShell title="9. Izvēlies telpu/as, kas tika bojātas">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
              {ROOM_TYPES.map((rt) => (
                <div key={rt} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                  <label style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={rooms[rt].checked}
                      onChange={(e) => setRooms({ ...rooms, [rt]: { ...rooms[rt], checked: e.target.checked } })}
                    />
                    {rt}
                  </label>
                  {rooms[rt].checked && (
                    <div style={{ marginTop: 8 }}>
                      {rt === "Cits" && (
                        <input
                          value={String(rooms[rt].custom ?? "")}
                          onChange={(e) => setRooms({ ...rooms, [rt]: { ...rooms[rt], custom: e.currentTarget.value } })}
                          placeholder="Telpas nosaukums"
                          autoComplete="off"
                          style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, marginBottom: 8 }}
                        />
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>Daudzums:</span>
                        <input
                          type="number" min={1} value={rooms[rt].count}
                          onChange={(e) => setRooms({ ...rooms, [rt]: { ...rooms[rt], count: Math.max(1, Number(e.target.value || 1)) } })}
                          style={{ width: 90, border: "1px solid #e5e7eb", borderRadius: 10, padding: 6 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </StepShell>
        )}

        {/* Step 10 */}
        {step === 10 && (
          <StepShell title="10. Izvēlētās telpas">
            {roomInstances.length === 0 ? (
              <div style={{ color: "#6b7280" }}>Nav izvēlētas telpas 9. solī.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
                {roomInstances.map((ri) => {
                  const count = (roomActions[ri.id] || []).filter((a) => a.itemUid && a.quantity).length;
                  const suggested = suggestedCategoriesFor(ri.id);
                  return (
                    <div key={ri.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f9fafb" }}>
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontWeight: 700 }}>{ri.type} {ri.index}</div>
                        <button
                          type="button" onClick={() => removeRoomInstance(ri.id)} title="Dzēst telpu"
                          style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white" }}
                        >Dzēst</button>
                      </div>

                      <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 8 }}>Pozīcijas: {count}</div>

                      {suggested.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                          {suggested.map((c) => (<span key={c} style={{ background: "#e5e7eb", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>{c}</span>))}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          type="button" onClick={() => { setEditingRoomId(ri.id); setStep(11); }}
                          style={{ padding: "8px 12px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}
                        >
                          Atvērt
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {roomInstances.length > 0 && (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button" onClick={() => setStep(9)}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white" }}
                >
                  + Pievienot vēl telpu
                </button>

                {roomInstances.every((ri) => (roomActions[ri.id] || []).some((a) => a.itemUid && a.quantity)) && (
                  <button
                    type="button" onClick={exportToExcel}
                    style={{ padding: "12px 16px", borderRadius: 12, background: "#059669", color: "white", border: 0 }}
                  >
                    Viss pabeigts — izveidot tāmi
                  </button>
                )}
              </div>
            )}
          </StepShell>
        )}

        {/* Step 11 */}
        {step === 11 && editingRoomId && (
          <StepShell
            title={`11. Pozīcijas un apjomi – ${roomInstances.find((r) => r.id === editingRoomId)?.type} ${roomInstances.find((r) => r.id === editingRoomId)?.index}`}
          >
            <LabeledRow label="Piezīmes">
              <input
                value={roomInstances.find((r) => r.id === editingRoomId)?.note ?? ""}
                onChange={(e) => setRoomNote(editingRoomId, e.target.value)}
                placeholder="Papildus informācija"
                autoComplete="off"
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
              />
            </LabeledRow>

            <div style={{ fontWeight: 700, margin: "12px 0 6px" }}>Pozīcijas un apjomi</div>
            {(roomActions[editingRoomId] || [
              { category: "", itemUid: "", itemId: "", itemName: "", quantity: "", unit: "", unit_price: null },
            ]).map((row, idx) => {
              return (
                <div
                  key={idx}
                  style={{ display: "grid", gridTemplateColumns: "1.1fr 2.2fr 1fr 0.8fr auto", gap: 8, alignItems: "end", marginBottom: 8 }}
                >
                  {/* Kategorija */}
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>Kategorija</div>
                    <select
                      value={row.category ?? ""}
                      onChange={(e) => setRowCategory(editingRoomId, idx, e.target.value)}
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
                    >
                      <option value="">— visas —</option>
                      {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </div>

                  {/* Pozīcija (parents only) */}
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>Pozīcija</div>
<select
  value={row.itemUid ?? ""}
  onChange={(e) => setRowItem(editingRoomId, idx, e.target.value)}
  style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
>
  <option value="">— izvēlies pozīciju —</option>
  {priceCatalog
    .filter((it) => {
      if (insurer === "Gjensidige") {
        const nName = normTxt(it.name);
        if (GJ_GROUP_BLACKLIST.has(nName)) return false;
        if (gjChildOnlyNames.has(nName)) return false;
      }

      const categoryMatches =
        !row.category ||
        it.category === row.category ||
        it.subcategory === row.category;

      return (
        categoryMatches &&
        !isChildItem(it) &&
        !it.is_section
      );
    })
    .map((it) => (
      <option key={it.uid} value={it.uid}>
        {insurer !== "Swedbank" && it.subcategory ? `[${it.subcategory}] ` : ""}
        {it.name} · {it.unit || "—"}
      </option>
    ))}
</select>

                  </div>

                  {/* Mērv. */}
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>Mērv.</div>
                    <select
                      value={normalizeUnit(row.unit) || ""}
                      onChange={(e) => setRowField(editingRoomId, idx, "unit", normalizeUnit(e.target.value))}
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
                    >
                      <option value="">—</option>
                      {allUnits.map((u) => (<option key={u} value={u}>{u}</option>))}
                    </select>
                  </div>

                  {/* Daudz. */}
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>Daudz.</div>
                    <input
                      type="number" min={0} step="0.01"
                      value={row.quantity ?? ""}
                      onChange={(e) => setRowField(editingRoomId, idx, "quantity", e.target.value)}
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
                      autoComplete="off" placeholder="Skaitlis"
                    />
                  </div>

                  {/* Pogas */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                    <button
                      type="button" onClick={() => addActionRow(editingRoomId, row.category || "")}
                      style={{ padding: "8px 12px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}
                    >
                      + Rinda
                    </button>
                    <button
                      type="button" onClick={() => removeActionRow(editingRoomId, idx)}
                      style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white" }}
                    >
                      Dzēst
                    </button>
                    <button
                      type="button" onClick={() => { setEditingRoomId(null); setStep(9); }}
                      style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#111827" }}
                    >
                      + Pievienot vēl telpu
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button
                type="button"
                onClick={() => { setEditingRoomId(null); setStep(10); }}
                style={{ padding: "10px 14px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}
              >
                Saglabāt un atgriezties
              </button>
            </div>
          </StepShell>
        )}

        {/* Navigation bar (hide default on steps 10 & 11) */}
        {[1,2,3,4,5,6,7,8,9,12].includes(step) && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <button
              type="button" onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: step === 1 ? "#f3f4f6" : "white", color: "#111827" }}
            >
              ← Atpakaļ
            </button>
            <button
              type="button" onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
              disabled={!stepValid || step === totalSteps}
              style={{ padding: "10px 14px", borderRadius: 10, background: !stepValid || step === totalSteps ? "#9ca3af" : "#111827", color: "white", border: 0 }}
            >
              {step === totalSteps ? "Beigas" : "Tālāk →"}
            </button>
          </div>
        )}

        {/* Saved estimates */}
        <div style={{ background: "white", padding: 16, borderRadius: 12, marginTop: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Saglabātās tāmēs (šajā pārlūkā)</div>
          {saved.length === 0 ? (
            <div style={{ color: "#6b7280" }}>Vēl nav saglabātu tāmju.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "8px 12px" }}>Fails</th>
                    <th style={{ padding: "8px 12px" }}>Tāmētājs</th>
                    <th style={{ padding: "8px 12px" }}>Datums</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
                        {e.filename}
                      </td>
                      <td style={{ padding: "8px 12px" }}>{e.estimator}</td>
                      <td style={{ padding: "8px 12px" }}>{new Date(e.createdAtISO).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer style={{ paddingBottom: 40, marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          Piezīme: forma nerāda apakšpozīcijas; Excel tās pievieno automātiski (saites, iebūvētie vai blakus esošie).
        </footer>
      </div>
    </div>
  );
}
