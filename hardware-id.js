// hardware-id.js
// Genera un ID único del hardware para device binding

const { machineIdSync } = require('node-machine-id');
const os = require('os');
const crypto = require('crypto');

/**
 * Genera un hardware ID único para este dispositivo
 * Combina: machine ID + CPU info + hostname
 * @returns {string} Hardware ID único y consistente
 */
function getHardwareId() {
    try {
        // Método 1: node-machine-id (más confiable)
        const machineId = machineIdSync({ original: true });
        
        // Método 2: Información del sistema como backup
        const cpuModel = os.cpus()[0].model;
        const hostname = os.hostname();
        const platform = os.platform();
        
        // Combinar todo en un hash único
        const combined = `${machineId}-${cpuModel}-${hostname}-${platform}`;
        
        // Generar hash SHA-256
        const hash = crypto
            .createHash('sha256')
            .update(combined)
            .digest('hex');
        
        return hash;
        
    } catch (error) {
        console.error('Error generating hardware ID:', error);
        
        // Fallback: usar solo información del sistema
        const cpuModel = os.cpus()[0].model;
        const hostname = os.hostname();
        const platform = os.platform();
        const arch = os.arch();
        
        const fallback = `${cpuModel}-${hostname}-${platform}-${arch}`;
        
        return crypto
            .createHash('sha256')
            .update(fallback)
            .digest('hex');
    }
}

/**
 * Genera un nombre legible para el dispositivo
 * @returns {string} Nombre del dispositivo
 */
function getDeviceName() {
    try {
        const hostname = os.hostname();
        const platform = os.platform();
        const username = os.userInfo().username;
        
        return `${username}@${hostname} (${platform})`;
    } catch (error) {
        return 'Unknown Device';
    }
}

module.exports = {
    getHardwareId,
    getDeviceName
};
