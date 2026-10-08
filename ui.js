/**
 * ui.js — everything that draws to the page. Reads from Store, never writes.
 */
const $ = (id) => document.getElementById(id);

// Escape user-entered text before putting it into innerHTML
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function badgeClass(status) {
  return {
    'Approved': 'badge-approved',
    'Pending': 'badge-pending',
    'Returned': 'badge-returned',
    'Lost/Damaged': 'badge-lost',
    'Rejected': 'badge-rejected',
  }[status] || 'badge-pending';
}
const badge = (status) => `<span class="badge ${badgeClass(status)}">${esc(status)}</span>`;

// ── toast ──
let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── modal ──
function openModal({ title, body = '', formHtml = '', confirmText = 'Close', onConfirm = closeModal, showCancel = false }) {
  $('modal-title').textContent = title;
  $('modal-body').textContent = body;
  $('modal-form').innerHTML = formHtml;
  $('modal-confirm').textContent = confirmText;
  $('modal-confirm').onclick = onConfirm;
  $('modal-cancel').style.display = showCancel ? '' : 'none';
  $('modal').classList.add('show');
}
function closeModal() { $('modal').classList.remove('show'); }

// ── shared bits ──
const detailRow = (label, value) =>
  `<div class="status-detail-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;

function requestDetailsHtml(r, includeId = false) {
  return (
    (includeId ? detailRow('Request ID', esc(r.id)) : '') +
    detailRow('Borrower', esc(r.name)) +
    detailRow('Contact', esc(r.contact)) +
    detailRow('Item', `${esc(r.item)} (${r.qty})`) +
    detailRow('Purpose', esc(r.purpose)) +
    detailRow('Date Needed', esc(r.dateNeeded)) +
    detailRow('Return Date', esc(r.returnDate)) +
    detailRow('Status', badge(r.status)) +
    (r.status === 'Rejected' ? detailRow('Reason', esc(r.rejectReason || '—')) : '') +
    (r.idImage
      ? `<div class="status-detail-row" style="flex-direction:column;"><span class="label">Valid ID</span><img class="id-thumb" src="${r.idImage}" alt="Valid ID of ${esc(r.name)}"></div>`
      : detailRow('Valid ID No.', esc(r.idNum || '—')))
  );
}

// Why an item can't be borrowed right now
function stockStatus(it) {
  const avail = Store.available(it);
  const out = Store.inUse(it.name);
  return { avail, out, soldOut: avail === 0, onLoan: avail === 0 && out > 0 };
}

// showStatus = true on the public page: adds "out on loan" indications
function inventoryCards(items, showStatus = false) {
  return items.map((it) => {
    const s = stockStatus(it);
    let note = '';
    if (showStatus) {
      if (s.onLoan) note = '<div class="stock-note stock-out">Not available – out on loan</div>';
      else if (s.soldOut) note = '<div class="stock-note stock-out">Not available</div>';
      else if (s.out > 0) note = `<div class="stock-note">${s.out} out on loan</div>`;
    }
    return `
    <div class="inv-item${showStatus && s.soldOut ? ' is-out' : ''}"><div class="icon">${it.icon}</div>
      <div class="count">${s.avail}</div>
      <div class="label">${esc(it.name)}</div>${note}</div>`;
  }).join('');
}

// ── public pages ──
function renderPublicHome() {
  $('pub-inventory').innerHTML = inventoryCards(Store.getItems(), true);
}

function renderEquipmentSelect() {
  const sel = $('f-equipment');
  const previous = sel.value;
  sel.innerHTML = '<option value="">Select item</option>' +
    Store.getItems().map((it) => {
      const s = stockStatus(it);
      const label = s.onLoan ? `${it.name} — out on loan (none available)`
        : s.soldOut ? `${it.name} — not available`
        : `${it.name} (${s.avail} available)`;
      return `<option value="${esc(it.name)}">${esc(label)}</option>`;
    }).join('');
  sel.value = Store.getItem(previous) ? previous : '';
}

// ── reports ──
function computeReport() {
  const reqs = Store.getRequests();
  const count = (s) => reqs.filter((r) => r.status === s).length;
  const returned = count(Store.STATUS.RETURNED);
  const lost = count(Store.STATUS.LOST);
  const byItem = Store.getItems().map((it) => ({
    name: it.name,
    qty: reqs.filter((r) => r.item === it.name).reduce((s, r) => s + r.qty, 0),
  }));
  return {
    total: reqs.length,
    approved: count(Store.STATUS.APPROVED),
    returned,
    pending: count(Store.STATUS.PENDING),
    rejected: count(Store.STATUS.REJECTED),
    lost,
    returnRate: returned + lost > 0 ? Math.round((returned / (returned + lost)) * 100) + '%' : '—',
    byItem,
  };
}

const statBox = (num, label) =>
  `<div class="report-stat"><div class="rs-num">${num}</div><div class="rs-label">${label}</div></div>`;

function barChartHtml(byItem) {
  const colors = ['var(--navy-mid)', 'var(--green-light)', 'var(--orange)', 'var(--teal)'];
  const max = Math.max(1, ...byItem.map((b) => b.qty));
  return `<div class="bar-chart">${byItem.map((b, i) => `
    <div class="bar-wrap"><div class="bar-val">${b.qty}</div>
      <div class="bar" style="height:${Math.round((b.qty / max) * 100)}px;background:${colors[i % colors.length]};"></div>
      <div class="bar-label">${esc(b.name)}</div></div>`).join('')}</div>`;
}

function renderReports() {
  const r = computeReport();
  $('reports-admin-body').innerHTML = `
    <div class="reports-grid">
      ${statBox(r.total, 'Total Requests')}${statBox(r.approved, 'Approved')}${statBox(r.returned, 'Returned')}
      ${statBox(r.pending, 'Pending')}${statBox(r.rejected, 'Rejected')}${statBox(r.lost, 'Lost/Damaged')}${statBox(r.returnRate, 'Return Rate')}
    </div>
    <div class="card"><h3 style="margin-bottom:16px;">Borrowing Activity (qty requested per item)</h3>${barChartHtml(r.byItem)}</div>`;
}

// ── admin ──
function renderStats() {
  const r = computeReport();
  $('dash-pending').textContent = r.pending;
  $('dash-approved').textContent = r.approved;
  $('dash-returned').textContent = r.returned;
  $('dash-lost').textContent = r.lost;
}

function renderDashboard() {
  renderStats();
  const items = Store.getItems();
  const lostTotal = items.reduce((s, it) => s + it.lost, 0);
  $('dash-inventory').innerHTML = inventoryCards(items) +
    `<div class="inv-item"><div class="icon">⚠️</div><div class="count">${lostTotal}</div><div class="label">Lost/Dmgd</div></div>`;

  $('dash-recent-table').innerHTML = Store.getRequests().slice(0, 5).map((r) => `
    <tr>
      <td class="req-id">${esc(r.id)}</td>
      <td>${esc(r.name)}</td>
      <td><strong>${esc(r.item)}</strong></td>
      <td>${esc(r.dateNeeded)}</td>
      <td>${badge(r.status)}</td>
      <td>${actionButtons(r)}<button class="link-btn" onclick="viewDetail('${esc(r.id)}')">Details</button></td>
    </tr>`).join('');
}

function actionButtons(r) {
  if (r.status === Store.STATUS.PENDING)
    return `<button class="btn-approve" onclick="approveReq('${esc(r.id)}')">Approve</button> ` +
           `<button class="btn-lost" onclick="rejectReq('${esc(r.id)}')">Reject</button> `;
  if (r.status === Store.STATUS.APPROVED)
    return `<button class="btn-return" onclick="markReturned('${esc(r.id)}')">Returned</button> ` +
           `<button class="btn-lost" onclick="markLost('${esc(r.id)}')">Lost</button> `;
  return '';
}

const REQUEST_TABLES = {
  'a-pending':  { body: 'pending-table',  status: 'Pending',      cols: 8, third: (r) => esc(r.purpose),    actions: true },
  'a-approved': { body: 'approved-table', status: 'Approved',     cols: 8, third: (r) => esc(r.returnDate), actions: true },
  'a-rejected': { body: 'rejected-table', status: 'Rejected',     cols: 7, third: (r) => esc(r.rejectReason || '—'), actions: false },
  'a-returned': { body: 'returned-table', status: 'Returned',     cols: 7, third: (r) => esc(r.returnDate), actions: false },
  'a-lost':     { body: 'lost-table',     status: 'Lost/Damaged', cols: 7, third: (r) => esc(r.returnDate), actions: false },
};

function renderRequestTable(pageId) {
  const cfg = REQUEST_TABLES[pageId];
  const rows = Store.getRequests().filter((r) => r.status === cfg.status);
  const tbody = $(cfg.body);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${cfg.cols}" class="empty-row">No records found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td class="req-id">${esc(r.id)}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.item)}</td>
      <td>${r.qty}</td>
      <td>${esc(r.dateNeeded)}</td>
      <td>${cfg.third(r)}</td>
      <td>${badge(r.status)}</td>
      ${cfg.actions ? `<td>${actionButtons(r)}<button class="link-btn" onclick="viewDetail('${esc(r.id)}')">Details</button></td>` : ''}
    </tr>`).join('');
}

function renderInventoryTable() {
  $('inventory-table').innerHTML = Store.getItems().map((it, i) => `
    <tr>
      <td>${it.icon} ${esc(it.name)}</td>
      <td>${it.total}</td>
      <td class="available">${Store.available(it)}</td>
      <td class="in-use">${Store.inUse(it.name)}</td>
      <td class="lost">${it.lost}</td>
      <td><button class="btn-edit" onclick="editItem(${i})">Edit</button></td>
    </tr>`).join('');
}

// Re-draw everything that depends on request/item data
function refreshAll() {
  renderPublicHome();
  renderEquipmentSelect();
  if (typeof updateQtyLimit === 'function') updateQtyLimit();
  renderReports();
  renderStats();
}
