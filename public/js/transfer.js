/**
 * Transfer Manager for MacFileBridge
 * Auto-expands progress drawer on start, renders byte counters, speed, ETA, and cancellation.
 */

const TransferManager = {
  ws: null,
  activeTransfers: new Map(),
  drawer: null,
  drawerToggle: null,
  drawerSummary: null,
  queueList: null,
  pulseDot: null,
  speedBadge: null,

  init() {
    this.drawer = document.getElementById('transfer-drawer');
    this.drawerToggle = document.getElementById('transfer-drawer-toggle');
    this.drawerSummary = document.getElementById('transfer-drawer-summary');
    this.queueList = document.getElementById('transfer-queue-list');
    this.pulseDot = document.getElementById('transfer-pulse');
    this.speedBadge = document.getElementById('global-speed-badge');

    if (this.drawerToggle) {
      this.drawerToggle.addEventListener('click', () => {
        this.drawer.classList.toggle('collapsed');
      });
    }

    this.connectWebSocket();
    this.initUploadPicker();
  },

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleWSEvent(payload.event, payload.data);
        } catch (e) {}
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connectWebSocket(), 3000);
      };
    } catch (e) {
      console.error('WS Error:', e);
    }
  },

  handleWSEvent(event, data) {
    if (event === 'transfer_started') {
      this.activeTransfers.set(data.id, data);
      this.renderTransferCard(data);
      this.updateDrawerStatus();
      
      // Auto-expand drawer so user clearly sees the progress bar!
      if (this.drawer) {
        this.drawer.classList.remove('collapsed');
      }

      App.showToast(`Transfer started: ${data.name}`, 'info');
    } else if (event === 'transfer_progress') {
      this.activeTransfers.set(data.id, data);
      this.updateTransferCard(data);
      this.updateDrawerStatus();
    } else if (event === 'transfer_completed') {
      this.activeTransfers.delete(data.id);
      this.markTransferCompleted(data);
      this.updateDrawerStatus();
      App.showToast(`Transfer completed: ${data.name} ✓`, 'success');
      Explorer.refreshMac();
      Explorer.refreshTarget();
    } else if (event === 'transfer_failed') {
      this.activeTransfers.delete(data.id);
      this.markTransferFailed(data);
      this.updateDrawerStatus();
      App.showToast(`Transfer failed: ${data.name}`, 'error');
    } else if (event === 'transfer_cancelled') {
      this.activeTransfers.delete(data.id);
      this.markTransferCancelled(data);
      this.updateDrawerStatus();
      App.showToast(`Transfer cancelled: ${data.name}`, 'info');
      Explorer.refreshMac();
      Explorer.refreshTarget();
    } else if (event === 'files_received_on_mac') {
      App.showToast(`Received ${data.count} file(s) on Mac!`, 'success');
      Explorer.refreshMac();
    }
  },

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  renderTransferCard(tx) {
    const emptyMsg = this.queueList.querySelector('.empty-queue-msg');
    if (emptyMsg) emptyMsg.remove();

    let card = document.getElementById(`tx-card-${tx.id}`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'transfer-card';
      card.id = `tx-card-${tx.id}`;
      this.queueList.prepend(card);
    }

    const directionIcon = tx.type === 'mac_to_android' ? 'arrow-right-circle' : 'arrow-left-circle';
    const directionLabel = tx.type === 'mac_to_android' ? 'Mac → Phone' : 'Phone → Mac';

    const transferredFormatted = this.formatBytes(tx.transferredBytes || 0);
    const totalFormatted = tx.totalBytes ? this.formatBytes(tx.totalBytes) : 'Calculating...';

    card.innerHTML = `
      <div class="tx-header">
        <span class="tx-name" title="${tx.name}">
          <i data-lucide="${directionIcon}"></i> ${tx.name}
          <span style="font-size:11px; color:var(--color-text-muted); font-weight:600; margin-left:6px;">(${directionLabel})</span>
        </span>
        <div class="tx-header-actions">
          <span class="tx-status transferring">Copying...</span>
          <button class="tx-cancel-btn" data-txid="${tx.id}" title="Cancel Transfer">
            <i data-lucide="x"></i> Cancel
          </button>
        </div>
      </div>
      <div class="tx-progress-bar-bg">
        <div class="tx-progress-bar-fill" style="width: ${tx.progress || 0}%"></div>
      </div>
      <div class="tx-footer">
        <span class="tx-bytes-info">${transferredFormatted} of ${totalFormatted} • ${tx.speedText || 'Measuring speed...'}</span>
        <span class="tx-progress-pct" style="font-weight:700; color:var(--color-primary); font-size:12px;">${tx.progress || 0}%</span>
      </div>
    `;

    const cancelBtn = card.querySelector('.tx-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelTransfer(tx.id);
      });
    }

    lucide.createIcons();
  },

  updateTransferCard(tx) {
    const card = document.getElementById(`tx-card-${tx.id}`);
    if (!card) {
      this.renderTransferCard(tx);
      return;
    }

    const fill = card.querySelector('.tx-progress-bar-fill');
    const pct = card.querySelector('.tx-progress-pct');
    const bytesInfo = card.querySelector('.tx-bytes-info');

    if (fill) fill.style.width = `${tx.progress}%`;
    if (pct) pct.textContent = `${tx.progress}%`;
    
    if (bytesInfo) {
      const transferredFormatted = this.formatBytes(tx.transferredBytes || 0);
      const totalFormatted = tx.totalBytes ? this.formatBytes(tx.totalBytes) : 'Calculating...';
      const etaText = tx.eta ? ` • ${tx.eta}s remaining` : '';
      bytesInfo.textContent = `${transferredFormatted} of ${totalFormatted} • ${tx.speedText || ''}${etaText}`;
    }
  },

  async cancelTransfer(id) {
    try {
      const res = await fetch('/api/transfer/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        App.showToast('Transfer stopped & cleaned up', 'info');
      }
    } catch (e) {
      console.error('Cancel error:', e);
    }
  },

  markTransferCompleted(tx) {
    const card = document.getElementById(`tx-card-${tx.id}`);
    if (!card) return;

    const status = card.querySelector('.tx-status');
    const fill = card.querySelector('.tx-progress-bar-fill');
    const pct = card.querySelector('.tx-progress-pct');
    const bytesInfo = card.querySelector('.tx-bytes-info');
    const cancelBtn = card.querySelector('.tx-cancel-btn');

    if (cancelBtn) cancelBtn.remove();

    if (status) {
      status.className = 'tx-status completed';
      status.textContent = 'Finished ✓';
    }
    if (fill) {
      fill.style.width = '100%';
      fill.style.background = '#15803D';
    }
    if (pct) pct.textContent = '100%';
    if (bytesInfo) {
      const totalFormatted = tx.totalBytes ? this.formatBytes(tx.totalBytes) : 'Done';
      bytesInfo.textContent = `Completed (${totalFormatted}) • Transfer successful`;
    }
  },

  markTransferFailed(tx) {
    const card = document.getElementById(`tx-card-${tx.id}`);
    if (!card) return;

    const status = card.querySelector('.tx-status');
    const bytesInfo = card.querySelector('.tx-bytes-info');
    const cancelBtn = card.querySelector('.tx-cancel-btn');

    if (cancelBtn) cancelBtn.remove();

    if (status) {
      status.className = 'tx-status failed';
      status.textContent = 'Failed ✕';
    }
    if (bytesInfo && tx.error) {
      bytesInfo.textContent = tx.error.slice(0, 50);
    }
  },

  markTransferCancelled(tx) {
    const card = document.getElementById(`tx-card-${tx.id}`);
    if (!card) return;

    const status = card.querySelector('.tx-status');
    const fill = card.querySelector('.tx-progress-bar-fill');
    const bytesInfo = card.querySelector('.tx-bytes-info');
    const cancelBtn = card.querySelector('.tx-cancel-btn');

    if (cancelBtn) cancelBtn.remove();

    if (status) {
      status.className = 'tx-status failed';
      status.textContent = 'Cancelled ✕';
    }
    if (fill) {
      fill.style.background = '#DC2626';
    }
    if (bytesInfo) bytesInfo.textContent = 'Cancelled by user';
  },

  updateDrawerStatus() {
    const activeCount = this.activeTransfers.size;
    if (activeCount > 0) {
      this.pulseDot.className = 'pulse-indicator active';
      this.drawerSummary.textContent = `Active Transfers (${activeCount} in progress)`;

      let activeTx = null;
      for (const tx of this.activeTransfers.values()) {
        if (tx.speedText && tx.speedText !== '0 MB/s') {
          activeTx = tx;
          break;
        }
      }

      this.speedBadge.style.display = 'inline-block';
      this.speedBadge.textContent = activeTx ? activeTx.speedText : 'USB High-Speed';

      if (this.drawer && this.drawer.classList.contains('collapsed')) {
        this.drawer.classList.remove('collapsed');
      }
    } else {
      this.pulseDot.className = 'pulse-indicator';
      this.drawerSummary.textContent = 'Transfers: Idle';
      this.speedBadge.style.display = 'none';
    }
  },

  async sendMacFilesToDevice(macFiles, targetDir) {
    if (!macFiles || macFiles.length === 0) return;

    App.showToast(`Starting transfer of ${macFiles.length} file(s) to Device...`, 'info');

    // Auto-open drawer
    if (this.drawer) this.drawer.classList.remove('collapsed');

    for (const file of macFiles) {
      try {
        const res = await fetch('/api/transfer/mac-to-android', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePath: file.path,
            targetDir: targetDir || '/storage/emulated/0/Download'
          })
        });
        const data = await res.json();
        if (data.success && data.transfer) {
          this.handleWSEvent('transfer_started', data.transfer);
        }
      } catch (err) {
        console.error('Transfer error:', err);
      }
    }
  },

  async sendDeviceFilesToMac(deviceFiles, macTargetDir) {
    if (!deviceFiles || deviceFiles.length === 0) return;

    App.showToast(`Pulling ${deviceFiles.length} file(s) to Mac...`, 'info');

    // Auto-open drawer
    if (this.drawer) this.drawer.classList.remove('collapsed');

    for (const file of deviceFiles) {
      try {
        const res = await fetch('/api/transfer/android-to-mac', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourcePath: file.path,
            targetDir: macTargetDir || Explorer.macCurrentPath
          })
        });
        const data = await res.json();
        if (data.success && data.transfer) {
          this.handleWSEvent('transfer_started', data.transfer);
        }
      } catch (err) {
        console.error('Transfer pull error:', err);
      }
    }
  },

  initUploadPicker() {
    const uploadBtn = document.getElementById('target-btn-upload-picker');
    const fileInput = document.getElementById('target-hidden-file-input');

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.uploadBrowserFilesToDevice(Array.from(e.target.files), Explorer.targetCurrentPath);
          fileInput.value = '';
        }
      });
    }
  },

  async uploadBrowserFilesToDevice(files, targetDir) {
    App.showToast(`Uploading ${files.length} file(s) to Android over USB...`, 'info');
    if (this.drawer) this.drawer.classList.remove('collapsed');

    const formData = new FormData();
    formData.append('targetDir', targetDir || '/storage/emulated/0/Download');
    for (const f of files) {
      formData.append('files', f);
    }

    try {
      const res = await fetch('/api/transfer/upload-to-android', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        App.showToast(`Pushing ${files.length} file(s) to Android...`, 'info');
      } else {
        App.showToast(`Upload failed: ${data.error}`, 'error');
      }
    } catch (err) {
      App.showToast(`Upload failed: ${err.message}`, 'error');
    }
  }
};
