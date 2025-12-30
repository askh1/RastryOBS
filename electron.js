const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const path = require('path');
const ProxyServer = require('./proxy-server');
const NgrokManager = require('./ngrok-manager');

let mainWindow;
let proxyServer;
let ngrokManager;
let connectionCheckInterval;

console.log('[RastryOBS] Starting application...');

function createWindow() {
    console.log('[RastryOBS] Creating main window...');
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 700,
        resizable: true,
        show: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        title: 'RastryOBS 1.3.0',
        icon: path.join(__dirname, 'assets', 'logo.png'),
        autoHideMenuBar: true
    });

    mainWindow.loadFile('index-new.html');
    
    console.log('[RastryOBS] Main window created successfully');

    // Open DevTools during development
    mainWindow.webContents.openDevTools();
    
    mainWindow.on('ready-to-show', () => {
        console.log('[RastryOBS] Window ready, displaying...');
        mainWindow.show();
    });
}

app.whenReady().then(() => {
    console.log('⚡ Electron listo');
    proxyServer = new ProxyServer();
    ngrokManager = new NgrokManager();
    
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', async () => {
    await cleanup();
    app.quit();
});

// IPC Handlers

ipcMain.handle('check-auth-token', async () => {
    return ngrokManager.getAuthToken();
});

ipcMain.handle('save-auth-token', async (event, token) => {
    ngrokManager.setAuthToken(token);
    return true;
});

ipcMain.handle('check-obs', async () => {
    return await ngrokManager.checkOBSRunning();
});

ipcMain.handle('start-tunnel', async () => {
    try {
        // 1. Verificar OBS
        const obsRunning = await ngrokManager.checkOBSRunning();
        if (!obsRunning) {
            throw new Error('OBS no está corriendo o WebSocket no está habilitado');
        }

        // 2. Iniciar proxy local
        const proxyPort = await proxyServer.start(0);
        
        // 3. Crear túnel ngrok
        const url = await ngrokManager.start(proxyPort);

        // 4. Iniciar monitoreo de conexiones
        startConnectionMonitoring();

        return {
            success: true,
            url: url
        };
    } catch (error) {
        console.error('Error al iniciar túnel:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('stop-tunnel', async () => {
    try {
        await cleanup();
        return { success: true };
    } catch (error) {
        console.error('Error al detener túnel:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('copy-url', async (event, url) => {
    clipboard.writeText(url);
    return true;
});

ipcMain.handle('get-connection-count', async () => {
    return proxyServer ? proxyServer.getConnectionCount() : 0;
});

// Funciones auxiliares

function startConnectionMonitoring() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }

    connectionCheckInterval = setInterval(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const count = proxyServer.getConnectionCount();
            mainWindow.webContents.send('connection-update', count);
        }
    }, 2000);
}

async function cleanup() {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
        connectionCheckInterval = null;
    }

    if (ngrokManager) {
        await ngrokManager.stop();
    }

    if (proxyServer) {
        await proxyServer.stop();
    }
}
