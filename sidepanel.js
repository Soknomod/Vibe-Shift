/* * Vibe Shift | Andrew Domonkos (C) 2026 */

const TOTAL_SLOTS = 5;
let fileSlots = Array(TOTAL_SLOTS).fill(null).map((_, i) => ({ id: i, name: "EMPTY_SLOT", assigned: false, handle: null }));
let history = {}; 
let currentEditIndex = null;
let currentNoteTab = "1";
let lastSearchQuery = "";
let currentSearchIndex = 0;

/* --- VIBE SHIFT PRO: FAIL-SAFE ACTIVATION --- */
const STRIPE_LINK = "https://buy.stripe.com/test_5kQ6oJdca9ZIeIAeil1Nu00";
const V_SIG = "7b587042a5960762963625f2066f25492d548324f5a63901b0f69661d4a04c64"; 
const V_DB_KEY = "v_sys_772";
const V_VAL = "99ae821b2";
let isPro = false;

async function hashKey(string) {
    const clean = string.toLowerCase().trim();
    const utf8 = new TextEncoder().encode(clean);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
// Secure Terminal Listener: Validates encrypted activation signatures.
document.addEventListener('click', async (e) => {
    if (e.target && e.target.id === 'activate-btn') {
        const inputField = document.getElementById('license-key');
        if (!inputField) return;

        const rawInput = inputField.value.toLowerCase().trim();
        const hashedInput = await hashKey(rawInput);
        
        // SECURE CHECK: We only check the Hash. 
        // The plain-text "vibe-pro-2026" is removed for repo security.
        if (hashedInput === V_SIG) {
            let p = {}; p[V_DB_KEY] = V_VAL;
            chrome.storage.local.set(p, () => {
                alert("SYSTEM OVERRIDE COMPLETE.");
                isPro = true;
                enableProMode();
                render(); 
            });
        } else {
            alert("ACCESS DENIED: INVALID SIGNATURE.");
        }
    }
});

function enableProMode() {
    isPro = true;
    const statusEl = document.getElementById('status-text');
    if(statusEl) {
        statusEl.innerText = "ACTIVE";
        statusEl.style.color = "#00ff00";
        statusEl.style.display = "inline";
    }
    const unlockZone = document.getElementById('pro-unlock-zone');
    if(unlockZone) unlockZone.style.display = "none";
}

function checkAccess(slotId) {
    if (slotId > 1 && !isPro) { 
        if (confirm("Slots 3-5 require VIBE SHIFT PRO ($4.99). Unlock now?")) {
            window.open(STRIPE_LINK, '_blank');
        }
        return false;
    }
    return true;
}

function updateClock() {
    const clockEl = document.getElementById('digital-clock');
    if (clockEl) clockEl.innerText = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);

// Unified Theme Toggle
document.addEventListener('click', async (e) => {
    const toggle = e.target.closest('#theme-toggle');
    if (toggle) {
        const isDark = document.body.classList.toggle('dark-mode');
        await chrome.storage.local.set({ darkMode: isDark });
    }
});

async function openDB() {
    return new Promise((resolve) => {
        const req = indexedDB.open("PowerCopyDB", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("handles", { keyPath: "id" });
        req.onsuccess = () => resolve({
            put: (s, d) => new Promise(res => req.result.transaction(s, "readwrite").objectStore(s).put(d).onsuccess = res),
            getAll: (s) => new Promise(res => req.result.transaction(s).objectStore(s).getAll().onsuccess = e => res(e.target.result)),
            delete: (s, id) => new Promise(res => req.result.transaction(s, "readwrite").objectStore(s).delete(id).onsuccess = res)
        });
    });
}

async function loadHandles() {
    const db = await openDB();
    const saved = await db.getAll("handles");
    saved.forEach(s => { fileSlots[s.id] = { id: s.id, name: s.name, assigned: true, handle: s.handle }; });
    render();
}

function performSearch() {
    const searchInput = document.getElementById('editor-search');
    const textarea = document.getElementById('editor-textarea');
    const mirror = document.getElementById('editor-mirror');
    const query = searchInput.value;
    const text = textarea.value;
    if (!query) { mirror.innerHTML = escapeHTML(text); return; }
    if (query.toLowerCase() !== lastSearchQuery.toLowerCase()) { lastSearchQuery = query; currentSearchIndex = 0; }
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const foundIndex = lowerText.indexOf(lowerQuery, currentSearchIndex);
    if (foundIndex !== -1) {
        const before = text.substring(0, foundIndex);
        const match = text.substring(foundIndex, foundIndex + query.length);
        const after = text.substring(foundIndex + query.length);
        mirror.innerHTML = escapeHTML(before) + '<span class="find-result" id="current-find-marker">' + escapeHTML(match) + '</span>' + escapeHTML(after);
        const marker = document.getElementById('current-find-marker');
        if (marker) {
            marker.scrollIntoView({ behavior: 'auto', block: 'center' });
            textarea.scrollTop = mirror.scrollTop;
            textarea.scrollLeft = mirror.scrollLeft;
        }
        currentSearchIndex = foundIndex + 1;
    } else {
        currentSearchIndex = 0;
        document.getElementById('status').innerText = "Search restart...";
        if (lowerText.includes(lowerQuery)) performSearch();
    }
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\n/g, "<br/>").replace(/  /g, " &nbsp;"); 
}

document.getElementById('editor-textarea').onscroll = (e) => {
    document.getElementById('editor-mirror').scrollTop = e.target.scrollTop;
    document.getElementById('editor-mirror').scrollLeft = e.target.scrollLeft;
};
document.getElementById('editor-textarea').oninput = (e) => {
    document.getElementById('editor-mirror').innerHTML = escapeHTML(e.target.value);
};

async function handleSync(index) {
    const slot = fileSlots[index];
    if (!slot.assigned) return;
    try {
        const file = await slot.handle.getFile();
        history[index] = await file.text();
        const txt = await navigator.clipboard.readText();
        const w = await slot.handle.createWritable();
        await w.write(txt); await w.close();
        const statusEl = document.getElementById('status');
        statusEl.innerText = "✓ SYNCED: " + slot.name.toUpperCase();
        statusEl.classList.add('status-glow'); 
        const row = document.querySelectorAll('.row')[index];
        const headerIcon = document.getElementById('header-backup-btn');
        if (row) { 
            row.classList.add('pulse-active'); 
            headerIcon.classList.add('icon-save-glow'); 
            setTimeout(() => { 
                row.classList.remove('pulse-active'); 
                headerIcon.classList.remove('icon-save-glow');
                statusEl.classList.remove('status-glow'); 
                render(); 
            }, 1000); 
        }
    } catch(e) { document.getElementById('status').innerText = "Sync Error: Check permissions"; }
}

async function assignSlot(index) {
    if (!checkAccess(index)) return; 
    const statusEl = document.getElementById('status');
    try {
        const [h] = await window.showOpenFilePicker({
            types: [{
                description: 'Vibe Code & Text',
                accept: { 'text/plain': ['.txt', '.js', '.html', '.css', '.json', '.md', '.ts', '.tsx', '.jsx', '.py'] }
            }],
            excludeAcceptAllOption: false, multiple: false
        });
        fileSlots[index] = { id: index, name: h.name, assigned: true, handle: h };
        const db = await openDB();
        await db.put("handles", { id: index, handle: h, name: h.name });
        if (statusEl) {
            statusEl.innerText = "✓ SLOT LINKED: " + h.name.toUpperCase();
            statusEl.style.color = "#00ff00"; statusEl.classList.add('status-glow');
            setTimeout(() => { statusEl.style.color = "#ffffff"; statusEl.classList.remove('status-glow'); }, 1500);
        }
        render();
    } catch(e) {
        if (statusEl) {
            statusEl.innerText = "× LINKING CANCELLED";
            statusEl.style.color = "#ff4444"; setTimeout(() => { statusEl.style.color = "#ffffff"; }, 1500);
        }
    }
}

async function openEditor(i) {
    if (!checkAccess(i)) return;
    const container = document.getElementById('editor-container');
    if (currentEditIndex === i && container.classList.contains('open')) {
        container.classList.remove('open');
        currentEditIndex = null;
        return;
    }
    const slot = fileSlots[i];
    if (!slot.assigned) return;
    try {
        let status = await slot.handle.queryPermission({mode: 'readwrite'});
        if (status !== 'granted') status = await slot.handle.requestPermission({mode: 'readwrite'});
        if (status === 'granted') {
            currentEditIndex = i;
            const file = await slot.handle.getFile();
            const content = await file.text();
            document.getElementById('editor-textarea').value = content;
            document.getElementById('editor-mirror').innerHTML = escapeHTML(content);
            document.getElementById('editing-filename').innerText = "EDITING: " + slot.name.toUpperCase();
            container.classList.add('open');
        }
    } catch(e) { document.getElementById('status').innerText = "Access denied"; }
}

async function saveFile() {
    if (currentEditIndex === null) return;
    const saveBtn = document.getElementById('editor-save-btn');
    const headerIcon = document.getElementById('header-backup-btn');
    const statusEl = document.getElementById('status');
    try {
        const w = await fileSlots[currentEditIndex].handle.createWritable();
        await w.write(document.getElementById('editor-textarea').value);
        await w.close();
        statusEl.innerText = "✓ SAVED TO DISK";
        statusEl.classList.add('status-glow');
        saveBtn.classList.add('success-glow');
        saveBtn.innerText = "SAVED SUCCESSFULLY";
        headerIcon.classList.add('icon-save-glow');
        setTimeout(() => {
            saveBtn.classList.remove('success-glow');
            saveBtn.innerText = "SAVE TO FILE";
            headerIcon.classList.remove('icon-save-glow');
            statusEl.classList.remove('status-glow');
        }, 1000);
    } catch(e) { document.getElementById('status').innerText = "Save failed"; }
}

async function saveNotes(showStatus = true) {
    const data = await chrome.storage.local.get(['stickyNotes']);
    const notes = data.stickyNotes || {};
    const textarea = document.getElementById('note-textarea');
    if (textarea) {
        notes[currentNoteTab] = textarea.value;
        await chrome.storage.local.set({ stickyNotes: notes });
        if (showStatus) {
            const statusEl = document.getElementById('status');
            if (statusEl) {
                statusEl.innerText = "✓ NOTES SYNCED TO STORAGE";
                statusEl.style.color = "#00ff00";
                statusEl.classList.add('status-glow');
                setTimeout(() => { statusEl.style.color = "#ffffff"; statusEl.classList.remove('status-glow'); }, 1500);
            }
        }
    }
}

async function rollback(index) {
    if (!history[index]) return;
    try {
        const w = await fileSlots[index].handle.createWritable();
        await w.write(history[index]); await w.close();
        delete history[index];
        render();
        document.getElementById('status').innerText = "↺ UNDO SUCCESS";
    } catch(e) {}
}

/* --- RESTORED RENDER WITH DOUBLE-CLICK TO RENAME --- */
function render() {
    const container = document.getElementById('slots');
    if (!container) return;
    container.innerHTML = '';
    
    // 1. Update Note Tabs & Handle Renaming
    [1, 2, 3, 4, 5].forEach(num => {
        const tab = document.querySelector(`.note-tab[data-tab="${num}"]`);
        if (tab) {
            if (num > 2 && !isPro) {
                tab.style.opacity = "0.4";
                tab.style.filter = "grayscale(100%)";
                tab.innerHTML = `🔒 ${num}`;
            } else {
                tab.style.opacity = "1";
                tab.style.filter = "none";
                chrome.storage.local.get(['tabNames'], (data) => {
                    const names = data.tabNames || {};
                    tab.innerText = names[num] || `Note ${num}`;
                });

                // DOUBLE CLICK TO RENAME LOGIC
                tab.ondblclick = () => {
                    tab.contentEditable = "true";
                    tab.focus();
                };

                tab.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        tab.blur();
                    }
                };

                tab.onblur = async () => {
                    tab.contentEditable = "false";
                    const newName = tab.innerText.trim();
                    const data = await chrome.storage.local.get(['tabNames']);
                    const names = data.tabNames || {};
                    names[num] = newName;
                    await chrome.storage.local.set({ tabNames: names });
                };
            }
        }
    });

    fileSlots.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'row';
        const isProSlot = i > 1; 
        const btn = document.createElement('div');
        btn.className = 'btn-main';
        
        if (isProSlot && !isPro) {
            btn.innerHTML = `<span style="color: #666;">🔒 SLOT ${i+1}</span>`;
            btn.style.borderColor = "#333";
            btn.style.cursor = "pointer";
        } else {
            btn.innerText = s.assigned ? s.name : `+ Link Slot ${i+1}`;
        }

        btn.onclick = () => assignSlot(i);
        row.appendChild(btn);
        
        if (s.assigned) {
            const syncBox = document.createElement('div'); syncBox.className = 'action-box';
            syncBox.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#1a73e8"><path d="M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z"/></svg>`;
            syncBox.onclick = (e) => { e.stopPropagation(); handleSync(i); };

            const rollBox = document.createElement('div'); rollBox.className = 'action-box';
            rollBox.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="${history[i] ? '#f29900' : '#888'}"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;
            if (history[i]) rollBox.onclick = (e) => { e.stopPropagation(); rollback(i); };

            const editBox = document.createElement('div'); editBox.className = 'action-box';
            editBox.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" class="icon-svg"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>`;
            editBox.onclick = (e) => { e.stopPropagation(); openEditor(i); };
            
            const delBox = document.createElement('div'); 
            delBox.className = 'action-box';
            delBox.innerHTML = `<span style="font-size:20px;" class="icon-svg">&times;</span>`;
            delBox.onclick = (e) => { 
                e.stopPropagation(); 
                (async () => { 
                    const db = await openDB(); 
                    const removedName = fileSlots[i].name ? fileSlots[i].name.toUpperCase() : "SLOT";
                    await db.delete("handles", i); 
                    fileSlots[i] = { id: i, name: "EMPTY_SLOT", assigned: false, handle: null }; 

                    const statusEl = document.getElementById('status');
                    if (statusEl) {
                        statusEl.innerText = "× UNLINKED: " + removedName;
                        statusEl.style.color = "#ff4444";
                        statusEl.classList.add('status-glow');
                        setTimeout(() => { 
                            statusEl.style.color = "#ffffff"; 
                            statusEl.classList.remove('status-glow');
                        }, 1500);
                    }
                    render(); 
                })(); 
            };
            row.appendChild(syncBox); row.appendChild(rollBox); row.appendChild(editBox); row.appendChild(delBox);
        }
        container.appendChild(row);
    });
}

/* --- THE REST OF YOUR BOTTOM LISTENERS --- */

document.getElementById('editor-search').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); performSearch(); } };
document.getElementById('editor-save-btn').onclick = saveFile;

document.getElementById('btn-min').onclick = () => { 
    document.getElementById('editor-container').classList.remove('open', 'maximized'); 
    currentEditIndex = null; 
};

document.getElementById('btn-max').onclick = () => {
    document.getElementById('editor-container').classList.toggle('maximized');
};

document.getElementById('note-save-trigger').onclick = (e) => {
    e.stopPropagation();
    const menu = document.getElementById('note-save-menu');
    const isVisible = menu.style.display === 'flex';
    menu.style.display = isVisible ? 'none' : 'flex';
};

document.getElementById('save-current-opt').onclick = async () => {
    await saveNotes(false);
    const text = document.getElementById('note-textarea').value;
    const activeTab = document.querySelector('.note-tab.active');
    const tabNum = activeTab ? activeTab.getAttribute('data-tab') : "1";
    const data = await chrome.storage.local.get(['tabNames']);
    const customName = (data.tabNames || {})[tabNum] || `Note_${tabNum}`;
    try {
        const handle = await window.showSaveFilePicker({suggestedName: `${customName.trim()}.txt`, types: [{ description: 'Text File', accept: {'text/plain': ['.txt']} }]});
        const writable = await handle.createWritable(); await writable.write(text); await writable.close();
        document.getElementById('note-save-menu').style.display = 'none';
    } catch (e) {}
};

document.getElementById('save-all-opt').onclick = async () => {
    await saveNotes(false);
    const data = await chrome.storage.local.get(['stickyNotes', 'tabNames']);
    const notes = data.stickyNotes || {};
    const names = data.tabNames || {};
    
    let combinedContent = "--- VIBE SHIFT MASTER NOTES BACKUP ---\n\n";
    for (let i = 1; i <= 5; i++) {
        const title = names[i] || `Note ${i}`;
        const content = notes[i] || "";
        combinedContent += `=== ${title.toUpperCase()} ===\n${content}\n\n`;
    }

    try {
        const handle = await window.showSaveFilePicker({
            // Updated to be unique and clear
            suggestedName: `VIBE_SHIFT_NOTES_MASTER_BACKUP.txt`, 
            types: [{ description: 'Text File', accept: {'text/plain': ['.txt']} }]
        });
        const writable = await handle.createWritable(); 
        await writable.write(combinedContent); 
        await writable.close();
        document.getElementById('note-save-menu').style.display = 'none';
        
        // Visual feedback in the status bar
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.innerText = "✓ MASTER BACKUP CREATED";
            statusEl.style.color = "#00ff00";
            setTimeout(() => { statusEl.style.color = "#ffffff"; }, 2000);
        }
    } catch (e) { console.log("Backup cancelled"); }
};

document.getElementById('cancel-save-opt').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('note-save-menu').style.display = 'none';
};

document.getElementById('header-backup-btn').onclick = async () => {
    for (const s of fileSlots) { if (s.assigned) { 
        const f = await s.handle.getFile();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([await f.text()])); a.download = `BK_${s.name}`; a.click();
    }}
};

document.getElementById('note-tabs').addEventListener('click', async (e) => {
    const tab = e.target.closest('.note-tab');
    if (!tab || tab.contentEditable === "true") return;
    const tabId = parseInt(tab.getAttribute('data-tab'));
    if (tabId > 2 && !isPro) {
        if (confirm("Tabs 3-5 are restricted. Unlock system?")) { window.open(STRIPE_LINK, '_blank'); }
        return; 
    }
    await saveNotes(false);
    document.querySelectorAll('.note-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentNoteTab = tab.getAttribute('data-tab');
    const data = await chrome.storage.local.get(['stickyNotes']);
    document.getElementById('note-textarea').value = (data.stickyNotes || {})[currentNoteTab] || "";
});

document.getElementById('clear-all-links').onclick = async () => {
    if (confirm("TOTAL SYSTEM RESET?")) {
        const db = await openDB();
        for (let i = 0; i < TOTAL_SLOTS; i++) { await db.delete("handles", i); fileSlots[i] = { id: i, name: "EMPTY_SLOT", assigned: false, handle: null }; }
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) editorContainer.classList.remove('open', 'maximized');
        render();
    }
};

document.addEventListener('click', (e) => {
    const menu = document.getElementById('note-save-menu');
    const trigger = document.getElementById('note-save-trigger');
    if (menu && !trigger.contains(e.target) && !menu.contains(e.target)) menu.style.display = 'none';
});

(async () => {
    const data = await chrome.storage.local.get([V_DB_KEY, 'darkMode', 'stickyNotes']);
    if (data[V_DB_KEY] === V_VAL) enableProMode();
    if (data.darkMode) document.body.classList.add('dark-mode');
    document.getElementById('note-textarea').value = (data.stickyNotes || {})["1"] || "";
    await loadHandles();
    render();
})();