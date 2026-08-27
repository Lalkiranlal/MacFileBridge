/**
 * AirBridge Module for MacFileBridge
 * Wireless pairing, QR code generation, and local Wi-Fi drop.
 */

const AirBridge = {
  modal: null,
  qrImg: null,
  urlInput: null,
  portalUrl: '',

  init() {
    this.modal = document.getElementById('modal-airbridge');
    this.qrImg = document.getElementById('airbridge-qr-img');
    this.urlInput = document.getElementById('airbridge-url-input');

    const openBtn = document.getElementById('btn-open-airbridge');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openModal());
    }

    const copyBtn = document.getElementById('btn-copy-airbridge-url');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (this.portalUrl) {
          navigator.clipboard.writeText(this.portalUrl);
          App.showToast('AirBridge link copied to clipboard!', 'success');
        }
      });
    }

    const browserBtn = document.getElementById('btn-open-airbridge-browser');
    if (browserBtn) {
      browserBtn.addEventListener('click', () => {
        if (this.portalUrl) {
          window.open(this.portalUrl, '_blank');
        }
      });
    }
  },

  async openModal() {
    this.modal.classList.add('active');
    try {
      const res = await fetch('/api/airbridge/info');
      const data = await res.json();
      if (data.success) {
        this.portalUrl = data.portalUrl;
        this.urlInput.value = data.portalUrl;
        if (data.qrCode) {
          this.qrImg.src = data.qrCode;
        }
      }
    } catch (err) {
      console.error('AirBridge info error:', err);
    }
  }
};
