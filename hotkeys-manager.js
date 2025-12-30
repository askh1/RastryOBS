/**
 * Hotkeys Manager for RastryOBS
 * Manages keyboard shortcuts for quick actions
 */

class HotkeysManager {
    constructor() {
        this.hotkeys = this.loadHotkeys();
        this.isEnabled = true;
        this.registeredHandlers = new Map();
        this.setupGlobalListener();
    }

    // Default hotkeys configuration
    getDefaultHotkeys() {
        return {
            // Streaming controls
            'f9': { action: 'toggleStreaming', description: 'Start/Stop Streaming' },
            'f10': { action: 'toggleRecording', description: 'Start/Stop Recording' },
            'f11': { action: 'toggleStudioMode', description: 'Toggle Studio Mode' },
            
            // Scene switching (1-9)
            '1': { action: 'switchScene', sceneIndex: 0, description: 'Switch to Scene 1' },
            '2': { action: 'switchScene', sceneIndex: 1, description: 'Switch to Scene 2' },
            '3': { action: 'switchScene', sceneIndex: 2, description: 'Switch to Scene 3' },
            '4': { action: 'switchScene', sceneIndex: 3, description: 'Switch to Scene 4' },
            '5': { action: 'switchScene', sceneIndex: 4, description: 'Switch to Scene 5' },
            '6': { action: 'switchScene', sceneIndex: 5, description: 'Switch to Scene 6' },
            '7': { action: 'switchScene', sceneIndex: 6, description: 'Switch to Scene 7' },
            '8': { action: 'switchScene', sceneIndex: 7, description: 'Switch to Scene 8' },
            '9': { action: 'switchScene', sceneIndex: 8, description: 'Switch to Scene 9' },
            
            // Source controls (Ctrl + F1-F9)
            'ctrl+f1': { action: 'toggleSource', sourceIndex: 0, description: 'Toggle Source 1' },
            'ctrl+f2': { action: 'toggleSource', sourceIndex: 1, description: 'Toggle Source 2' },
            'ctrl+f3': { action: 'toggleSource', sourceIndex: 2, description: 'Toggle Source 3' },
            'ctrl+f4': { action: 'toggleSource', sourceIndex: 3, description: 'Toggle Source 4' },
            'ctrl+f5': { action: 'toggleSource', sourceIndex: 4, description: 'Toggle Source 5' },
            'ctrl+f6': { action: 'toggleSource', sourceIndex: 5, description: 'Toggle Source 6' },
            'ctrl+f7': { action: 'toggleSource', sourceIndex: 6, description: 'Toggle Source 7' },
            'ctrl+f8': { action: 'toggleSource', sourceIndex: 7, description: 'Toggle Source 8' },
            'ctrl+f9': { action: 'toggleSource', sourceIndex: 8, description: 'Toggle Source 9' },
            
            // Audio controls
            'm': { action: 'muteDesktopAudio', description: 'Mute Desktop Audio' },
            'n': { action: 'muteMicAudio', description: 'Mute Microphone' },
            
            // Preview controls
            'p': { action: 'togglePreview', description: 'Toggle Preview' },
            
            // Quick actions
            'ctrl+s': { action: 'takeScreenshot', description: 'Take Screenshot' },
        };
    }

    loadHotkeys() {
        try {
            const stored = localStorage.getItem('rastryobs_hotkeys');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (error) {
            console.error('[Hotkeys] Error loading hotkeys:', error);
        }
        return this.getDefaultHotkeys();
    }

    saveHotkeys() {
        try {
            localStorage.setItem('rastryobs_hotkeys', JSON.stringify(this.hotkeys));
        } catch (error) {
            console.error('[Hotkeys] Error saving hotkeys:', error);
        }
    }

    setupGlobalListener() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger hotkeys when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if (!this.isEnabled) return;

            const key = this.getKeyCombo(e);
            const hotkey = this.hotkeys[key];

            if (hotkey) {
                e.preventDefault();
                this.executeAction(hotkey);
            }
        });
    }

    getKeyCombo(event) {
        const parts = [];
        
        if (event.ctrlKey) parts.push('ctrl');
        if (event.altKey) parts.push('alt');
        if (event.shiftKey) parts.push('shift');
        
        const key = event.key.toLowerCase();
        parts.push(key);
        
        return parts.join('+');
    }

    executeAction(hotkey) {
        const handler = this.registeredHandlers.get(hotkey.action);
        
        if (handler) {
            try {
                handler(hotkey);
                this.showHotkeyNotification(hotkey);
            } catch (error) {
                console.error('[Hotkeys] Error executing action:', error);
            }
        } else {
            console.warn('[Hotkeys] No handler registered for action:', hotkey.action);
        }
    }

    registerHandler(action, callback) {
        this.registeredHandlers.set(action, callback);
    }

    showHotkeyNotification(hotkey) {
        // Create a small notification to show which hotkey was pressed
        const notification = document.createElement('div');
        notification.className = 'hotkey-notification';
        notification.textContent = hotkey.description || 'Action executed';
        
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        });
        
        // Remove after 2 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    enable() {
        this.isEnabled = true;
    }

    disable() {
        this.isEnabled = false;
    }

    updateHotkey(key, hotkey) {
        this.hotkeys[key] = hotkey;
        this.saveHotkeys();
    }

    removeHotkey(key) {
        delete this.hotkeys[key];
        this.saveHotkeys();
    }

    resetToDefaults() {
        this.hotkeys = this.getDefaultHotkeys();
        this.saveHotkeys();
    }

    getAllHotkeys() {
        return { ...this.hotkeys };
    }
}

module.exports = HotkeysManager;
