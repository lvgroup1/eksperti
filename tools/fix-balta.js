// tools/fix-balta.js
const fs = require("fs");
const path = require("path");

// Ceļi
const IN = path.join(process.cwd(), "public/prices/balta.json");
const OUT = path.join(process.cwd(), "public/prices/balta.v2.json");

// Kategoriju kodi ID ģenerēšanai
const CAT_CODES = new Map([
  ["Jumts, pārsegums", "ROOF"],
  ["Griesti", "CEILING"],
  ["Sienas, starpsienas", "WALL"],
  ["Grīdas", "FLOOR"],
  ["Logi un durvis", "WINDOW"],
  ["Fasāde", "FACADE"],
  ["Inžen.komun.darbi", "MEP"],
  ["Iekartas", "EQUIP"],
  ["Sagat.un uzkopš.darbi", "PREP"],
  ["Sīkie remonta darbi", "SMALL"],
]);

// Mērvienību normalizācija
function normUnit(u) {
  if (!u) return "";
  const x = String(u).toLowerCase()
    .replace(/\s+/g, "")
    .replace("²", "2")
    .replace("m\u00b2", "m2")
    .replace("m²", "m2")
    .replace("m³", "m3");
  if (x === "gb." || x === "gab." || x === "gab") return "gab";
  if (x === "kpl." || x === "kpl") return "kpl";
  if (x === "m2" || x === "m^2") return "m2";
  if (x === "m3" || x === "m^3") return "m3";
  if (x === "m") return "m";
  if (x === "obj." || x === "obj") return "obj";
  if (x === "c/h") return "c/h";
  if (x === "diena" || x === "d.") return "diena";
  return x; // default
}

// Unikālu ID ģenerators
function makeIdGen() {
  const counters = new Map(); // code -> next int
  return (category, seedName) => {
    const code = CAT_CODES.get(category) || "GEN";
    const n = (counters.get(code) || 0) + 1;
    counters.set(code, n);
    return `${code}:${String(n).padStart(3, "0")}`;
  };
}
const nextId = makeIdGen();

// Nolasa ievadi
const src = JSON.parse(fs.readFileSync(IN, "utf8"));
if (!Array.isArray(src.items)) {
  throw new Error("balta.json nav pareizā formātā: nav 'items' masīvs");
}

// Dublētu ID detektēšana
const seenIds = new Set();

// Konvertē katru pozīciju
const items = src.items.map((raw) => {
  const category = raw.category?.trim() || "Nezināma kategorija";
  let id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  const unit = normUnit(raw.unit);

  // E/F/G: ja nav, tad labor = unit_price; F,G = 0
  const hasEFG = ["labor","materials","mechanisms"].some(k => raw[k] != null);
  const labor = hasEFG ? Number(raw.labor || 0) : Number(raw.unit_price || 0);
  const materials = hasEFG ? Number(raw.materials || 0) : 0;
  const mechanisms = hasEFG ? Number(raw.mechanisms || 0) : 0;

  // ID – ja dublikāts vai tukšs, ģenerē jaunu
  if (!id || seenIds.has(id)) id = nextId(category, name);
  seenIds.add(id);

  // Components (BOM) ja bija
  let components = Array.isArray(raw.components) ? raw.components : undefined;

  return {
    id,
    category,
    name,
    unit,
    labor: Number.isFinite(labor) ? labor : 0,
    materials: Number.isFinite(materials) ? materials : 0,
    mechanisms: Number.isFinite(mechanisms) ? mechanisms : 0,
    unit_price: Number((labor + materials + mechanisms).toFixed(2)),
    ...(components ? { components } : {})
  };
});

// Pievieno BOM bērnu pozīcijas (ja vajag) un sasaista ar montāžu
function ensureItem(id, category, name, unit, { labor = 0, materials = 0, mechanisms = 0 }) {
  if (items.some(it => it.id === id)) return;
  items.push({
    id, category, name, unit,
    labor, materials, mechanisms,
    unit_price: Number((labor + materials + mechanisms).toFixed(2))
  });
}

// Definē saidinga bērnus (piem., materiālu izmaksas)
ensureItem("FACADE:SAIDING-BOARD", "Fasāde", "Saidinga dēļi", "m2", { materials: 9.20 });
ensureItem("FACADE:SAIDING-ELEMENTS", "Fasāde", "Saidinga elementi", "m2", { materials: 3.40 });
ensureItem("FACADE:SCREW-SP27DZ-4.2x45", "Fasāde", "Pašvītņojošās skrūves Sp27Dz 4.2×45", "gab", { materials: 0.06 });

// Atrodi montāžas pozīciju un piesaisti BOM (1 m2 -> 1/1/15 gab)
items.forEach((it) => {
  if (it.name.toLowerCase().includes("plastikāta apdares dēlīšu") &&
      it.name.toLowerCase().includes("montāža") &&
      it.category === "Fasāde") {
    it.components = [
      { id: "FACADE:SAIDING-BOARD", multiplier: 1 },
      { id: "FACADE:SAIDING-ELEMENTS", multiplier: 1 },
      { id: "FACADE:SCREW-SP27DZ-4.2x45", multiplier: 15 }
    ];
  }
});

// Galvene
const out = {
  insurer: "Balta",
  version: (src.version ? String(src.version) : "2024-08-27") + "+v2",
  currency: src.currency || "EUR",
  items
};

// Saglabā
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), "utf8");
console.log(`✅ Uzrakstīts: ${OUT} (pozīcijas: ${items.length})`);
