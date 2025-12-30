const express = require('express');
const http = require('http');
const WebSocket = require('ws');

class ProxyServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = null;
        this.port = null;
        this.connections = new Map();
    }

    start(port = 0) {
        return new Promise((resolve, reject) => {
            // WebSocket server para recibir conexiones WSS desde internet
            this.wss = new WebSocket.Server({ 
                server: this.server,
                perMessageDeflate: false
            });

            this.wss.on('connection', (clientWs) => {
                console.log('[PROXY] Cliente conectado desde internet');
                
                // Conectar al OBS local
                const obsWs = new WebSocket('ws://localhost:4455', {
                    perMessageDeflate: false
                });

                const connectionId = Date.now() + Math.random();
                this.connections.set(connectionId, { clientWs, obsWs });

                // Cliente → OBS
                clientWs.on('message', (data, isBinary) => {
                    if (obsWs.readyState === WebSocket.OPEN) {
                        obsWs.send(data, { binary: isBinary });
                    }
                });

                // OBS → Cliente
                obsWs.on('message', (data, isBinary) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(data, { binary: isBinary });
                    }
                });

                // Manejar errores y desconexiones
                obsWs.on('open', () => {
                    console.log('[PROXY] Conectado a OBS local');
                });

                obsWs.on('error', (error) => {
                    console.error('[PROXY] Error OBS:', error.message);
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.close(1011, `OBS error: ${error.message}`);
                    }
                });

                obsWs.on('close', () => {
                    console.log('[PROXY] OBS desconectado');
                    if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.close();
                    }
                    this.connections.delete(connectionId);
                });

                clientWs.on('close', () => {
                    console.log('[PROXY] Cliente desconectado');
                    if (obsWs.readyState === WebSocket.OPEN) {
                        obsWs.close();
                    }
                    this.connections.delete(connectionId);
                });

                clientWs.on('error', (error) => {
                    console.error('[PROXY] Error cliente:', error.message);
                    if (obsWs.readyState === WebSocket.OPEN) {
                        obsWs.close();
                    }
                    this.connections.delete(connectionId);
                });
            });

            // Health check endpoint
            this.app.get('/', (req, res) => {
                res.json({
                    status: 'ok',
                    service: 'RastryOBS Proxy',
                    connections: this.connections.size
                });
            });

            this.server.listen(port, () => {
                this.port = this.server.address().port;
                console.log(`[PROXY] Servidor iniciado en puerto ${this.port}`);
                resolve(this.port);
            });

            this.server.on('error', reject);
        });
    }

    stop() {
        return new Promise((resolve) => {
            // Cerrar todas las conexiones
            this.connections.forEach(({ clientWs, obsWs }) => {
                if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
                if (obsWs.readyState === WebSocket.OPEN) obsWs.close();
            });
            this.connections.clear();

            if (this.wss) {
                this.wss.close();
            }

            if (this.server) {
                this.server.close(() => {
                    console.log('[PROXY] Servidor detenido');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    getConnectionCount() {
        return this.connections.size;
    }
}

module.exports = ProxyServer;
