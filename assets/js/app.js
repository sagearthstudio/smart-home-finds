/* Smart Home Finds — Issues as CMS + Add Product modal (GitHub API) */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const LS_TOKEN_KEY = "shf_github_token";

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

  function normalize(str) {
    return String(str || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function setStatus(msg) {
    $("#statusText").textContent = msg;
  }

  function setNote(el, msg, kind) {
    el.classList.remove("ok", "bad");
    if (kind) el.classList.add(kind);
    el.textContent = msg;
  }

  function getToken() {
    return localStorage.getItem(LS_TOKEN_KEY) || "";
  }

  function setToken(t) {
    localStorage.setItem(LS_TOKEN_KEY, t);
  }

  function clearToken() {
    localStorage.removeItem(LS_TOKEN_KEY);
  }

  function githubHeaders() {
    const h = {
      "Accept": "application/vnd.github+json",
    };
    const token = getToken().trim();
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }

  function apiIssuesUrl(owner, repo, label, perPage = 100) {
    const params = new URLSearchParams({
      state: "all",
      per_page: String(Math.min(100, Math.max(1, perPage))),
      labels: label || "product",
      sort: "created",
      direction: "desc",
    });
    return `https://api.github.com/repos/${owner}/${repo}/issues?${params.toString()}`;
  }

  function apiCreateIssueUrl(owner, repo) {
    return `https://api.github.com/repos/${owner}/${repo}/issues`;
  }

  // Parse fields from Issue body headings
  function parseIssue(issue) {
    if (issue.pull_request) return null;

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
    const category = (getField("Category") || "All").trim();
    const tagsRaw = getField("Tags (comma separated)");
    const notes = getField("Short Notes (optional)");

    const title = String(issue.title || "Untitled").trim();

    const tags = uniq(
      (tagsRaw || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    );

    // accept if at least pin exists
    if (!pinUrl && !destinationUrl) return null;

    return {
      id: String(issue.number),
      title,
      pinUrl,
      destinationUrl,
      imageUrl,
      category: category || "All",
      tags,
      notes,
      createdAt: issue.created_at || "",
    };
  }

  async function fetchProducts(force = false) {
    const cfg = state.config;
    const url = apiIssuesUrl(cfg.owner, cfg.repo, cfg.issueLabel || "product", cfg.maxItems || 100);

    const res = await fetch(url, { headers: githubHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API error: ${res.status} ${res.statusText} ${text}`);
    }

    const issues = await res.json();
    const items = issues.map(parseIssue).filter(Boolean);
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

  // MODALS
  function openModal(which) {
    const el = which === "token" ? $("#tokenModal") : $("#productModal");
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(which) {
    const el = which === "token" ? $("#tokenModal") : $("#productModal");
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function buildGitHubFormUrl(cfg) {
    // fallback: open GitHub issue form template (if you also keep the YAML template)
    return `https://github.com/${cfg.owner}/${cfg.repo}/issues/new?template=product.yml`;
  }

  function populateCategorySelect() {
    const cfg = state.config;
    const sel = $("#pCategory");
    sel.innerHTML = "";
    const cats = (cfg.categories || ["All"]).filter((c) => c !== "All");
    for (const c of (cats.length ? cats : ["Other"])) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      sel.appendChild(opt);
    }
  }

  function makeIssueBody(fields) {
    // Keep headings EXACT for parser
    return [
      `### Pinterest Pin URL`,
      fields.pinUrl || "",
      ``,
      `### Destination / Affiliate URL (optional)`,
      fields.destUrl || "",
      ``,
      `### Image URL (optional)`,
      fields.imageUrl || "",
      ``,
      `### Category`,
      fields.category || "Other",
      ``,
      `### Tags (comma separated)`,
      fields.tags || "",
      ``,
      `### Short Notes (optional)`,
      fields.notes || "",
      ``,
      `---`,
      `Created via Smart Home Finds webapp.`,
    ].join("\n");
  }

  async function createProductIssue() {
    const cfg = state.config;
    const statusEl = $("#productStatus");

    const title = String($("#pTitle").value || "").trim();
    const pinUrl = safeUrl($("#pPinUrl").value);
    const destUrl = safeUrl($("#pDestUrl").value);
    const imageUrl = safeUrl($("#pImageUrl").value);
    const category = String($("#pCategory").value || "Other").trim();
    const tags = String($("#pTags").value || "").trim();
    const notes = String($("#pNotes").value || "").trim();

    if (!pinUrl) {
      setNote(statusEl, "Pinterest Pin URL is required (must be a valid https link).", "bad");
      return;
    }

    const issueTitle = title ? title : `Product: ${category} find`;

    const body = makeIssueBody({ pinUrl, destUrl, imageUrl, category, tags, notes });

    const token = getToken().trim();
    if (!token) {
      setNote(statusEl, "No token saved. Click 🔑 Token first. Without a token the webapp cannot publish issues.", "bad");
      return;
    }

    setNote(statusEl, "Publishing product…", "");

    const res = await fetch(apiCreateIssueUrl(cfg.owner, cfg.repo), {
      method: "POST",
      headers: {
        ...githubHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: issueTitle,
        body,
        labels: [cfg.issueLabel || "product"],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setNote(
        statusEl,
        `Publish failed. Your token may be read-only. Create a token with "Issues: Read and Write". (${res.status}) ${text}`,
        "bad"
      );
      return;
    }

    setNote(statusEl, "✅ Product published! Click Refresh to see it on the site.", "ok");
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

    $("#btnToken").addEventListener("click", () => {
      $("#tokenInput").value = getToken();
      setNote($("#tokenStatus"), getToken() ? "Token is saved in this browser." : "No token saved yet.", getToken() ? "ok" : "");
      openModal("token");
    });

    $("#btnAddProduct").addEventListener("click", () => {
      $("#btnFallbackGitHub").href = buildGitHubFormUrl(state.config);
      $("#productStatus").textContent = "";
      $("#pTitle").value = "";
      $("#pPinUrl").value = "";
      $("#pDestUrl").value = "";
      $("#pImageUrl").value = "";
      $("#pTags").value = "";
      $("#pNotes").value = "";
      populateCategorySelect();
      openModal("product");
    });

    // Close modals
    $$(".modal__overlay, [data-close]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const which = e.target.getAttribute("data-close");
        if (which === "token") closeModal("token");
        if (which === "product") closeModal("product");
      });
    });

    // Token actions
    $("#btnSaveToken").addEventListener("click", () => {
      const t = String($("#tokenInput").value || "").trim();
      if (!t) {
        setNote($("#tokenStatus"), "Paste a token first.", "bad");
        return;
      }
      setToken(t);
      setNote($("#tokenStatus"), "✅ Token saved in this browser.", "ok");
    });

    $("#btnClearToken").addEventListener("click", () => {
      clearToken();
      $("#tokenInput").value = "";
      setNote($("#tokenStatus"), "Token removed from this browser.", "");
    });

    // Product actions
    $("#btnSubmitProduct").addEventListener("click", async () => {
      try {
        await createProductIssue();
      } catch (err) {
        console.error(err);
        setNote($("#productStatus"), "Unexpected error while publishing. Check console.", "bad");
      }
    });

    $("#btnCancelProduct").addEventListener("click", () => closeModal("product"));

    // ESC to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("#tokenModal").hidden) closeModal("token");
        if (!$("#productModal").hidden) closeModal("product");
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

    $("#year").textContent = String(new Date().getFullYear());
    document.title = cfg.brand || "Smart Home Finds";
  }

  async function load(force = false) {
    try {
      setStatus(force ? "Refreshing products…" : "Loading products…");
      const items = await fetchProducts(force);
      state.products = items;

      if (!state.products.length) {
        setStatus("No GitHub products yet — loading sample.");
        state.products = await fetchSampleProducts();
      }

      state.products.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      applyFilters();

      const tok = getToken().trim();
      if (!tok) {
        setStatus("Loaded. Tip: add a token (🔑) to avoid GitHub API limits.");
      }
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
        maxItems: 100,
      };
    }

    applyConfigToUI(state.config);
    renderCategories();
    wireUI();
    await load(false);
  }

  init();
})();
