const ngrok = require('@ngrok/ngrok');
const Store = require('electron-store');
const WebSocket = require('ws');

class NgrokManager {
    constructor() {
        this.store = new Store();
        this.listener = null;
        this.url = null;
    }

    async checkOBSRunning() {
        return new Promise((resolve) => {
            const ws = new WebSocket('ws://localhost:4455');
            
            ws.on('open', () => {
                ws.close();
                resolve(true);
            });
            
            ws.on('error', () => {
                resolve(false);
            });
        });
    }

    getAuthToken() {
        return this.store.get('ngrokAuthToken');
    }

    setAuthToken(token) {
        this.store.set('ngrokAuthToken', token);
    }

    async start(localPort) {
        const authToken = this.getAuthToken();
        
        if (!authToken) {
            throw new Error('NO_AUTH_TOKEN');
        }

        try {
            // Conectar a ngrok
            this.listener = await ngrok.connect({
                addr: localPort,
                authtoken: authToken,
            });

            this.url = this.listener.url();
            
            // Convertir http:// a wss://
            if (this.url.startsWith('http://')) {
                this.url = this.url.replace('http://', 'wss://');
            } else if (this.url.startsWith('https://')) {
                this.url = this.url.replace('https://', 'wss://');
            }

            console.log('[NGROK] Túnel creado:', this.url);
            return this.url;
            
        } catch (error) {
            console.error('[NGROK] Error:', error);
            throw error;
        }
    }

    async stop() {
        if (this.listener) {
            try {
                await ngrok.disconnect();
                console.log('[NGROK] Túnel cerrado');
            } catch (error) {
                console.error('[NGROK] Error al cerrar:', error);
            }
            this.listener = null;
            this.url = null;
        }
    }

    getUrl() {
        return this.url;
    }
}

module.exports = NgrokManager;
