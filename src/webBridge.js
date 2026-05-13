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
 * 🔥 DYNAMIC SERVER DISCOVERY
 * 1. If we are served by the daemon, our origin is the server.
 * 2. If we are in Electron, we check localStorage (from our connect screen).
 * 3. Otherwise, fallback to the default port 3000.
 */
const getTargetUrl = () => {
    // If we are NOT on the Vite dev port (5173), we are likely being served by the Rust Daemon
    if (window.location.port !== '5173' && window.location.hostname !== 'localhost') {
        return window.location.origin;
    }
    // Check if we saved a URL during the Electron connection phase
    const saved = localStorage.getItem('openprix_last_server');
    if (saved) return saved;

    return 'http://127.0.0.1:3000'; // Default Fallback
};

const SERVER_URL = getTargetUrl();
console.log(`[OpenPrix] Connecting to Nexus Daemon at: ${SERVER_URL}`);

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
    scaffoldProject: () => console.log("Not implemented in REST yet"),
    renameProjectFolder: () => console.log("Not implemented in REST yet"),
    uploadFileWeb: (fileName, base64Data) => restCall('POST', '/api/os/upload', { filename: fileName, base64: base64Data }),
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
    os: { ...(window.electronHost && window.electronHost.os ? window.electronHost.os : webOsFallbacks), ...osNetworkCalls }
};