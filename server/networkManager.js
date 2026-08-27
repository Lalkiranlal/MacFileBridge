const os = require('os');
const QRCode = require('qrcode');

class NetworkManager {
  getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Only IPv4 and non-internal
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({
            name,
            address: iface.address,
            isWiFi: name.toLowerCase().includes('en0') || name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wlan')
          });
        }
      }
    }

    // Sort to prioritize Wi-Fi / en0
    addresses.sort((a, b) => (b.isWiFi ? 1 : 0) - (a.isWiFi ? 1 : 0));
    return addresses;
  }

  getPrimaryIP() {
    const ips = this.getLocalIPs();
    return ips.length > 0 ? ips[0].address : 'localhost';
  }

  async generateQRCode(url) {
    try {
      return await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('QR code generation error:', err);
      return null;
    }
  }
}

module.exports = new NetworkManager();
