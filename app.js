/**
 * app.js — navigation, user actions, and startup.
 * Uses Store (data) and the render functions from ui.js.
 */
const PUBLIC_PAGES = ['home', 'borrow', 'login'];
const ADMIN_PAGES = ['dashboard', 'a-pending', 'a-approved', 'a-rejected', 'a-returned', 'a-lost', 'a-inventory', 'a-reports'];

// ─── TERMS & CONDITIONS ────────────────────────────────────────
let termsOk = false; // fallback if sessionStorage is unavailable
function hasAcceptedTerms() {
  try { return sessionStorage.getItem('ebms.terms') === '1' || termsOk; } catch (e) { return termsOk; }
}
function showTerms() {
  $('terms-check').checked = false;
  $('terms-continue').disabled = true;
  $('terms-overlay').classList.remove('hidden');
}
function onTermsToggle() {
  $('terms-continue').disabled = !$('terms-check').checked;
}
function acceptTerms() {
  if (!$('terms-check').checked) return;
  termsOk = true;
  try { sessionStorage.setItem('ebms.terms', '1'); } catch (e) { /* ignore */ }
  $('terms-overlay').classList.add('hidden');
}

// ─── NAVIGATION ────────────────────────────────────────────────
function activatePage(id, navId) {
  [...PUBLIC_PAGES, ...ADMIN_PAGES].forEach((p) => $('page-' + p).classList.remove('active'));
  $('page-' + id).classList.add('active');
  document.querySelectorAll(`#${navId} button[data-page]`).forEach((b) => {
    b.classList.toggle('active', b.dataset.page === id);
  });
}

function showPage(id) {
  if (id === 'borrow' && !hasAcceptedTerms()) { showTerms(); return; }
  activatePage(id, 'public-nav');
  if (id === 'home') renderPublicHome();
  if (id === 'borrow') setDateLimits();
}

function showAdminPage(id) {
  if (!isLoggedIn()) { showLogin(); return; }
  activatePage(id, 'admin-nav');
  if (id === 'dashboard') renderDashboard();
  else if (REQUEST_TABLES[id]) renderRequestTable(id);
  else if (id === 'a-inventory') renderInventoryTable();
  else if (id === 'a-reports') renderReports();
}

// ─── ADMIN LOGIN ───────────────────────────────────────────────
let loggedIn = false; // fallback if sessionStorage is unavailable
function isLoggedIn() {
  try { return sessionStorage.getItem('ebms.admin') === '1' || loggedIn; } catch (e) { return loggedIn; }
}
function setLoggedIn(v) {
  loggedIn = v;
  try { v ? sessionStorage.setItem('ebms.admin', '1') : sessionStorage.removeItem('ebms.admin'); } catch (e) { /* ignore */ }
}
function showLogin() {
  $('admin-nav').style.display = 'none';
  $('public-nav').style.display = 'flex';
  activatePage('login', 'public-nav');
  $('login-user').focus();
}
function doLogin() {
  const user = $('login-user').value.trim();
  const pass = $('login-pass').value;
  if (!Store.checkLogin(user, pass)) {
    showToast('❌ Incorrect username or password.');
    $('login-pass').value = '';
    return;
  }
  setLoggedIn(true);
  $('login-user').value = '';
  $('login-pass').value = '';
  showToast('✅ Welcome, Admin!');
  showAdmin();
}
function logout() {
  setLoggedIn(false);
  showPublic();
  showToast('👋 Logged out.');
}

function showAdmin() {
  if (!isLoggedIn()) { showLogin(); return; }
  $('public-nav').style.display = 'none';
  $('admin-nav').style.display = 'flex';
  showAdminPage('dashboard');
}

function showPublic() {
  $('admin-nav').style.display = 'none';
  $('public-nav').style.display = 'flex';
  showPage('home');
}

function addRequestShortcut() {
  showPublic();
  showPage('borrow');
}

// Re-draw whichever admin page is open after data changes
function refreshAdminView() {
  const active = ADMIN_PAGES.find((p) => $('page-' + p).classList.contains('active'));
  refreshAll();
  if (active) showAdminPage(active);
}

// ─── BORROW FORM HELPERS ───────────────────────────────────────
let pendingIdImage = null;

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Past dates can't be picked: both fields start at today; return date starts at the date needed
function setDateLimits() {
  const today = todayStr();
  $('f-date').min = today;
  $('f-return').min = $('f-date').value && $('f-date').value >= today ? $('f-date').value : today;
}

function syncReturnMin() {
  setDateLimits();
  if ($('f-return').value && $('f-return').value < $('f-return').min) $('f-return').value = '';
}

// Quantity can't exceed what's available for the selected item
function updateQtyLimit() {
  const qty = $('f-qty'), hint = $('qty-hint');
  const item = Store.getItem($('f-equipment').value);
  hint.classList.remove('hint-out');
  if (!item) {
    qty.removeAttribute('max'); qty.disabled = false; qty.placeholder = 'Select item first'; hint.textContent = '';
    return;
  }
  const s = stockStatus(item);
  qty.max = s.avail;
  qty.disabled = s.soldOut;
  if (s.soldOut) {
    qty.value = '';
    qty.placeholder = 'Not available';
    hint.classList.add('hint-out');
    hint.textContent = s.onLoan
      ? `❌ Not available — all ${s.out} unit(s) are currently out on loan.`
      : '❌ Not available right now.';
    return;
  }
  qty.placeholder = `Max ${s.avail}`;
  hint.textContent = `Available: ${s.avail}` + (s.out > 0 ? ` (${s.out} out on loan)` : '');
  if (parseInt(qty.value, 10) > s.avail) qty.value = s.avail;
}
function clampQty() {
  const qty = $('f-qty');
  const max = parseInt(qty.max, 10);
  const v = parseInt(qty.value, 10);
  if (!Number.isNaN(max) && v > max) { qty.value = max; showToast(`⚠️ Only ${max} available.`); }
  else if (v < 1) qty.value = '';
}

// Read the chosen image, shrink it (max 900px, JPEG) so it fits in browser storage
function handleIdUpload(input) {
  const file = input.files[0];
  const preview = $('f-id-preview');
  pendingIdImage = null;
  preview.style.display = 'none';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('⚠️ Please choose an image file (JPG/PNG).');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      pendingIdImage = canvas.toDataURL('image/jpeg', 0.75);
      preview.src = pendingIdImage;
      preview.style.display = 'block';
    };
    img.onerror = () => { showToast('⚠️ Could not read that image.'); input.value = ''; };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ─── BORROW FORM ───────────────────────────────────────────────
function submitRequest() {
  if (!hasAcceptedTerms()) { showTerms(); return; }
  const name = $('f-name').value.trim();
  const contact = $('f-contact').value.trim();
  const item = $('f-equipment').value;
  const qty = parseInt($('f-qty').value, 10);
  const purpose = $('f-purpose').value.trim();
  const dateNeeded = $('f-date').value;
  const returnDate = $('f-return').value;

  if (!name || !contact || !item || !qty || !purpose || !dateNeeded || !returnDate) {
    showToast('⚠️ Please fill in all fields.');
    return;
  }
  if (!/^\d{11}$/.test(contact)) { showToast('⚠️ Contact number must be exactly 11 digits.'); return; }
  if (!pendingIdImage) { showToast('⚠️ Please attach a picture of your valid ID.'); return; }
  const today = todayStr();
  if (dateNeeded < today || returnDate < today) { showToast('⚠️ Dates cannot be in the past.'); return; }
  if (qty < 1) { showToast('⚠️ Quantity must be at least 1.'); return; }
  if (returnDate < dateNeeded) { showToast('⚠️ Return date cannot be before the date needed.'); return; }

  const itemObj = Store.getItem(item);
  const available = Store.available(itemObj);
  if (available === 0) {
    showToast(Store.inUse(item) > 0
      ? `❌ ${item} is not available — all units are currently out on loan.`
      : `❌ ${item} is not available right now.`);
    return;
  }
  if (qty > available) {
    showToast(`⚠️ Only ${available} ${item} available right now.`);
    return;
  }

  const req = Store.addRequest({ name, contact, item, qty, purpose, dateNeeded, returnDate, idImage: pendingIdImage, termsAcceptedAt: new Date().toISOString() });
  if (!req) { showToast('❌ Storage is full. Please remove old requests or use a smaller ID photo.'); return; }

  $('req-id-out').textContent = req.id;
  $('borrow-success').classList.add('show');
  ['f-name', 'f-contact', 'f-qty', 'f-purpose', 'f-date', 'f-return', 'f-id'].forEach((id) => ($(id).value = ''));
  pendingIdImage = null;
  $('f-id-preview').style.display = 'none';
  setDateLimits();
  $('f-equipment').value = '';
  refreshAll();
  showToast('✅ Request ' + req.id + ' submitted!');
}

// ─── REQUEST DETAILS ───────────────────────────────────────────
function viewDetail(id) {
  const r = Store.getRequest(id);
  if (!r) return;
  openModal({
    title: 'Request Details – ' + r.id,
    formHtml: requestDetailsHtml(r),
    confirmText: 'Close',
  });
}

// ─── ADMIN ACTIONS ─────────────────────────────────────────────
function approveReq(id) {
  const r = Store.getRequest(id);
  if (!r) return;
  const available = Store.available(Store.getItem(r.item));
  if (r.qty > available) {
    showToast(`⚠️ Cannot approve: only ${available} ${r.item} available.`);
    return;
  }
  Store.setStatus(id, Store.STATUS.APPROVED);
  showToast('✅ ' + id + ' approved!');
  refreshAdminView();
}

function rejectReq(id) {
  const r = Store.getRequest(id);
  if (!r) return;
  openModal({
    title: 'Reject Request',
    body: `Reject ${r.id} from ${r.name} (${r.qty} × ${r.item})?`,
    formHtml: '<div class="form-group"><label for="reject-reason">Reason (optional)</label><textarea id="reject-reason" placeholder="e.g. Items not available on that date"></textarea></div>',
    confirmText: 'Reject',
    showCancel: true,
    onConfirm: () => {
      const reason = $('reject-reason').value.trim();
      Store.setStatus(id, Store.STATUS.REJECTED, { rejectReason: reason });
      closeModal();
      showToast('🚫 ' + id + ' rejected.');
      refreshAdminView();
    },
  });
}

function markReturned(id) {
  Store.setStatus(id, Store.STATUS.RETURNED);
  showToast('📦 ' + id + ' marked as returned.');
  refreshAdminView();
}

function markLost(id) {
  const r = Store.getRequest(id);
  if (!r) return;
  openModal({
    title: 'Mark as Lost/Damaged',
    body: `Mark ${r.id} (${r.qty} × ${r.item}) as lost or damaged? The items will be counted in the item's Lost/Damaged total.`,
    confirmText: 'Confirm',
    showCancel: true,
    onConfirm: () => {
      Store.setStatus(id, Store.STATUS.LOST);
      const it = Store.getItem(r.item);
      if (it) Store.updateItem(Store.getItems().indexOf(it), { total: it.total, lost: it.lost + r.qty });
      closeModal();
      showToast('⚠️ ' + id + ' marked as lost/damaged.');
      refreshAdminView();
    },
  });
}

function editItem(i) {
  const it = Store.getItems()[i];
  openModal({
    title: 'Edit: ' + it.name,
    body: 'Update inventory numbers for this item. "In use" is calculated from approved requests.',
    formHtml: `
      <div class="form-group"><label for="edit-total">Total Quantity</label><input type="number" id="edit-total" value="${it.total}" min="0"></div>
      <div class="form-group"><label for="edit-lost">Lost/Damaged</label><input type="number" id="edit-lost" value="${it.lost}" min="0"></div>`,
    confirmText: 'Save Changes',
    showCancel: true,
    onConfirm: () => {
      const total = parseInt($('edit-total').value, 10);
      const lost = parseInt($('edit-lost').value, 10);
      if (Number.isNaN(total) || Number.isNaN(lost) || total < 0 || lost < 0) {
        showToast('⚠️ Enter valid numbers.');
        return;
      }
      if (lost > total) { showToast('⚠️ Lost/Damaged cannot exceed total.'); return; }
      Store.updateItem(i, { total, lost });
      closeModal();
      showToast('✅ Item updated!');
      refreshAdminView();
    },
  });
}

function showAddItem() {
  openModal({
    title: 'Add New Item',
    body: 'Enter details for the new equipment item.',
    formHtml: `
      <div class="form-group"><label for="add-name">Item Name</label><input type="text" id="add-name" placeholder="e.g. Sound System"></div>
      <div class="form-group"><label for="add-total">Total Quantity</label><input type="number" id="add-total" placeholder="0" min="0"></div>`,
    confirmText: 'Add Item',
    showCancel: true,
    onConfirm: () => {
      const name = $('add-name').value.trim();
      const total = parseInt($('add-total').value, 10) || 0;
      if (!name) { showToast('⚠️ Please enter item name.'); return; }
      if (Store.getItem(name)) { showToast('⚠️ That item already exists.'); return; }
      Store.addItem(name, total);
      closeModal();
      showToast('✅ Item added: ' + name);
      refreshAdminView();
    },
  });
}

function resetData() {
  openModal({
    title: 'Reset Demo Data',
    body: 'This erases all saved requests and items and restores the sample data. Continue?',
    confirmText: 'Reset',
    showCancel: true,
    onConfirm: () => {
      Store.reset();
      closeModal();
      showToast('🔄 Data reset.');
      refreshAdminView();
    },
  });
}

// ─── INIT ──────────────────────────────────────────────────────
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
$('login-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
$('year').textContent = new Date().getFullYear();

refreshAll();
setDateLimits();
if (hasAcceptedTerms()) $('terms-overlay').classList.add('hidden'); else showTerms();
