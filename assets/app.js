// ✅ CONFIG (change only if you rename repo)
const CONFIG = {
  repoOwner: "sagearthstudio",
  repoName: "smart-home-finds",
  pinterestUrl: "#",
  instagramUrl: "#",
  linktreeUrl: "#",
  shopUrl: "#",
  productsJsonPath: "data/products.json"
};

const els = {
  grid: document.getElementById("productGrid"),
  chips: document.getElementById("categoryChips"),
  search: document.getElementById("searchInput"),
  year: document.getElementById("year"),
  addBtn: document.getElementById("addProductBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  clearCacheLink: document.getElementById("clearCacheLink"),
  btnPinterest: document.getElementById("btnPinterest"),
  btnInstagram: document.getElementById("btnInstagram"),
  btnLinktree: document.getElementById("btnLinktree"),
  btnShop: document.getElementById("btnShop"),
};

let state = {
  all: [],
  category: "All",
  search: ""
};

function escapeHtml(s=""){
  return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function uniq(arr){
  return [...new Set(arr)];
}

function normalize(s=""){
  return s.toLowerCase().trim();
}

function buildIssueLink(){
  // Issue forms open link
  return `https://github.com/${CONFIG.repoOwner}/${CONFIG.repoName}/issues/new?template=add-product.yml`;
}

async function loadProducts(){
  // ✅ Force fresh fetch (prevents stale data)
  const url = `${CONFIG.productsJsonPath}?v=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to load ${CONFIG.productsJsonPath}: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

function renderChips(){
  const categories = uniq(["All", ...state.all.map(p => p.category).filter(Boolean)]);
  els.chips.innerHTML = categories.map(c => {
    const active = c === state.category ? "active" : "";
    return `<button class="chip ${active}" data-cat="${escapeHtml(c)}" type="button">${escapeHtml(c)}</button>`;
  }).join("");

  els.chips.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => {
      state.category = btn.getAttribute("data-cat") || "All";
      render();
    });
  });
}

function matches(p){
  const byCat = state.category === "All" || normalize(p.category) === normalize(state.category);
  const q = normalize(state.search);
  if(!q) return byCat;

  const hay = [
    p.title,
    p.category,
    (p.tags || []).join(" "),
    p.pinUrl,
    p.url
  ].filter(Boolean).join(" ").toLowerCase();

  return byCat && hay.includes(q);
}

function render(){
  renderChips();

  const items = state.all
    .filter(matches)
    .sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  if(items.length === 0){
    els.grid.innerHTML = `
      <div class="card">
        <div class="cardBody">
          <h3 class="cardTitle">No results</h3>
          <div class="tags">Try another category or different keywords.</div>
        </div>
      </div>
    `;
    return;
  }

  els.grid.innerHTML = items.map(p => {
    const title = escapeHtml(p.title || "Untitled product");
    const img = escapeHtml(p.image || "");
    const cat = escapeHtml(p.category || "Uncategorized");
    const tags = (p.tags || []).slice(0,10).map(t => `#${escapeHtml(t)}`).join(" ");
    const openUrl = escapeHtml(p.url || p.pinUrl || "#");

    return `
      <article class="card">
        ${img
          ? `<img class="cardImg" src="${img}" alt="${title}" loading="lazy" />`
          : `<div class="cardImg"></div>`
        }
        <div class="cardBody">
          <div class="badges">
            <span class="badge badgeAccent">${cat}</span>
            ${p.pinUrl ? `<span class="badge">Pinterest</span>` : ``}
          </div>
          <h3 class="cardTitle">${title}</h3>
          <div class="tags">${tags || ""}</div>
          <div class="cardActions">
            <a class="openBtn" href="${openUrl}" target="_blank" rel="noopener">Open</a>
            ${p.pinUrl ? `<a class="pill" style="padding:10px 12px" href="${escapeHtml(p.pinUrl)}" target="_blank" rel="noopener">Pin</a>` : ``}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

async function init(){
  els.year.textContent = new Date().getFullYear();

  // Social links (fill later)
  els.btnPinterest.href = CONFIG.pinterestUrl;
  els.btnInstagram.href = CONFIG.instagramUrl;
  els.btnLinktree.href = CONFIG.linktreeUrl;
  els.btnShop.href = CONFIG.shopUrl;

  els.addBtn.addEventListener("click", () => {
    window.open(buildIssueLink(), "_blank");
  });

  els.refreshBtn.addEventListener("click", async () => {
    await boot(true);
  });

  els.search.addEventListener("input", () => {
    state.search = els.search.value || "";
    render();
  });

  els.clearCacheLink.addEventListener("click", async (e) => {
    e.preventDefault();
    // Clear SW caches if present
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    alert("Cache cleared. Now reload the page.");
  });

  await boot(false);
}

async function boot(fromRefresh){
  try{
    const items = await loadProducts();
    state.all = items;
    if(fromRefresh) {
      // keep category/search
    } else {
      state.category = "All";
      state.search = "";
      els.search.value = "";
    }
    render();
  } catch(err){
    els.grid.innerHTML = `
      <div class="card">
        <div class="cardBody">
          <h3 class="cardTitle">Error loading products</h3>
          <div class="tags">${escapeHtml(String(err.message || err))}</div>
          <div class="tags">Tip: after GitHub Actions updates products.json, try ↻ Refresh or clear cache.</div>
        </div>
      </div>
    `;
  }
}

init();
