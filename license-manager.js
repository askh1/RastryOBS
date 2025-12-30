// Sistema de gestión de licencias/tokens premium
const { getHardwareId, getDeviceName } = require('./hardware-id');

class LicenseManager {
    constructor() {
        this.apiUrl = 'https://rastry.com/api';
        this.license = this.loadLicense();
        this.hardwareId = getHardwareId();
        this.deviceName = getDeviceName();
    }

    // Cargar licencia desde localStorage
    loadLicense() {
        const stored = localStorage.getItem('rastry_license');
        if (!stored) return null;

        try {
            const license = JSON.parse(stored);
            
            // Verificar si no ha expirado
            if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
                console.log('License expired');
                this.clearLicense();
                return null;
            }

            return license;
        } catch (error) {
            console.error('Error loading license:', error);
            return null;
        }
    }

    // Guardar licencia
    saveLicense(license) {
        localStorage.setItem('rastry_license', JSON.stringify(license));
        this.license = license;
    }

    // Limpiar licencia
    clearLicense() {
        localStorage.removeItem('rastry_license');
        this.license = null;
    }

    // Verificar si tiene licencia premium activa
    isPremium() {
        return this.license !== null && this.license.plan !== 'free';
    }

    // Obtener información de la licencia
    getLicenseInfo() {
        if (!this.license) {
            return {
                plan: 'free',
                twitchUsername: null,
                expiresAt: null,
                features: []
            };
        }

        return {
            plan: this.license.plan,
            twitchUsername: this.license.twitchUsername,
            expiresAt: this.license.expiresAt,
            features: this.license.features || []
        };
    }

    // Canjear token premium
    async redeemToken(token) {
        try {
            const response = await fetch(`${this.apiUrl}/obs/redeem-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    token,
                    hardwareId: this.hardwareId,
                    deviceName: this.deviceName
                })
            });

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || 'Invalid token'
                };
            }

            // Guardar licencia
            this.saveLicense({
                plan: data.plan,
                twitchUsername: data.twitchUsername,
                token: token,
                redeemedAt: new Date().toISOString(),
                expiresAt: data.expiresAt,
                features: data.features || []
            });

            return {
                success: true,
                license: this.license
            };

        } catch (error) {
            console.error('Error redeeming token:', error);
            return {
                success: false,
                error: 'Failed to connect to Rastry servers'
            };
        }
    }

    // Verificar token con el servidor (validación periódica)
    async verifyToken() {
        if (!this.license || !this.license.token) {
            return { valid: false };
        }

        try {
            const response = await fetch(`${this.apiUrl}/obs/verify-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    token: this.license.token,
                    hardwareId: this.hardwareId
                })
            });

            const data = await response.json();

            if (!response.ok || !data.valid) {
                // Token inválido o revocado
                this.clearLicense();
                return { valid: false, reason: data.reason };
            }

            // Actualizar información si cambió
            if (data.expiresAt !== this.license.expiresAt) {
                this.license.expiresAt = data.expiresAt;
                this.saveLicense(this.license);
            }

            return { valid: true };

        } catch (error) {
            console.error('Error verifying token:', error);
            // En caso de error de red, asumir válido temporalmente
            return { valid: true, offline: true };
        }
    }

    // Obtener límites según plan
    getLimits() {
        const plan = this.license?.plan || 'free';

        const limits = {
            free: {
                tunnels: 0,           // Sin túneles automáticos
                cloudRecording: false,
                analytics: false,
                multiMods: false
            },
            basic: {
                tunnels: 1,           // 1 túnel simultáneo
                cloudRecording: false,
                analytics: true,
                multiMods: false
            },
            pro: {
                tunnels: 5,           // 5 túneles simultáneos
                cloudRecording: true,
                analytics: true,
                multiMods: true
            },
            team: {
                tunnels: 999,         // Ilimitado
                cloudRecording: true,
                analytics: true,
                multiMods: true
            }
        };

        return limits[plan] || limits.free;
    }

    // Verificar si puede usar una característica
    canUseFeature(feature) {
        const limits = this.getLimits();
        
        switch (feature) {
            case 'tunnel':
                return limits.tunnels > 0;
            case 'cloudRecording':
                return limits.cloudRecording;
            case 'analytics':
                return limits.analytics;
            case 'multiMods':
                return limits.multiMods;
            default:
                return false;
        }
    }

    // Mensaje para upgrade
    getUpgradeMessage(feature) {
        const messages = {
            tunnel: 'Los túneles automáticos requieren una licencia Premium. Visita rastry.com/dashboard para solicitar tu licencia.',
            cloudRecording: 'La grabación en la nube requiere plan Pro o superior.',
            analytics: 'Las analíticas avanzadas requieren una licencia Premium.',
            multiMods: 'Múltiples mods simultáneos requieren plan Pro o superior.'
        };

        return messages[feature] || 'Esta característica requiere una licencia Premium.';
    }
}

// Exportar instancia única
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LicenseManager;
}
