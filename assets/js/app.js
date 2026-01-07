const CONFIG = {
  brandName: "Smart Home Finds",
  links: {
    pinterest: "https://www.pinterest.com/",
    instagram: "https://www.instagram.com/",
    linktree: "https://linktr.ee/",
    shop: "https://www.amazon.com/",
  },
  // IMPORTANT: replace with your repo URL once created
  addProductIssueUrl: "https://github.com/<YOUR_USER>/<YOUR_REPO>/issues/new?template=add-product.yml",
  dataUrl: "data/products.json",
  categories: ["All","Candles","Wall Art","Furniture","Gifts","Accessories","Kitchen","Bathroom","Other"]
};

let state = {
  products: [],
  filtered: [],
  query: "",
  category: "All",
  sort: "newest", // newest | az
};

const els = {
  year: document.getElementById("year"),
  btnPinterest: document.getElementById("btnPinterest"),
  btnInstagram: document.getElementById("btnInstagram"),
  btnLinktree: document.getElementById("btnLinktree"),
  btnShop: document.getElementById("btnShop"),
  btnAddProduct: document.getElementById("btnAddProduct"),
  searchInput: document.getElementById("searchInput"),
  chips: document.getElementById("categoryChips"),
  grid: document.getElementById("productsGrid"),
  empty: document.getElementById("emptyState"),
  resultsCount: document.getElementById("resultsCount"),
  disclosureBtn: document.getElementById("disclosureBtn"),
  disclosurePanel: document.getElementById("disclosurePanel"),
  sortNewest: document.getElementById("sortNewest"),
  sortAZ: document.getElementById("sortAZ"),
};

function setTopLinks(){
  els.btnPinterest.href = CONFIG.links.pinterest;
  els.btnInstagram.href = CONFIG.links.instagram;
  els.btnLinktree.href = CONFIG.links.linktree;
  els.btnShop.href = CONFIG.links.shop;
  els.btnAddProduct.href = CONFIG.addProductIssueUrl;
}

function buildChips(){
  els.chips.innerHTML = "";
  CONFIG.categories.forEach(cat => {
    const b = document.createElement("button");
    b.className = "chip" + (cat === state.category ? " active" : "");
    b.textContent = cat;
    b.addEventListener("click", () => {
      state.category = cat;
      update();
      highlightChips();
    });
    els.chips.appendChild(b);
  });
}

function highlightChips(){
  [...els.chips.children].forEach(btn => {
    btn.classList.toggle("active", btn.textContent === state.category);
  });
}

function norm(s){
  return (s || "").toString().toLowerCase().trim();
}

function applyFilters(){
  const q = norm(state.query);
  const cat = state.category;

  let list = [...state.products];

  if(cat && cat !== "All"){
    list = list.filter(p => (p.category || "Other") === cat);
  }

  if(q){
    list = list.filter(p => {
      const hay = [
        p.title, p.description, p.category,
        (p.tags || []).join(" ")
      ].map(norm).join(" | ");
      return hay.includes(q);
    });
  }

  // sorting
  if(state.sort === "az"){
    list.sort((a,b) => norm(a.title).localeCompare(norm(b.title)));
  } else {
    // newest first by id (timestamp) fallback to 0
    list.sort((a,b) => (b.id||0) - (a.id||0));
  }

  state.filtered = list;
}

function safeUrl(u){
  if(!u) return "";
  return u;
}

function render(){
  els.grid.innerHTML = "";
  const list = state.filtered;

  els.resultsCount.textContent = `${list.length} item${list.length === 1 ? "" : "s"}`;

  if(list.length === 0){
    els.empty.hidden = false;
    return;
  }
  els.empty.hidden = true;

  list.forEach(p => {
    const card = document.createElement("article");
    card.className = "card";

    const imgUrl = safeUrl(p.imageUrl) || "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=70";
    const title = p.title || "Smart Home Find";
    const desc = p.description || "Cozy, elegant, minimal — curated for your home.";
    const category = p.category || "Other";
    const pinUrl = safeUrl(p.pinUrl);
    const buyUrl = safeUrl(p.buyUrl) || pinUrl;

    const tags = Array.isArray(p.tags) ? p.tags : [];

    card.innerHTML = `
      <div class="card-media">
        <img src="${imgUrl}" alt="${escapeHtml(title)}" loading="lazy" />
        <div class="badge">${escapeHtml(category)}</div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(title)}</h3>
        <p class="card-desc">${escapeHtml(desc)}</p>

        ${tags.length ? `
          <div class="card-tags">
            ${tags.slice(0,6).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
          </div>
        ` : ""}

        <div class="card-actions">
          ${pinUrl ? `<a class="linkbtn" href="${pinUrl}" target="_blank" rel="noopener">View Pin</a>` : ""}
          ${buyUrl ? `<a class="linkbtn primary" href="${buyUrl}" target="_blank" rel="noopener">Shop</a>` : ""}
        </div>
      </div>
    `;

    els.grid.appendChild(card);
  });
}

function escapeHtml(str){
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function update(){
  applyFilters();
  render();
}

async function loadProducts(){
  const res = await fetch(CONFIG.dataUrl, { cache: "no-store" });
  if(!res.ok) throw new Error("Failed to load products.json");
  const json = await res.json();
  const products = (json && json.products) ? json.products : [];
  state.products = products;
  update();
}

function init(){
  els.year.textContent = new Date().getFullYear();

  setTopLinks();
  buildChips();

  els.searchInput.addEventListener("input", (e) => {
    state.query = e.target.value;
    update();
  });

  els.disclosureBtn.addEventListener("click", () => {
    const expanded = els.disclosureBtn.getAttribute("aria-expanded") === "true";
    els.disclosureBtn.setAttribute("aria-expanded", String(!expanded));
    els.disclosurePanel.hidden = expanded;
  });

  els.sortNewest.addEventListener("click", () => {
    state.sort = "newest";
    update();
  });
  els.sortAZ.addEventListener("click", () => {
    state.sort = "az";
    update();
  });

  loadProducts().catch(err => {
    console.error(err);
    state.products = [];
    update();
  });
}

init();
