const { ipcRenderer, shell } = require('electron');
const OBSWebSocket = require('obs-websocket-js').default;
const WebSocketRelay = require('./websocket-relay');
const HotkeysManager = require('./hotkeys-manager');
// const LicenseManager = require('./license-manager'); // Disabled during development

// ============================================
// WARNING: PREMIUM SYSTEM - DEVELOPMENT MODE
// ============================================
// Set to TRUE when ready to activate license system
// Set to FALSE during development (current state)
const PREMIUM_ENABLED = false;

let obs = null;
let isConnected = false;
let relay = null;
let currentMode = 'moderator'; // 'moderator' or 'streamer'
let currentScene = null;
let licenseManager = null;
let selectedSourceId = null;
let scenesList = [];
let hotkeysManager = null;
let sourcesList = [];
let previewInterval = null;
let previewCanvas = null;
let previewCtx = null;

// Initialize
async function init() {
    console.log('=== INICIANDO RASTRYOBS ==>');
    console.log('PREMIUM_ENABLED:', PREMIUM_ENABLED);
    console.log('DOM readyState:', document.readyState);
    
    // Initialize Hotkeys Manager
    hotkeysManager = new HotkeysManager();
    setupHotkeysHandlers();
    console.log('[Hotkeys] Hotkeys system initialized');
    
    // Initialize license manager (ONLY if premium system enabled)
    if (PREMIUM_ENABLED) {
        // const LicenseManager = require('./license-manager');
        // licenseManager = new LicenseManager();
        
        // Verificar licencia periódicamente (cada hora)
        setInterval(() => {
            if (licenseManager) {
                licenseManager.verifyToken();
                updateLicenseUI();
            }
        }, 60 * 60 * 1000);
    }
    
    // Check if ngrok token exists
    const hasToken = await ipcRenderer.invoke('check-auth-token');
    if (!hasToken && currentMode === 'streamer') {
        showSetupModal();
    }
    
    // Initialize OBS WebSocket
    obs = new OBSWebSocket();
    setupOBSEventListeners();
    
    // Setup UI for current mode (creates the buttons)
    updateUIForMode();
    
    // THEN setup event listeners (after buttons exist)
    setupEventListeners();
    
    // NO auto-connect in moderator mode - they need to connect to streamer's tunnel
    // Auto-connect only in streamer mode to local OBS
    if (currentMode === 'streamer') {
        tryAutoConnectLocal();
    }
    
    // Close context menus on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu') && !e.target.closest('.mini-btn')) {
            hideContextMenus();
        }
    });
}

function hideContextMenus() {
    document.getElementById('add-source-menu').style.display = 'none';
}

function setupEventListeners() {
    console.log('=== SETUP EVENT LISTENERS ==>');
    
    // Mode selector buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            updateUIForMode(); // This recreates the connection panel and adds its listeners
        });
    });
    
    // License/Premium button (only if enabled)
    if (PREMIUM_ENABLED) {
        const premiumBtn = document.getElementById('premium-btn');
        if (premiumBtn) {
            premiumBtn.addEventListener('click', showLicenseModal);
            updateLicenseUI();
        }
    } else {
        // Hide premium button if disabled
        const premiumBtn = document.getElementById('premium-btn');
        if (premiumBtn) {
            premiumBtn.style.display = 'none';
        }
    }
    
    // WebSocket settings button (top bar)
    const wsSettingsBtn = document.getElementById('websocket-settings-btn');
    if (wsSettingsBtn) {
        wsSettingsBtn.addEventListener('click', openWebSocketSettings);
    }
    
    // Hotkeys button (top bar)
    const hotkeysBtn = document.getElementById('hotkeys-btn');
    if (hotkeysBtn) {
        hotkeysBtn.addEventListener('click', openHotkeysModal);
    }
    
    // Settings button (top bar)
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            console.log('Settings clicked (not implemented yet)');
        });
    }
    
    // Preview controls (these exist in the HTML, not dynamically created)
    const startStreamingBtn = document.getElementById('start-streaming');
    const startRecordingBtn = document.getElementById('start-recording');
    const studioModeBtn = document.getElementById('studio-mode');
    
    if (startStreamingBtn) {
        startStreamingBtn.addEventListener('click', toggleStreaming);
    }
    if (startRecordingBtn) {
        startRecordingBtn.addEventListener('click', toggleRecording);
    }
    if (studioModeBtn) {
        studioModeBtn.addEventListener('click', toggleStreaming);
    }
    
    console.log('=== EVENT LISTENERS CONFIGURADOS ===');
}

function updateUIForMode() {
    const connectionPanel = document.getElementById('connection-panel');
    
    if (currentMode === 'streamer') {
        // Streamer mode: connect to local OBS and share via tunnel
        connectionPanel.innerHTML = `
            <div class="connection-instructions">
                <h3>STREAMER MODE</h3>
                <p>1. Make sure OBS Studio is running</p>
                <p>2. Enable WebSocket server in OBS (Tools → WebSocket Server Settings)</p>
                <p>3. Click below to create a tunnel for your moderators</p>
            </div>
            <button id="connect-local-obs-btn" class="primary-btn">Connect to Local OBS</button>
            <button id="share-btn" class="primary-btn" style="display: none;">Create Tunnel (Share with Moderators)</button>
            <div id="tunnel-url-display" style="display: none; flex: 1; flex-direction: column; gap: 10px;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="text" id="tunnel-url" readonly style="flex: 1;">
                    <button id="copy-url-btn" class="primary-btn">Copy URL</button>
                </div>
                <p style="font-size: 12px; color: #888;">Share this URL with your moderators to control your OBS remotely</p>
            </div>
        `;
        // Add event listeners for new buttons
        document.getElementById('connect-local-obs-btn')?.addEventListener('click', connectToLocalOBS);
        document.getElementById('share-btn')?.addEventListener('click', startTunnel);
        document.getElementById('copy-url-btn')?.addEventListener('click', copyTunnelUrl);
    } else {
        // Moderator mode: connect to streamer's tunnel
        connectionPanel.innerHTML = `
            <div class="connection-instructions">
                <h3>MODERATOR MODE</h3>
                <p>Enter the tunnel URL shared by the streamer</p>
                <p>Example: wss://abc123.ngrok.io</p>
            </div>
            <input type="text" id="ws-url" placeholder="Enter Streamer's Tunnel URL (wss://...)">
            <input type="password" id="ws-password" placeholder="Password (if required)">
            <button id="connect-btn" class="primary-btn">Connect to Streamer's OBS</button>
            <button id="start-relay-btn" class="secondary-btn" style="display: none;">Start Local Relay (for Web Dashboard)</button>
            <div id="relay-status" style="display: none; color: #22c55e; font-size: 12px; margin-top: 10px;">
                [ACTIVE] Local Relay: ws://localhost:4456<br>
                Use this URL in your web dashboard
            </div>
        `;
        document.getElementById('connect-btn').addEventListener('click', connectToOBS);
        document.getElementById('start-relay-btn')?.addEventListener('click', startLocalRelay);
    }
}

async function tryAutoConnectLocal() {
    // Only for streamer mode: try to connect to local OBS
    const defaultUrl = 'ws://localhost:4455';
    updateConnectionStatus('connecting', 'Connecting to local OBS...');
    
    try {
        await obs.connect(defaultUrl, undefined, {
            eventSubscriptions: 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512
        });
        console.log('Auto-connected to local OBS');
    } catch (error) {
        console.log('Local OBS not available:', error.message);
        updateConnectionStatus('disconnected', 'Please start OBS Studio and enable WebSocket');
    }
}

async function connectToLocalOBS() {
    // Streamer mode: connect to local OBS only
    const connectBtn = document.getElementById('connect-local-obs-btn');
    
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting to Local OBS...';
    updateConnectionStatus('connecting', 'Connecting to local OBS...');
    
    try {
        await obs.connect('ws://localhost:4455', undefined, {
            eventSubscriptions: 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 256 | 512
        });
        console.log('Connected to local OBS');
        
        // Show tunnel button after successful connection
        connectBtn.style.display = 'none';
        document.getElementById('share-btn').style.display = 'inline-block';
    } catch (error) {
        console.error('Connection to local OBS failed:', error);
        alert('Failed to connect to local OBS:\n\n' + error.message + '\n\nMake sure:\n1. OBS Studio is running\n2. WebSocket Server is enabled (Tools → WebSocket Server Settings)\n3. Port is 4455 (default)');
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect to Local OBS';
        updateConnectionStatus('disconnected', 'Connection Failed');
    }
}

async function connectToOBS() {
    const urlInput = document.getElementById('ws-url');
    const passwordInput = document.getElementById('ws-password');
    const connectBtn = document.getElementById('connect-btn');
    
    const url = urlInput?.value.trim() || 'ws://localhost:4455';
    const password = passwordInput?.value.trim();
    
    if (!url) {
        alert('Please enter a WebSocket URL');
        return;
    }
    
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    updateConnectionStatus('connecting', 'Connecting...');
    
    try {
        const connectionOptions = {
            address: url
        };
        
        // Only add password if provided
        if (password) {
            connectionOptions.password = password;
        }
        
        await obs.connect(connectionOptions.address, connectionOptions.password);
        console.log('Connected to streamer\'s OBS successfully');
    } catch (error) {
        console.error('Connection failed:', error);
        alert('Failed to connect to streamer\'s OBS:\n\n' + error.message + '\n\nMake sure:\n1. You have the correct tunnel URL from the streamer\n2. The streamer has their OBS and RastryOBS running\n3. The tunnel is active');
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect to Streamer\'s OBS';
        updateConnectionStatus('disconnected', 'Connection Failed');
    }
}

function setupOBSEventListeners() {
    obs.on('ConnectionOpened', async () => {
        console.log('OBS Connection opened');
        isConnected = true;
        
        if (currentMode === 'streamer') {
            updateConnectionStatus('connected', 'Connected to Local OBS');
        } else {
            updateConnectionStatus('connected', 'Connected to Streamer\'s OBS');
            // In moderator mode, start receiving preview frames
            startRemotePreviewReceiver();
        }
        
        const connectBtn = document.getElementById('connect-btn');
        if (connectBtn) {
            connectBtn.textContent = 'Disconnect';
        }
        hidePreviewOverlay();
        
        // Show relay button if moderator mode
        if (currentMode === 'moderator') {
            const relayBtn = document.getElementById('start-relay-btn');
            if (relayBtn) relayBtn.style.display = 'inline-block';
        }
        
        // Wait a bit before loading data
        setTimeout(() => {
            loadOBSData();
        }, 500);
    });
    
    obs.on('ConnectionClosed', () => {
        console.log('OBS Connection closed');
        isConnected = false;
        updateConnectionStatus('disconnected', 'Disconnected');
        const connectBtn = document.getElementById('connect-btn');
        if (connectBtn) {
            connectBtn.textContent = 'Connect to OBS';
            connectBtn.disabled = false;
        }
        showPreviewOverlay();
        clearOBSData();
    });
    
    obs.on('ConnectionError', (error) => {
        console.error('OBS Connection error:', error);
        updateConnectionStatus('disconnected', 'Connection Error');
    });
    
    // Scene events
    obs.on('CurrentProgramSceneChanged', (data) => {
        console.log('Scene changed:', data.sceneName);
        updateActiveScene(data.sceneName);
    });
    
    // Scene item events
    obs.on('SceneItemEnableStateChanged', (data) => {
        updateSourceVisibility(data.sceneItemId, data.sceneItemEnabled);
    });
    
    // Streaming/Recording events
    obs.on('StreamStateChanged', (data) => {
        updateStreamingButton(data.outputActive);
    });
    
    obs.on('RecordStateChanged', (data) => {
        updateRecordingButton(data.outputActive);
    });
}

function updateConnectionStatus(status, text) {
    const dot = document.getElementById('connection-dot');
    const textEl = document.getElementById('connection-text');
    
    dot.className = 'status-dot';
    if (status === 'connected') {
        dot.classList.add('connected');
    } else if (status === 'connecting') {
        dot.classList.add('connecting');
    }
    
    textEl.textContent = text;
}

function hidePreviewOverlay() {
    document.getElementById('preview-overlay')?.classList.add('hidden');
    
    // Start preview capture
    startPreviewCapture();
}

function showPreviewOverlay() {
    document.getElementById('preview-overlay')?.classList.remove('hidden');
    
    // Stop preview capture
    stopPreviewCapture();
}

function startPreviewCapture() {
    if (!isConnected || previewInterval) return;
    
    previewCanvas = document.getElementById('preview-canvas');
    previewCtx = previewCanvas?.getContext('2d', { 
        alpha: false,
        desynchronized: true // Better performance
    });
    
    if (!previewCanvas || !previewCtx) return;
    
    // Enable image smoothing for better quality
    previewCtx.imageSmoothingEnabled = true;
    previewCtx.imageSmoothingQuality = 'high';
    
    let isCapturing = false;
    
    console.log('[Preview] Starting local preview capture at 60 FPS');
    
    // Capture screenshot at 60 FPS for ultra smooth preview
    const captureFrame = async () => {
        if (!isConnected || isCapturing) return;
        
        isCapturing = true;
        try {
            const screenshot = await obs.call('GetSourceScreenshot', {
                sourceName: currentScene,
                imageFormat: 'jpg',
                imageWidth: 1280,
                imageHeight: 720,
                imageCompressionQuality: 90 // High quality for smooth visuals
            });
            
            if (screenshot && screenshot.imageData) {
                const imageData = screenshot.imageData;
                const img = new Image();
                img.onload = () => {
                    requestAnimationFrame(() => {
                        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                        previewCtx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
                    });
                };
                img.src = imageData;
                
                // If in streamer mode, broadcast frame to connected mods via WebSocket
                if (currentMode === 'streamer') {
                    try {
                        // Send preview frame through OBS WebSocket as a custom event
                        // Mods listening to this will receive the frame
                        obs.call('BroadcastCustomEvent', {
                            eventData: {
                                type: 'preview_frame',
                                data: imageData
                            }
                        }).catch(() => {
                            // BroadcastCustomEvent might not be available, use alternative
                            // Store frame data for relay server to pick up
                            if (window.currentPreviewFrame !== imageData) {
                                window.currentPreviewFrame = imageData;
                            }
                        });
                    } catch (err) {
                        // Silently fail - not critical
                    }
                }
            }
        } catch (error) {
            console.error('Error capturing preview:', error);
        } finally {
            isCapturing = false;
        }
    };
    
    previewInterval = setInterval(captureFrame, 16); // 60 FPS (~16ms) - ultra smooth
}

function stopPreviewCapture() {
    if (previewInterval) {
        clearInterval(previewInterval);
        previewInterval = null;
    }
    
    if (previewCtx && previewCanvas) {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }
}

// For moderators: receive and display preview frames from streamer's OBS
function startRemotePreviewReceiver() {
    if (currentMode !== 'moderator' || !isConnected || previewInterval) return;
    
    previewCanvas = document.getElementById('preview-canvas');
    previewCtx = previewCanvas?.getContext('2d', { 
        alpha: false,
        desynchronized: true // Better performance
    });
    
    if (!previewCanvas || !previewCtx) return;
    
    // Enable image smoothing for better quality
    previewCtx.imageSmoothingEnabled = true;
    previewCtx.imageSmoothingQuality = 'high';
    
    console.log('[Preview] Starting remote preview receiver at 30 FPS with high quality');
    
    let isReceiving = false;
    let frameQueue = [];
    let isRendering = false;
    
    // Render queued frames smoothly
    const renderFrame = () => {
        if (!isRendering && frameQueue.length > 0) {
            isRendering = true;
            const imageData = frameQueue.shift();
            
            const img = new Image();
            img.onload = () => {
                requestAnimationFrame(() => {
                    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                    previewCtx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
                    isRendering = false;
                    
                    // Render next frame if available
                    if (frameQueue.length > 0) {
                        renderFrame();
                    }
                });
            };
            img.src = imageData;
        }
    };
    
    // Request frames from streamer's OBS at 30 FPS
    const requestFrame = async () => {
        if (!isConnected || isReceiving) return;
        
        isReceiving = true;
        try {
            // Request a screenshot from the current scene
            const screenshot = await obs.call('GetSourceScreenshot', {
                sourceName: currentScene || 'CurrentScene',
                imageFormat: 'jpg',
                imageWidth: 1280,
                imageHeight: 720,
                imageCompressionQuality: 90 // High quality for best visuals
            });
            
            if (screenshot && screenshot.imageData) {
                // Add to queue, keep max 2 frames to prevent memory issues
                frameQueue.push(screenshot.imageData);
                if (frameQueue.length > 2) {
                    frameQueue.shift(); // Remove oldest frame
                }
                renderFrame();
            }
        } catch (error) {
            console.error('Error receiving remote preview:', error);
            // If GetSourceScreenshot fails, try with fallback settings
            if (currentScene) {
                try {
                    const screenshot = await obs.call('GetSourceScreenshot', {
                        sourceName: currentScene,
                        imageFormat: 'jpg',
                        imageWidth: 1280,
                        imageHeight: 720,
                        imageCompressionQuality: 85
                    });
                    
                    if (screenshot && screenshot.imageData) {
                        frameQueue.push(screenshot.imageData);
                        if (frameQueue.length > 2) {
                            frameQueue.shift();
                        }
                        renderFrame();
                    }
                } catch (err2) {
                    console.error('Fallback preview also failed:', err2);
                }
            }
        } finally {
            isReceiving = false;
        }
    };
    
    previewInterval = setInterval(requestFrame, 33); // 30 FPS (~33ms) - smooth and high quality
    requestFrame(); // Request first frame immediately
}

async function loadOBSData() {
    try {
        // Load scenes
        const scenesData = await obs.call('GetSceneList');
        currentScene = scenesData.currentProgramSceneName;
        displayScenes(scenesData.scenes, scenesData.currentProgramSceneName);
        
        // Load sources for current scene
        const sourcesData = await obs.call('GetSceneItemList', {
            sceneName: scenesData.currentProgramSceneName
        });
        displaySources(sourcesData.sceneItems);
        
        // Load audio sources
        loadAudioSources();
        
        // Get streaming/recording status
        const streamStatus = await obs.call('GetStreamStatus');
        updateStreamingButton(streamStatus.outputActive);
        
        const recordStatus = await obs.call('GetRecordStatus');
        updateRecordingButton(recordStatus.outputActive);
        
    } catch (error) {
        console.error('Error loading OBS data:', error);
    }
}

function displayScenes(scenes, currentSceneName) {
    const scenesListEl = document.getElementById('scenes-list');
    scenesListEl.innerHTML = '';
    
    scenesList = scenes; // Store globally
    currentScene = currentSceneName;
    
    if (scenes.length === 0) {
        scenesListEl.innerHTML = '<div class="empty-state">No scenes available</div>';
        return;
    }
    
    scenes.forEach(scene => {
        const sceneItem = document.createElement('div');
        sceneItem.className = 'scene-item';
        if (scene.sceneName === currentSceneName) {
            sceneItem.classList.add('active');
        }
        sceneItem.textContent = scene.sceneName;
        sceneItem.addEventListener('click', () => switchScene(scene.sceneName));
        scenesListEl.appendChild(sceneItem);
    });
}

function displaySources(sources) {
    const sourcesListEl = document.getElementById('sources-list');
    sourcesListEl.innerHTML = '';
    
    sourcesList = sources; // Store globally
    
    if (sources.length === 0) {
        sourcesListEl.innerHTML = '<div class="empty-state">No sources in this scene</div>';
        return;
    }
    
    sources.reverse().forEach(source => {
        const sourceItem = document.createElement('div');
        sourceItem.className = 'source-item';
        sourceItem.dataset.itemId = source.sceneItemId;
        sourceItem.draggable = true; // Make draggable
        
        if (selectedSourceId === source.sceneItemId) {
            sourceItem.classList.add('selected');
        }
        
        // Create visibility toggle
        const visibilityDiv = document.createElement('div');
        visibilityDiv.className = `source-visibility ${source.sceneItemEnabled ? 'visible' : ''}`;
        visibilityDiv.dataset.itemId = source.sceneItemId;
        visibilityDiv.textContent = source.sceneItemEnabled ? '●' : '○';
        visibilityDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSourceVisibilityUI(source.sceneItemId);
        });
        
        // Create source name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'source-name';
        nameSpan.textContent = source.sourceName;
        
        // Create lock toggle
        const lockSpan = document.createElement('span');
        lockSpan.className = `source-lock ${source.sceneItemLocked ? 'locked' : ''}`;
        lockSpan.dataset.itemId = source.sceneItemId;
        lockSpan.textContent = source.sceneItemLocked ? '[LOCK]' : '[OPEN]';
        lockSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSourceLockUI(source.sceneItemId);
        });
        
        // Append all elements
        sourceItem.appendChild(visibilityDiv);
        sourceItem.appendChild(nameSpan);
        sourceItem.appendChild(lockSpan);
        
        // Drag & Drop events
        sourceItem.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', source.sceneItemId);
            sourceItem.classList.add('dragging');
        });
        
        sourceItem.addEventListener('dragend', (e) => {
            sourceItem.classList.remove('dragging');
        });
        
        sourceItem.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            const draggingElement = document.querySelector('.dragging');
            if (draggingElement && draggingElement !== sourceItem) {
                sourceItem.classList.add('drag-over');
            }
        });
        
        sourceItem.addEventListener('dragleave', (e) => {
            sourceItem.classList.remove('drag-over');
        });
        
        sourceItem.addEventListener('drop', async (e) => {
            e.preventDefault();
            sourceItem.classList.remove('drag-over');
            
            const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
            const targetId = parseInt(sourceItem.dataset.itemId);
            
            if (draggedId !== targetId) {
                await reorderSource(draggedId, targetId);
            }
        });
        
        // Click to select
        sourceItem.addEventListener('click', (e) => {
            if (!e.target.closest('.source-visibility') && !e.target.closest('.source-lock')) {
                selectSource(source.sceneItemId);
            }
        });
        
        sourcesListEl.appendChild(sourceItem);
    });
}

function selectSource(itemId) {
    selectedSourceId = itemId;
    
    // Update UI
    document.querySelectorAll('.source-item').forEach(item => {
        item.classList.remove('selected');
        if (parseInt(item.dataset.itemId) === itemId) {
            item.classList.add('selected');
        }
    });
}

async function loadAudioSources() {
    try {
        const inputs = await obs.call('GetInputList');
        const audioSources = inputs.inputs.filter(input => 
            input.inputKind.includes('audio') || 
            input.inputKind === 'wasapi_input_capture' ||
            input.inputKind === 'wasapi_output_capture'
        );
        
        displayAudioMixer(audioSources);
    } catch (error) {
        console.error('Error loading audio sources:', error);
    }
}

function displayAudioMixer(sources) {
    const mixerContainer = document.getElementById('mixer-container');
    mixerContainer.innerHTML = '';
    
    if (sources.length === 0) {
        mixerContainer.innerHTML = '<div class="empty-state">No audio sources</div>';
        return;
    }
    
    sources.forEach(source => {
        const audioItem = document.createElement('div');
        audioItem.className = 'audio-source';
        audioItem.dataset.inputName = source.inputName;
        audioItem.innerHTML = `
            <div class="audio-header">
                <span class="audio-name">${source.inputName}</span>
                <div class="audio-controls">
                    <button class="audio-btn" onclick="toggleAudioMute('${source.inputName}')" title="Mute/Unmute">🔊</button>
                    <button class="audio-settings-btn" onclick="showAudioSettings('${source.inputName}')" title="Audio Settings">⚙</button>
                </div>
            </div>
            <div class="volume-container">
                <div class="volume-slider">
                    <div class="volume-track"></div>
                    <div class="volume-fill" style="width: 100%"></div>
                    <div class="volume-level-indicator" style="width: 0%"></div>
                    <div class="volume-fader" style="left: 100%">
                        <div class="volume-fader-handle"></div>
                    </div>
                </div>
                <div class="volume-db">0.0 dB</div>
            </div>
        `;
        mixerContainer.appendChild(audioItem);
        
        // Setup drag functionality for volume fader
        const slider = audioItem.querySelector('.volume-slider');
        const faderHandle = audioItem.querySelector('.volume-fader-handle');
        
        let isDragging = false;
        
        // Click on slider to set volume
        slider.addEventListener('click', (e) => {
            if (e.target === faderHandle || e.target.closest('.volume-fader')) return;
            setVolumeAtPosition(e, slider, source.inputName);
        });
        
        // Drag fader handle
        faderHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDragging = true;
            faderHandle.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            setVolumeAtPosition(e, slider, source.inputName);
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                faderHandle.style.cursor = 'grab';
            }
        });
    });
    
    // Start monitoring audio levels
    startAudioLevelMonitoring();
}

async function switchScene(sceneName) {
    try {
        await obs.call('SetCurrentProgramScene', { sceneName });
        currentScene = sceneName;
        
        // Update UI
        document.querySelectorAll('.scene-item').forEach(item => {
            item.classList.remove('active');
            if (item.textContent === sceneName) {
                item.classList.add('active');
            }
        });
        
        // Reload sources for new scene
        const sourcesData = await obs.call('GetSceneItemList', { sceneName });
        displaySources(sourcesData.sceneItems);
    } catch (error) {
        console.error('Error switching scene:', error);
    }
}

async function toggleSourceVisibility(itemId, enabled) {
    try {
        if (!currentScene) return;
        
        await obs.call('SetSceneItemEnabled', {
            sceneName: currentScene,
            sceneItemId: itemId,
            sceneItemEnabled: enabled
        });
    } catch (error) {
        console.error('Error toggling source visibility:', error);
    }
}

// New function to handle UI click
async function toggleSourceVisibilityUI(itemId) {
    try {
        if (!currentScene) {
            console.error('No current scene available');
            return;
        }
        
        // Get current state from UI - be more specific with selector
        const visibilityIcon = document.querySelector(`.source-visibility[data-item-id="${itemId}"]`);
        if (!visibilityIcon) {
            console.error('Visibility icon not found for item:', itemId);
            return;
        }
        
        const isCurrentlyVisible = visibilityIcon.classList.contains('visible');
        
        // Toggle to opposite state
        await obs.call('SetSceneItemEnabled', {
            sceneName: currentScene,
            sceneItemId: itemId,
            sceneItemEnabled: !isCurrentlyVisible
        });
        
        // Update UI immediately
        updateSourceVisibility(itemId, !isCurrentlyVisible);
    } catch (error) {
        console.error('Error toggling source visibility:', error);
    }
}

function updateSourceVisibility(itemId, enabled) {
    // Be more specific with selector to avoid duplicates
    const sourceItem = document.querySelector(`.source-visibility[data-item-id="${itemId}"]`);
    if (sourceItem) {
        // Remove all classes and add base class
        sourceItem.className = 'source-visibility';
        if (enabled) {
            sourceItem.classList.add('visible');
        }
        sourceItem.textContent = enabled ? '●' : '○';
    }
}

async function toggleSourceLockUI(itemId) {
    try {
        if (!currentScene) {
            console.error('No current scene available');
            return;
        }
        
        // Read current state from UI
        const lockIcon = document.querySelector(`.source-lock[data-item-id="${itemId}"]`);
        if (!lockIcon) {
            console.error('Lock icon not found for item:', itemId);
            return;
        }
        
        const isCurrentlyLocked = lockIcon.classList.contains('locked');
        
        // Toggle to opposite state
        await obs.call('SetSceneItemLocked', {
            sceneName: currentScene,
            sceneItemId: itemId,
            sceneItemLocked: !isCurrentlyLocked
        });
        
        // Update UI immediately
        updateSourceLock(itemId, !isCurrentlyLocked);
    } catch (error) {
        console.error('Error toggling source lock:', error);
    }
}

function updateSourceLock(itemId, locked) {
    const lockIcon = document.querySelector(`.source-lock[data-item-id="${itemId}"]`);
    if (lockIcon) {
        lockIcon.className = `source-lock ${locked ? 'locked' : ''}`;
        lockIcon.textContent = locked ? '[LOCK]' : '[OPEN]';
    }
}

async function toggleStreaming() {
    try {
        const status = await obs.call('GetStreamStatus');
        if (status.outputActive) {
            await obs.call('StopStream');
        } else {
            await obs.call('StartStream');
        }
    } catch (error) {
        console.error('Error toggling streaming:', error);
        alert('Error: ' + error.message);
    }
}

async function toggleRecording() {
    try {
        const status = await obs.call('GetRecordStatus');
        if (status.outputActive) {
            await obs.call('StopRecord');
        } else {
            await obs.call('StartRecord');
        }
    } catch (error) {
        console.error('Error toggling recording:', error);
        alert('Error: ' + error.message);
    }
}

async function toggleStudioMode() {
    try {
        const status = await obs.call('GetStudioModeEnabled');
        await obs.call('SetStudioModeEnabled', { studioModeEnabled: !status.studioModeEnabled });
        document.getElementById('studio-mode').classList.toggle('active');
    } catch (error) {
        console.error('Error toggling studio mode:', error);
    }
}

function updateStreamingButton(isStreaming) {
    const btn = document.getElementById('start-streaming');
    if (isStreaming) {
        btn.textContent = 'Stop Streaming';
        btn.classList.add('streaming');
    } else {
        btn.textContent = 'Start Streaming';
        btn.classList.remove('streaming');
    }
}

function updateRecordingButton(isRecording) {
    const btn = document.getElementById('start-recording');
    if (isRecording) {
        btn.textContent = 'Stop Recording';
        btn.classList.add('recording');
    } else {
        btn.textContent = 'Start Recording';
        btn.classList.remove('recording');
    }
}

// ========================================
// AUDIO FUNCTIONS
// ========================================

async function toggleAudioMute(inputName) {
    try {
        const muted = await obs.call('GetInputMute', { inputName });
        await obs.call('SetInputMute', {
            inputName,
            inputMuted: !muted.inputMuted
        });
        
        // Update UI
        const audioBtn = document.querySelector(`button[onclick="toggleAudioMute('${inputName}')"]`);
        if (audioBtn) {
            audioBtn.classList.toggle('active', !muted.inputMuted);
            audioBtn.textContent = !muted.inputMuted ? '🔇' : '🔊';
        }
    } catch (error) {
        console.error('Error toggling audio mute:', error);
    }
}

async function setVolume(event, inputName) {
    try {
        const slider = event.currentTarget;
        const rect = slider.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        
        // OBS volume is in dB, convert percentage to dB
        // 0% = -100dB (muted), 100% = 0dB (unity gain)
        const volumeDb = percentage === 0 ? -100 : (20 * Math.log10(percentage));
        
        await obs.call('SetInputVolume', {
            inputName,
            inputVolumeDb: volumeDb
        });
        
        // Update UI
        const volumeFill = slider.querySelector('.volume-fill');
        if (volumeFill) {
            volumeFill.style.width = (percentage * 100) + '%';
        }
    } catch (error) {
        console.error('Error setting volume:', error);
    }
}

async function setVolumeAtPosition(event, slider, inputName) {
    try {
        const rect = slider.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        
        // OBS volume is in dB, convert percentage to dB
        // 0% = -100dB (muted), 100% = 0dB (unity gain)
        const volumeDb = percentage === 0 ? -100 : (20 * Math.log10(percentage));
        
        await obs.call('SetInputVolume', {
            inputName,
            inputVolumeDb: volumeDb
        });
        
        // Update UI immediately
        const audioSource = slider.closest('.audio-source');
        if (audioSource) {
            const volumeFill = audioSource.querySelector('.volume-fill');
            const volumeFader = audioSource.querySelector('.volume-fader');
            const volumeDbText = audioSource.querySelector('.volume-db');
            
            if (volumeFill) {
                volumeFill.style.width = (percentage * 100) + '%';
            }
            
            if (volumeFader) {
                volumeFader.style.left = (percentage * 100) + '%';
            }
            
            if (volumeDbText) {
                volumeDbText.textContent = volumeDb.toFixed(1) + ' dB';
            }
        }
    } catch (error) {
        console.error('Error setting volume:', error);
    }
}

function showAudioSettings(inputName) {
    const dialog = document.getElementById('audio-settings-dialog');
    const title = document.getElementById('audio-settings-title');
    
    title.textContent = `Audio Settings - ${inputName}`;
    dialog.style.display = 'flex';
    dialog.dataset.inputName = inputName;
    
    // Load current settings
    loadAudioSettingsForSource(inputName);
}

function hideAudioSettings() {
    document.getElementById('audio-settings-dialog').style.display = 'none';
}

async function loadAudioSettingsForSource(inputName) {
    try {
        // Get volume
        const volume = await obs.call('GetInputVolume', { inputName });
        const volumePercent = Math.pow(10, volume.inputVolumeDb / 20) * 100;
        
        document.getElementById('audio-volume-slider').value = volumePercent;
        document.getElementById('audio-volume-percent').textContent = Math.round(volumePercent) + '%';
        document.getElementById('audio-volume-db').value = volume.inputVolumeDb.toFixed(1);
        
        // Load filters (if any)
        try {
            const filters = await obs.call('GetSourceFilterList', { sourceName: inputName });
            displayAudioFilters(filters.filters);
        } catch (err) {
            console.log('No filters or error loading filters:', err);
            displayAudioFilters([]);
        }
        
    } catch (error) {
        console.error('Error loading audio settings:', error);
    }
}

function displayAudioFilters(filters) {
    const filtersList = document.getElementById('audio-filters-list');
    filtersList.innerHTML = '';
    
    if (filters.length === 0) {
        filtersList.innerHTML = '<div class="empty-filters">No filters added</div>';
        return;
    }
    
    filters.forEach(filter => {
        const filterItem = document.createElement('div');
        filterItem.className = 'filter-item';
        filterItem.dataset.filterName = filter.filterName;
        filterItem.innerHTML = `
            <input type="checkbox" ${filter.filterEnabled ? 'checked' : ''} 
                   onchange="toggleFilter('${filter.filterName}')">
            <span>${filter.filterName}</span>
            <span class="filter-type">(${filter.filterKind})</span>
        `;
        filterItem.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                document.querySelectorAll('.filter-item').forEach(item => item.classList.remove('selected'));
                filterItem.classList.add('selected');
            }
        });
        filtersList.appendChild(filterItem);
    });
}

async function applyAudioSettings() {
    const dialog = document.getElementById('audio-settings-dialog');
    const inputName = dialog.dataset.inputName;
    
    try {
        // Apply volume
        const volumeDb = parseFloat(document.getElementById('audio-volume-db').value);
        await obs.call('SetInputVolume', {
            inputName,
            inputVolumeDb: volumeDb
        });
        
        hideAudioSettings();
        
    } catch (error) {
        console.error('Error applying audio settings:', error);
        alert('Error applying settings: ' + error.message);
    }
}

function showAddFilterMenu() {
    const menu = document.getElementById('add-filter-menu');
    const button = event.target;
    const rect = button.getBoundingClientRect();
    
    menu.style.display = 'block';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 5) + 'px';
}

async function addAudioFilter(filterType) {
    const dialog = document.getElementById('audio-settings-dialog');
    const inputName = dialog.dataset.inputName;
    
    document.getElementById('add-filter-menu').style.display = 'none';
    
    const filterName = prompt(`Enter name for ${filterType} filter:`);
    if (!filterName) return;
    
    try {
        await obs.call('CreateSourceFilter', {
            sourceName: inputName,
            filterName: filterName,
            filterKind: filterType,
            filterSettings: {}
        });
        
        // Reload filters list
        loadAudioSettingsForSource(inputName);
        
    } catch (error) {
        console.error('Error adding filter:', error);
        alert('Error adding filter: ' + error.message);
    }
}

async function removeSelectedFilter() {
    const dialog = document.getElementById('audio-settings-dialog');
    const inputName = dialog.dataset.inputName;
    
    const selected = document.querySelector('.filter-item.selected');
    if (!selected) {
        alert('Please select a filter to remove');
        return;
    }
    
    const filterName = selected.dataset.filterName;
    
    if (!confirm(`Remove filter "${filterName}"?`)) {
        return;
    }
    
    try {
        await obs.call('RemoveSourceFilter', {
            sourceName: inputName,
            filterName: filterName
        });
        
        // Reload filters list
        loadAudioSettingsForSource(inputName);
        
    } catch (error) {
        console.error('Error removing filter:', error);
        alert('Error removing filter: ' + error.message);
    }
}

async function toggleFilter(filterName) {
    const dialog = document.getElementById('audio-settings-dialog');
    const inputName = dialog.dataset.inputName;
    const checkbox = event.target;
    
    try {
        await obs.call('SetSourceFilterEnabled', {
            sourceName: inputName,
            filterName: filterName,
            filterEnabled: checkbox.checked
        });
    } catch (error) {
        console.error('Error toggling filter:', error);
        checkbox.checked = !checkbox.checked;
    }
}

function moveFilterUp() {
    alert('Filter reordering coming soon!');
}

function moveFilterDown() {
    alert('Filter reordering coming soon!');
}

let audioLevelInterval = null;

function startAudioLevelMonitoring() {
    // Stop previous monitoring if exists
    if (audioLevelInterval) {
        clearInterval(audioLevelInterval);
    }
    
    // Monitor audio levels every 50ms (20 times per second)
    audioLevelInterval = setInterval(async () => {
        if (!isConnected) {
            stopAudioLevelMonitoring();
            return;
        }
        
        try {
            const inputs = await obs.call('GetInputList');
            const audioSources = inputs.inputs.filter(input => 
                input.inputKind.includes('audio') || 
                input.inputKind === 'wasapi_input_capture' ||
                input.inputKind === 'wasapi_output_capture'
            );
            
            for (const source of audioSources) {
                try {
                    const volume = await obs.call('GetInputVolume', { inputName: source.inputName });
                    const muted = await obs.call('GetInputMute', { inputName: source.inputName });
                    
                    // Get audio levels (this requires InputVolumeMeters event, but we'll simulate it)
                    updateAudioLevelUI(source.inputName, volume.inputVolumeDb, muted.inputMuted);
                } catch (err) {
                    // Ignore errors for individual sources
                }
            }
        } catch (error) {
            console.error('Error monitoring audio levels:', error);
        }
    }, 50);
}

function stopAudioLevelMonitoring() {
    if (audioLevelInterval) {
        clearInterval(audioLevelInterval);
        audioLevelInterval = null;
    }
}

function updateAudioLevelUI(inputName, volumeDb, isMuted) {
    const audioSource = document.querySelector(`.audio-source[data-input-name="${inputName}"]`);
    if (!audioSource) return;
    
    const volumeFill = audioSource.querySelector('.volume-fill');
    const volumeFader = audioSource.querySelector('.volume-fader');
    const volumeDbText = audioSource.querySelector('.volume-db');
    const levelIndicator = audioSource.querySelector('.volume-level-indicator');
    
    // Convert dB to percentage for UI
    // -100dB = 0%, 0dB = 100%
    let percentage;
    if (volumeDb <= -100) {
        percentage = 0;
    } else if (volumeDb >= 0) {
        percentage = 100;
    } else {
        // Logarithmic conversion
        percentage = Math.pow(10, volumeDb / 20) * 100;
    }
    
    if (volumeFill) {
        volumeFill.style.width = percentage + '%';
    }
    
    if (volumeFader) {
        volumeFader.style.left = percentage + '%';
    }
    
    if (volumeDbText) {
        volumeDbText.textContent = volumeDb.toFixed(1) + ' dB';
    }
    
    // Simulate audio level animation (in real scenario, use InputVolumeMeters event)
    // For now, show a random flickering effect when not muted
    if (levelIndicator && !isMuted) {
        const randomLevel = Math.random() * percentage * 0.8;
        levelIndicator.style.width = randomLevel + '%';
    } else if (levelIndicator) {
        levelIndicator.style.width = '0%';
    }
}

function clearOBSData() {
    document.getElementById('scenes-list').innerHTML = '<div class="empty-state">Not connected</div>';
    document.getElementById('sources-list').innerHTML = '<div class="empty-state">Not connected</div>';
    document.getElementById('mixer-container').innerHTML = '<div class="empty-state">Not connected</div>';
    stopAudioLevelMonitoring();
}

function updateActiveScene(sceneName) {
    document.querySelectorAll('.scene-item').forEach(item => {
        item.classList.remove('active');
        if (item.textContent === sceneName) {
            item.classList.add('active');
        }
    });
}

// ========================================
// RELAY SERVER FUNCTIONS (Moderator)
// ========================================

function startLocalRelay(customPort = null) {
    if (!isConnected) {
        alert('Connect to OBS first!');
        return;
    }
    
    console.log('[UI] Starting local relay...');
    
    if (!relay) {
        relay = new WebSocketRelay(obs);
    }
    
    const result = relay.start(customPort);
    
    if (result.success) {
        // Update UI
        const relayBtn = document.getElementById('start-relay-btn');
        const relayStatus = document.getElementById('relay-status');
        
        if (relayBtn) {
            relayBtn.textContent = 'Stop Relay';
            relayBtn.onclick = stopLocalRelay;
        }
        
        if (relayStatus) {
            relayStatus.style.display = 'block';
            relayStatus.style.color = '#22c55e';
            relayStatus.innerHTML = `
                <div>[ACTIVE] Relay: <code>ws://localhost:${result.port}</code></div>
                <div style="font-size: 11px; color: #6b6b6b; margin-top: 4px;">
                    Web clients can now connect • ${relay.getStatus().clients} connected
                </div>
            `;
        }
        
        // Forward OBS events to web clients
        setupRelayEventForwarding();
        
        console.log('[UI] [SUCCESS] Local relay started successfully on port', result.port);
        
        // Update client count every 2 seconds
        if (window.relayStatusInterval) {
            clearInterval(window.relayStatusInterval);
        }
        window.relayStatusInterval = setInterval(() => {
            if (relay && relayStatus) {
                const status = relay.getStatus();
                if (status.running) {
                    const clientInfo = relayStatus.querySelector('div:last-child');
                    if (clientInfo) {
                        clientInfo.textContent = `Web clients can now connect • ${status.clients} connected`;
                    }
                }
            }
        }, 2000);
    } else {
        console.error('[UI] [ERROR] Failed to start relay:', result.error);
        alert('Failed to start relay server:\n' + result.error + '\n\nCheck if port is already in use.');
    }
}

function stopLocalRelay() {
    if (!relay) return;
    
    console.log('[UI] Stopping local relay...');
    
    // Clear interval
    if (window.relayStatusInterval) {
        clearInterval(window.relayStatusInterval);
        window.relayStatusInterval = null;
    }
    
    const result = relay.stop();
    
    if (result.success) {
        const relayBtn = document.getElementById('start-relay-btn');
        const relayStatus = document.getElementById('relay-status');
        
        if (relayBtn) {
            relayBtn.textContent = 'Start Local Relay';
            relayBtn.onclick = startLocalRelay;
        }
        
        if (relayStatus) {
            relayStatus.style.display = 'none';
        }
        
        console.log('[UI] [SUCCESS] Local relay stopped');
    } else {
        console.error('[UI] [ERROR] Failed to stop relay:', result.error);
        alert('Failed to stop relay: ' + result.error);
    }
}

// ========================================
// HOTKEYS SYSTEM
// ========================================

function setupHotkeysHandlers() {
    // Streaming controls
    hotkeysManager.registerHandler('toggleStreaming', async () => {
        if (!isConnected) return;
        try {
            const status = await obs.call('GetStreamStatus');
            if (status.outputActive) {
                await obs.call('StopStream');
            } else {
                await obs.call('StartStream');
            }
        } catch (error) {
            console.error('[Hotkeys] Error toggling streaming:', error);
        }
    });

    hotkeysManager.registerHandler('toggleRecording', async () => {
        if (!isConnected) return;
        try {
            const status = await obs.call('GetRecordStatus');
            if (status.outputActive) {
                await obs.call('StopRecord');
            } else {
                await obs.call('StartRecord');
            }
        } catch (error) {
            console.error('[Hotkeys] Error toggling recording:', error);
        }
    });

    hotkeysManager.registerHandler('toggleStudioMode', async () => {
        if (!isConnected) return;
        try {
            const status = await obs.call('GetStudioModeEnabled');
            await obs.call('SetStudioModeEnabled', { studioModeEnabled: !status.studioModeEnabled });
        } catch (error) {
            console.error('[Hotkeys] Error toggling studio mode:', error);
        }
    });

    // Scene switching
    hotkeysManager.registerHandler('switchScene', async (hotkey) => {
        if (!isConnected || !scenesList || scenesList.length === 0) return;
        
        const sceneIndex = hotkey.sceneIndex;
        if (sceneIndex < scenesList.length) {
            const scene = scenesList[sceneIndex];
            try {
                await obs.call('SetCurrentProgramScene', { sceneName: scene.sceneName });
            } catch (error) {
                console.error('[Hotkeys] Error switching scene:', error);
            }
        }
    });

    // Source toggling
    hotkeysManager.registerHandler('toggleSource', async (hotkey) => {
        if (!isConnected || !currentScene || !sourcesList || sourcesList.length === 0) return;
        
        const sourceIndex = hotkey.sourceIndex;
        if (sourceIndex < sourcesList.length) {
            const source = sourcesList[sourceIndex];
            try {
                await obs.call('SetSceneItemEnabled', {
                    sceneName: currentScene,
                    sceneItemId: source.sceneItemId,
                    sceneItemEnabled: !source.sceneItemEnabled
                });
            } catch (error) {
                console.error('[Hotkeys] Error toggling source:', error);
            }
        }
    });

    // Audio mute controls
    hotkeysManager.registerHandler('muteDesktopAudio', async () => {
        if (!isConnected) return;
        try {
            // Try to find desktop audio input
            const inputs = await obs.call('GetInputList');
            const desktopAudio = inputs.inputs.find(input => 
                input.inputName.toLowerCase().includes('desktop') || 
                input.inputName.toLowerCase().includes('system')
            );
            
            if (desktopAudio) {
                const muteStatus = await obs.call('GetInputMute', { inputName: desktopAudio.inputName });
                await obs.call('SetInputMute', { 
                    inputName: desktopAudio.inputName, 
                    inputMuted: !muteStatus.inputMuted 
                });
            }
        } catch (error) {
            console.error('[Hotkeys] Error toggling desktop audio:', error);
        }
    });

    hotkeysManager.registerHandler('muteMicAudio', async () => {
        if (!isConnected) return;
        try {
            // Try to find microphone input
            const inputs = await obs.call('GetInputList');
            const micAudio = inputs.inputs.find(input => 
                input.inputName.toLowerCase().includes('mic') || 
                input.inputName.toLowerCase().includes('microphone')
            );
            
            if (micAudio) {
                const muteStatus = await obs.call('GetInputMute', { inputName: micAudio.inputName });
                await obs.call('SetInputMute', { 
                    inputName: micAudio.inputName, 
                    inputMuted: !muteStatus.inputMuted 
                });
            }
        } catch (error) {
            console.error('[Hotkeys] Error toggling microphone:', error);
        }
    });

    // Preview toggle
    hotkeysManager.registerHandler('togglePreview', () => {
        const preview = document.getElementById('preview-canvas');
        if (preview) {
            preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
        }
    });

    // Screenshot
    hotkeysManager.registerHandler('takeScreenshot', async () => {
        if (!isConnected) return;
        try {
            const screenshot = await obs.call('GetSourceScreenshot', {
                sourceName: currentScene,
                imageFormat: 'png',
                imageWidth: 1920,
                imageHeight: 1080
            });
            
            // Download screenshot
            const link = document.createElement('a');
            link.href = screenshot.imageData;
            link.download = `rastryobs-screenshot-${Date.now()}.png`;
            link.click();
        } catch (error) {
            console.error('[Hotkeys] Error taking screenshot:', error);
        }
    });

    console.log('[Hotkeys] All handlers registered successfully');
}

function setupRelayEventForwarding() {
    if (!relay) return;
    
    // Forward OBS events to web clients through relay
    const eventsToForward = [
        'CurrentProgramSceneChanged',
        'SceneItemEnableStateChanged',
        'SceneItemLockStateChanged',
        'StreamStateChanged',
        'RecordStateChanged',
        'InputVolumeChanged',
        'InputMuteStateChanged'
    ];
    
    eventsToForward.forEach(eventName => {
        obs.on(eventName, (data) => {
            relay.broadcastEvent({
                eventType: eventName,
                eventData: data
            });
        });
    });
}

// Streamer mode functions
async function startTunnel() {
    // VALIDACIÓN PREMIUM: Verificar licencia antes de crear túnel
    // DISABLED DURING DEVELOPMENT (change PREMIUM_ENABLED = true to activate)
    if (PREMIUM_ENABLED && (!licenseManager || !licenseManager.isPremium())) {
        showLicenseModal();
        return;
    }
    
    const shareBtn = document.getElementById('share-btn');
    shareBtn.disabled = true;
    shareBtn.textContent = 'Starting Tunnel...';
    
    const result = await ipcRenderer.invoke('start-tunnel');
    
    if (result.success) {
        document.getElementById('share-btn').style.display = 'none';
        const urlDisplay = document.getElementById('tunnel-url-display');
        urlDisplay.style.display = 'flex';
        document.getElementById('tunnel-url').value = result.url;
        
        // Also connect to local OBS
        tryAutoConnect();
    } else {
        alert('Error starting tunnel: ' + result.error);
        shareBtn.disabled = false;
        shareBtn.textContent = 'Share OBS (Start Tunnel)';
    }
}

async function copyTunnelUrl() {
    const url = document.getElementById('tunnel-url').value;
    await ipcRenderer.invoke('copy-url', url);
    
    const btn = document.getElementById('copy-url-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
        btn.textContent = originalText;
    }, 2000);
}

// Setup modal functions
function showSetupModal() {
    document.getElementById('setup-modal').style.display = 'flex';
}

function hideSetupModal() {
    document.getElementById('setup-modal').style.display = 'none';
}

async function saveNgrokToken() {
    const input = document.getElementById('ngrok-token-input');
    const token = input.value.trim();
    
    if (!token) {
        alert('Please enter a valid token');
        return;
    }
    
    await ipcRenderer.invoke('save-auth-token', token);
    hideSetupModal();
}

function openExternal(url) {
    shell.openExternal(url);
}

// ========================================
// SCENE MANAGEMENT FUNCTIONS
// ========================================

function showAddSceneDialog() {
    document.getElementById('add-scene-dialog').style.display = 'flex';
    document.getElementById('new-scene-name').value = '';
    document.getElementById('new-scene-name').focus();
}

function hideAddSceneDialog() {
    document.getElementById('add-scene-dialog').style.display = 'none';
}

async function createScene() {
    const nameInput = document.getElementById('new-scene-name');
    const sceneName = nameInput.value.trim();
    
    if (!sceneName) {
        alert('Please enter a scene name');
        return;
    }
    
    try {
        await obs.call('CreateScene', { sceneName });
        hideAddSceneDialog();
        
        // Refresh scenes list
        const scenesData = await obs.call('GetSceneList');
        displayScenes(scenesData.scenes, scenesData.currentProgramSceneName);
    } catch (error) {
        console.error('Error creating scene:', error);
        alert('Error creating scene: ' + error.message);
    }
}

async function removeSelectedScene() {
    const activeScene = document.querySelector('.scene-item.active');
    if (!activeScene) {
        alert('Please select a scene to remove');
        return;
    }
    
    const sceneName = activeScene.textContent;
    
    if (!confirm(`Remove scene "${sceneName}"?`)) {
        return;
    }
    
    try {
        await obs.call('RemoveScene', { sceneName });
        
        // Refresh scenes list
        const scenesData = await obs.call('GetSceneList');
        displayScenes(scenesData.scenes, scenesData.currentProgramSceneName);
    } catch (error) {
        console.error('Error removing scene:', error);
        alert('Error removing scene: ' + error.message);
    }
}

async function moveSceneUp() {
    // OBS doesn't have direct scene reordering API
    alert('Scene reordering not yet implemented');
}

async function moveSceneDown() {
    alert('Scene reordering not yet implemented');
}

async function changeTransition() {
    const transitionType = document.getElementById('transition-select').value;
    const duration = parseInt(document.getElementById('transition-duration').value);
    
    try {
        // Set transition
        await obs.call('SetCurrentSceneTransition', { transitionName: transitionType });
        await obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: duration });
    } catch (error) {
        console.error('Error changing transition:', error);
    }
}

// ========================================
// SOURCE MANAGEMENT FUNCTIONS
// ========================================

function showAddSourceMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('add-source-menu');
    const button = event.target.closest('.mini-btn');
    const rect = button.getBoundingClientRect();
    
    menu.style.display = 'block';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 5) + 'px';
}

async function addSource(sourceType) {
    hideContextMenus();
    
    const sourceName = prompt(`Enter name for ${sourceType.replace(/_/g, ' ')}:`);
    if (!sourceName) return;
    
    try {
        const activeScene = document.querySelector('.scene-item.active');
        if (!activeScene) {
            alert('Please select a scene first');
            return;
        }
        
        const sceneName = activeScene.textContent;
        
        // Create input (source)
        await obs.call('CreateInput', {
            sceneName: sceneName,
            inputName: sourceName,
            inputKind: sourceType,
            inputSettings: {},
            sceneItemEnabled: true
        });
        
        // Refresh sources list
        const sourcesData = await obs.call('GetSceneItemList', { sceneName });
        displaySources(sourcesData.sceneItems);
        
    } catch (error) {
        console.error('Error adding source:', error);
        alert('Error adding source: ' + error.message);
    }
}

async function removeSelectedSource() {
    if (!selectedSourceId) {
        alert('Please select a source to remove');
        return;
    }
    
    const activeScene = document.querySelector('.scene-item.active');
    if (!activeScene) return;
    
    const sceneName = activeScene.textContent;
    
    if (!confirm('Remove selected source?')) {
        return;
    }
    
    try {
        await obs.call('RemoveSceneItem', {
            sceneName: sceneName,
            sceneItemId: selectedSourceId
        });
        
        selectedSourceId = null;
        
        // Refresh sources list
        const sourcesData = await obs.call('GetSceneItemList', { sceneName });
        displaySources(sourcesData.sceneItems);
        
    } catch (error) {
        console.error('Error removing source:', error);
        alert('Error: ' + error.message);
    }
}

async function moveSourceUp() {
    if (!selectedSourceId) {
        alert('Please select a source');
        return;
    }
    
    if (!currentScene) return;
    
    try {
        // Get current sources list
        const sourcesData = await obs.call('GetSceneItemList', { sceneName: currentScene });
        const currentIndex = sourcesData.sceneItems.findIndex(item => item.sceneItemId === selectedSourceId);
        
        if (currentIndex === -1 || currentIndex === sourcesData.sceneItems.length - 1) {
            // Already at top or not found
            return;
        }
        
        // Move up one position (higher index in OBS = higher in visual stack)
        const newIndex = currentIndex + 1;
        await obs.call('SetSceneItemIndex', {
            sceneName: currentScene,
            sceneItemId: selectedSourceId,
            sceneItemIndex: newIndex
        });
        
        // Refresh
        const updatedSources = await obs.call('GetSceneItemList', { sceneName: currentScene });
        displaySources(updatedSources.sceneItems);
    } catch (error) {
        console.error('Error moving source up:', error);
        alert('Error moving source: ' + error.message);
    }
}

async function moveSourceDown() {
    if (!selectedSourceId) {
        alert('Please select a source');
        return;
    }
    
    if (!currentScene) return;
    
    try {
        // Get current sources list
        const sourcesData = await obs.call('GetSceneItemList', { sceneName: currentScene });
        const currentIndex = sourcesData.sceneItems.findIndex(item => item.sceneItemId === selectedSourceId);
        
        if (currentIndex === -1 || currentIndex === 0) {
            // Already at bottom or not found
            return;
        }
        
        // Move down one position (lower index in OBS = lower in visual stack)
        const newIndex = currentIndex - 1;
        await obs.call('SetSceneItemIndex', {
            sceneName: currentScene,
            sceneItemId: selectedSourceId,
            sceneItemIndex: newIndex
        });
        
        // Refresh
        const updatedSources = await obs.call('GetSceneItemList', { sceneName: currentScene });
        displaySources(updatedSources.sceneItems);
    } catch (error) {
        console.error('Error moving source down:', error);
        alert('Error moving source: ' + error.message);
    }
}

async function reorderSource(draggedId, targetId) {
    if (!currentScene) return;
    
    try {
        // Get current sources list
        const sourcesData = await obs.call('GetSceneItemList', { sceneName: currentScene });
        
        // Find indices
        const draggedIndex = sourcesData.sceneItems.findIndex(item => item.sceneItemId === draggedId);
        const targetIndex = sourcesData.sceneItems.findIndex(item => item.sceneItemId === targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        // Set the dragged item to the target position
        await obs.call('SetSceneItemIndex', {
            sceneName: currentScene,
            sceneItemId: draggedId,
            sceneItemIndex: targetIndex
        });
        
        // Refresh
        const updatedSources = await obs.call('GetSceneItemList', { sceneName: currentScene });
        displaySources(updatedSources.sceneItems);
        
        // Keep selection
        selectSource(draggedId);
    } catch (error) {
        console.error('Error reordering source:', error);
    }
}

function showSourceProperties() {
    if (!selectedSourceId) {
        alert('Please select a source');
        return;
    }
    
    const dialog = document.getElementById('source-properties-dialog');
    const content = document.getElementById('source-properties-content');
    
    content.innerHTML = `
        <div class="property-group">
            <label>Transform</label>
            <button onclick="resetTransform()" class="secondary-btn">Reset Transform</button>
        </div>
        <div class="property-group">
            <label>Position X</label>
            <input type="number" id="pos-x" value="0">
        </div>
        <div class="property-group">
            <label>Position Y</label>
            <input type="number" id="pos-y" value="0">
        </div>
        <div class="property-group">
            <label>Scale X</label>
            <input type="number" step="0.1" id="scale-x" value="1.0">
        </div>
        <div class="property-group">
            <label>Scale Y</label>
            <input type="number" step="0.1" id="scale-y" value="1.0">
        </div>
        <div class="property-group">
            <label>Rotation</label>
            <input type="number" id="rotation" value="0" min="0" max="360">
        </div>
    `;
    
    dialog.style.display = 'flex';
}

function hideSourceProperties() {
    document.getElementById('source-properties-dialog').style.display = 'none';
}

async function resetTransform() {
    if (!selectedSourceId) return;
    
    const activeScene = document.querySelector('.scene-item.active');
    if (!activeScene) return;
    
    try {
        await obs.call('SetSceneItemTransform', {
            sceneName: activeScene.textContent,
            sceneItemId: selectedSourceId,
            sceneItemTransform: {
                positionX: 0,
                positionY: 0,
                scaleX: 1.0,
                scaleY: 1.0,
                rotation: 0
            }
        });
        
        alert('Transform reset');
    } catch (error) {
        console.error('Error resetting transform:', error);
    }
}

function showSourceFilters() {
    if (!selectedSourceId) {
        alert('Please select a source');
        return;
    }
    
    alert('Filters panel coming soon!');
}

// WebSocket Server Settings Functions
function openWebSocketSettings() {
    const modal = document.getElementById('websocket-settings-modal');
    modal.style.display = 'flex';
    
    // Update status
    updateWebSocketSettingsUI();
    
    // Load saved port
    const savedPort = localStorage.getItem('ws-relay-port') || '4456';
    document.getElementById('ws-port-input').value = savedPort;
    
    // Load auto-start preference
    const autoStart = localStorage.getItem('ws-relay-autostart') === 'true';
    document.getElementById('ws-auto-start').checked = autoStart;
    
    // Start interval to update client count
    window.wsSettingsInterval = setInterval(() => {
        if (modal.style.display === 'flex') {
            updateWebSocketSettingsUI();
        } else {
            clearInterval(window.wsSettingsInterval);
        }
    }, 1000);
}

function closeWebSocketSettings() {
    const modal = document.getElementById('websocket-settings-modal');
    modal.style.display = 'none';
    
    if (window.wsSettingsInterval) {
        clearInterval(window.wsSettingsInterval);
    }
}

function updateWebSocketSettingsUI() {
    const status = relay?.getStatus();
    const isRunning = status?.running || false;
    
    // Update OBS connection status
    const obsStatusEl = document.getElementById('ws-obs-status');
    const obsWarningEl = document.getElementById('ws-obs-warning');
    const startBtn = document.getElementById('ws-start-btn');
    
    if (obsStatusEl) {
        obsStatusEl.textContent = isConnected ? 'Connected' : 'Not Connected';
        obsStatusEl.style.color = isConnected ? '#22c55e' : '#6b6b6b';
    }
    
    // Show/hide warning and disable/enable start button based on OBS connection
    if (obsWarningEl) {
        obsWarningEl.style.display = isConnected ? 'none' : 'block';
    }
    
    if (startBtn) {
        startBtn.disabled = !isConnected || isRunning;
    }
    
    document.getElementById('ws-status-text').textContent = isRunning ? 'Running' : 'Stopped';
    document.getElementById('ws-status-text').style.color = isRunning ? '#22c55e' : '#6b6b6b';
    
    const port = status?.port || document.getElementById('ws-port-input')?.value || '4456';
    document.getElementById('ws-port-text').textContent = port;
    document.getElementById('ws-url-text').value = `ws://localhost:${port}`;
    
    document.getElementById('ws-clients-text').textContent = status?.clients || '0';
    
    document.getElementById('ws-start-btn').style.display = isRunning ? 'none' : 'block';
    document.getElementById('ws-stop-btn').style.display = isRunning ? 'block' : 'none';
    
    document.getElementById('ws-port-input').disabled = isRunning;
}

function startRelayFromSettings() {
    // Check if connected to OBS first
    if (!isConnected) {
        alert('Please connect to OBS before starting the relay server');
        return;
    }
    
    const port = parseInt(document.getElementById('ws-port-input').value);
    
    if (port < 1024 || port > 65535) {
        alert('Port must be between 1024 and 65535');
        return;
    }
    
    // Save port preference
    localStorage.setItem('ws-relay-port', port.toString());
    
    // Save auto-start preference
    const autoStart = document.getElementById('ws-auto-start').checked;
    localStorage.setItem('ws-relay-autostart', autoStart.toString());
    
    // Start relay with custom port
    startLocalRelay(port);
    
    // Update UI
    setTimeout(() => updateWebSocketSettingsUI(), 500);
}

function stopRelayFromSettings() {
    stopLocalRelay();
    
    // Update UI
    setTimeout(() => updateWebSocketSettingsUI(), 500);
}

// Initialize on load - wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM already loaded
    init();
}

// Audio settings event listeners
window.addEventListener('DOMContentLoaded', () => {
    // Hide premium button if system disabled
    if (!PREMIUM_ENABLED) {
        const premiumBtn = document.getElementById('premium-btn');
        if (premiumBtn) {
            premiumBtn.style.display = 'none';
        }
    }
    
    const volumeSlider = document.getElementById('audio-volume-slider');
    const volumePercent = document.getElementById('audio-volume-percent');
    const volumeDb = document.getElementById('audio-volume-db');
    
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            const percent = parseFloat(e.target.value);
            const db = percent === 0 ? -100 : (20 * Math.log10(percent / 100));
            
            volumePercent.textContent = Math.round(percent) + '%';
            volumeDb.value = db.toFixed(1);
        });
    }
    
    if (volumeDb) {
        volumeDb.addEventListener('input', (e) => {
            const db = parseFloat(e.target.value);
            const percent = db <= -100 ? 0 : Math.pow(10, db / 20) * 100;
            
            volumeSlider.value = percent;
            volumePercent.textContent = Math.round(percent) + '%';
        });
    }
    
    const syncOffsetEnabled = document.getElementById('audio-sync-offset-enabled');
    const syncOffset = document.getElementById('audio-sync-offset');
    
    if (syncOffsetEnabled && syncOffset) {
        syncOffsetEnabled.addEventListener('change', (e) => {
            syncOffset.disabled = !e.target.checked;
        });
    }
});

// ============================================
// LICENSE MANAGEMENT FUNCTIONS
// ============================================

function updateLicenseUI() {
    if (!PREMIUM_ENABLED || !licenseManager) return;
    
    const licenseInfo = licenseManager.getLicenseInfo();
    const premiumBtn = document.getElementById('premium-btn');
    
    if (!premiumBtn) return;
    
    if (licenseManager.isPremium()) {
        // Usuario premium
        premiumBtn.textContent = `Premium: ${licenseInfo.twitchUsername}`;
        premiumBtn.style.background = '#22c55e';
        premiumBtn.title = `Plan: ${licenseInfo.plan}\nExpira: ${licenseInfo.expiresAt ? new Date(licenseInfo.expiresAt).toLocaleDateString() : 'Nunca'}`;
    } else {
        // Usuario free
        premiumBtn.textContent = 'Activar Premium';
        premiumBtn.style.background = '#9146FF';
        premiumBtn.title = 'Click para canjear tu licencia premium';
    }
}

function showLicenseModal() {
    if (!PREMIUM_ENABLED) {
        alert('Sistema premium en desarrollo. Próximamente disponible.');
        return;
    }
    
    const licenseInfo = licenseManager.getLicenseInfo();
    
    let modalContent;
    
    if (licenseManager.isPremium()) {
        // Ya tiene licencia premium - mostrar información
        const expiresText = licenseInfo.expiresAt 
            ? new Date(licenseInfo.expiresAt).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
            : 'Permanente';
            
        modalContent = `
            <div class="modal" id="license-modal">
                <div class="modal-content">
                    <h2>Premium License Active</h2>
                    <div style="background: #1a1a1d; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 10px 0;"><strong>Plan:</strong> ${licenseInfo.plan.toUpperCase()}</p>
                        <p style="margin: 10px 0;"><strong>Twitch Username:</strong> ${licenseInfo.twitchUsername}</p>
                        <p style="margin: 10px 0;"><strong>Expires:</strong> ${expiresText}</p>
                    </div>
                    <p style="color: #9ca3af; font-size: 13px; margin: 15px 0;">
                        Your license gives you access to:
                    </p>
                    <ul style="color: #b0b0b0; font-size: 13px; margin-left: 20px;">
                        <li>Automatic tunnels (no ngrok configuration needed)</li>
                        <li>Advanced analytics at rastry.com</li>
                        <li>Cloud recording (depending on plan)</li>
                        <li>Priority support</li>
                    </ul>
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button class="secondary-btn" style="flex: 1;" onclick="closeModal('license-modal')">Close</button>
                        <button class="primary-btn" style="flex: 1; background: #dc2626;" onclick="revokeLicense()">Revoke License</button>
                    </div>
                </div>
            </div>
        `;
    } else {
        // No license - show redemption screen
        modalContent = `
            <div class="modal" id="license-modal">
                <div class="modal-content">
                    <h2>Activate Premium License</h2>
                    <p style="color: #9ca3af; margin: 15px 0;">
                        To get premium access to RastryOBS:
                    </p>
                    <ol style="color: #b0b0b0; font-size: 13px; margin: 15px 0 15px 20px; line-height: 1.8;">
                        <li>Register at <a href="#" onclick="openExternal('https://rastry.com'); return false;" style="color: #9146FF;">rastry.com</a> with your Twitch account</li>
                        <li>Go to "OBS Control" in your dashboard</li>
                        <li>Open a ticket to request a license</li>
                        <li>Make payment via PayPal (include your Twitch username)</li>
                        <li>You will receive your premium token via Discord or ticket</li>
                        <li>Redeem your token below</li>
                    </ol>
                    
                    <div style="background: #1a1a1d; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <label style="display: block; margin-bottom: 10px; color: #e0e0e0; font-weight: 600;">
                            Premium Token:
                        </label>
                        <input 
                            type="text" 
                            id="premium-token-input"
                            placeholder="RASTRY-XXXX-XXXX-XXXX-XXXX"
                            style="width: 100%; padding: 12px; background: #26262c; border: 1px solid #3a3a3a; border-radius: 6px; color: #efeff1; font-family: monospace; font-size: 14px;"
                        />
                        <p id="token-error" style="color: #dc2626; font-size: 12px; margin-top: 8px; display: none;"></p>
                        <p id="token-success" style="color: #22c55e; font-size: 12px; margin-top: 8px; display: none;"></p>
                    </div>
                    
                    <div style="display: flex; gap: 10px;">
                        <button class="secondary-btn" style="flex: 1;" onclick="closeModal('license-modal')">Cancel</button>
                        <button class="primary-btn" style="flex: 1;" onclick="redeemToken()" id="redeem-btn">Redeem Token</button>
                    </div>
                    
                    <p style="color: #6b6b6b; font-size: 11px; margin-top: 20px; text-align: center;">
                        Having issues? Contact us on Discord or open a ticket at rastry.com
                    </p>
                </div>
            </div>
        `;
    }
    
    // Remover modal anterior si existe
    const existingModal = document.getElementById('license-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Añadir nuevo modal
    document.body.insertAdjacentHTML('beforeend', modalContent);
    
    // Focus en input si está en modo canje
    if (!licenseManager.isPremium()) {
        setTimeout(() => {
            document.getElementById('premium-token-input')?.focus();
        }, 100);
    }
}

async function redeemToken() {
    const input = document.getElementById('premium-token-input');
    const errorEl = document.getElementById('token-error');
    const successEl = document.getElementById('token-success');
    const redeemBtn = document.getElementById('redeem-btn');
    
    if (!input || !errorEl || !successEl || !redeemBtn) return;
    
    const token = input.value.trim();
    
    // Validar formato básico
    if (!token) {
        errorEl.textContent = 'Por favor ingresa tu token premium';
        errorEl.style.display = 'block';
        successEl.style.display = 'none';
        return;
    }
    
    if (token.length < 10) {
        errorEl.textContent = 'El token parece ser inválido (muy corto)';
        errorEl.style.display = 'block';
        successEl.style.display = 'none';
        return;
    }
    
    // Deshabilitar botón durante canje
    redeemBtn.disabled = true;
    redeemBtn.textContent = 'Verifying...';
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    
    try {
        const result = await licenseManager.redeemToken(token);
        
        if (result.success) {
            // Success
            successEl.textContent = `License activated! Plan: ${result.license.plan}`;
            successEl.style.display = 'block';
            errorEl.style.display = 'none';
            
            // Update UI
            updateLicenseUI();
            
            // Close modal after 2 seconds
            setTimeout(() => {
                closeModal('license-modal');
            }, 2000);
            
        } else {
            // Error
            errorEl.textContent = result.error || 'Invalid or expired token';
            errorEl.style.display = 'block';
            successEl.style.display = 'none';
            redeemBtn.disabled = false;
            redeemBtn.textContent = 'Redeem Token';
        }
    } catch (error) {
        errorEl.textContent = 'Error connecting to server. Please try again.';
        errorEl.style.display = 'block';
        successEl.style.display = 'none';
        redeemBtn.disabled = false;
        redeemBtn.textContent = 'Redeem Token';
    }
}

function revokeLicense() {
    if (confirm('¿Estás seguro de que quieres desvincular tu licencia premium?\n\nDeberás canjear un nuevo token para volver a activarla.')) {
        licenseManager.clearLicense();
        updateLicenseUI();
        closeModal('license-modal');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
    }
}

function openExternal(url) {
    shell.openExternal(url);
}

// ========================================
// HOTKEYS MODAL FUNCTIONS
// ========================================

function openHotkeysModal() {
    const modal = document.getElementById('hotkeys-modal');
    if (!modal) return;
    
    // Populate hotkeys list
    const hotkeys = hotkeysManager.getAllHotkeys();
    const hotkeysList = document.getElementById('hotkeys-list');
    hotkeysList.innerHTML = '';
    
    // Group hotkeys by category
    const categories = {
        'Streaming Controls': [],
        'Scene Switching': [],
        'Source Controls': [],
        'Audio Controls': [],
        'Quick Actions': []
    };
    
    Object.entries(hotkeys).forEach(([key, hotkey]) => {
        if (hotkey.action === 'toggleStreaming' || hotkey.action === 'toggleRecording' || hotkey.action === 'toggleStudioMode') {
            categories['Streaming Controls'].push({ key, ...hotkey });
        } else if (hotkey.action === 'switchScene') {
            categories['Scene Switching'].push({ key, ...hotkey });
        } else if (hotkey.action === 'toggleSource') {
            categories['Source Controls'].push({ key, ...hotkey });
        } else if (hotkey.action === 'muteDesktopAudio' || hotkey.action === 'muteMicAudio') {
            categories['Audio Controls'].push({ key, ...hotkey });
        } else {
            categories['Quick Actions'].push({ key, ...hotkey });
        }
    });
    
    // Render categories
    Object.entries(categories).forEach(([category, items]) => {
        if (items.length === 0) return;
        
        const categoryDiv = document.createElement('div');
        categoryDiv.style.marginBottom = '20px';
        
        const categoryTitle = document.createElement('h3');
        categoryTitle.textContent = category;
        categoryTitle.style.cssText = 'color: #efeff1; font-size: 14px; margin-bottom: 10px; font-weight: 600;';
        categoryDiv.appendChild(categoryTitle);
        
        items.forEach(item => {
            const hotkeyRow = document.createElement('div');
            hotkeyRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #1a1a1d; border-radius: 6px; margin-bottom: 6px;';
            
            const description = document.createElement('span');
            description.textContent = item.description;
            description.style.cssText = 'color: #efeff1; font-size: 13px;';
            
            const keyCombo = document.createElement('kbd');
            keyCombo.textContent = item.key.toUpperCase();
            keyCombo.style.cssText = 'background: #26262c; padding: 4px 12px; border-radius: 4px; font-family: "Courier New", monospace; font-size: 12px; color: #9146FF; border: 1px solid #3a3a3a;';
            
            hotkeyRow.appendChild(description);
            hotkeyRow.appendChild(keyCombo);
            categoryDiv.appendChild(hotkeyRow);
        });
        
        hotkeysList.appendChild(categoryDiv);
    });
    
    modal.style.display = 'flex';
}

function closeHotkeysModal() {
    const modal = document.getElementById('hotkeys-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function resetHotkeysToDefaults() {
    if (confirm('Reset all keyboard shortcuts to default settings?')) {
        hotkeysManager.resetToDefaults();
        openHotkeysModal(); // Refresh the list
    }
}
