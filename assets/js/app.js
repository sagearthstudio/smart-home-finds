/* Smart Home Finds — GitHub Issues as CMS (no build step) */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    config: null,
    products: [],
    filtered: [],
    activeCategory: "All",
    query: "",
  };

  function safeUrl(url) {
    try {
      const u = new URL(String(url || ""));
      if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
      return "";
    } catch {
      return "";
    }
  }

  function minutesToMs(min) {
    return Math.max(0, Number(min || 0)) * 60 * 1000;
  }

  function setStatus(msg) {
    $("#statusText").textContent = msg;
  }

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function normalize(str) {
    return String(str || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  // Fetch BOTH open and closed issues (so products stay visible even if you close issues)
  function apiUrl(owner, repo, label, maxItems) {
    const perPage = Math.min(100, Math.max(1, Number(maxItems || 100)));
    const params = new URLSearchParams({
      state: "all",
      per_page: String(perPage),
      labels: label || "product",
      sort: "created",
      direction: "desc",
    });
    return `https://api.github.com/repos/${owner}/${repo}/issues?${params.toString()}`;
  }

  function cacheKey(owner, repo) {
    return `shf_cache_${owner}_${repo}`;
  }

  function readCache(owner, repo) {
    try {
      const raw = localStorage.getItem(cacheKey(owner, repo));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeCache(owner, repo, payload) {
    try {
      localStorage.setItem(cacheKey(owner, repo), JSON.stringify(payload));
    } catch {}
  }

  function isCacheFresh(cacheObj, minutes) {
    if (!cacheObj || !cacheObj.at) return false;
    const age = Date.now() - Number(cacheObj.at);
    return age < minutesToMs(minutes);
  }

  // Parse Issue Form content
  // Looks for headings like "### Pinterest Pin URL" and grabs first non-empty line below it.
  function parseIssue(issue) {
    if (issue.pull_request) return null; // ignore PRs

    const body = String(issue.body || "");

    const getField = (label) => {
      const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^###\\s+${safe}\\s*$([\\s\\S]*?)(^###\\s+|\\Z)`, "mi");
      const m = body.match(re);
      if (!m) return "";
      const chunk = m[1] || "";
      const lines = chunk
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && l.toLowerCase() !== "no response");
      return lines[0] || "";
    };

    const pinUrl = safeUrl(getField("Pinterest Pin URL"));
    const destinationUrl = safeUrl(getField("Destination / Affiliate URL (optional)"));
    const imageUrl = safeUrl(getField("Image URL (optional)"));
    const titleFromField = getField("Title (optional)");
    const category = (getField("Category") || "All").trim();
    const tagsRaw = getField("Tags (comma separated)");

    const tags = uniq(
      (tagsRaw || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    );

    const title = (titleFromField && titleFromField.trim()) || (issue.title || "Untitled");

    // minimal sanity: accept if at least pin or destination exists
    if (!pinUrl && !destinationUrl) return null;

    return {
      id: String(issue.number),
      title: title.trim(),
      pinUrl,
      destinationUrl,
      imageUrl,
      category: category || "All",
      tags,
      createdAt: issue.created_at || "",
    };
  }

  async function fetchProductsFromGitHub(force = false) {
    const cfg = state.config;
    const owner = cfg.owner;
    const repo = cfg.repo;
    const label = cfg.issueLabel || "product";
    const cacheMinutes = Number(cfg.cacheMinutes || 10);

    const cached = readCache(owner, repo);
    if (!force && isCacheFresh(cached, cacheMinutes) && Array.isArray(cached.items)) {
      return cached.items;
    }

    const url = apiUrl(owner, repo, label, cfg.maxItems || 200);
    const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" } });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API error: ${res.status} ${res.statusText} ${text}`);
    }

    const issues = await res.json();
    const items = issues.map(parseIssue).filter(Boolean);

    writeCache(owner, repo, { at: Date.now(), items });
    return items;
  }

  async function fetchSampleProducts() {
    try {
      const res = await fetch(`products.sample.json?v=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("sample not found");
      return await res.json();
    } catch {
      return [];
    }
  }

  function renderCategories() {
    const cfg = state.config;
    const chips = $("#categoryChips");
    chips.innerHTML = "";

    const categories = (cfg.categories && cfg.categories.length) ? cfg.categories : ["All"];
    for (const cat of categories) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (cat === state.activeCategory ? " is-active" : "");
      btn.textContent = cat;
      btn.addEventListener("click", () => {
        state.activeCategory = cat;
        $$(".chip").forEach((c) => c.classList.remove("is-active"));
        btn.classList.add("is-active");
        applyFilters();
      });
      chips.appendChild(btn);
    }
  }

  function makeTagEl(text) {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = text;
    return el;
  }

  function renderProducts() {
    const grid = $("#productGrid");
    const tpl = $("#cardTemplate");
    grid.innerHTML = "";

    const items = state.filtered;
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "disclosure";
      empty.innerHTML = `<strong>No results.</strong> Try a different search or category.`;
      grid.appendChild(empty);
      setStatus("No products found.");
      return;
    }

    const frag = document.createDocumentFragment();

    for (const p of items) {
      const node = tpl.content.cloneNode(true);
      const media = node.querySelector(".card__media");
      const img = node.querySelector(".card__img");
      const badge = node.querySelector(".badge");
      const title = node.querySelector(".card__title");
      const tagsWrap = node.querySelector(".card__tags");
      const openLink = node.querySelector(".card__actions .link");
      const pinLink = node.querySelector(".card__actions .link--muted");

      badge.textContent = p.category || "Find";
      title.textContent = p.title;

      const imgUrl = p.imageUrl || "";
      if (imgUrl) {
        img.src = imgUrl;
        img.alt = p.title;
      } else {
        img.remove();
        media.style.background =
          "linear-gradient(135deg, rgba(230,201,168,.22), rgba(167,197,255,.15)), rgba(0,0,0,.25)";
      }

      const primaryUrl = safeUrl(p.destinationUrl) || safeUrl(p.pinUrl) || "#";
      media.href = primaryUrl;

      openLink.href = primaryUrl;
      openLink.textContent = primaryUrl.includes("amzn.to") ? "Open (Amazon)" : "Open";

      pinLink.href = safeUrl(p.pinUrl) || primaryUrl;
      pinLink.textContent = "Pin";

      const tagList = (p.tags || []).slice(0, 6);
      for (const t of tagList) tagsWrap.appendChild(makeTagEl(t));

      frag.appendChild(node);
    }

    grid.appendChild(frag);
    setStatus(`Showing ${items.length} product${items.length === 1 ? "" : "s"}.`);
  }

  function applyFilters() {
    const q = normalize(state.query);
    const cat = state.activeCategory;

    state.filtered = state.products.filter((p) => {
      const matchCat = cat === "All" || normalize(p.category) === normalize(cat);
      if (!matchCat) return false;

      if (!q) return true;

      const hay = [p.title, p.category, ...(p.tags || [])].map(normalize).join(" ");
      return hay.includes(q);
    });

    renderProducts();
  }

  function buildAddProductUrl(cfg) {
    return `https://github.com/${cfg.owner}/${cfg.repo}/issues/new?template=add-product.yml`;
  }

  function wireUI() {
    $("#searchInput").addEventListener("input", (e) => {
      state.query = e.target.value || "";
      applyFilters();
    });

    $("#btnRefresh").addEventListener("click", async () => {
      await load(true);
    });

    $("#btnDisclosure").addEventListener("click", () => {
      const box = $("#disclosureBox");
      const isOpen = !box.hasAttribute("hidden");
      if (isOpen) {
        box.setAttribute("hidden", "");
        $("#btnDisclosure").setAttribute("aria-expanded", "false");
      } else {
        box.removeAttribute("hidden");
        $("#btnDisclosure").setAttribute("aria-expanded", "true");
      }
    });
  }

  function applyConfigToUI(cfg) {
    $("#brandName").textContent = cfg.brand || "Smart Home Finds";
    $("#brandNameFooter").textContent = cfg.brand || "Smart Home Finds";
    $("#brandTagline").textContent = cfg.tagline || "";
    $("#logoText").textContent = cfg.logoText || "SHF";
    $("#disclosureText").textContent = cfg.affiliateDisclosure || "";

    $("#btnPinterest").href = cfg.social?.pinterest || "https://www.pinterest.com/";
    $("#btnInstagram").href = cfg.social?.instagram || "https://www.instagram.com/";
    $("#btnLinktree").href = cfg.social?.linktree || "https://linktr.ee/";
    $("#btnShop").href = cfg.shopPageUrl || "#products";

    $("#btnAddProduct").href = buildAddProductUrl(cfg);
    $("#year").textContent = String(new Date().getFullYear());
    document.title = cfg.brand || "Smart Home Finds";
  }

  async function load(force = false) {
    try {
      setStatus(force ? "Refreshing products…" : "Loading products…");

      const items = await fetchProductsFromGitHub(force);
      state.products = items;

      if (!state.products.length) {
        setStatus("No GitHub products yet — loading sample.");
        state.products = await fetchSampleProducts();
      }

      state.products.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      applyFilters();
    } catch (err) {
      console.error(err);
      setStatus("GitHub API unavailable — loading sample products.");
      state.products = await fetchSampleProducts();
      applyFilters();
    }
  }

  async function init() {
    try {
      const res = await fetch(`config.json?v=${Date.now()}`, { cache: "no-store" });
      state.config = await res.json();
    } catch {
      state.config = {
        brand: "Smart Home Finds",
        tagline: "",
        logoText: "SHF",
        owner: "sagearthstudio",
        repo: "smart-home-finds",
        social: { pinterest: "https://www.pinterest.com/" },
        categories: ["All"],
        issueLabel: "product",
        cacheMinutes: 10,
        maxItems: 200,
      };
    }

    applyConfigToUI(state.config);
    renderCategories();
    wireUI();
    await load(false);
  }

  init();
})();
