import fs from "node:fs";

function pickSection(body, heading){
  const safe = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`###\\s+${safe}\\s*\\n+([\\s\\S]*?)(?=\\n###\\s+|\\n$)`, "i");
  const m = body.match(re);
  if(!m) return "";
  let v = (m[1] || "").trim();
  v = v.replace(/\r/g, "").trim();
  if (v.toLowerCase() === "no response") return "";
  return v;
}

function firstLine(s=""){
  return (s.split("\n").map(x => x.trim()).filter(Boolean)[0] || "").trim();
}

function cleanTitle(issueTitle=""){
  // "Add product: Something" -> "Something"
  const t = issueTitle.replace(/^add product:\s*/i, "").trim();
  return t || issueTitle.trim();
}

function normalizeUrl(u=""){
  return u.trim();
}

function parseTags(s=""){
  const raw = s.split(",").map(x => x.trim()).filter(Boolean);
  // normalize: remove #, spaces -> dash
  return raw.map(t => t.replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase()).slice(0, 18);
}

function nextId(items){
  // p-0001, p-0002...
  const nums = items
    .map(i => (i.id || "").match(/^p-(\d+)$/i))
    .filter(Boolean)
    .map(m => Number(m[1] || 0))
    .filter(n => Number.isFinite(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `p-${String(n).padStart(4, "0")}`;
}

const issueTitle = process.env.ISSUE_TITLE || "";
const issueBody = process.env.ISSUE_BODY || "";

const pinUrl = normalizeUrl(firstLine(pickSection(issueBody, "Pinterest Pin URL")));
const affiliateUrl = normalizeUrl(firstLine(pickSection(issueBody, "Destination / Affiliate URL (optional)")));
const imageUrl = normalizeUrl(firstLine(pickSection(issueBody, "Image URL (optional)")));
const formTitle = firstLine(pickSection(issueBody, "Title (optional)"));
const category = firstLine(pickSection(issueBody, "Category")) || "Accessories";
const tagsRaw = firstLine(pickSection(issueBody, "Tags (comma separated)"));

if(!pinUrl){
  console.error("Missing Pinterest Pin URL. Aborting.");
  process.exit(1);
}

const filePath = "data/products.json";
const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
const items = Array.isArray(json.items) ? json.items : [];

const already = items.find(p => (p.pinUrl || "") === pinUrl);
if(already){
  console.log("Product already exists for this pinUrl. No change.");
  process.exit(0);
}

const now = new Date().toISOString();
const title = formTitle || cleanTitle(issueTitle) || "New Product";

const product = {
  id: nextId(items),
  title,
  pinUrl,
  url: affiliateUrl || pinUrl,
  image: imageUrl || "",
  category,
  tags: parseTags(tagsRaw),
  createdAt: now
};

json.updatedAt = now;
json.items = [product, ...items];

fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + "\n", "utf8");
console.log("Added product:", product.id);
