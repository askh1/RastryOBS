const { ipcRenderer, shell } = require('electron');

let tunnelActive = false;

// Inicializar
async function init() {
    const hasToken = await ipcRenderer.invoke('check-auth-token');
    
    if (hasToken) {
        showMainScreen();
    } else {
        showSetupScreen();
    }
}

function showSetupScreen() {
    document.getElementById('setup-screen').style.display = 'block';
    document.getElementById('main-screen').style.display = 'none';
}

function showMainScreen() {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    checkOBS();
}

async function saveAuthToken() {
    const input = document.getElementById('auth-token-input');
    const token = input.value.trim();
    
    if (!token) {
        alert('Please enter a valid token');
        return;
    }
    
    await ipcRenderer.invoke('save-auth-token', token);
    showMainScreen();
}

async function checkOBS() {
    const checkItem = document.getElementById('obs-check');
    const isRunning = await ipcRenderer.invoke('check-obs');
    
    if (isRunning) {
        checkItem.className = 'check-item success';
        checkItem.innerHTML = '<span class="check-icon"></span><span>OBS Studio detected</span>';
    } else {
        checkItem.className = 'check-item error';
        checkItem.innerHTML = '<span class="check-icon"></span><span>OBS is not running or WebSocket is not enabled</span>';
    }
}

async function startTunnel() {
    const startBtn = document.getElementById('start-btn');
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
    
    const result = await ipcRenderer.invoke('start-tunnel');
    
    if (result.success) {
        // Show URL
        document.getElementById('tunnel-url').value = result.url;
        document.getElementById('url-box').style.display = 'block';
        document.getElementById('stats-box').style.display = 'block';
        
        // Change status
        document.getElementById('status-idle').style.display = 'none';
        document.getElementById('status-active').style.display = 'flex';
        
        // Change buttons
        startBtn.style.display = 'none';
        document.getElementById('stop-btn').style.display = 'block';
        
        tunnelActive = true;
        
    } else {
        alert('Error starting tunnel: ' + result.error);
        startBtn.disabled = false;
        startBtn.textContent = 'Start Tunnel';
    }
}

async function stopTunnel() {
    const stopBtn = document.getElementById('stop-btn');
    stopBtn.disabled = true;
    stopBtn.textContent = 'Stopping...';
    
    await ipcRenderer.invoke('stop-tunnel');
    
    // Hide URL and stats
    document.getElementById('url-box').style.display = 'none';
    document.getElementById('stats-box').style.display = 'none';
    
    // Change status
    document.getElementById('status-idle').style.display = 'flex';
    document.getElementById('status-active').style.display = 'none';
    
    // Change buttons
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('start-btn').disabled = false;
    document.getElementById('start-btn').textContent = 'Start Tunnel';
    stopBtn.style.display = 'none';
    stopBtn.disabled = false;
    stopBtn.textContent = 'Stop Tunnel';
    
    tunnelActive = false;
}

async function copyUrl() {
    const url = document.getElementById('tunnel-url').value;
    await ipcRenderer.invoke('copy-url', url);
    
    const copyBtn = document.querySelector('.btn-copy');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyBtn.textContent = originalText;
    }, 2000);
}

function openExternal(url) {
    shell.openExternal(url);
}

// Escuchar actualizaciones de conexiones
ipcRenderer.on('connection-update', (event, count) => {
    document.getElementById('connection-count').textContent = count;
});

// Inicializar al cargar
init();
