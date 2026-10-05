// ===== FORGIA DEL DANNATO Gestionale - Script =====
const firebaseConfig = {
  apiKey: "AIzaSyDx45rL90fBGEgOB1ErS27kFy97v8AiAAE",
  authDomain: "forgia-del-dannato-horde.firebaseapp.com",
  projectId: "forgia-del-dannato-horde",
  storageBucket: "forgia-del-dannato-horde.firebasestorage.app",
  messagingSenderId: "270454280136",
  appId: "1:270454280136:web:520209fb276284a100bafd",
  measurementId: "G-DPN2LN9B9B"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Stato Globale
let currentUser = null;
let userRole = null; // 'gestore' | 'dipendente'
let currentEmployeeId = null;
let currentEmployeeData = null;
let staffSession = null;
let localCatalog = {};
let localEmployees = {};
let localSales = {};
let localSalariesStatus = {};
let localInventory = {};
let localInventoryLogs = [];
let localStashes = {};
let localArchive = {};
let localItemImages = {};
let localSettings = {
    freeSalesEnabled: false,
    freeSalesForgePct: 40
};

// DOM
const loginPage = document.getElementById('login-page');
const mainDashboard = document.getElementById('main-dashboard');
const roleBadge = document.getElementById('role-badge');

const navSalesBtn = document.getElementById('nav-sales-btn');
const navInventoryBtn = document.getElementById('nav-inventory-btn');
const navAdminBtn = document.getElementById('nav-admin-btn');

const salesSection = document.getElementById('sales-section');
const inventorySection = document.getElementById('inventory-section');
const adminSection = document.getElementById('admin-section');

const logoutBtn = document.getElementById('logout-btn');
const adminEmployeeFilter = document.getElementById('admin-employee-filter');

// Gestione immagini logo
const imgLogin = document.getElementById('login-main-logo');
const imgNav = document.getElementById('nav-main-logo');
if (imgLogin) imgLogin.onerror = function() { this.style.display = 'none'; };
if (imgNav) imgNav.onerror = function() { this.style.display = 'none'; };

// --- UTILS ---
function formatValuta(valore) {
    if (isNaN(valore) || valore === null) valore = 0;
    return "€ " + valore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStartOfCurrentWeek() {
    const now = new Date();
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    monday.setHours(0, 0, 0, 0);
    return monday.getTime();
}

function getStashName(stashId) {
    if (localStashes[stashId]) return localStashes[stashId].name;
    return stashId || '—';
}

// --- TOAST ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    let bgClass = 'bg-emerald-600 border-emerald-500';
    let iconClass = 'fa-circle-check';
    if (type === 'error') { bgClass = 'bg-red-600 border-red-500'; iconClass = 'fa-circle-exclamation'; }
    else if (type === 'info') { bgClass = 'bg-indigo-600 border-indigo-500'; iconClass = 'fa-circle-info'; }
    else if (type === 'warning') { bgClass = 'bg-amber-500 border-amber-400 text-gray-900'; iconClass = 'fa-triangle-exclamation'; }

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-white ${bgClass} transform transition-all duration-300 translate-x-4 opacity-0 text-sm font-medium w-full`;
    toast.innerHTML = `
        <i class="fa-solid ${iconClass} text-base shrink-0"></i>
        <div class="flex-1 leading-snug">${message}</div>
        <button type="button" class="ml-1 hover:opacity-70 transition text-current shrink-0 p-1" onclick="this.closest('div').remove()" aria-label="Chiudi"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-4', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    });
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-4');
        toast.classList.remove('opacity-100', 'translate-x-0');
        setTimeout(() => toast.remove(), 280);
    }, 4200);
}

// --- CONFIRM MODAL ---
let modalCallback = null;
function showConfirmModal(title, message, onConfirm, isDangerous = true) {
    const modal = document.getElementById('custom-modal');
    const box = document.getElementById('modal-box');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const icon = document.getElementById('modal-icon');
    if (isDangerous) {
        confirmBtn.className = "px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm transition";
        icon.className = "fa-solid fa-triangle-exclamation text-2xl text-red-400";
    } else {
        confirmBtn.className = "px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 rounded-xl font-bold text-sm transition";
        icon.className = "fa-solid fa-circle-question text-2xl text-amber-400";
    }
    modalCallback = onConfirm;
    modal.classList.remove('hidden');
    setTimeout(() => {
        box.classList.remove('scale-95', 'opacity-0');
        box.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeConfirmModal() {
    const modal = document.getElementById('custom-modal');
    const box = document.getElementById('modal-box');
    box.classList.remove('scale-100', 'opacity-100');
    box.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modalCallback = null;
    }, 200);
}

document.getElementById('modal-cancel-btn').addEventListener('click', closeConfirmModal);
document.getElementById('modal-confirm-btn').addEventListener('click', () => {
    if (modalCallback) modalCallback();
    closeConfirmModal();
});

// --- SMART MODAL ---
window.openSmartModal = function(type, itemId) {
    const modal = document.getElementById('smart-action-modal');
    const box = document.getElementById('smart-modal-box');
    const empSelect = document.getElementById('smart-modal-employee');
    empSelect.innerHTML = '<option value="">-- Seleziona Operatore --</option>';
    Object.keys(localEmployees).forEach(key => {
        empSelect.innerHTML += `<option value="${key}">${localEmployees[key].name}</option>`;
    });

    document.getElementById('smart-modal-form').reset();
    if (userRole === 'dipendente' && currentEmployeeId) {
        empSelect.value = currentEmployeeId;
        empSelect.disabled = true;
    } else {
        empSelect.disabled = false;
    }
    document.getElementById('smart-modal-type').value = type;
    document.getElementById('smart-modal-item-id').value = itemId || '';
    document.getElementById('smart-modal-action-container').classList.add('hidden');
    document.getElementById('smart-modal-custom-name-container').classList.add('hidden');
    document.getElementById('smart-modal-price-container').classList.add('hidden');
    document.getElementById('smart-modal-reason-container').classList.add('hidden');
    const pctBox = document.getElementById('smart-modal-pct-container');
    if (pctBox) pctBox.classList.add('hidden');
    const freePreview = document.getElementById('smart-modal-free-preview');
    if (freePreview) freePreview.classList.add('hidden');

    const titleEl = document.getElementById('smart-modal-title');
    const submitBtn = document.getElementById('smart-modal-submit');
    const priceInput = document.getElementById('smart-modal-price');
    document.getElementById('smart-modal-quantity').value = "1";
    const freePctInput = document.getElementById('smart-modal-free-pct');
    if (freePctInput) freePctInput.value = '';

    if (type === 'inv') {
        const item = localInventory[itemId];
        if (!item) return;
        titleEl.innerHTML = `<i class="fa-solid fa-boxes-stacked mr-2"></i> Gestisci: <span class="text-white">${item.name}</span>`;
        document.getElementById('smart-modal-action-container').classList.remove('hidden');
        document.getElementById('smart-modal-reason-container').classList.remove('hidden');
        submitBtn.textContent = "Conferma Movimento";
        submitBtn.className = "w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition transform active:scale-95 shadow-lg mt-4";
    } else if (type === 'sale_catalog') {
        const item = localCatalog[itemId];
        if (!item) return;
        titleEl.innerHTML = `<i class="fa-solid fa-cash-register mr-2"></i> Vendi: <span class="text-white">${item.name}</span>`;
        document.getElementById('smart-modal-price-container').classList.remove('hidden');
        document.getElementById('smart-modal-price-label').textContent = "Prezzo Unitario (€)";
        priceInput.value = item.price;
        priceInput.disabled = true;
        submitBtn.textContent = "Registra Vendita";
        submitBtn.className = "w-full py-3 bg-amber-500 hover:bg-amber-600 text-gray-900 font-extrabold rounded-xl transition transform active:scale-95 shadow-lg mt-4";
    } else if (type === 'sale_custom') {
        if (!localSettings.freeSalesEnabled && userRole !== 'gestore') {
            showToast("Le vendite libere non sono abilitate dal gestore.", "warning");
            return;
        }
        titleEl.innerHTML = `<i class="fa-solid fa-bolt mr-2"></i> Nuova Vendita Libera`;
        document.getElementById('smart-modal-custom-name-container').classList.remove('hidden');
        document.getElementById('smart-modal-price-container').classList.remove('hidden');
        if (pctBox) pctBox.classList.remove('hidden');
        document.getElementById('smart-modal-price-label').textContent = "Prezzo base senza % (€)";
        priceInput.value = '';
        priceInput.disabled = false;
        const lockedPct = (localSettings.freeSalesForgePct != null) ? localSettings.freeSalesForgePct : 40;
        if (freePctInput) {
            freePctInput.value = lockedPct;
            // Solo gestore può cambiare la % al momento; staff usa quella impostata
            freePctInput.disabled = (userRole !== 'gestore');
        }
        submitBtn.textContent = "Registra Vendita";
        submitBtn.className = "w-full py-3 bg-amber-500 hover:bg-amber-600 text-gray-900 font-extrabold rounded-xl transition transform active:scale-95 shadow-lg mt-4";
        if (typeof updateFreeSalePreview === 'function') updateFreeSalePreview();
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        box.classList.remove('scale-95', 'opacity-0');
        box.classList.add('scale-100', 'opacity-100');
    }, 10);
};

function updateFreeSalePreview() {
    const preview = document.getElementById('smart-modal-free-preview');
    if (!preview) return;
    const baseUnit = parseFloat(document.getElementById('smart-modal-price')?.value);
    const pct = parseFloat(document.getElementById('smart-modal-free-pct')?.value);
    const qty = parseInt(document.getElementById('smart-modal-quantity')?.value) || 1;
    if (isNaN(baseUnit) || baseUnit < 0 || isNaN(pct) || pct < 0) {
        preview.classList.add('hidden');
        return;
    }
    const empId = document.getElementById('smart-modal-employee')?.value;
    let empPct = 40;
    if (empId && localEmployees[empId] && localEmployees[empId].customPercentage != null && localEmployees[empId].customPercentage !== '') {
        empPct = parseFloat(localEmployees[empId].customPercentage) || 40;
    } else if (userRole === 'dipendente' && currentEmployeeId && localEmployees[currentEmployeeId]?.customPercentage != null) {
        empPct = parseFloat(localEmployees[currentEmployeeId].customPercentage) || 40;
    }
    const priceWithoutPct = baseUnit * qty;
    const forgeGain = priceWithoutPct * (pct / 100);
    const totalPrice = priceWithoutPct + forgeGain;
    const employeeGain = forgeGain * (empPct / 100);
    const elBase = document.getElementById('preview-base');
    const elForge = document.getElementById('preview-forge');
    const elTotal = document.getElementById('preview-total');
    const elEmp = document.getElementById('preview-emp');
    if (elBase) elBase.textContent = formatValuta(priceWithoutPct);
    if (elForge) elForge.textContent = formatValuta(forgeGain) + ' (' + pct + '%)';
    if (elTotal) elTotal.textContent = formatValuta(totalPrice);
    if (elEmp) elEmp.textContent = formatValuta(employeeGain) + ' (su ' + empPct + '% pers.)';
    preview.classList.remove('hidden');
}

['smart-modal-price', 'smart-modal-free-pct', 'smart-modal-quantity', 'smart-modal-employee'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', () => {
            const box = document.getElementById('smart-modal-pct-container');
            if (box && !box.classList.contains('hidden')) updateFreeSalePreview();
        });
        el.addEventListener('change', () => {
            const box = document.getElementById('smart-modal-pct-container');
            if (box && !box.classList.contains('hidden')) updateFreeSalePreview();
        });
    }
});

window.closeSmartModal = function() {
    const modal = document.getElementById('smart-action-modal');
    const box = document.getElementById('smart-modal-box');
    box.classList.remove('scale-100', 'opacity-100');
    box.classList.add('scale-95', 'opacity-0');
    setTimeout(() => { modal.classList.add('hidden'); }, 200);
};

document.getElementById('smart-modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.getElementById('smart-modal-type').value;
    const itemId = document.getElementById('smart-modal-item-id').value;
    const empId = document.getElementById('smart-modal-employee').value;
    const qty = parseInt(document.getElementById('smart-modal-quantity').value) || 1;

    if (!empId) {
        showToast("Seleziona il tuo nome prima di procedere!", "warning");
        return;
    }

    if (type === 'inv') {
        const action = document.getElementById('smart-modal-action').value;
        const reason = document.getElementById('smart-modal-reason').value.trim();
        const item = localInventory[itemId];
        if (!item) return;

        let newQty = item.quantity;
        if (action === 'preleva') {
            if (qty > item.quantity) {
                showToast(`Impossibile prelevare ${qty}, disponibile: ${item.quantity}.`, "error");
                return;
            }
            newQty -= qty;
        } else {
            newQty += qty;
        }

        const empName = localEmployees[empId] ? localEmployees[empId].name : 'Dipendente';
        const batch = db.batch();
        const itemRef = db.collection('inventory_items').doc(itemId);
        const logRef = db.collection('inventory_logs').doc();
        batch.update(itemRef, { quantity: newQty });
        batch.set(logRef, {
            timestamp: Date.now(),
            dateString: new Date().toLocaleString('it-IT'),
            employeeId: empId,
            employeeName: empName,
            itemId: itemId,
            itemName: item.name,
            action: action,
            quantity: qty,
            reason: reason
        });
        batch.commit().then(() => {
            closeSmartModal();
            showToast(`Movimento completato!`, "success");
        }).catch(err => showToast("Errore: " + err.message, "error"));

    } else if (type.startsWith('sale_')) {
        let saleData = {
            timestamp: Date.now(),
            dateString: new Date().toLocaleString('it-IT'),
            employeeKey: empId,
            employeeName: localEmployees[empId].name,
            quantity: qty
        };

        const empPct = localEmployees[empId].customPercentage ? parseFloat(localEmployees[empId].customPercentage) : 40;
        saleData.appliedPercentage = empPct;

        if (type === 'sale_custom') {
            if (!localSettings.freeSalesEnabled && userRole !== 'gestore') {
                showToast("Le vendite libere non sono abilitate.", "warning");
                return;
            }
            const name = document.getElementById('smart-modal-custom-name').value.trim();
            const baseUnit = parseFloat(document.getElementById('smart-modal-price').value);
            let freePct = parseFloat(document.getElementById('smart-modal-free-pct')?.value);
            // Staff: forza sempre la % impostata dal gestore
            if (userRole !== 'gestore') {
                freePct = (localSettings.freeSalesForgePct != null) ? parseFloat(localSettings.freeSalesForgePct) : 40;
            }
            if (!name || isNaN(baseUnit) || baseUnit < 0) {
                showToast("Compila nome e prezzo base.", "warning");
                return;
            }
            if (isNaN(freePct) || freePct < 0) {
                showToast("Inserisci la % guadagno Forgia (≥ 0).", "warning");
                return;
            }
            const priceWithoutPct = baseUnit * qty;
            const forgeGain = priceWithoutPct * (freePct / 100);
            const finalTotalPrice = priceWithoutPct + forgeGain;
            const employeeGain = forgeGain * (empPct / 100);
            saleData.serviceName = "[LIBERO] " + name;
            saleData.totalPrice = finalTotalPrice;
            saleData.priceWithoutPct = priceWithoutPct;
            saleData.freePercentage = freePct;
            saleData.isFreeSale = true;
            saleData.forgeCost = 0;
            saleData.forgeGain = forgeGain;
            saleData.employeeGain = employeeGain;
            saleData.appliedPercentage = empPct;
        } else {
            const item = localCatalog[itemId];
            const finalTotalPrice = item.price * qty;
            const finalForgeCost = (item.cost || 0) * qty;
            const forgeGain = finalTotalPrice - finalForgeCost;
            const employeeGain = (forgeGain * empPct) / 100;
            saleData.serviceName = item.name;
            saleData.totalPrice = finalTotalPrice;
            saleData.forgeCost = finalForgeCost;
            saleData.forgeGain = forgeGain;
            saleData.employeeGain = employeeGain;
        }

        db.collection('current_sales').add(saleData)
            .then(() => {
                closeSmartModal();
                showToast("Vendita registrata!", "success");
            })
            .catch(err => showToast("Errore: " + err.message, "error"));
    }
});

// --- MANUTENZIONE ---
(function() {
    const manutenzioneDiv = document.getElementById('schermata-manutenzione');
    function controllaStatoManutenzione() {
        fetch('status.txt?t=' + new Date().getTime())
            .then(response => {
                if (!response.ok) throw new Error('File status non trovato');
                return response.text();
            })
            .then(stato => {
                const statoPulito = stato.trim().toLowerCase();
                manutenzioneDiv.style.display = (statoPulito === 'on') ? 'flex' : 'none';
            })
            .catch(err => console.log('Errore controllo manutenzione:', err));
    }
    controllaStatoManutenzione();
    setInterval(controllaStatoManutenzione, 5000);
})();

const loginStaffForm = document.getElementById('login-staff-form');
const loginGestoreForm = document.getElementById('login-gestore-form');
const loginStaffPanel = document.getElementById('login-staff-panel');
const loginGestorePanel = document.getElementById('login-gestore-panel');

document.getElementById('show-gestore-login')?.addEventListener('click', () => {
    loginStaffPanel.classList.add('hidden');
    loginGestorePanel.classList.remove('hidden');
});
document.getElementById('show-staff-login')?.addEventListener('click', () => {
    loginGestorePanel.classList.add('hidden');
    loginStaffPanel.classList.remove('hidden');
});

function applyStaffSession(session, employeeData) {
    staffSession = session;
    currentEmployeeId = session.id;
    currentEmployeeData = employeeData || null;
    userRole = 'dipendente';
    sessionStorage.setItem('forgia_staff_session', JSON.stringify(session));
    setupUIForRole();
    initDatabaseListeners();
    loginPage.classList.add('hidden');
    mainDashboard.classList.remove('hidden');
}

function tryRestoreStaffSession() {
    if (userRole === 'gestore') return false;
    const saved = sessionStorage.getItem('forgia_staff_session');
    if (!saved) return false;
    try {
        const session = JSON.parse(saved);
        if (!session || !session.id) return false;
        applyStaffSession(session, null);
        return true;
    } catch (_) {
        sessionStorage.removeItem('forgia_staff_session');
        return false;
    }
}

loginStaffForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nick = document.getElementById('staff-login').value.trim();
    const password = document.getElementById('staff-password').value;

    if (!nick || !password) {
        showToast("Inserisci nickname e password.", "warning");
        return;
    }

    const btn = loginStaffForm.querySelector('button[type="submit"]');
    const prevBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Accesso...';
    }

    try {
        const snap = await db.collection('employees').get();
        const nickLower = nick.toLowerCase();
        let found = null;
        let foundId = null;

        snap.forEach(doc => {
            const d = doc.data();
            const loginMatch = (d.login || '').trim().toLowerCase() === nickLower;
            const nameMatch = (d.name || '').trim().toLowerCase() === nickLower;
            if ((loginMatch || nameMatch) && String(d.password) === String(password)) {
                found = d;
                foundId = doc.id;
            }
        });

        if (!found) {
            showToast("Nickname o password non validi.", "error");
            if (btn) { btn.disabled = false; btn.innerHTML = prevBtnHtml; }
            return;
        }

        applyStaffSession({
            id: foundId,
            name: found.name,
            login: found.login || found.name,
            roles: found.roles || { sales: true, inv: true },
            customPercentage: found.customPercentage || 40
        }, found);

        showToast(`Benvenuto, ${found.name}!`, "success");
        if (btn) { btn.disabled = false; btn.innerHTML = prevBtnHtml; }
    } catch (err) {
        console.error('Login staff error:', err);
        const msg = (err && String(err.code || err.message || '').includes('permission'))
            ? "Permesso negato su employees. Aggiorna le regole Firestore (read pubblico su employees)."
            : ("Errore di accesso: " + (err.message || err));
        showToast(msg, "error");
        if (btn) { btn.disabled = false; btn.innerHTML = prevBtnHtml; }
    }
});

// LOGIN GESTORE — solo forgiadeldannato@horde.it
const GESTORE_EMAIL = 'forgiadeldannato@horde.it';

loginGestoreForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('gestore-email').value.trim().toLowerCase();
    const password = document.getElementById('gestore-password').value;

    if (email !== GESTORE_EMAIL) {
        showToast("Accesso gestore non autorizzato.", "error");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            staffSession = null;
            currentEmployeeId = null;
            sessionStorage.removeItem('forgia_staff_session');
            showToast("Accesso Gestore effettuato!", "success");
        })
        .catch(err => showToast("Errore di accesso: " + err.message, "error"));
});

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        if ((user.email || '').toLowerCase() === GESTORE_EMAIL) {
            userRole = 'gestore';
            staffSession = null;
            currentEmployeeId = null;
            currentEmployeeData = null;
            sessionStorage.removeItem('forgia_staff_session');
            setupUIForRole();
            initDatabaseListeners();
            loginPage.classList.add('hidden');
            mainDashboard.classList.remove('hidden');
        } else if (user.isAnonymous) {
            auth.signOut().catch(() => {});
        } else {
            auth.signOut();
            showToast("Accesso non autorizzato.", "error");
        }
    } else {
        currentUser = null;
        if (tryRestoreStaffSession()) return;
        if (userRole !== 'dipendente') {
            userRole = null;
            staffSession = null;
            currentEmployeeId = null;
            currentEmployeeData = null;
            loginPage.classList.remove('hidden');
            mainDashboard.classList.add('hidden');
        }
    }
});

logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('forgia_staff_session');
    staffSession = null;
    currentEmployeeId = null;
    currentEmployeeData = null;
    userRole = null;
    if (auth.currentUser) {
        auth.signOut().then(() => window.location.reload());
    } else {
        window.location.reload();
    }
});

tryRestoreStaffSession();

function setupUIForRole() {
    const isGestore = userRole === 'gestore';
    const roles = (staffSession && staffSession.roles) || {};

    if (isGestore) {
        roleBadge.textContent = 'GESTORE';
        roleBadge.className = "px-3 py-1 badge-gestore text-xs font-semibold rounded-full";
    } else {
        roleBadge.textContent = (staffSession?.name || 'STAFF').toUpperCase();
        roleBadge.className = "px-3 py-1 bg-orange-500/20 text-xs font-semibold rounded-full text-orange-300 border border-orange-500/30";
    }

    const show = (btn, visible) => {
        if (!btn) return;
        if (visible) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    };

    show(navSalesBtn, isGestore || roles.sales !== false);
    show(navInventoryBtn, isGestore || roles.inv !== false);
    show(navAdminBtn, isGestore);

    const adminInv = document.getElementById('admin-inventory-controls');
    if (adminInv) adminInv.classList.toggle('hidden', !isGestore);

    if (inventorySection) inventorySection.classList.toggle('staff-centered', !isGestore);

    document.getElementById('manager-sales-archive-section')?.classList.toggle('hidden', !isGestore);
    document.getElementById('sales-employee-filter')?.classList.toggle('hidden', !isGestore);

    if (isGestore || roles.sales !== false) showSection('sales');
    else if (roles.inv !== false) showSection('inventory');
    else showSection('sales');
}

// --- NAVIGAZIONE ---
navSalesBtn.addEventListener('click', () => showSection('sales'));
navInventoryBtn.addEventListener('click', () => showSection('inventory'));
navAdminBtn.addEventListener('click', () => showSection('admin'));

let currentSectionId = 'sales';

function isSectionVisible(section) {
    return currentSectionId === section;
}
function isAdminOpen() {
    return currentSectionId === 'admin' && userRole === 'gestore';
}
function scheduleUI(fn, delay) {
    const run = function () {
        try { fn(); } catch (e) { console.error(e); }
    };
    if (delay && delay > 0) {
        setTimeout(function () {
            if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 600 });
            else run();
        }, delay);
    } else if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 400 });
    } else {
        setTimeout(run, 0);
    }
}

function refreshActiveSectionUI() {
    switch (currentSectionId) {
        case 'sales':
            if (typeof renderQuickSalesGrid === 'function') renderQuickSalesGrid();
            if (typeof renderSalesTable === 'function') renderSalesTable();
            if (typeof renderSalesDropdowns === 'function') renderSalesDropdowns();
            if (typeof renderSalesArchiveWindow === 'function') renderSalesArchiveWindow(localArchive);
            break;
        case 'inventory':
            if (typeof renderStashDropdowns === 'function') renderStashDropdowns();
            if (typeof renderInventoryGrid === 'function') renderInventoryGrid();
            if (typeof renderInventoryLogs === 'function') renderInventoryLogs();
            break;
        case 'admin':
            if (typeof renderCatalog === 'function') renderCatalog();
            if (typeof renderEmployees === 'function') renderEmployees();
            if (typeof renderCustomStashesList === 'function') renderCustomStashesList();
            if (typeof calculateManagementData === 'function') calculateManagementData();
            if (typeof renderArchive === 'function') renderArchive(localArchive);
            if (typeof renderItemImagesLibrary === 'function') renderItemImagesLibrary();
            if (typeof renderItemImageSelects === 'function') renderItemImageSelects();
            if (typeof applySettingsToAdminUI === 'function') applySettingsToAdminUI();
            break;
        default:
            break;
    }
}

function showSection(section) {
    currentSectionId = section;
    [salesSection, inventorySection, adminSection].forEach(s => s && s.classList.add('hidden'));
    
    const inactiveClass = "px-3 py-2 rounded-xl bg-gray-700 text-gray-200 font-medium transition hover:bg-gray-600 text-sm";
    const activeClass = "px-3 py-2 rounded-xl nav-active font-medium transition text-sm";
    
    [navSalesBtn, navInventoryBtn, navAdminBtn].forEach(b => {
        if (!b) return;
        const wasHidden = b.classList.contains('hidden');
        b.className = inactiveClass + (wasHidden ? ' hidden' : '');
    });

    if (section === 'sales') {
        salesSection.classList.remove('hidden');
        navSalesBtn.className = activeClass;
    } else if (section === 'inventory') {
        inventorySection.classList.remove('hidden');
        navInventoryBtn.className = activeClass;
    } else if (section === 'admin') {
        adminSection.classList.remove('hidden');
        navAdminBtn.className = activeClass;
    }

    scheduleUI(function () { refreshActiveSectionUI(); });
}

// --- LISTENERS FIRESTORE ---
let listenersStarted = false;

function initDatabaseListeners() {
    if (listenersStarted) return;
    listenersStarted = true;

    db.collection('employees').onSnapshot(snapshot => {
        localEmployees = {};
        snapshot.forEach(doc => { localEmployees[doc.id] = doc.data(); });
        scheduleUI(function () {
            if (typeof renderAllEmployeeDropdowns === 'function') renderAllEmployeeDropdowns();
            if (typeof renderAdminFilterDropdown === 'function') renderAdminFilterDropdown();
            if (isAdminOpen() && typeof renderEmployees === 'function') renderEmployees();
        });
    });

    db.collection('catalog').onSnapshot(snapshot => {
        localCatalog = {};
        snapshot.forEach(doc => { localCatalog[doc.id] = doc.data(); });
        scheduleUI(function () {
            if (isSectionVisible('sales')) {
                if (typeof renderSalesDropdowns === 'function') renderSalesDropdowns();
                if (typeof renderQuickSalesGrid === 'function') renderQuickSalesGrid();
            }
            if (isAdminOpen() && typeof renderCatalog === 'function') renderCatalog();
        });
    });

    setTimeout(function () {
        db.collection('custom_stashes').onSnapshot(snapshot => {
            localStashes = {};
            snapshot.forEach(doc => { localStashes[doc.id] = doc.data(); });
            scheduleUI(function () {
                if (typeof renderStashDropdowns === 'function') renderStashDropdowns();
                if (isAdminOpen() && typeof renderCustomStashesList === 'function') renderCustomStashesList();
                if (isSectionVisible('inventory') && typeof renderInventoryGrid === 'function') renderInventoryGrid();
            });
        });

        db.collection('current_sales').onSnapshot(snapshot => {
            localSales = {};
            snapshot.forEach(doc => { localSales[doc.id] = doc.data(); });
            scheduleUI(function () {
                if (isSectionVisible('sales') && typeof renderSalesTable === 'function') renderSalesTable();
                if (isAdminOpen() && typeof calculateManagementData === 'function') calculateManagementData();
            });
        });

        db.collection('current_salaries_status').onSnapshot(snapshot => {
            localSalariesStatus = {};
            snapshot.forEach(doc => { localSalariesStatus[doc.id] = doc.data().status || 'non_pagato'; });
            scheduleUI(function () {
                if (isAdminOpen() && typeof calculateManagementData === 'function') calculateManagementData();
            });
        });

        db.collection('inventory_items').onSnapshot(snapshot => {
            localInventory = {};
            snapshot.forEach(doc => { localInventory[doc.id] = doc.data(); });
            scheduleUI(function () {
                if (isSectionVisible('inventory') && typeof renderInventoryGrid === 'function') renderInventoryGrid();
            });
        });

        db.collection('inventory_logs').orderBy('timestamp', 'desc').limit(50).onSnapshot(snapshot => {
            localInventoryLogs = [];
            snapshot.forEach(doc => { localInventoryLogs.push({ id: doc.id, ...doc.data() }); });
            scheduleUI(function () {
                if (isSectionVisible('inventory') && typeof renderInventoryLogs === 'function') renderInventoryLogs();
            });
        });

        db.collection('archive').onSnapshot(snapshot => {
            localArchive = {};
            snapshot.forEach(doc => { localArchive[doc.id] = doc.data(); });
            scheduleUI(function () {
                if (isSectionVisible('sales') && typeof renderSalesArchiveWindow === 'function') renderSalesArchiveWindow(localArchive);
                if (isAdminOpen() && typeof renderArchive === 'function') renderArchive(localArchive);
            });
        });

        
        db.collection('settings').doc('app').onSnapshot(doc => {
            if (doc.exists) {
                const d = doc.data() || {};
                localSettings.freeSalesEnabled = !!d.freeSalesEnabled;
                localSettings.freeSalesForgePct = (d.freeSalesForgePct != null) ? parseFloat(d.freeSalesForgePct) : 40;
            } else {
                localSettings.freeSalesEnabled = false;
                localSettings.freeSalesForgePct = 40;
            }
            scheduleUI(function () {
                if (typeof applySettingsToAdminUI === 'function') applySettingsToAdminUI();
                if (isSectionVisible('sales') && typeof renderQuickSalesGrid === 'function') renderQuickSalesGrid();
            });
        }, err => console.error('settings listener', err));

        db.collection('item_images').onSnapshot(snapshot => {
            localItemImages = {};
            snapshot.forEach(doc => { localItemImages[doc.id] = doc.data(); });
            scheduleUI(function () {
                if (typeof renderItemImageSelects === 'function') renderItemImageSelects();
                if (isAdminOpen() && typeof renderItemImagesLibrary === 'function') renderItemImagesLibrary();
                if (isSectionVisible('inventory') && typeof renderInventoryGrid === 'function') renderInventoryGrid();
            }, 40);
        });
    }, 200);
}

// Protezione
document.addEventListener('contextmenu', event => event.preventDefault());
document.onkeydown = function(e) {
    if (e.keyCode == 123) return false;
    if (e.ctrlKey && e.shiftKey && (e.keyCode == 'I'.charCodeAt(0) || e.keyCode == 'C'.charCodeAt(0) || e.keyCode == 'J'.charCodeAt(0))) return false;
    if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false;
};

// --- STASH ---
function renderStashDropdowns() {
    const adminSel = document.getElementById('inv-admin-stash');
    const filterSel = document.getElementById('inv-stash-filter');
    let opts = '';
    Object.keys(localStashes).forEach(key => {
        opts += `<option value="${key}">${localStashes[key].name}</option>`;
    });
    if (adminSel) {
        const v = adminSel.value;
        adminSel.innerHTML = '<option value="">— Seleziona deposito —</option>' + opts;
        if (v && [...adminSel.options].some(o => o.value === v)) adminSel.value = v;
    }
    if (filterSel) {
        const v = filterSel.value;
        filterSel.innerHTML = '<option value="all">Tutti i Depositi</option>' + opts;
        if (v && [...filterSel.options].some(o => o.value === v)) filterSel.value = v;
    }
}

function renderCustomStashesList() {
    const list = document.getElementById('custom-stashes-list');
    if (!list) return;
    const keys = Object.keys(localStashes);
    if (keys.length === 0) {
        list.innerHTML = '<p class="text-xs text-gray-500 italic">Nessun deposito personalizzato.</p>';
        return;
    }
    list.innerHTML = '';
    keys.forEach(id => {
        const s = localStashes[id];
        list.innerHTML += `
            <div class="flex items-center justify-between bg-gray-900 px-3 py-2 rounded-xl border border-gray-700 text-xs">
                <span class="text-gray-200 font-medium">${s.name}</span>
                <button onclick="window.deleteStash('${id}')" class="p-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition" title="Elimina">
                    <i class="fa-solid fa-trash text-[10px]"></i>
                </button>
            </div>
        `;
    });
}

window.deleteStash = function(id) {
    showConfirmModal("Elimina Deposito", "Eliminare questo deposito?", () => {
        db.collection('custom_stashes').doc(id).delete()
            .then(() => showToast("Deposito rimosso.", "info"))
            .catch(err => showToast(err.message, "error"));
    }, true);
};

document.getElementById('stash-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('stash-name').value.trim();
    if (!name) return;
    db.collection('custom_stashes').add({ name, createdAt: Date.now() })
        .then(() => {
            e.target.reset();
            showToast("Deposito creato!", "success");
        })
        .catch(err => showToast(err.message, "error"));
});

// --- ITEM IMAGES ---
function renderItemImageSelects() {
    const sel = document.getElementById('inv-admin-img');
    if (!sel) return;
    const v = sel.value;
    let opts = '<option value="">— Nessuna / placeholder —</option>';
    Object.keys(localItemImages).forEach(id => {
        const img = localItemImages[id];
        opts += `<option value="${id}">${img.fileName || id}</option>`;
    });
    sel.innerHTML = opts;
    if (v && [...sel.options].some(o => o.value === v)) sel.value = v;
}

function renderItemImagesLibrary() {
    const grid = document.getElementById('item-images-grid');
    if (!grid) return;
    const keys = Object.keys(localItemImages);
    if (keys.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-xs text-gray-500 italic">Nessuna immagine caricata.</p>';
        return;
    }
    grid.innerHTML = '';
    keys.forEach(id => {
        const img = localItemImages[id];
        grid.innerHTML += `
            <div class="relative bg-gray-900 rounded-xl border border-gray-700 overflow-hidden p-2 group">
                <img src="${img.dataUrl}" alt="${img.fileName}" class="w-full h-20 object-contain">
                <p class="text-[10px] text-gray-400 truncate mt-1">${img.fileName || ''}</p>
                <button onclick="window.deleteItemImage('${id}')" class="absolute top-1 right-1 p-1 bg-red-600/90 text-white rounded opacity-0 group-hover:opacity-100 transition text-xs">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
    });
}

window.deleteItemImage = function(id) {
    showConfirmModal("Elimina Immagine", "Rimuovere questa immagine dalla libreria?", () => {
        db.collection('item_images').doc(id).delete()
            .then(() => showToast("Immagine rimossa.", "info"))
            .catch(err => showToast(err.message, "error"));
    }, true);
};

window.uploadItemImagesFromInput = async function() {
    const input = document.getElementById('item-image-file');
    const status = document.getElementById('item-image-status');
    if (!input || !input.files || input.files.length === 0) {
        showToast("Seleziona almeno un file PNG.", "warning");
        return;
    }
    const files = Array.from(input.files);
    let ok = 0, fail = 0;
    if (status) {
        status.classList.remove('hidden');
        status.textContent = `Caricamento di ${files.length} file...`;
    }
    for (const file of files) {
        if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
            fail++;
            continue;
        }
        if (file.size > 400 * 1024) {
            showToast(`${file.name} troppo grande (max 400KB).`, "warning");
            fail++;
            continue;
        }
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            await db.collection('item_images').add({
                fileName: file.name,
                dataUrl,
                uploadedAt: Date.now()
            });
            ok++;
        } catch (err) {
            fail++;
            console.error(err);
        }
    }
    if (status) status.textContent = `Caricate: ${ok}${fail ? `, fallite: ${fail}` : ''}`;
    input.value = '';
    showToast(`Caricate ${ok} immagini.`, ok ? "success" : "warning");
};

// --- DROPDOWNS EMPLOYEE ---
function renderAllEmployeeDropdowns() {
    // usato nei filtri
    renderSalesDropdowns();
    renderAdminFilterDropdown();
}

function renderAdminFilterDropdown() {
    const sel = document.getElementById('admin-employee-filter');
    if (!sel) return;
    const v = sel.value;
    let opts = '<option value="all">📊 MOSTRA TUTTO LO STAFF</option>';
    Object.keys(localEmployees).forEach(k => {
        opts += `<option value="${k}">${localEmployees[k].name}</option>`;
    });
    sel.innerHTML = opts;
    if (v && [...sel.options].some(o => o.value === v)) sel.value = v;
}

function renderSalesDropdowns() {
    const filter = document.getElementById('sales-employee-filter');
    const archFilter = document.getElementById('archive-window-employee-filter');
    let opts = '<option value="all">📊 Tutti i Dipendenti</option>';
    Object.keys(localEmployees).forEach(k => {
        opts += `<option value="${k}">${localEmployees[k].name}</option>`;
    });
    if (filter) {
        const v = filter.value;
        filter.innerHTML = opts;
        if (v && [...filter.options].some(o => o.value === v)) filter.value = v;
    }
    if (archFilter) {
        const v = archFilter.value;
        archFilter.innerHTML = opts;
        if (v && [...archFilter.options].some(o => o.value === v)) archFilter.value = v;
    }
}

// --- VENDITE ---
function renderQuickSalesGrid() {
    const grid = document.getElementById('quick-sales-grid');
    if (!grid) return;
    grid.innerHTML = '';
    // Vendita libera solo se abilitata dal gestore (o se sei gestore)
    if (localSettings.freeSalesEnabled || userRole === 'gestore') {
        const pctLabel = (localSettings.freeSalesForgePct != null) ? localSettings.freeSalesForgePct : 40;
        grid.innerHTML += `
            <div onclick="openSmartModal('sale_custom')" class="bg-gray-900 border border-dashed border-amber-500/50 rounded-xl p-4 cursor-pointer hover:border-amber-500 hover:bg-gray-800 transition flex flex-col items-center justify-center min-h-[100px] text-center">
                <i class="fa-solid fa-plus text-2xl text-amber-400 mb-2"></i>
                <span class="text-xs font-bold text-amber-400">Vendita Libera</span>
                <span class="text-[10px] text-gray-500 mt-1">% Forgia: ${pctLabel}</span>
            </div>
        `;
    }
    Object.keys(localCatalog).forEach(id => {
        const item = localCatalog[id];
        grid.innerHTML += `
            <div onclick="openSmartModal('sale_catalog', '${id}')" class="bg-gray-900 border border-gray-700 rounded-xl p-3 cursor-pointer hover:border-amber-500 transition min-h-[100px] flex flex-col justify-between">
                <span class="text-sm font-bold text-amber-400 leading-tight">${item.name}</span>
                <span class="text-xs text-emerald-400 font-semibold mt-2">${formatValuta(item.price)}</span>
            </div>
        `;
    });
    if (Object.keys(localCatalog).length === 0 && !localSettings.freeSalesEnabled && userRole !== 'gestore') {
        grid.innerHTML = `<div class="col-span-full text-center py-6 text-gray-500 text-sm">Nessun servizio in catalogo. Il gestore deve aggiungerli in Gestione.</div>`;
    }
}

function renderSalesTable() {
    const tbody = document.getElementById('current-sales-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    const filterVal = document.getElementById('sales-employee-filter')?.value || 'all';
    const isGestore = userRole === 'gestore';
    let sales = Object.keys(localSales).map(k => ({ id: k, ...localSales[k] }));
    sales.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (filterVal !== 'all') sales = sales.filter(s => s.employeeKey === filterVal);
    if (sales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-gray-500 text-xs">Nessuna vendita corrente.</td></tr>`;
        return;
    }
    sales.forEach(sale => {
        const delBtn = isGestore
            ? `<button onclick="window.deleteSale('${sale.id}')" class="p-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition" title="Elimina vendita"><i class="fa-solid fa-trash text-[10px]"></i></button>`
            : '';
        tbody.innerHTML += `
            <tr class="hover:bg-gray-750/50 border-b border-gray-700">
                <td class="py-2 text-xs text-gray-400">${sale.dateString || '-'}</td>
                <td class="py-2 font-semibold text-gray-200">${sale.employeeName || '-'}</td>
                <td class="py-2 text-amber-400 text-xs"><b>${sale.serviceName}</b> (x${sale.quantity || 1})</td>
                <td class="py-2 text-emerald-400 font-semibold">${formatValuta(sale.totalPrice)}</td>
                <td class="py-2 text-amber-400 font-semibold">${formatValuta(sale.forgeGain)}</td>
                <td class="py-2 text-indigo-400 font-bold">${formatValuta(sale.employeeGain)}</td>
                <td class="py-2 text-right">${delBtn}</td>
            </tr>
        `;
    });
}

window.deleteSale = function(saleId) {
    if (userRole !== 'gestore') return;
    const sale = localSales[saleId];
    const label = sale ? (sale.serviceName || 'questa vendita') : 'questa vendita';
    showConfirmModal("Elimina vendita", `Eliminare definitivamente "${label}"?`, () => {
        db.collection('current_sales').doc(saleId).delete()
            .then(() => showToast("Vendita eliminata.", "info"))
            .catch(err => showToast(err.message, "error"));
    }, true);
}

document.getElementById('sales-employee-filter')?.addEventListener('change', renderSalesTable);

function renderSalesArchiveWindow(archiveList) {
    const container = document.getElementById('archive-window-weeks-container');
    if (!container) return;
    container.innerHTML = '';
    const filterVal = document.getElementById('archive-window-employee-filter')?.value || 'all';
    const items = Object.keys(archiveList || {}).map(k => ({ key: k, ...archiveList[k] }));
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (items.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 italic">Nessun archivio.</p>';
        return;
    }
    items.forEach(item => {
        let salesHtml = '';
        let count = 0;
        Object.keys(item.sales || {}).forEach(sk => {
            const s = item.sales[sk];
            if (filterVal !== 'all' && s.employeeKey !== filterVal) return;
            count++;
            salesHtml += `<div class="text-[11px] text-gray-400 py-0.5">${s.dateString} — <b class="text-amber-400">${s.serviceName}</b> x${s.quantity || 1} · ${formatValuta(s.totalPrice)} · Dip: ${s.employeeName}</div>`;
        });
        if (count === 0 && filterVal !== 'all') return;
        container.innerHTML += `
            <div class="p-3 bg-gray-800/80 rounded-xl border border-gray-700">
                <p class="font-bold text-sm text-gray-200 mb-2">${item.title}</p>
                ${salesHtml || '<p class="text-xs text-gray-500">Nessuna vendita in questo filtro.</p>'}
            </div>
        `;
    });
}

document.getElementById('archive-window-employee-filter')?.addEventListener('change', () => renderSalesArchiveWindow(localArchive));

// --- CATALOGO ---

// --- IMPOSTAZIONI APP (vendite libere) ---
function applySettingsToAdminUI() {
    const en = document.getElementById('settings-free-sales-enabled');
    const pct = document.getElementById('settings-free-sales-pct');
    if (en) en.checked = !!localSettings.freeSalesEnabled;
    if (pct) pct.value = (localSettings.freeSalesForgePct != null) ? localSettings.freeSalesForgePct : 40;
}

document.getElementById('settings-save-btn')?.addEventListener('click', () => {
    if (userRole !== 'gestore') {
        showToast("Solo il gestore può modificare le impostazioni.", "error");
        return;
    }
    const enabled = !!document.getElementById('settings-free-sales-enabled')?.checked;
    let pct = parseFloat(document.getElementById('settings-free-sales-pct')?.value);
    if (isNaN(pct) || pct < 0) pct = 40;
    const status = document.getElementById('settings-status');
    db.collection('settings').doc('app').set({
        freeSalesEnabled: enabled,
        freeSalesForgePct: pct,
        updatedAt: Date.now()
    }, { merge: true }).then(() => {
        if (status) {
            status.classList.remove('hidden');
            status.textContent = enabled
                ? `Vendite libere ATTIVE · % Forgia: ${pct}`
                : 'Vendite libere DISATTIVATE (solo catalogo)';
        }
        showToast("Impostazioni salvate.", "success");
    }).catch(err => showToast(err.message, "error"));
});

function renderCatalog() {
    const tbody = document.getElementById('catalog-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const keys = Object.keys(localCatalog);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-center text-gray-500 text-xs">Nessun servizio in catalogo.</td></tr>`;
        return;
    }
    keys.forEach(key => {
        const item = localCatalog[key];
        tbody.innerHTML += `
            <tr class="hover:bg-gray-700/60 border-b border-gray-700 text-xs">
                <td class="p-2 font-bold text-amber-400">${item.name}</td>
                <td class="p-2 text-emerald-400">${formatValuta(item.price)}</td>
                <td class="p-2 text-gray-400">${formatValuta(item.cost || 0)}</td>
                <td class="p-2 text-right space-x-1">
                    <button onclick="window.editCatalogItem('${key}')" class="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500 hover:text-gray-900 transition" title="Modifica"><i class="fa-solid fa-pen text-[10px]"></i></button>
                    <button onclick="window.deleteCatalogItem('${key}')" class="p-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition" title="Elimina"><i class="fa-solid fa-trash text-[10px]"></i></button>
                </td>
            </tr>
        `;
    });
}

document.getElementById('catalog-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('catalog-id').value;
    const name = document.getElementById('catalog-name').value.trim();
    const price = parseFloat(document.getElementById('catalog-price').value);
    const cost = parseFloat(document.getElementById('catalog-cost').value);
    if (!name || isNaN(price)) {
        showToast("Compila nome e prezzo.", "warning");
        return;
    }
    const data = { name, price, cost: isNaN(cost) ? 0 : cost };
    if (id) {
        db.collection('catalog').doc(id).set(data, { merge: true })
            .then(() => { e.target.reset(); document.getElementById('catalog-id').value = ''; document.getElementById('catalog-submit-btn').textContent = 'Aggiungi al Catalogo'; showToast("Catalogo aggiornato!", "success"); })
            .catch(err => showToast(err.message, "error"));
    } else {
        db.collection('catalog').add(data)
            .then(() => { e.target.reset(); showToast("Servizio aggiunto!", "success"); })
            .catch(err => showToast(err.message, "error"));
    }
});

window.editCatalogItem = function(key) {
    const item = localCatalog[key];
    if (!item) return;
    document.getElementById('catalog-id').value = key;
    document.getElementById('catalog-name').value = item.name || '';
    document.getElementById('catalog-price').value = item.price ?? '';
    document.getElementById('catalog-cost').value = item.cost ?? '';
    document.getElementById('catalog-submit-btn').textContent = 'Salva Modifiche';
};

window.deleteCatalogItem = function(key) {
    showConfirmModal("Elimina Servizio", `Rimuovere "${localCatalog[key]?.name}" dal catalogo?`, () => {
        db.collection('catalog').doc(key).delete()
            .then(() => showToast("Rimosso dal catalogo.", "info"))
            .catch(err => showToast(err.message, "error"));
    }, true);
};

// --- INVENTARIO ---
document.getElementById('inv-search-filter')?.addEventListener('input', renderInventoryGrid);
document.getElementById('inv-stash-filter')?.addEventListener('change', renderInventoryGrid);

function renderInventoryGrid() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const searchVal = (document.getElementById('inv-search-filter')?.value || '').toLowerCase();
    const stashVal = document.getElementById('inv-stash-filter')?.value || 'all';
    let items = Object.keys(localInventory).map(k => ({ id: k, ...localInventory[k] }));
    if (stashVal !== 'all') items = items.filter(i => i.stash === stashVal);
    if (searchVal) items = items.filter(i => i.name.toLowerCase().includes(searchVal));
    if (items.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-6 text-gray-500 text-sm">Nessun oggetto in inventario.</div>`;
        return;
    }
    items.forEach(item => {
        grid.innerHTML += `
            <div onclick="openSmartModal('inv', '${item.id}')" class="relative bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-lg flex flex-col group cursor-pointer hover:border-amber-500 transition-all">
                <button onclick="event.stopPropagation(); window.deleteInventoryItem('${item.id}', '${(item.name || '').replace(/'/g, "\\'")}')" class="absolute top-2 right-2 p-1.5 bg-red-600/90 hover:bg-red-700 text-white rounded-lg text-xs z-20 ${userRole !== 'gestore' ? 'hidden' : ''}" title="Rimuovi">
                    <i class="fa-solid fa-trash"></i>
                </button>
                <div class="h-28 w-full bg-gray-900 flex items-center justify-center p-2">
                    <img src="${item.imageUrl || 'https://via.placeholder.com/150?text=No+Immagine'}" alt="${item.name}" class="max-h-full max-w-full object-contain drop-shadow-md group-hover:scale-110 transition" onerror="this.src='https://via.placeholder.com/150?text=No+Immagine';">
                </div>
                <div class="p-3 flex-1 flex flex-col justify-between">
                    <h4 class="font-bold text-amber-400 text-sm truncate">${item.name}</h4>
                    <div class="mt-2 flex justify-between items-end">
                        <span class="text-[10px] text-gray-400 font-semibold bg-gray-700 px-2 py-0.5 rounded">${getStashName(item.stash)}</span>
                        <span class="text-emerald-400 font-bold text-sm">Qta: ${item.quantity}</span>
                    </div>
                </div>
            </div>
        `;
    });
}

function renderInventoryLogs() {
    const tbody = document.getElementById('inventory-logs-table');
    if (!tbody) return;
    tbody.innerHTML = '';
    const isGestore = userRole === 'gestore';
    if (localInventoryLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-gray-500 text-xs">Nessun movimento.</td></tr>`;
        return;
    }
    localInventoryLogs.forEach(log => {
        const isDeposit = log.action === 'deposita';
        const badge = isDeposit
            ? `<span class="text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded text-xs font-bold">📥 Deposita</span>`
            : `<span class="text-amber-500 bg-amber-500/10 px-2 py-1 rounded text-xs font-bold">📤 Preleva</span>`;
        const delBtn = isGestore
            ? `<button onclick="window.deleteInventoryLog('${log.id}')" class="p-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition" title="Elimina log"><i class="fa-solid fa-trash text-[10px]"></i></button>`
            : '';
        tbody.innerHTML += `
            <tr class="hover:bg-gray-750/50 border-b border-gray-700">
                <td class="p-3 text-xs text-gray-400">${log.dateString}</td>
                <td class="p-3 font-semibold text-gray-200">${log.employeeName}</td>
                <td class="p-3">${badge}</td>
                <td class="p-3 text-gray-300 text-xs"><b>${log.itemName}</b> (x${log.quantity})</td>
                <td class="p-3 text-gray-400 text-xs italic truncate max-w-[150px]">${log.reason || '-'}</td>
                <td class="p-3 text-right">${delBtn}</td>
            </tr>
        `;
    });
}

window.deleteInventoryLog = function(logId) {
    if (userRole !== 'gestore') return;
    showConfirmModal("Elimina movimento", "Eliminare questo log di inventario?", () => {
        db.collection('inventory_logs').doc(logId).delete()
            .then(() => showToast("Log eliminato.", "info"))
            .catch(err => showToast(err.message, "error"));
    }, true);
}

document.getElementById('inventory-admin-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('inv-admin-name').value.trim();
    const imgId = document.getElementById('inv-admin-img').value;
    const quantity = parseInt(document.getElementById('inv-admin-qty').value) || 0;
    const stash = document.getElementById('inv-admin-stash').value;
    if (!name) { showToast("Inserisci il nome dell'oggetto.", "warning"); return; }
    if (!stash) { showToast("Seleziona un deposito.", "warning"); return; }
    let imageUrl = 'https://via.placeholder.com/150?text=No+Immagine';
    let imageFileName = '';
    if (imgId && localItemImages[imgId]) {
        imageUrl = localItemImages[imgId].dataUrl || imageUrl;
        imageFileName = localItemImages[imgId].fileName || '';
    }
    db.collection('inventory_items').add({ name, imageUrl, imageFileName, quantity, stash, createdAt: Date.now() })
        .then(() => { e.target.reset(); document.getElementById('inv-admin-qty').value = 0; showToast("Oggetto creato!", "success"); })
        .catch(err => showToast("Errore salvataggio: " + err.message, "error"));
});

window.deleteInventoryItem = function(id, name) {
    showConfirmModal("Elimina Oggetto", `Rimuovere "${name}"?`, () => {
        db.collection('inventory_items').doc(id).delete()
            .then(() => showToast("Rimosso.", "info"))
            .catch(err => showToast(err.message, "error"));
    }, true);
};

// --- EMPLOYEES ---
const employeeForm = document.getElementById('employee-form');
const empSubmitBtn = document.getElementById('emp-submit-btn');
const empCancelEditBtn = document.getElementById('emp-cancel-edit-btn');

function resetEmployeeForm() {
    if (!employeeForm) return;
    employeeForm.reset();
    document.getElementById('emp-id').value = '';
    document.getElementById('role-sales').checked = true;
    document.getElementById('role-inv').checked = true;
    if (empSubmitBtn) {
        empSubmitBtn.innerHTML = '<i class="fa-solid fa-user-plus mr-1"></i> Registra Nuovo Dipendente';
        empSubmitBtn.className = 'flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition';
    }
    if (empCancelEditBtn) empCancelEditBtn.classList.add('hidden');
}

empCancelEditBtn?.addEventListener('click', resetEmployeeForm);

if (employeeForm) {
    employeeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const empId = document.getElementById('emp-id').value;
        const name = document.getElementById('emp-name').value.trim();
        const rank = document.getElementById('emp-rank').value.trim();
        const login = document.getElementById('emp-login').value.trim();
        const password = document.getElementById('emp-password').value.trim();
        const customPercentage = document.getElementById('emp-percentage').value;

        const roles = {
            sales: document.getElementById('role-sales').checked,
            inv: document.getElementById('role-inv').checked
        };

        if (!name || !rank || !login || !password) {
            showToast("Compila nome, grado, codice login e password.", "warning");
            return;
        }

        const empData = {
            name,
            rank,
            login,
            password,
            customPercentage: customPercentage !== "" ? parseInt(customPercentage) : null,
            roles,
            updatedAt: Date.now()
        };

        if (empId) {
            db.collection('employees').doc(empId).set(empData, { merge: true })
                .then(() => {
                    resetEmployeeForm();
                    showToast("Dipendente aggiornato con successo!", "success");
                })
                .catch(err => showToast(err.message, "error"));
        } else {
            empData.createdAt = Date.now();
            db.collection('employees').add(empData)
                .then(() => {
                    resetEmployeeForm();
                    showToast("Dipendente registrato!", "success");
                })
                .catch(err => showToast(err.message, "error"));
        }
    });
}

window.editEmployee = function(key) {
    const emp = localEmployees[key];
    if (!emp) return;

    document.getElementById('emp-id').value = key;
    document.getElementById('emp-name').value = emp.name || '';
    document.getElementById('emp-rank').value = emp.rank || '';
    document.getElementById('emp-login').value = emp.login || '';
    document.getElementById('emp-password').value = emp.password || '';
    document.getElementById('emp-percentage').value = emp.customPercentage != null ? emp.customPercentage : '';

    const roles = emp.roles || {};
    document.getElementById('role-sales').checked = roles.sales !== false;
    document.getElementById('role-inv').checked = roles.inv !== false;

    if (empSubmitBtn) {
        empSubmitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Salva Modifiche';
        empSubmitBtn.className = 'flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold text-sm rounded-xl transition';
    }
    if (empCancelEditBtn) empCancelEditBtn.classList.remove('hidden');
    employeeForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast("Dati caricati. Modifica e premi Salva.", "info");
};

window.deleteEmployee = function(key) {
    showConfirmModal(
        "Rimuovi Dipendente",
        `Rimuovere "${localEmployees[key]?.name}"?`,
        () => {
            db.collection('employees').doc(key).delete()
                .then(() => {
                    if (document.getElementById('emp-id').value === key) resetEmployeeForm();
                    showToast("Dipendente rimosso.", "info");
                })
                .catch(err => showToast(err.message, "error"));
        },
        true
    );
};

function renderEmployees() {
    const tbody = document.getElementById('employee-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const keys = Object.keys(localEmployees);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-500 text-xs">Nessun dipendente.</td></tr>`;
        return;
    }
    keys.forEach(key => {
        const emp = localEmployees[key];
        const pct = emp.customPercentage ? `${emp.customPercentage}%` : '40%';
        const roles = emp.roles || {};
        const roleBadges = [];
        if (roles.sales !== false) roleBadges.push('<span class="text-amber-400">Vendite</span>');
        if (roles.inv !== false) roleBadges.push('<span class="text-blue-400">Inv</span>');
        tbody.innerHTML += `
            <tr class="hover:bg-gray-700/60 border-b border-gray-700 text-xs">
                <td class="p-2 font-bold text-amber-400">${emp.name || '-'}</td>
                <td class="p-2 text-gray-300">${emp.rank || '-'}</td>
                <td class="p-2 text-gray-300 font-mono">${emp.login || '-'}</td>
                <td class="p-2 text-gray-400 font-mono">${emp.password || '-'}</td>
                <td class="p-2 text-indigo-400">${pct}</td>
                <td class="p-2">${roleBadges.join(' ') || '-'}</td>
                <td class="p-2 text-right whitespace-nowrap space-x-1">
                    <button onclick="window.editEmployee('${key}')" class="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500 hover:text-gray-900 transition" title="Modifica">
                        <i class="fa-solid fa-pen text-[10px]"></i>
                    </button>
                    <button onclick="window.deleteEmployee('${key}')" class="p-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition" title="Elimina">
                        <i class="fa-solid fa-user-minus text-[10px]"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

window.updateSalaryStatus = function(employeeKey, statusValue) {
    db.collection('current_salaries_status').doc(employeeKey).set({ status: statusValue })
        .then(() => { showToast("Stato aggiornato.", "success"); calculateManagementData(); })
        .catch(err => showToast(err.message, "error"));
};

function calculateManagementData() {
    const filterValue = adminEmployeeFilter ? adminEmployeeFilter.value : "all";
    let totalSalesAmount = 0, totalForgeGain = 0, totalSalaries = 0, totalForgeItemCosts = 0;
    let staffStats = {};
    Object.keys(localEmployees).forEach(k => {
        staffStats[k] = {
            name: localEmployees[k].name,
            count: 0, salary: 0,
            pct: localEmployees[k].customPercentage || 40,
            status: localSalariesStatus[k] || 'non_pagato'
        };
    });

    const singleEmpTableBody = document.getElementById('single-employee-sales-table');
    const singleEmpCard = document.getElementById('single-employee-sales-card');
    const archiveSingleBtn = document.getElementById('archive-single-employee-btn');
    if (singleEmpTableBody) singleEmpTableBody.innerHTML = "";

    Object.keys(localSales).forEach(key => {
        const sale = localSales[key];
        const realKey = sale.employeeKey;
        if (!staffStats[realKey]) {
            staffStats[realKey] = {
                name: (sale.employeeName || 'Sconosciuto') + " (Rimosso)",
                count: 0, salary: 0, pct: sale.appliedPercentage || 40,
                status: localSalariesStatus[realKey] || 'non_pagato'
            };
        }
        staffStats[realKey].count += (sale.quantity || 1);
        staffStats[realKey].salary += sale.employeeGain || 0;

        if (filterValue === 'all' || sale.employeeKey === filterValue) {
            totalSalesAmount += sale.totalPrice || 0;
            totalForgeGain += sale.forgeGain || 0;
            totalSalaries += sale.employeeGain || 0;
            totalForgeItemCosts += (sale.forgeCost || 0);
            if (filterValue !== 'all' && singleEmpTableBody) {
                singleEmpTableBody.innerHTML += `
                    <tr class="hover:bg-gray-800 border-b border-gray-800">
                        <td class="py-2 text-gray-400">${sale.dateString}</td>
                        <td class="py-2 font-bold text-amber-400">${sale.serviceName}</td>
                        <td class="py-2 text-center text-gray-300">${sale.quantity || 1}</td>
                        <td class="py-2 text-emerald-400 font-semibold">${formatValuta(sale.totalPrice)}</td>
                        <td class="py-2 text-indigo-400 font-bold">${formatValuta(sale.employeeGain)}</td>
                    </tr>
                `;
            }
        }
    });

    if (filterValue !== 'all') {
        if (singleEmpCard) singleEmpCard.classList.remove('hidden');
        if (archiveSingleBtn) {
            archiveSingleBtn.classList.remove('hidden');
            archiveSingleBtn.textContent = `Archivia Settimana di ${localEmployees[filterValue]?.name || 'Dipendente'}`;
        }
        if (singleEmpTableBody && singleEmpTableBody.innerHTML === "") {
            singleEmpTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500 italic">Nessuna vendita non archiviata.</td></tr>`;
        }
    } else {
        if (singleEmpCard) singleEmpCard.classList.add('hidden');
        if (archiveSingleBtn) archiveSingleBtn.classList.add('hidden');
    }

    const totalExpenses = totalForgeItemCosts + totalSalaries;
    document.getElementById('kpi-total').textContent = formatValuta(totalSalesAmount);
    document.getElementById('kpi-forge').textContent = formatValuta(totalForgeGain);
    document.getElementById('kpi-stipendi').textContent = formatValuta(totalSalaries);
    document.getElementById('kpi-expenses').textContent = formatValuta(totalExpenses);

    const tbody = document.getElementById('salary-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const staffKeys = Object.keys(staffStats);
    if (staffKeys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500 text-xs">Nessun dato.</td></tr>`;
        return;
    }
    staffKeys.forEach(k => {
        const s = staffStats[k];
        const highlight = (filterValue !== 'all' && k === filterValue) ? 'bg-amber-500/10' : '';
        tbody.innerHTML += `
            <tr class="hover:bg-gray-750/50 border-b border-gray-800 text-xs ${highlight}">
                <td class="py-3 font-semibold text-gray-200">${s.name}</td>
                <td class="py-3 text-gray-400">${s.count} oggetti</td>
                <td class="py-3 text-amber-500 font-bold">${s.pct}%</td>
                <td class="py-3 font-bold text-emerald-400 text-sm">${formatValuta(s.salary)}</td>
                <td class="py-3 text-right">
                    <select onchange="window.updateSalaryStatus('${k}', this.value)" class="px-2 py-1 bg-gray-700 text-xs rounded-lg text-white border border-gray-600">
                        <option value="non_pagato" ${s.status === 'non_pagato' ? 'selected' : ''}>🔴 Non Pagato</option>
                        <option value="pagato" ${s.status === 'pagato' ? 'selected' : ''}>🟢 Pagato</option>
                    </select>
                </td>
            </tr>
        `;
    });
}

adminEmployeeFilter?.addEventListener('change', calculateManagementData);

// --- ARCHIVIAZIONE ---
document.getElementById('archive-manual-btn')?.addEventListener('click', () => {
    if (Object.keys(localSales).length === 0) {
        showToast("Nessun dato da archiviare.", "warning");
        return;
    }
    showConfirmModal("Archiviazione GENERALE", "Archiviare e azzerare i bilanci di TUTTI i dipendenti?", () => {
        archiveCurrentWeek();
    }, false);
});

function archiveCurrentWeek() {
    const archiveTitle = "Settimana conclusa il " + new Date().toLocaleDateString('it-IT');
    let finalStaffSalariesReport = {};
    Object.keys(localEmployees).forEach(k => {
        finalStaffSalariesReport[k] = {
            name: localEmployees[k].name,
            salary: 0,
            status: localSalariesStatus[k] || 'non_pagato'
        };
    });

    Object.keys(localSales).forEach(sk => {
        const sale = localSales[sk];
        if (finalStaffSalariesReport[sale.employeeKey]) {
            finalStaffSalariesReport[sale.employeeKey].salary += sale.employeeGain || 0;
        }
    });

    const archiveData = {
        title: archiveTitle,
        timestamp: Date.now(),
        sales: { ...localSales },
        salariesReport: finalStaffSalariesReport
    };

    db.collection('archive').add(archiveData).then(() => {
        Object.keys(localSales).forEach(sk => db.collection('current_sales').doc(sk).delete());
        Object.keys(localSalariesStatus).forEach(ek => db.collection('current_salaries_status').doc(ek).delete());
        if (adminEmployeeFilter) adminEmployeeFilter.value = "all";
        showToast("Settimana archiviata e bilanci azzerati!", "success");
    }).catch(err => showToast(err.message, "error"));
}

document.getElementById('archive-single-employee-btn')?.addEventListener('click', () => {
    const empKey = adminEmployeeFilter.value;
    if (empKey === "all" || !empKey) return;
    const empName = localEmployees[empKey]?.name || "Dipendente";
    let singleSales = {};
    Object.keys(localSales).forEach(sk => {
        if (localSales[sk].employeeKey === empKey) singleSales[sk] = localSales[sk];
    });
    if (Object.keys(singleSales).length === 0) {
        showToast(`Nessuna vendita per ${empName}.`, "warning");
        return;
    }
    showConfirmModal(`Archiviazione: ${empName}`, `Archiviare SOLO le vendite di ${empName}?`, () => {
        const archiveTitle = `[SINGOLO] Settimana ${empName} - ` + new Date().toLocaleDateString('it-IT');
        let report = {};
        report[empKey] = {
            name: empName,
            salary: 0,
            status: localSalariesStatus[empKey] || 'non_pagato'
        };
        Object.keys(singleSales).forEach(sk => { report[empKey].salary += singleSales[sk].employeeGain || 0; });
        db.collection('archive').add({
            title: archiveTitle, timestamp: Date.now(), sales: singleSales, salariesReport: report
        }).then(() => {
            Object.keys(localSales).forEach(sk => {
                if (localSales[sk].employeeKey === empKey) db.collection('current_sales').doc(sk).delete();
            });
            db.collection('current_salaries_status').doc(empKey).delete();
            if (adminEmployeeFilter) adminEmployeeFilter.value = "all";
            showToast(`Settimana di ${empName} archiviata!`, "success");
        }).catch(err => showToast(err.message, "error"));
    }, false);
});

window.deleteArchiveItem = function(key) {
    showConfirmModal("Elimina Archivio", "Eliminare definitivamente questo blocco di archivio?", () => {
        db.collection('archive').doc(key).delete()
            .then(() => showToast("Archivio rimosso.", "info"))
            .catch(err => showToast(err.message, "error"));
    }, true);
};

function renderArchive(archiveList) {
    const container = document.getElementById('archive-container');
    if (!container) return;
    container.innerHTML = '';
    const items = Object.keys(archiveList || {}).map(k => ({ key: k, ...archiveList[k] }));
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    if (items.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-500">Nessun archivio storico.</p>`;
        return;
    }
    items.forEach(item => {
        let archTotal = 0, archForge = 0;
        const salesCount = Object.keys(item.sales || {}).length;
        Object.keys(item.sales || {}).forEach(sk => {
            archTotal += item.sales[sk].totalPrice || 0;
            archForge += item.sales[sk].forgeGain || 0;
        });
        let salariesHtml = "";
        if (item.salariesReport) {
            salariesHtml = `<div class="mt-2 pt-2 border-t border-gray-700/50 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-gray-400">`;
            Object.keys(item.salariesReport).forEach(ek => {
                const empRep = item.salariesReport[ek];
                if (empRep.salary > 0) {
                    const badge = empRep.status === 'pagato'
                        ? `<span class="text-emerald-400 font-semibold">🟢 Pagato</span>`
                        : `<span class="text-red-400 font-semibold">🔴 Non Pagato</span>`;
                    salariesHtml += `<div>${empRep.name}: <b>${formatValuta(empRep.salary)}</b> → ${badge}</div>`;
                }
            });
            salariesHtml += `</div>`;
        }
        container.innerHTML += `
            <div class="p-4 bg-gray-750/80 rounded-xl border border-gray-700 text-xs text-gray-300 shadow-md">
                <div class="flex flex-wrap justify-between items-center gap-2">
                    <div>
                        <p class="font-bold text-sm text-gray-200">${item.title}</p>
                        <p class="text-gray-400 mt-1">Vendite: <span class="text-amber-400">${salesCount}</span></p>
                    </div>
                    <div class="flex items-center gap-4">
                        <span class="text-emerald-400">Entrate: <b>${formatValuta(archTotal)}</b></span>
                        <span class="text-amber-400">Netto: <b>${formatValuta(archForge)}</b></span>
                        <button onclick="window.deleteArchiveItem('${item.key}')" class="p-1.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600 hover:text-white" title="Elimina">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                    </div>
                </div>
                ${salariesHtml}
            </div>
        `;
    });
}
