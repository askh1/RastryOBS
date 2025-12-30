const WebSocket = require('ws');

class WebSocketRelay {
    constructor(obsConnection) {
        this.obsConnection = obsConnection;
        this.server = null;
        this.clients = new Set();
        this.port = 4456;
    }

    start(customPort = null) {
        if (this.server) {
            console.log('[Relay] Server already running');
            return { success: true, port: this.port };
        }

        // Use custom port if provided
        if (customPort && customPort >= 1024 && customPort <= 65535) {
            this.port = customPort;
        }

        try {
            // Create WebSocket server with configuration
            this.server = new WebSocket.Server({ 
                port: this.port,
                perMessageDeflate: false,
                clientTracking: true
            });
            
            console.log(`[Relay] Starting server on port ${this.port}...`);

            // Server listening event
            this.server.on('listening', () => {
                console.log(`[Relay] ✅ Server listening on ws://localhost:${this.port}`);
            });

            // Server error event
            this.server.on('error', (error) => {
                console.error('[Relay] ❌ Server error:', error.message);
                if (error.code === 'EADDRINUSE') {
                    console.error(`[Relay] Port ${this.port} is already in use`);
                }
            });

            // Client connection event
            this.server.on('connection', (ws, req) => {
                const clientIp = req.socket.remoteAddress;
                const clientPort = req.socket.remotePort;
                console.log(`[Relay] ✅ New client connected from ${clientIp}:${clientPort}`);
                console.log(`[Relay] Total clients: ${this.clients.size + 1}`);
                
                this.clients.add(ws);
                
                // Send OBS-like Hello message for compatibility
                try {
                    ws.send(JSON.stringify({
                        op: 0, // Hello opcode
                        d: {
                            obsWebSocketVersion: '5.0.0',
                            rpcVersion: 1,
                            authentication: {
                                challenge: '',
                                salt: ''
                            }
                        }
                    }));
                    console.log(`[Relay] Sent Hello message to ${clientIp}:${clientPort}`);
                } catch (error) {
                    console.error('[Relay] Error sending Hello message:', error.message);
                }

                // Handle messages from web clients
                ws.on('message', async (message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        console.log(`[Relay] 📥 Received:`, data);
                        
                        // Handle OBS WebSocket protocol opcodes
                        if (data.op !== undefined) {
                            // Op 1 = Identify
                            if (data.op === 1) {
                                console.log('[Relay] Client sent Identify, sending Identified');
                                ws.send(JSON.stringify({
                                    op: 2, // Identified opcode
                                    d: {
                                        negotiatedRpcVersion: 1
                                    }
                                }));
                                return;
                            }
                            
                            // Op 6 = Request
                            if (data.op === 6) {
                                const requestData = data.d;
                                console.log(`[Relay] 📤 Forwarding request: ${requestData.requestType}`);
                                
                                // Check OBS connection
                                if (!this.obsConnection || !this.obsConnection.identified) {
                                    throw new Error('OBS not connected');
                                }
                                
                                // Forward to OBS
                                const result = await this.obsConnection.call(
                                    requestData.requestType, 
                                    requestData.requestData || {}
                                );
                                
                                // Send response (Op 7 = RequestResponse)
                                ws.send(JSON.stringify({
                                    op: 7,
                                    d: {
                                        requestType: requestData.requestType,
                                        requestId: requestData.requestId,
                                        requestStatus: {
                                            result: true,
                                            code: 100
                                        },
                                        responseData: result
                                    }
                                }));
                                console.log(`[Relay] ✅ Response sent for ${requestData.requestType}`);
                                return;
                            }
                        }
                        
                        // Legacy format support (for backward compatibility)
                        if (data.requestType) {
                            console.log(`[Relay] 📤 Forwarding legacy request: ${data.requestType}`);
                            
                            // Check OBS connection
                            if (!this.obsConnection || !this.obsConnection.identified) {
                                throw new Error('OBS not connected');
                            }
                            
                            const result = await this.obsConnection.call(
                                data.requestType,
                                data.requestData || {}
                            );
                            
                            ws.send(JSON.stringify({
                                requestId: data.requestId,
                                requestType: data.requestType,
                                requestStatus: { result: true, code: 100 },
                                responseData: result
                            }));
                            console.log(`[Relay] ✅ Legacy response sent`);
                        }
                        
                    } catch (error) {
                        console.error('[Relay] ❌ Error processing request:', error.message);
                        try {
                            // Send error response
                            if (data.op === 6) {
                                ws.send(JSON.stringify({
                                    op: 7,
                                    d: {
                                        requestType: data.d?.requestType,
                                        requestId: data.d?.requestId,
                                        requestStatus: {
                                            result: false,
                                            code: 600,
                                            comment: error.message
                                        }
                                    }
                                }));
                            } else {
                                ws.send(JSON.stringify({
                                    requestId: data?.requestId,
                                    requestStatus: { result: false, code: 600 },
                                    error: error.message
                                }));
                            }
                        } catch (sendError) {
                            console.error('[Relay] Error sending error response:', sendError.message);
                        }
                    }
                });

                ws.on('close', (code, reason) => {
                    console.log(`[Relay] 🔌 Client disconnected: ${clientIp}:${clientPort} (Code: ${code})`);
                    this.clients.delete(ws);
                    console.log(`[Relay] Total clients: ${this.clients.size}`);
                });

                ws.on('error', (error) => {
                    console.error(`[Relay] ⚠️ Client error (${clientIp}:${clientPort}):`, error.message);
                    this.clients.delete(ws);
                });

                ws.on('pong', () => {
                    ws.isAlive = true;
                });
            });

            // Heartbeat to detect dead connections
            this.heartbeatInterval = setInterval(() => {
                this.clients.forEach((ws) => {
                    if (ws.isAlive === false) {
                        console.log('[Relay] Terminating dead connection');
                        return ws.terminate();
                    }
                    ws.isAlive = false;
                    ws.ping();
                });
            }, 30000);

            console.log(`[Relay] ✅ WebSocket Relay initialized successfully`);
            return { success: true, port: this.port };
            
        } catch (error) {
            console.error('[Relay] ❌ Failed to start relay server:', error.message);
            return { success: false, error: error.message };
        }
    }

    stop() {
        if (!this.server) {
            console.log('[Relay] Server is not running');
            return { success: true };
        }

        try {
            console.log('[Relay] Stopping server...');
            
            // Clear heartbeat interval
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }

            // Close all client connections
            console.log(`[Relay] Closing ${this.clients.size} client connection(s)...`);
            this.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    try {
                        client.send(JSON.stringify({
                            type: 'server-shutdown',
                            message: 'Server is shutting down'
                        }));
                        client.close(1000, 'Server shutdown');
                    } catch (error) {
                        console.error('[Relay] Error closing client:', error.message);
                    }
                }
            });
            this.clients.clear();

            // Close server
            this.server.close(() => {
                console.log('[Relay] ✅ Server closed successfully');
            });
            this.server = null;
            
            console.log('[Relay] ✅ WebSocket Relay stopped');
            return { success: true };
            
        } catch (error) {
            console.error('[Relay] ❌ Failed to stop relay server:', error.message);
            return { success: false, error: error.message };
        }
    }

    broadcastEvent(eventData) {
        if (!this.server || this.clients.size === 0) {
            return;
        }
        
        const message = JSON.stringify({
            type: 'event',
            eventData: eventData
        });

        console.log(`[Relay] 📡 Broadcasting event: ${eventData.eventType} to ${this.clients.size} client(s)`);
        
        let successCount = 0;
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(message);
                    successCount++;
                } catch (error) {
                    console.error('[Relay] Error broadcasting to client:', error.message);
                }
            }
        });
        
        console.log(`[Relay] Event sent to ${successCount}/${this.clients.size} client(s)`);
    }

    getStatus() {
        return {
            running: this.server !== null,
            port: this.port,
            clients: this.clients.size
        };
    }
}

module.exports = WebSocketRelay;
