// 🔥 POLYFILL: Gives HTTP devices the ability to generate secure IDs
if (!window.crypto) window.crypto = {};
if (!window.crypto.randomUUID) {
    window.crypto.randomUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };
}

/**
 * 🔥 TAURI DETECTION & DYNAMIC SERVER DISCOVERY
 */
const isTauri = '__TAURI_INTERNALS__' in window;

const getTargetUrl = () => {
    // 1. If we are in Tauri, we MUST rely on the saved connection URL from the portal
    if (isTauri) {
        return localStorage.getItem('openprix_last_server') || 'http://127.0.0.1:3000';
    }

    // 2. 🔥 THE FIX: If we are purely in a web browser and NOT on the Vite dev port (5173),
    // it means the Rust Daemon is serving us directly. Just use the current URL!
    if (window.location.port !== '5173') {
        return window.location.origin;
    }

    // 3. Vite Dev Server fallback (for testing frontend without compiling)
    return localStorage.getItem('openprix_last_server') || 'http://127.0.0.1:3000';
};

const SERVER_URL = getTargetUrl();
console.log(`[OpenPrix] Connecting to Nexus Daemon at: ${SERVER_URL} (Tauri Client: ${isTauri})`);

// 🚀 THE PURE REST CLIENT
const restCall = async (method, endpoint, data = null) => {
    try {
        const options = { method, headers: { 'Content-Type': 'application/json' } };
        if (data) options.body = JSON.stringify(data);

        const res = await fetch(`${SERVER_URL}${endpoint}`, options);
        const json = await res.json();

        // Handle standard success/data wrapping from our Rust routes
        if (json.success === false) throw new Error(json.error || "Server Error");
        return json.data !== undefined ? json.data : json;
    } catch (error) {
        console.error(`Network REST Error [${method} ${endpoint}]:`, error);
        return { success: false, error: error.message };
    }
};

// --- NATIVE OS BRIDGE ---

let tauriInvoke = null;
if (isTauri) {
    // Dynamically import Tauri core so it doesn't break the pure web version
    import('@tauri-apps/api/core').then(module => {
        tauriInvoke = module.invoke;
    }).catch(err => console.error("Failed to load Tauri API", err));
}

const tauriOsCalls = {
    // We will write these exact Rust functions in Phase 4!
    pickFile: () => tauriInvoke ? tauriInvoke('os_pick_file') : null,
    openFile: (filePath) => tauriInvoke ? tauriInvoke('os_open_file', { filePath }) : null,
    getBase64: (filePath) => tauriInvoke ? tauriInvoke('os_get_base64', { filePath }) : null,
    pickDirectory: () => tauriInvoke ? tauriInvoke('os_pick_directory') : null
};

const webPickFile = (accept = "*") => {
    return new Promise((resolve) => {
        const input = document.createElement('input'); input.type = 'file'; input.accept = accept;
        input.onchange = e => {
            const file = e.target.files[0]; if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = evt => resolve({ name: file.name, base64: evt.target.result.split(',')[1] });
            reader.readAsDataURL(file);
        };
        input.click();
    });
};

const osNetworkCalls = {
    // Passes targetFolder to the backend so Rust knows exactly where to save it
    uploadFileWeb: async (fileObject, targetFolder = null) => {
        const formData = new FormData();
        // Append the folder FIRST so Rust knows where to stream the bytes!
        formData.append('targetFolder', targetFolder || "null");
        formData.append('file', fileObject);

        try {
            // Note: We DO NOT use our standard restCall here because we CANNOT set
            // the 'Content-Type': 'application/json' header. The browser must set 
            // 'multipart/form-data' automatically with its unique payload boundary.
            const res = await fetch(`${SERVER_URL}/api/os/upload`, {
                method: 'POST',
                body: formData
            });

            const rawText = await res.text();
            let json;
            try { json = JSON.parse(rawText); } catch (e) { return { success: false, error: rawText }; }

            return json.success !== false ? (json.data !== undefined ? json.data : json) : json;
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    // Smart Routing for File Opening
    openFile: async (filePath) => {
        if (isTauri) {
            // If running on the Desktop Host App, launch AutoCAD/PDF Viewer natively on the server monitor
            return restCall('POST', '/api/os/open', { path: filePath });
        } else {
            // LIVE STREAM TO MOBILE / WEB BROWSER
            const streamUrl = `${SERVER_URL}/api/os/download?path=${encodeURIComponent(filePath)}`;
            window.open(streamUrl, '_blank');
            return { success: true };
        }
    },

    scanDirectory: (targetFolder, ignoredExtensions = []) => {
        return restCall('POST', '/api/os/scan', { targetFolder, ignoredExtensions });
    },
    listDirectories: (targetFolder) => {
        return restCall('POST', '/api/os/dirs', { targetFolder });
    },

    scaffoldProject: (payload) => restCall('POST', '/api/os/scaffold', payload),

    renameProjectFolder: (payload) => restCall('POST', '/api/os/rename', payload),

    getServerUrl: () => SERVER_URL
};

const webOsFallbacks = {
    pickFile: () => webPickFile(),
    pickDirectory: async () => prompt("Host Server Path Mapping:\nBecause you are on a remote web browser, please type the absolute path ON THE HOST SERVER where projects should be scaffolded (e.g., C:/OpenPrix/Projects):") || null,
    openFile: (filePath) => {
        window.open(`${SERVER_URL}/api/os/download?path=${encodeURIComponent(filePath)}`, '_blank');
    },
    getBase64: async (filePath) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/os/download?path=${encodeURIComponent(filePath)}`);
            const blob = await res.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch { return null; }
    }
};

window.api = {
    db: {
        verifyEmployeeLogin: (un, pw) => restCall('POST', '/api/auth/login', { username: un, password: pw }),
        getSettings: (key) => restCall('GET', `/api/settings/${key}`),
        saveSettings: (key, val) => restCall('POST', `/api/settings/${key}`, { value: val }),

        backupDatabase: () => restCall('POST', '/api/db/backup'),
        restoreDatabase: (fileData) => restCall('POST', '/api/db/restore', { data: fileData }),
        purgeDatabase: () => restCall('POST', '/api/db/purge'),

        getRegions: () => restCall('GET', '/api/regions'),
        createRegion: (name) => restCall('POST', '/api/regions', { name }),
        deleteRegion: (id) => restCall('DELETE', `/api/regions/${id}`),

        getResources: () => restCall('GET', '/api/resources'),
        createResource: (data) => restCall('POST', '/api/resources', data),
        updateResource: (id, f, v) => restCall('PUT', `/api/resources/${id}`, { field: f, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }),
        deleteResource: (id) => restCall('DELETE', `/api/resources/${id}`),

        getMasterBoqs: () => restCall('GET', '/api/master-boqs'),
        saveMasterBoq: (p, id, n) => restCall('POST', '/api/master-boqs', { payload: p, id, isNew: n }),
        deleteMasterBoq: (id) => restCall('DELETE', `/api/master-boqs/${id}`),

        getProjects: () => restCall('GET', '/api/projects'),
        getProject: (id) => restCall('GET', `/api/projects/${id}`),
        addProject: (data) => restCall('POST', '/api/projects', data),
        updateProject: (id, data) => restCall('PUT', `/api/projects/${id}`, data),
        deleteProject: (id) => restCall('DELETE', `/api/projects/${id}`),
        purgeProjects: () => restCall('POST', '/api/projects/purge'),

        getProjectBoqs: (pid) => restCall('GET', `/api/projects/${pid}/boqs`),
        addProjectBoq: (data) => restCall('POST', '/api/boqs', data),
        updateProjectBoq: (id, data) => restCall('PUT', `/api/boqs/${id}`, data),
        deleteProjectBoq: (id) => restCall('DELETE', `/api/boqs/${id}`),
        bulkPutProjectBoqs: (arr) => restCall('PUT', '/api/boqs/bulk', { items: arr }),

        getProjectDocuments: (pid) => restCall('GET', `/api/projects/${pid}/documents`),
        saveProjectDocument: (data) => restCall('POST', '/api/documents', data),
        deleteProjectDocument: (id) => restCall('DELETE', `/api/documents/${id}`),

        getCrmContacts: () => restCall('GET', '/api/crm'),
        saveCrmContact: (data) => restCall('POST', '/api/crm', data),
        deleteCrmContact: (id) => restCall('DELETE', `/api/crm/${id}`),

        getOrgStaff: () => restCall('GET', '/api/staff'),
        saveOrgStaff: (data) => restCall('POST', '/api/staff', data),
        deleteOrgStaff: (id) => restCall('DELETE', `/api/staff/${id}`),

        getWorkLogs: () => restCall('GET', '/api/worklogs'),
        saveWorkLog: (data) => restCall('POST', '/api/worklogs', data),
        updateWorkLog: (id, data) => restCall('PUT', `/api/worklogs/${id}`, data),
        deleteWorkLog: (id) => restCall('DELETE', `/api/worklogs/${id}`),

        getMessages: (pid) => restCall('GET', pid ? `/api/messages?projectId=${pid}` : '/api/messages'),
        saveMessage: (data) => restCall('POST', '/api/messages', data),
        deleteMessage: (id) => restCall('DELETE', `/api/messages/${id}`),

        getPrivateMessages: (u1, u2) => restCall('GET', `/api/private-messages/${u1}/${u2}`),
        savePrivateMessage: (data) => restCall('POST', '/api/private-messages', data),
        deletePrivateMessage: (id) => restCall('DELETE', `/api/private-messages/${id}`),

        checkNotifications: (id, lc) => restCall('GET', `/api/notifications/check`),
        getKanbanTasks: () => restCall('GET', '/api/kanban'),
    },
    // 🔥 Clean injection: If Tauri, use Rust invokes. If Web, use Fallbacks.
    os: { ...(isTauri ? tauriOsCalls : webOsFallbacks), ...osNetworkCalls }
};