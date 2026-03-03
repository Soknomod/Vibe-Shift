const TOTAL_SLOTS = 5;
let fileSlots = Array(TOTAL_SLOTS).fill(null).map((_, i) => ({ id: i, name: "EMPTY_SLOT", assigned: false, handle: null }));
let history = {}; 
let currentEditIndex = null;
let lastSearchQuery = "";
let lastSearchIndex = -1;
let currentNoteTab = "1";

function updateClock() {
    const clockEl = document.getElementById('digital-clock');
    if (!clockEl) return;
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

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

async function loadNotes() {
    const data = await chrome.storage.local.get(['stickyNotes']);
    const notes = data.stickyNotes || { "1": "", "2": "", "3": "" };
    document.getElementById('note-textarea').value = notes[currentNoteTab] || "";
}

async function saveNote() {
    const content = document.getElementById('note-textarea').value;
    const data = await chrome.storage.local.get(['stickyNotes']);
    const notes = data.stickyNotes || { "1": "", "2": "", "3": "" };
    notes[currentNoteTab] = content;
    await chrome.storage.local.set({ stickyNotes: notes });
    document.getElementById('status').innerText = "Saved Note";
    setTimeout(() => document.getElementById('status').innerText = "Ready", 800);
}

function closeEditor() {
    const container = document.getElementById('editor-container');
    container.classList.remove('open', 'maximized');
    currentEditIndex = null;
}

function toggleMaximize() {
    document.getElementById('editor-container').classList.toggle('maximized');
}

async function openEditor(i) {
    const container = document.getElementById('editor-container');
    if (currentEditIndex === i && container.classList.contains('open')) { closeEditor(); return; }
    const slot = fileSlots[i];
    if (!slot.assigned) return;
    currentEditIndex = i;
    try {
        let status = await slot.handle.queryPermission({mode: 'readwrite'});
        if (status !== 'granted') status = await slot.handle.requestPermission({mode: 'readwrite'});
        if (status === 'granted') {
            const file = await slot.handle.getFile();
            document.getElementById('editing-filename').innerText = "EDITING: " + slot.name.toUpperCase();
            document.getElementById('editor-textarea').value = await file.text();
            container.classList.add('open');
            document.getElementById('status').innerText = "Access Granted";
        }
    } catch(e) { document.getElementById('status').innerText = "Re-Auth Required"; }
}

async function saveEditorContent() {
    if (currentEditIndex === null) return;
    const slot = fileSlots[currentEditIndex];
    try {
        const w = await slot.handle.createWritable();
        await w.write(document.getElementById('editor-textarea').value);
        await w.close();
        document.getElementById('status').innerText = "✓ SAVED FILE";
    } catch(e) { document.getElementById('status').innerText = "Save Failed"; }
}

async function handleAction(index, event) {
    const slot = fileSlots[index];
    const rowElement = event.currentTarget.closest('.row'); 

    if (!slot.assigned) {
        try {
            const [h] = await window.showOpenFilePicker();
            fileSlots[index] = { id: index, name: h.name, assigned: true, handle: h };
            const db = await openDB();
            await db.put("handles", { id: index, handle: h, name: h.name });
            render();
        } catch(e) {}
    } else {
        try {
            const file = await slot.handle.getFile();
            history[index] = await file.text();
            const txt = await navigator.clipboard.readText();
            const w = await slot.handle.createWritable();
            await w.write(txt); await w.close();
            
            if (rowElement) {
                rowElement.classList.add('pulse-active');
                setTimeout(() => rowElement.classList.remove('pulse-active'), 800);
            }
            
            document.getElementById('status').innerText = "✓ SYNCED";
            render();
        } catch(e) { openEditor(index); }
    }
}

async function rollback(index) {
    const slot = fileSlots[index];
    if (!history[index]) return;
    try {
        const w = await slot.handle.createWritable();
        await w.write(history[index]);
        await w.close();
        delete history[index];
        render();
        document.getElementById('status').innerText = "↺ UNDO DONE";
    } catch(e) {}
}

async function clearSlot(index) {
    const db = await openDB();
    await db.delete("handles", index);
    fileSlots[index] = { id: index, name: "EMPTY_SLOT", assigned: false, handle: null };
    render();
}

function render() {
    const container = document.getElementById('slots');
    container.innerHTML = '';
    fileSlots.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'row';
        const btn = document.createElement('div');
        btn.className = 'btn-main';
        btn.innerText = s.assigned ? s.name : `+ Link Slot ${i+1}`;
        btn.addEventListener('click', (e) => handleAction(i, e));
        row.appendChild(btn);
        if (s.assigned) {
            const rollBox = document.createElement('div');
            rollBox.className = 'action-box';
            rollBox.title = "Undo Last Paste";
            const iconColor = history[i] ? '#f29900' : '#eee';
            rollBox.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="${iconColor}"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;
            if (history[i]) rollBox.addEventListener('click', (e) => { e.stopPropagation(); rollback(i); });

            const editBox = document.createElement('div');
            editBox.className = 'action-box';
            editBox.title = "Open in Editor";
            editBox.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="#dadce0"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
            editBox.addEventListener('click', (e) => { e.stopPropagation(); openEditor(i); });
            
            const delBox = document.createElement('div');
            delBox.className = 'action-box';
            delBox.title = "Unlink File";
            delBox.innerHTML = `<span style="font-size: 20px; color: #dadce0;">&times;</span>`;
            delBox.addEventListener('click', (e) => { e.stopPropagation(); clearSlot(i); });
            
            row.appendChild(rollBox); row.appendChild(editBox); row.appendChild(delBox);
        }
        container.appendChild(row);
    });
}

async function backupAll() {
    for (const slot of fileSlots) {
        if (slot.assigned) {
            try {
                const file = await slot.handle.getFile();
                const text = await file.text();
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `BK_${slot.name}`; a.click();
                URL.revokeObjectURL(url);
                await new Promise(r => setTimeout(r, 250));
            } catch (e) {}
        }
    }
}

document.getElementById('btn-min').addEventListener('click', closeEditor);
document.getElementById('btn-max').addEventListener('click', toggleMaximize);
document.getElementById('editor-save-btn').addEventListener('click', saveEditorContent);
document.getElementById('header-backup-btn').addEventListener('click', backupAll);

document.getElementById('note-tabs').addEventListener('click', (e) => {
    if (e.target.classList.contains('note-tab')) {
        saveNote();
        document.querySelectorAll('.note-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        currentNoteTab = e.target.getAttribute('data-tab');
        loadNotes();
    }
});

let noteTimeout;
document.getElementById('note-textarea').addEventListener('input', () => {
    clearTimeout(noteTimeout);
    noteTimeout = setTimeout(saveNote, 1000);
});

loadHandles();
loadNotes();