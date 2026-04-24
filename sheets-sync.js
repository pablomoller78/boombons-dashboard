
(function() {
  const SHEET_ID = '1jyivOWFeJ_AychkVaXug1-U4hNWVjFmzIbThh2FE-_Q';
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;

  function parseFloat2(v) {
    if (v == null) return 0;
    return parseFloat(String(v).replace(',','.').replace(/[€%\\-]/g, s => s === '-' ? '-' : '')) || 0;
  }

  async function fetchProducts() {
    const res = await fetch(SHEET_URL + '&t=' + Date.now());
    const text = await res.text();
    const json = JSON.parse(text.replace(/^[^(]+\(/, '').replace(/\);?\s*$/, ''));
    const rows = json.table.rows;
    const products = [];
    let currentCat = '';

    for (const row of rows) {
      const cells = row.c;
      if (!cells || cells.length < 3) continue;
      const c0 = cells[0]?.v != null ? String(cells[0].v).trim() : '';
      const c1 = cells[1]?.v != null ? String(cells[1].v).trim() : '';
      const c2 = cells[2]?.v != null ? String(cells[2].v).trim() : '';
      if (!c0 && !c1 && !c2) continue;
      if (!c2 && c0 && !String(c0).match(/^\d+$/)) { currentCat = c0; continue; }
      if (!c2) continue;
      const id = parseInt(c0);
      if (!id || isNaN(id)) continue;
      const stock = cells[4]?.v != null ? parseInt(cells[4].v) || 0 : 0;
      const cost  = parseFloat2(cells[5]?.v ?? cells[5]?.f);
      const venda = parseFloat2(cells[6]?.v ?? cells[6]?.f);
      const marge = parseFloat2(cells[7]?.v ?? cells[7]?.f);
      const margePctRaw = cells[8]?.v ?? cells[8]?.f;
      let margePct = 0;
      if (margePctRaw != null) {
        const s = String(margePctRaw).replace(',','.').replace('%','');
        margePct = parseFloat(s) || 0;
        if (Math.abs(margePct) <= 1.5 && Math.abs(margePct) > 0) margePct *= 100;
      }
      products.push({
        id, sku: c2,
        nom: cells[3]?.v || '',
        cat: c1 || currentCat,
        stockIni: stock, stock,
        cost, preu: venda, marge,
        margePct: Math.round(margePct * 10) / 10,
        activa: true
      });
    }
    return products;
  }

  function mergeIntoAppState(sheetProducts) {
    if (typeof window.catalogue === 'undefined') window.catalogue = [];
    const existing = new Map(window.catalogue.map(p => [p.sku, p]));
    let added = 0, updated = 0;

    for (const sp of sheetProducts) {
      if (existing.has(sp.sku)) {
        const p = existing.get(sp.sku);
        const changed = p.stockIni !== sp.stockIni || p.cost !== sp.cost || p.preu !== sp.preu;
        if (changed) {
          Object.assign(p, { stockIni: sp.stockIni, cost: sp.cost, preu: sp.preu, margePct: sp.margePct });
          updated++;
        }
      } else {
        window.catalogue.push(sp);
        added++;
      }
    }

    if (typeof window.renderCatalogue === 'function') window.renderCatalogue();
    if (typeof window.renderStockTable === 'function') window.renderStockTable();
    if (typeof window.renderDashboard === 'function') window.renderDashboard();
    if (typeof window.renderSaleForm === 'function') window.renderSaleForm();

    return { added, updated, total: sheetProducts.length };
  }

  async function syncNow(silent) {
    const btn = document.getElementById('syncSheetsBtn');
    const statusEl = document.getElementById('syncStatus');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronitzant...'; }
    if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'sync-status loading'; statusEl.textContent = 'Llegint Google Sheets...'; }

    try {
      const products = await fetchProducts();
      const result = mergeIntoAppState(products);

      const msg = `✓ Sincronitzat · ${result.total} productes · +${result.added} nous · ${result.updated} actualitzats · ${new Date().toLocaleTimeString('ca-ES')}`;
      if (statusEl) { statusEl.className = 'sync-status ok'; statusEl.textContent = msg; }
      if (btn) { btn.disabled = false; btn.textContent = '↑ Sincronitzar Sheets'; }
      if (!silent) console.log('[BoomBons Sync]', msg);

      localStorage.setItem('lastSheetSync', Date.now());
      localStorage.setItem('sheetProducts', JSON.stringify(products));
      return result;
    } catch (e) {
      const errMsg = '✗ Error de connexió: ' + e.message;
      if (statusEl) { statusEl.className = 'sync-status error'; statusEl.textContent = errMsg; }
      if (btn) { btn.disabled = false; btn.textContent = '↑ Sincronitzar Sheets'; }
      console.error('[BoomBons Sync]', e);
    }
  }

  function setupAutoSync(intervalMs) {
    intervalMs = intervalMs || 2 * 60 * 1000;
    syncNow(true);
    setInterval(() => syncNow(true), intervalMs);
  }

  function injectSyncUI() {
    const style = document.createElement('style');
    style.textContent = `
      .sync-status { display:none; font-size:12px; padding:6px 10px; border-radius:6px; margin-top:6px; }
      .sync-status.loading { background:#FAEEDA; color:#633806; }
      .sync-status.ok { background:#E1F5EE; color:#085041; }
      .sync-status.error { background:#FCEBEB; color:#A32D2D; }
      #syncSheetsBtn { cursor:pointer; }
      .sync-banner { position:fixed; bottom:16px; right:16px; z-index:9999; background:#E1F5EE; color:#085041; border:1px solid #9FE1CB; border-radius:8px; padding:8px 14px; font-size:12px; opacity:0; transition:opacity .4s; pointer-events:none; }
      .sync-banner.show { opacity:1; }
    `;
    document.head.appendChild(style);

    const statusEl = document.createElement('div');
    statusEl.id = 'syncStatus';
    statusEl.className = 'sync-status';

    const banner = document.createElement('div');
    banner.className = 'sync-banner';
    banner.id = 'syncBanner';
    document.body.appendChild(banner);

    const btn = document.getElementById('syncSheetsBtn');
    if (btn) {
      btn.parentNode.insertBefore(statusEl, btn.nextSibling);
      btn.addEventListener('click', () => syncNow(false));
    }
  }

  window.BoomBonsSync = { syncNow, setupAutoSync, fetchProducts };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { injectSyncUI(); setupAutoSync(2 * 60 * 1000); });
  } else {
    injectSyncUI();
    setupAutoSync(2 * 60 * 1000);
  }
})();
