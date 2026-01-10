/* Smart Home Finds — app.js
   - Reads products from GitHub Issues (label: "product")
   - Adds products by creating a new Issue (needs token)
   - Optional image upload: commits file into /uploads and uses raw GitHub URL (needs Contents R/W)
   - Notes: parse multi-line "Short Notes" and show toggle per card
   - Admin UI: hidden unless Admin PIN is enabled (PIN is only UI gating; token is the real security)
   - PWA: registers ./sw.js
*/

(() => {
  'use strict';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const els = {
    year: $('year'),
    brandName: $('brandName'),
    brandNameFooter: $('brandNameFooter'),
    brandTagline: $('brandTagline'),
    logoText: $('logoText'),

    btnPinterest: $('btnPinterest'),
    btnInstagram: $('btnInstagram'),
    btnLinktree: $('btnLinktree'),

    searchInput: $('searchInput'),
    categoryChips: $('categoryChips'),
    productGrid: $('productGrid'),
    statusText: $('statusText'),

    btnRefresh: $('btnRefresh'),
    btnAdmin: $('btnAdmin'),
    btnToken: $('btnToken'),
    btnAddProduct: $('btnAddProduct'),
    btnDisclosure: $('btnDisclosure'),
    disclosureBox: $('disclosureBox'),

    // Admin modal
    adminModal: $('adminModal'),
    adminPinInput: $('adminPinInput'),
    btnEnableAdmin: $('btnEnableAdmin'),
    btnDisableAdmin: $('btnDisableAdmin'),
    adminStatus: $('adminStatus'),

    // Token modal
    tokenModal: $('tokenModal'),
    tokenInput: $('tokenInput'),
    btnSaveToken: $('btnSaveToken'),
    btnClearToken: $('btnClearToken'),
    tokenStatus: $('tokenStatus'),

    // Product modal
    productModal: $('productModal'),
    pTitle: $('pTitle'),
    pCategory: $('pCategory'),
    pPinUrl: $('pPinUrl'),
    pDestUrl: $('pDestUrl'),
    pImageUrl: $('pImageUrl'),
    pImageFile: $('pImageFile'),
    pTags: $('pTags'),
    pNotes: $('pNotes'),
    btnSubmitProduct: $('btnSubmitProduct'),
    btnCancelProduct: $('btnCancelProduct'),
    btnFallbackGitHub: $('btnFallbackGitHub'),
    productStatus: $('productStatus'),

    cardTemplate: document.getElementById('cardTemplate'),
  };

  // ---------- Config (auto-detected for GitHub Pages project sites) ----------
  const owner = (location.hostname.split('.')[0] || '').trim();
  const repo = (location.pathname.split('/').filter(Boolean)[0] || '').trim();

  // Social links (customize)
  const LINKS = {
    pinterest: 'https://it.pinterest.com/SmartlifeSmartIdeas/',
    instagram: 'https://www.instagram.com/sagearthstudio/',
    linkShop: 'https://sagearthstudio.github.io/smart-home-finds/',
  };

  // Categories for UI
  const CATEGORIES = [
    'All',
    'Candles',
    'Wall Art',
    'Furniture',
    'Gifts',
    'Accessories',
    'Kitchen',
    'Bathroom',
    'Lighting',
    'Smart',
  ];

  // Labels
  const PRODUCT_LABEL = 'product';

  // Storage keys
  const LS_TOKEN = 'shf_github_token';
  const LS_ADMIN = 'shf_admin_enabled';

  // Admin PIN (UI gating only)
  const ADMIN_PIN = 'Serena05';

  // ---------- State ----------
  let allProducts = [];
  let activeCategory = 'All';
  let searchQuery = '';
  let adminEnabled = localStorage.getItem(LS_ADMIN) === '1';

  // ---------- Helpers ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setStatus(text) {
    if (els.statusText) els.statusText.textContent = text;
  }

  function setNote(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.remove('ok', 'bad');
    if (kind === 'ok') el.classList.add('ok');
    if (kind === 'bad') el.classList.add('bad');
  }

  function normalizeUrl(url) {
    const u = (url || '').trim();
    if (!u) return '';
    try {
      return new URL(u).toString();
    } catch {
      return u;
    }
  }

  function splitTags(tags) {
    return (tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function slugifyLabel(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
  }

  function getToken() {
    return (localStorage.getItem(LS_TOKEN) || '').trim();
  }

  function authHeaders() {
    const t = getToken();
    return t
      ? {
          Authorization: `Bearer ${t}`,
          'X-GitHub-Api-Version': '2022-11-28',
        }
      : {
          'X-GitHub-Api-Version': '2022-11-28',
        };
  }

  function githubRepoUrl() {
    return `https://github.com/${owner}/${repo}`;
  }

  function githubIssueNewUrl() {
    return `${githubRepoUrl()}/issues/new?template=add-product.yml`;
  }

  // ---------- Robust parser for issue body (supports multi-line notes) ----------
  function parseIssueBody(body) {
    const text = (body || '').replace(/\r/g, '');

    // Recognized labels in the body (must match how we generate it)
    const LABELS = [
      'Pinterest Pin URL',
      'Destination / Affiliate URL',
      'Image URL',
      'Title',
      'Category',
      'Tags',
      'Short Notes',
    ];

    const map = {};
    let current = null;
    const lines = text.split('\n');

    const isLabelLine = (line) => LABELS.includes((line || '').trim());
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Support inline "Label: value"
      const inline = line.match(/^\s*([^:]+?)\s*:\s*(.+)\s*$/);
      if (inline && LABELS.includes(inline[1].trim())) {
        map[inline[1].trim()] = (map[inline[1].trim()] ? map[inline[1].trim()] + '\n' : '') + inline[2].trim();
        current = null;
        continue;
      }

      if (isLabelLine(line)) {
        current = line.trim();
        if (!map[current]) map[current] = '';
        continue;
      }

      if (current) {
        // stop if another label appears
        if (isLabelLine(line)) {
          current = line.trim();
          if (!map[current]) map[current] = '';
          continue;
        }

        // collect lines (including blanks)
        map[current] += (map[current] ? '\n' : '') + line;
      }
    }

    const pinUrl = normalizeUrl((map['Pinterest Pin URL'] || '').trim());
    const destUrl = normalizeUrl((map['Destination / Affiliate URL'] || '').trim());
    const imageUrl = normalizeUrl((map['Image URL'] || '').trim());
    const title = (map['Title'] || '').trim();
    const category = (map['Category'] || '').trim();
    const tags = (map['Tags'] || '').trim();
    const notes = (map['Short Notes'] || '').trim();

    // If users paste an image upload markdown like: ![alt](https://user-images.githubusercontent.com/...)
    const uploadImgMatch = text.match(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/i);
    const uploadedImage = uploadImgMatch ? normalizeUrl(uploadImgMatch[1]) : '';

    return {
      pinUrl,
      destUrl,
      imageUrl: imageUrl || uploadedImage,
      title,
      category,
      tags,
      notes,
    };
  }

  function productFromIssue(issue) {
    const parsed = parseIssueBody(issue.body || '');
    const title =
      (parsed.title && parsed.title !== 'No response' ? parsed.title : '') ||
      (issue.title || '').replace(/^Add\s+product\s*:\s*/i, '').trim();

    let category = parsed.category && parsed.category !== 'No response' ? parsed.category : '';
    if (!category) {
      const labelNames = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
      const catLabel = labelNames.find((l) => l && l !== PRODUCT_LABEL);
      category = catLabel ? catLabel.replace(/-/g, ' ') : 'Accessories';
    }

    const tags = splitTags(parsed.tags && parsed.tags !== 'No response' ? parsed.tags : '');

    return {
      id: issue.number,
      issueUrl: issue.html_url,
      createdAt: issue.created_at,
      title: title || `Product #${issue.number}`,
      category: category || 'Accessories',
      tags,
      pinUrl: parsed.pinUrl || '',
      destUrl: parsed.destUrl || '',
      imageUrl: parsed.imageUrl || '',
      notes: parsed.notes && parsed.notes !== 'No response' ? parsed.notes : '',
    };
  }

  // ---------- UI ----------
  function setAdminUI(enabled) {
    adminEnabled = !!enabled;
    if (els.btnToken) els.btnToken.hidden = !adminEnabled;
    if (els.btnAddProduct) els.btnAddProduct.hidden = !adminEnabled;

    if (els.btnAdmin) {
      els.btnAdmin.textContent = adminEnabled ? '🔓 Admin' : '🔒 Admin';
      els.btnAdmin.title = adminEnabled ? 'Admin attivo' : 'Modalità admin';
    }
  }

  function renderChips() {
    if (!els.categoryChips) return;
    els.categoryChips.innerHTML = '';
    CATEGORIES.forEach((cat) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (cat === activeCategory ? ' is-active' : '');
      b.textContent = cat;
      b.addEventListener('click', () => {
        activeCategory = cat;
        renderChips();
        renderProducts();
      });
      els.categoryChips.appendChild(b);
    });
  }

  function matchesFilters(p) {
    const catOk = activeCategory === 'All' || (p.category || '').toLowerCase() === activeCategory.toLowerCase();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catOk;
    const hay = `${p.title} ${p.category} ${(p.tags || []).join(' ')} ${p.notes || ''}`.toLowerCase();
    return catOk && hay.includes(q);
  }

  function renderProducts() {
    if (!els.productGrid || !els.cardTemplate) return;
    els.productGrid.innerHTML = '';

    const items = allProducts.filter(matchesFilters);
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'note';
      empty.textContent = 'Nessun prodotto trovato. Premi Refresh o cambia filtri.';
      els.productGrid.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const p of items) {
      const node = els.cardTemplate.content.cloneNode(true);

      const media = node.querySelector('.card__media');
      const img = node.querySelector('.card__img');
      const badge = node.querySelector('.badge');
      const title = node.querySelector('.card__title');
      const tags = node.querySelector('.card__tags');
      const linkOpen = node.querySelectorAll('.link')[0];
      const linkPin = node.querySelectorAll('.link')[1];
      const noteBtn = node.querySelector('.noteToggle');
      const noteBox = node.querySelector('.card__notes');

      title.textContent = p.title;
      badge.textContent = p.category || 'Product';

      // Image (not cropped: CSS uses object-fit: contain)
      if (p.imageUrl) {
        img.src = p.imageUrl;
        img.alt = p.title;
        img.style.display = '';
      } else {
        img.alt = p.title;
        img.style.display = 'none';
        media.style.background = 'linear-gradient(135deg, rgba(230,201,168,.18), rgba(167,197,255,.10))';
      }

      // Primary link: destination preferred, else pin, else issue
      const primaryUrl = p.destUrl || p.pinUrl || p.issueUrl;
      media.href = primaryUrl;

      // Actions
      linkOpen.href = primaryUrl;
      linkPin.href = p.pinUrl || p.issueUrl;
      linkPin.textContent = p.pinUrl ? 'Pin' : 'Issue';

      // Notes toggle
      if (p.notes && p.notes.trim()) {
        noteBtn.hidden = false;
        noteBtn.textContent = 'Short Notes';
        noteBtn.setAttribute('aria-expanded', 'false');
        noteBox.hidden = true;
        noteBox.textContent = p.notes.trim();

        noteBtn.addEventListener('click', () => {
          const isOpen = noteBtn.getAttribute('aria-expanded') === 'true';
          noteBtn.setAttribute('aria-expanded', String(!isOpen));
          noteBtn.textContent = isOpen ? 'Short Notes' : 'Chiudi note';
          noteBox.hidden = isOpen;
        });
      } else {
        noteBtn.hidden = true;
        noteBox.hidden = true;
      }

      // Tags
      tags.innerHTML = '';
      (p.tags || []).slice(0, 8).forEach((t) => {
        const s = document.createElement('span');
        s.className = 'tag';
        s.textContent = t;
        tags.appendChild(s);
      });

      frag.appendChild(node);
    }
    els.productGrid.appendChild(frag);
  }

  // ---------- Modals ----------
  function openModal(which) {
    const el =
      which === 'token' ? els.tokenModal :
      which === 'product' ? els.productModal :
      which === 'admin' ? els.adminModal :
      null;
    if (!el) return;
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(which) {
    const el =
      which === 'token' ? els.tokenModal :
      which === 'product' ? els.productModal :
      which === 'admin' ? els.adminModal :
      null;
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function wireModalClose() {
    document.querySelectorAll('[data-close]').forEach((x) => {
      x.addEventListener('click', (e) => {
        const which = e.currentTarget.getAttribute('data-close');
        closeModal(which);
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('token');
        closeModal('product');
        closeModal('admin');
      }
    });
  }

  // ---------- GitHub API ----------
  async function ghFetch(url, options = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      ...authHeaders(),
      ...(options.headers || {}),
    };

    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      let detail = '';
      try {
        const j = await res.json();
        detail = j && (j.message || JSON.stringify(j));
      } catch { /* ignore */ }
      const err = new Error(`GitHub API error: ${res.status} — ${detail || res.statusText}`);
      err.status = res.status;
      throw err;
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async function validateToken() {
    try {
      const j = await ghFetch('https://api.github.com/rate_limit');
      const remaining = j?.resources?.core?.remaining;
      const limit = j?.resources?.core?.limit;
      setNote(els.tokenStatus, `✅ Token OK. API remaining: ${remaining}/${limit}`, 'ok');
      return true;
    } catch (e) {
      setNote(els.tokenStatus, `❌ Token non valido: ${e.message}`, 'bad');
      return false;
    }
  }

  async function fetchProductsFromIssues() {
    if (!owner || !repo) {
      setStatus('Questo sito è pensato per GitHub Pages (username.github.io/repo).');
      return [];
    }

    setStatus('Carico i prodotti da GitHub Issues…');
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(PRODUCT_LABEL)}&state=open&per_page=100&sort=created&direction=desc`;

    try {
      const issues = await ghFetch(url);
      const products = (issues || [])
        .filter((it) => !it.pull_request)
        .map(productFromIssue);

      setStatus(`Caricati ${products.length} prodotti.`);
      return products;
    } catch (e) {
      if (e.status === 403) {
        setStatus('Rate limit GitHub. Premi “Admin → Token” e inserisci un token (read-only basta per caricare).');
      } else {
        setStatus(`Errore caricamento: ${e.message}`);
      }
      return [];
    }
  }

  async function createProductIssue(product) {
    const t = getToken();
    if (!t) {
      throw new Error('Nessun token salvato. Vai su Admin → Token e incolla un token con Issues: Read and write.');
    }

    const title = (product.title || '').trim() || 'New product';
    const category = (product.category || 'Accessories').trim() || 'Accessories';
    const tags = (product.tags || []).join(', ');

    const body = [
      `Pinterest Pin URL`,
      `${product.pinUrl || ''}`,
      ``,
      `Destination / Affiliate URL`,
      `${product.destUrl || ''}`,
      ``,
      `Image URL`,
      `${product.imageUrl || ''}`,
      ``,
      `Title`,
      `${title}`,
      ``,
      `Category`,
      `${category}`,
      ``,
      `Tags`,
      `${tags || ''}`,
      ``,
      `Short Notes`,
      `${product.notes || ''}`,
      ``,
    ].join('\n');

    const labels = [PRODUCT_LABEL, slugifyLabel(category)].filter(Boolean);

    const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
    const created = await ghFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Add product: ${title}`, body, labels }),
    });

    return created;
  }

  async function uploadImageToRepo(file) {
    const t = getToken();
    if (!t) {
      throw new Error('Nessun token salvato. Per caricare una foto serve token con Contents: Read and write.');
    }

    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

    // base64 encode
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const content = btoa(binary);

    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'png';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `uploads/${stamp}-${Math.random().toString(16).slice(2)}.${safeExt}`;

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filename)}`;
    await ghFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Add product image ${filename}`,
        content,
      }),
    });

    return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filename}`;
  }

  // ---------- Events ----------
  function wireHeaderLinks() {
    if (els.btnPinterest) els.btnPinterest.href = LINKS.pinterest;
    if (els.btnInstagram) els.btnInstagram.href = LINKS.instagram;
    if (els.btnLinktree) els.btnLinktree.href = LINKS.linktree;
  }

  function wireToolbar() {
    els.btnRefresh?.addEventListener('click', async () => {
      await reloadProducts(true);
    });

    els.btnAdmin?.addEventListener('click', () => {
      els.adminPinInput.value = '';
      setNote(els.adminStatus, adminEnabled ? 'Admin attivo su questo dispositivo.' : 'Admin non attivo.', adminEnabled ? 'ok' : '');
      openModal('admin');
    });

    els.btnToken?.addEventListener('click', () => {
      const t = getToken();
      els.tokenInput.value = t ? t : '';
      setNote(els.tokenStatus, t ? 'Token caricato da questo browser.' : 'Nessun token salvato.', t ? 'ok' : '');
      openModal('token');
    });

    els.btnAddProduct?.addEventListener('click', () => {
      // Fill categories in select
      els.pCategory.innerHTML = '';
      CATEGORIES.filter((c) => c !== 'All').forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        els.pCategory.appendChild(opt);
      });

      // Default values
      els.pTitle.value = '';
      els.pPinUrl.value = '';
      els.pDestUrl.value = '';
      els.pImageUrl.value = '';
      if (els.pImageFile) els.pImageFile.value = '';
      els.pTags.value = '';
      els.pNotes.value = '';
      setNote(els.productStatus, '', '');

      els.btnFallbackGitHub.href = githubIssueNewUrl();
      openModal('product');
    });

    els.btnDisclosure?.addEventListener('click', () => {
      const isOpen = !els.disclosureBox.hidden;
      els.disclosureBox.hidden = isOpen;
      els.btnDisclosure.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  function wireSearch() {
    els.searchInput?.addEventListener('input', () => {
      searchQuery = els.searchInput.value || '';
      renderProducts();
    });
  }

  function wireAdminModal() {
    els.btnEnableAdmin?.addEventListener('click', () => {
      const pin = (els.adminPinInput.value || '').trim();
      if (!pin) {
        setNote(els.adminStatus, 'Inserisci il PIN.', 'bad');
        return;
      }
      if (pin !== ADMIN_PIN) {
        setNote(els.adminStatus, 'PIN errato.', 'bad');
        return;
      }
      localStorage.setItem(LS_ADMIN, '1');
      setAdminUI(true);
      setNote(els.adminStatus, '✅ Admin attivo su questo dispositivo.', 'ok');
    });

    els.btnDisableAdmin?.addEventListener('click', () => {
      localStorage.removeItem(LS_ADMIN);
      setAdminUI(false);
      setNote(els.adminStatus, 'Admin disattivato.', 'ok');
    });
  }

  function wireTokenModal() {
    els.btnSaveToken?.addEventListener('click', async () => {
      const t = (els.tokenInput.value || '').trim();
      if (!t) {
        setNote(els.tokenStatus, 'Incolla un token prima.', 'bad');
        return;
      }
      localStorage.setItem(LS_TOKEN, t);
      await validateToken();
    });

    els.btnClearToken?.addEventListener('click', () => {
      localStorage.removeItem(LS_TOKEN);
      els.tokenInput.value = '';
      setNote(els.tokenStatus, 'Token rimosso da questo browser.', 'ok');
    });
  }

  function wireProductModal() {
    els.btnSubmitProduct?.addEventListener('click', async () => {
      try {
        setNote(els.productStatus, 'Pubblicazione…', '');

        const pinUrl = normalizeUrl(els.pPinUrl.value);
        if (!pinUrl) {
          setNote(els.productStatus, 'Pinterest Pin URL è obbligatorio.', 'bad');
          return;
        }

        let imageUrl = normalizeUrl(els.pImageUrl.value);
        const file = els.pImageFile?.files?.[0];

        if (file) {
          setNote(els.productStatus, 'Carico immagine su GitHub…', '');
          imageUrl = await uploadImageToRepo(file);
        }

        const product = {
          title: (els.pTitle.value || '').trim(),
          category: (els.pCategory.value || 'Accessories').trim(),
          pinUrl,
          destUrl: normalizeUrl(els.pDestUrl.value),
          imageUrl,
          tags: splitTags(els.pTags.value),
          notes: (els.pNotes.value || '').trim(),
        };

        setNote(els.productStatus, 'Creo la scheda su GitHub…', '');
        const issue = await createProductIssue(product);

        // Show immediately
        const newProd = productFromIssue(issue);
        allProducts = [newProd, ...allProducts];
        renderProducts();

        setNote(els.productStatus, '✅ Pubblicato! Ora è visibile nella webapp.', 'ok');
        await sleep(650);
        closeModal('product');
      } catch (e) {
        setNote(els.productStatus, `❌ ${e.message}`, 'bad');
      }
    });
  }

  // ---------- Load ----------
  async function reloadProducts(showSpinner) {
    if (showSpinner) setStatus('Aggiornamento…');
    const products = await fetchProductsFromIssues();
    allProducts = products;
    renderProducts();
  }

  function initMeta() {
    const year = new Date().getFullYear();
    if (els.year) els.year.textContent = String(year);
    if (els.brandNameFooter) els.brandNameFooter.textContent = els.brandName?.textContent || 'Smart Home Finds';
  }

  function init() {
    initMeta();
    wireHeaderLinks();
    renderChips();
    wireToolbar();
    wireSearch();
    wireModalClose();
    wireAdminModal();
    wireTokenModal();
    wireProductModal();
    setAdminUI(adminEnabled);
    renderProducts();
    reloadProducts(false);
  }

  // ---------- PWA ----------
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch {
      // ignore
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    registerSW();
  });
})();
