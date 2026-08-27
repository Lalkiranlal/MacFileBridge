/**
 * Main Application Orchestrator for MacFileBridge
 * Optimistic instant rendering from cache, live status updates, and multi-theme switcher.
 */

const App = {
  currentTheme: 'ocean',
  pollInterval: null,

  init() {
    this.initTheme();
    this.bindGlobalEvents();
    this.bindModalCloseButtons();
    this.renderOptimisticDeviceState();

    PreviewsManager.init();
    TransferManager.init();
    AirBridge.init();
    Explorer.init();

    this.checkSystemStatus();
    this.startDevicePolling();
  },

  renderOptimisticDeviceState() {
    try {
      const cached = JSON.parse(localStorage.getItem('mfb_last_status') || '{}');
      if (cached.phoneName) {
        const phoneName = document.getElementById('android-device-name');
        const phoneLed = document.getElementById('android-led');
        if (phoneName) phoneName.textContent = cached.phoneName;
        if (phoneLed) phoneLed.className = 'status-indicator live';
      }
    } catch (e) {}
  },

  bindGlobalEvents() {
    // Theme Selector
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
      themeSelector.value = this.currentTheme;
      themeSelector.addEventListener('change', (e) => {
        this.setTheme(e.target.value);
      });
    }

    // Refresh All
    document.getElementById('btn-refresh-all').addEventListener('click', () => {
      this.checkSystemStatus();
      Explorer.refreshMac();
      Explorer.refreshTarget();
      this.showToast('Refreshed all devices and storage', 'info');
    });

    // Android Screenshot
    document.getElementById('btn-phone-screenshot').addEventListener('click', async () => {
      this.showToast('Capturing Android screen...', 'info');
      try {
        const timestamp = Date.now();
        const res = await fetch(`/api/adb/screenshot?t=${timestamp}`);
        if (res.ok) {
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          PreviewsManager.showScreenshot(objUrl);
        } else {
          this.showToast('Failed to capture screenshot. Is device unlocked?', 'error');
        }
      } catch (e) {
        this.showToast(e.message, 'error');
      }
    });

    // Troubleshoot Guide Button
    document.getElementById('btn-adb-troubleshoot').addEventListener('click', () => {
      document.getElementById('modal-adb-guide').classList.add('active');
    });

    // Restart ADB
    document.getElementById('btn-restart-adb').addEventListener('click', async () => {
      this.showToast('Restarting ADB server...', 'info');
      try {
        const res = await fetch('/api/adb/restart', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          this.showToast('ADB Server restarted successfully', 'success');
          this.checkSystemStatus();
          Explorer.refreshTarget();
        }
      } catch (e) {
        this.showToast('Failed to restart ADB', 'error');
      }
    });
  },

  bindModalCloseButtons() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.close;
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
      });
    });

    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
  },

  initTheme() {
    const saved = localStorage.getItem('mfb_theme') || 'ocean';
    this.setTheme(saved);
  },

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('mfb_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.body.className = theme === 'light' ? 'light-theme' : 'dark-theme';

    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) themeSelector.value = theme;
  },

  async checkSystemStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (!data.success) return;

      const phonePill = document.getElementById('android-status-pill');
      const phoneName = document.getElementById('android-device-name');
      const phoneLed = document.getElementById('android-led');

      if (data.adb && data.adb.devices && data.adb.devices.length > 0) {
        const active = data.adb.devices[0];
        const name = active.model || active.deviceName || 'Android Phone';
        phoneName.textContent = name;
        phoneLed.className = 'status-indicator live';
        phonePill.title = `Connected: ${active.serial} (${active.state})`;
        try {
          localStorage.setItem('mfb_last_status', JSON.stringify({ phoneName: name, serial: active.serial }));
        } catch (e) {}
      } else {
        phoneName.textContent = 'No Phone Detected';
        phoneLed.className = 'status-indicator offline';
        phonePill.title = 'Connect Android via USB with USB Debugging enabled';
      }

      const usbPill = document.getElementById('usb-status-pill');
      const usbName = document.getElementById('usb-volume-name');
      const usbLed = document.getElementById('usb-led');

      const externalDrives = data.volumes ? data.volumes.filter(v => v.isUSB) : [];
      if (externalDrives.length > 0) {
        usbName.textContent = externalDrives[0].name;
        usbLed.className = 'status-indicator live';
        usbPill.title = `Mounted USB Drive: ${externalDrives[0].path}`;
      } else {
        usbName.textContent = 'No USB Flash Drive';
        usbLed.className = 'status-indicator offline';
        usbPill.title = 'No external USB storage mounted under /Volumes';
      }

    } catch (err) {
      console.error('Status check error:', err);
    }
  },

  startDevicePolling() {
    this.pollInterval = setInterval(() => {
      this.checkSystemStatus();
    }, 3000);
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    if (type === 'error') iconName = 'alert-circle';

    toast.innerHTML = `
      <i data-lucide="${iconName}"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
  lucide.createIcons();
});
