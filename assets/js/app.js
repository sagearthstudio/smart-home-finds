/* Smart Home Finds — app.js
   - Reads products from GitHub Issues (label: "product")
   - SECURITY: shows ONLY issues created by repo owner (prevents others from injecting products)
   - Adds products by creating a new Issue (requires token)
   - Optional image upload: commits file into /uploads and uses raw GitHub URL
   - Admin PIN gate: shows admin buttons only after PIN unlock
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
    btnUnlockAdmin: $('btnUnlockAdmin'),
    btnLockAdmin: $('btnLockAdmin'),
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

  // Social links (customize if you want)
  const LINKS = {
    pinterest: 'https://it.pinterest.com/SmartlifeSmartIdeas/',
    instagram: 'https://www.instagram.com/sagearthstudio/',
    linktree: 'https://linktr.ee/sagearthstudio',
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
  const LS_ADMIN = 'shf_admin_unlocked_v1';

  // Admin PIN (requested)
  const ADMIN_PIN = 'Serena05';

  // ---------- State ----------
  let allProducts = [];
  let activeCategory = 'All';
  let searchQuery = '';

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

  function isAdminUnlocked() {
    return localStorage.getItem(LS_ADMIN) === '1';
  }

  function setAdminUnlocked(v) {
    if (v) localStorage.setItem(LS_ADMIN, '1');
    else localStorage.removeItem(LS_ADMIN);
    document.body.classList.toggle('is-admin', !!v);
  }

  function githubRepoUrl() {
    return `https://github.com/${owner}/${repo}`;
  }

  function githubIssueNewUrl() {
    return `${githubRepoUrl()}/issues/new?template=add-product.yml`;
  }

  // Parse issue body from the issue-form template or from webapp-created markdown
  function parseIssueBody(body) {
    const text = (body || '').replace(/\r/g, '');
    const getField = (label) => {
      const re = new RegExp(`^\\s*${label}\\s*\\n+([^\\n]+)`, 'im');
      const m = text.match(re);
      return m ? m[1].trim() : '';
    };
    const getFieldInline = (label) => {
      const re = new RegExp(`^\\s*${label}\\s*:\\s*([^\\n]+)`, 'im');
      const m = text.match(re);
      return m ? m[1].trim() : '';
    };

    const pinUrl = normalizeUrl(getField('Pinterest Pin URL') || getFieldInline('Pinterest Pin URL'));
    const destUrl = normalizeUrl(getField('Destination / Affiliate URL') || getFieldInline('Destination / Affiliate URL'));
    const imageUrl = normalizeUrl(getField('Image URL') || getFieldInline('Image URL'));
    const title = (getField('Title') || getFieldInline('Title')).trim();
    const category = (getField('Category') || getFieldInline('Category')).trim();
    const tags = (getField('Tags') || getFieldInline('Tags')).trim();
    const notes = (getField('Short Notes') || getFieldInline('Short Notes')).trim();

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
    const pinUrl = parsed.pinUrl || '';
    const destUrl = parsed.destUrl || '';
    const imageUrl = parsed.imageUrl || '';

    return {
      id: issue.number,
      issueUrl: issue.html_url,
      createdAt: issue.created_at,
      title: title || `Product #${issue.number}`,
      category: category || 'Accessories',
      tags,
      pinUrl,
      destUrl,
      imageUrl,
      notes: parsed.notes && parsed.notes !== 'No response' ? parsed.notes : '',
    };
  }

  // ---------- UI ----------
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
      empty.textContent = 'No products found. Try Refresh or clear filters.';
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

      title.textContent = p.title;
      badge.textContent = p.category || 'Product';

      // Image
      if (p.imageUrl) {
        img.src = p.imageUrl;
        img.alt = p.title;
      } else {
        img.alt = p.title;
        img.style.display = 'none';
        media.style.background = 'linear-gradient(135deg, rgba(230,201,168,.18), rgba(167,197,255,.10))';
      }

      const primaryUrl = p.destUrl || p.pinUrl || p.issueUrl;
      media.href = primaryUrl;

      linkOpen.href = primaryUrl;
      linkPin.href = p.pinUrl || p.issueUrl;
      linkPin.textContent = p.pinUrl ? 'Pin' : 'Issue';

      tags.innerHTML = '';
      (p.tags || []).slice(0, 6).forEach((t) => {
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
        if (which === 'token') closeModal('token');
        if (which === 'product') closeModal('product');
        if (which === 'admin') closeModal('admin');
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
      } catch {}
      const err = new Error(`GitHub API error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
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
      setNote(els.tokenStatus, `❌ Token not working: ${e.message}`, 'bad');
      return false;
    }
  }

  async function fetchProductsFromIssues() {
    if (!owner || !repo) {
      setStatus('This site is designed for GitHub Pages project sites (username.github.io/repo).');
      return [];
    }

    setStatus('Loading products from GitHub issues…');
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(PRODUCT_LABEL)}&state=open&per_page=100&sort=created&direction=desc`;

    try {
      const issues = await ghFetch(url);

      // SECURITY: only issues authored by the repo owner
      const filtered = (issues || []).filter((it) => !it.pull_request && it?.user?.login === owner);

      const products = filtered.map(productFromIssue);

      setStatus(`Loaded ${products.length} products.`);
      return products;
    } catch (e) {
      if (e.status === 403) {
        setStatus('Rate limited by GitHub. Tap “🔑 Token” (after Admin unlock) and add a token (read-only is enough to load).');
      } else {
        setStatus(`Error loading products: ${e.message}`);
      }
      return [];
    }
  }

  async function createProductIssue(product) {
    const t = getToken();
    if (!t) {
      throw new Error('Nessun token salvato. Vai su 🔑 Token e incolla un token con Issues: Read and write.');
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
      throw new Error('Nessun token salvato. Per caricare un’immagine serve un token con Contents: Read and write.');
    }

    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

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
    els.btnPinterest.href = LINKS.pinterest;
    els.btnInstagram.href = LINKS.instagram;
    els.btnLinktree.href = LINKS.linktree;
  }

  function wireToolbar() {
    els.btnRefresh?.addEventListener('click', async () => {
      await reloadProducts(true);
    });

    els.btnAdmin?.addEventListener('click', () => {
      const unlocked = isAdminUnlocked();
      setNote(els.adminStatus, unlocked ? '✅ Admin già sbloccato su questo browser.' : 'Inserisci il PIN per sbloccare.', unlocked ? 'ok' : '');
      els.adminPinInput.value = '';
      openModal('admin');
    });

    els.btnToken?.addEventListener('click', () => {
      const t = getToken();
      els.tokenInput.value = t ? t : '';
      setNote(els.tokenStatus, t ? 'Token caricato da questo browser.' : 'Nessun token salvato.', t ? 'ok' : '');
      openModal('token');
    });

    els.btnAddProduct?.addEventListener('click', () => {
      els.pCategory.innerHTML = '';
      CATEGORIES.filter((c) => c !== 'All').forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        els.pCategory.appendChild(opt);
      });

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
    els.btnUnlockAdmin?.addEventListener('click', () => {
      const pin = (els.adminPinInput.value || '').trim();
      if (!pin) {
        setNote(els.adminStatus, 'Inserisci il PIN.', 'bad');
        return;
      }
      if (pin !== ADMIN_PIN) {
        setNote(els.adminStatus, '❌ PIN errato.', 'bad');
        return;
      }
      setAdminUnlocked(true);
      setNote(els.adminStatus, '✅ Admin sbloccato! Ora vedi Token e Add Product.', 'ok');
      setTimeout(() => closeModal('admin'), 550);
    });

    els.btnLockAdmin?.addEventListener('click', () => {
      setAdminUnlocked(false);
      setNote(els.adminStatus, 'Admin bloccato su questo browser.', 'ok');
    });
  }

  function wireTokenModal() {
    els.btnSaveToken?.addEventListener('click', async () => {
      const t = (els.tokenInput.value || '').trim();
      if (!t) {
        setNote(els.tokenStatus, 'Incolla prima un token.', 'bad');
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
        if (!isAdminUnlocked()) {
          setNote(els.productStatus, 'Area riservata: sblocca prima 🔒 Admin.', 'bad');
          return;
        }

        setNote(els.productStatus, 'Publishing…', '');

        const pinUrl = normalizeUrl(els.pPinUrl.value);
        if (!pinUrl) {
          setNote(els.productStatus, 'Pinterest Pin URL is required.', 'bad');
          return;
        }

        let imageUrl = normalizeUrl(els.pImageUrl.value);
        const file = els.pImageFile?.files?.[0];

        if (file) {
          setNote(els.productStatus, 'Uploading image to GitHub…', '');
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

        setNote(els.productStatus, 'Creating GitHub issue…', '');
        const issue = await createProductIssue(product);

        const newProd = productFromIssue(issue);
        allProducts = [newProd, ...allProducts];
        renderProducts();

        setNote(els.productStatus, '✅ Published! It is now visible on the webapp.', 'ok');

        await sleep(650);
        closeModal('product');
      } catch (e) {
        setNote(els.productStatus, `❌ ${e.message}`, 'bad');
      }
    });
  }

  // ---------- Load ----------
  async function reloadProducts(showSpinner) {
    if (showSpinner) setStatus('Refreshing…');
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
    renderProducts();

    // apply admin UI state at start
    document.body.classList.toggle('is-admin', isAdminUnlocked());

    reloadProducts(false);
  }

  // ---------- PWA (installable) ----------
  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    registerSW();
  });
})();
