const $ = (id) => document.getElementById(id);

let DATA = null;
let activeCategory = "All";
let query = "";

function escapeHtml(s=""){
  return s.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  }[c]));
}

function setLinks(profile){
  $("btnPinterest").href = profile.pinterest || "#";
  $("btnInstagram").href = profile.instagram || "#";
  $("btnLinktree").href = profile.linktree || "#";
  $("btnStore").href = profile.shopPage || "#";
}

function buildChips(categories){
  const wrap = $("chips");
  wrap.innerHTML = "";
  categories.forEach(cat => {
    const b = document.createElement("button");
    b.className = "chip" + (cat === activeCategory ? " active" : "");
    b.textContent = cat;
    b.onclick = () => {
      activeCategory = cat;
      Array.from(wrap.querySelectorAll(".chip")).forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      render();
    };
    wrap.appendChild(b);
  });
}

function matches(item){
  const q = query.trim().toLowerCase();
  const inCat = (activeCategory === "All") || (item.category === activeCategory);
  if(!inCat) return false;
  if(!q) return true;

  const hay = [
    item.title, item.description, item.category, (item.tags||[]).join(" ")
  ].join(" ").toLowerCase();

  return hay.includes(q);
}

function cardTemplate(item){
  const tags = (item.tags || []).slice(0, 3).map(t => `<span class="pill">${escapeHtml(t)}</span>`).join("");
  return `
    <article class="card" data-id="${escapeHtml(item.id)}">
      <div class="thumb">
        <img loading="lazy" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" />
        <div class="kicker">${escapeHtml(item.kicker || item.category)}</div>
      </div>
      <div class="body">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description || "")}</p>
        <div class="meta">${tags}</div>
      </div>
    </article>
  `;
}

function render(){
  const grid = $("grid");
  const items = (DATA.items || []).filter(matches);

  if(items.length === 0){
    grid.innerHTML = `<div style="color:rgba(244,244,245,.70); padding:18px; border:1px dashed rgba(255,255,255,.18); border-radius:18px;">
      No results. Try another keyword or category.
    </div>`;
    return;
  }

  grid.innerHTML = items.map(cardTemplate).join("");

  // click handlers
  grid.querySelectorAll(".card").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.getAttribute("data-id");
      const item = DATA.items.find(x => x.id === id);
      if(item) openModal(item);
      // update hash so you can link directly from Pinterest
      history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    });
  });
}

function captionFor(item){
  const tags = (item.tags || []).map(t => `#${t.replace(/\s+/g,"")}`).join(" ");
  return `${item.title}\n\n${item.description}\n\n${tags}\n\n(affiliate link)`;
}

function openModal(item){
  const modal = $("modal");
  $("mImg").src = item.image;
  $("mImg").alt = item.title;
  $("mTitle").textContent = item.title;
  $("mDesc").textContent = item.description || "";
  $("mShop").href = item.shopUrl || "#";

  const t = $("mTags");
  t.innerHTML = "";
  (item.tags || []).forEach(tag => {
    const s = document.createElement("span");
    s.className = "pill";
    s.textContent = tag;
    t.appendChild(s);
  });

  $("mHint").textContent = "Tip: Use this page link in your Pinterest pin destination. Use 'Copy caption' for Pinterest or Instagram text.";

  $("mCopy").onclick = async () => {
    const cap = captionFor(item);
    try{
      await navigator.clipboard.writeText(cap);
      $("mHint").textContent = "Copied! Paste it into Pinterest/Instagram description.";
      setTimeout(()=> $("mHint").textContent = "Tip: Use this page link in your Pinterest pin destination. Use 'Copy caption' for Pinterest or Instagram text.", 1800);
    }catch(e){
      $("mHint").textContent = "Copy failed. Select text manually: " + cap;
    }
  };

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(){
  const modal = $("modal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

async function init(){
  $("year").textContent = new Date().getFullYear();

  const res = await fetch("products.json", { cache: "no-store" });
  DATA = await res.json();

  setLinks(DATA.profile || {});
  buildChips(DATA.categories || ["All"]);
  $("q").addEventListener("input", (e) => {
    query = e.target.value;
    render();
  });

  $("close").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => {
    if(e.target.id === "modal") closeModal();
  });
  document.addEventListener("keydown", (e)=> {
    if(e.key === "Escape") closeModal();
  });

  render();

  // open product from hash (direct link from pins)
  if(location.hash && location.hash.length > 1){
    const id = decodeURIComponent(location.hash.slice(1));
    const item = (DATA.items||[]).find(x => x.id === id);
    if(item) openModal(item);
  }
}

init();
