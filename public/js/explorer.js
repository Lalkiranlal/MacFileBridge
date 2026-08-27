/**
 * File Explorer Logic for Mac & Android Panes
 * Supports direct local calls and hybrid hosted Vercel bridge calls.
 */

const Explorer = {
  macCurrentPath: '',
  targetCurrentPath: '/storage/emulated/0',
  macFiles: [],
  targetFiles: [],
  macSelected: new Set(),
  targetSelected: new Set(),
  macFilter: 'all',
  targetFilter: 'all',
  macSort: { col: 'name', asc: true },
  targetSort: { col: 'name', asc: true },

  init() {
    this.bindDOM();
    this.loadMacShortcuts();
    this.refreshMac();
    this.refreshTarget();
  },

  bindDOM() {
    // Search Inputs
    document.getElementById('mac-search-input').addEventListener('input', (e) => {
      this.renderFileList('mac', this.filterFiles(this.macFiles, e.target.value, this.macFilter));
    });

    document.getElementById('target-search-input').addEventListener('input', (e) => {
      this.renderFileList('target', this.filterFiles(this.targetFiles, e.target.value, this.targetFilter));
    });

    // Filter Tabs
    document.querySelectorAll('#mac-filter-tabs .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#mac-filter-tabs .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.macFilter = chip.dataset.filter;
        this.renderFileList('mac', this.filterFiles(this.macFiles, document.getElementById('mac-search-input').value, this.macFilter));
      });
    });

    document.querySelectorAll('#target-filter-tabs .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#target-filter-tabs .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.targetFilter = chip.dataset.filter;
        this.renderFileList('target', this.filterFiles(this.targetFiles, document.getElementById('target-search-input').value, this.targetFilter));
      });
    });

    // Target Selector
    const targetSelector = document.getElementById('target-device-selector');
    if (targetSelector) {
      targetSelector.addEventListener('change', (e) => {
        if (e.target.value === 'android') {
          this.targetCurrentPath = '/storage/emulated/0';
          this.refreshTarget();
        } else if (e.target.value === 'usb') {
          this.loadUSBVolumes();
        }
      });
    }

    // Transfer Buttons
    document.getElementById('mac-btn-send-to-device').addEventListener('click', () => {
      const selected = this.macFiles.filter(f => this.macSelected.has(f.path));
      if (selected.length === 0) return App.showToast('Please select Mac files to send', 'info');
      TransferManager.sendMacFilesToDevice(selected, this.targetCurrentPath);
    });

    document.getElementById('btn-transfer-mac-to-target').addEventListener('click', () => {
      const selected = this.macFiles.filter(f => this.macSelected.has(f.path));
      if (selected.length === 0) return App.showToast('Please select Mac files to send', 'info');
      TransferManager.sendMacFilesToDevice(selected, this.targetCurrentPath);
    });

    document.getElementById('target-btn-send-to-mac').addEventListener('click', () => {
      const selected = this.targetFiles.filter(f => this.targetSelected.has(f.path));
      if (selected.length === 0) return App.showToast('Please select Device files to pull', 'info');
      TransferManager.sendDeviceFilesToMac(selected, this.macCurrentPath);
    });

    document.getElementById('btn-transfer-target-to-mac').addEventListener('click', () => {
      const selected = this.targetFiles.filter(f => this.targetSelected.has(f.path));
      if (selected.length === 0) return App.showToast('Please select Device files to pull', 'info');
      TransferManager.sendDeviceFilesToMac(selected, this.macCurrentPath);
    });

    // New Folder Buttons
    document.getElementById('mac-btn-new-folder').addEventListener('click', () => {
      this.showPromptModal('Create New Folder on Mac', (name) => {
        this.createFolder('mac', name);
      });
    });

    document.getElementById('target-btn-new-folder').addEventListener('click', () => {
      this.showPromptModal('Create New Folder on Device', (name) => {
        this.createFolder('target', name);
      });
    });

    this.initDragAndDrop();
  },

  async safeFetchJSON(path, options = {}) {
    try {
      const fullUrl = App.apiUrl(path);
      const res = await fetch(fullUrl, options);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        return { 
          success: false, 
          isCloudMode: true, 
          error: 'Local Bridge is not running on localhost:54321.' 
        };
      }
    } catch (err) {
      return { 
        success: false, 
        isCloudMode: true, 
        error: 'Unable to reach local Mac daemon at localhost:54321.' 
      };
    }
  },

  async refreshMac(targetPath = '') {
    const listEl = document.getElementById('mac-file-list');
    listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--color-text-muted);">Loading Mac files...</div>';

    const p = targetPath ? `/api/mac/files?path=${encodeURIComponent(targetPath)}` : '/api/mac/files';
    const data = await this.safeFetchJSON(p);

    if (data.success) {
      this.macCurrentPath = data.path;
      this.macFiles = data.items || [];
      this.macSelected.clear();
      this.renderBreadcrumbs('mac', data.path);
      this.renderFileList('mac', this.macFiles);
      document.getElementById('mac-item-count').textContent = `${this.macFiles.length} items`;
      this.updateSelectedCount('mac');
    } else {
      const msg = data.isCloudMode 
        ? `<div style="padding:32px 20px; text-align:center;">
             <p style="font-weight:700; color:var(--color-primary); font-size:15px; margin-bottom:8px;">💻 Local Daemon Required</p>
             <p style="font-size:13px; color:var(--color-text-muted); line-height:1.5;">To browse your Mac files from this hosted page, start MacFileBridge on your Mac:</p>
             <div style="background:#EDF4E8; padding:8px 12px; border-radius:6px; font-family:monospace; font-size:12px; margin:10px auto; max-width:280px;">Double-click launch.command</div>
             <a href="http://localhost:54321" style="display:inline-block; margin-top:6px; padding:6px 14px; background:var(--color-primary); color:white; border-radius:6px; font-weight:700; text-decoration:none; font-size:12px;">Open Local App</a>
           </div>`
        : `<div style="padding:20px; text-align:center; color:var(--color-alert-red);">${data.error || 'Failed to load Mac files'}</div>`;
      listEl.innerHTML = msg;
    }
  },

  async refreshTarget(targetPath = '') {
    const listEl = document.getElementById('target-file-list');
    listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--color-text-muted);">Loading Device files...</div>';

    const p = targetPath || this.targetCurrentPath || '/storage/emulated/0';
    const url = `/api/adb/files?path=${encodeURIComponent(p)}`;
    const data = await this.safeFetchJSON(url);

    if (data.success) {
      this.targetCurrentPath = data.path;
      this.targetFiles = data.items || [];
      this.targetSelected.clear();
      this.renderBreadcrumbs('target', data.path);
      this.renderFileList('target', this.targetFiles);
      document.getElementById('target-item-count').textContent = `${this.targetFiles.length} items`;
      this.updateSelectedCount('target');
      this.fetchStorageInfo();
    } else {
      const msg = data.isCloudMode 
        ? `<div style="padding:32px 20px; text-align:center;">
             <p style="font-weight:700; color:var(--color-primary); font-size:15px; margin-bottom:8px;">📱 USB Hardware Conduit</p>
             <p style="font-size:13px; color:var(--color-text-muted); line-height:1.5;">Connects to Android ADB via your local Mac bridge:</p>
             <div style="background:#EDF4E8; padding:8px 12px; border-radius:6px; font-family:monospace; font-size:12px; margin:10px auto; max-width:280px;">http://localhost:54321</div>
             <a href="http://localhost:54321" style="display:inline-block; margin-top:6px; padding:6px 14px; background:var(--color-primary); color:white; border-radius:6px; font-weight:700; text-decoration:none; font-size:12px;">Open Local App</a>
           </div>`
        : `<div style="padding:20px; text-align:center; color:var(--color-alert-red);">${data.error || 'No device connected or authorized'}</div>`;
      listEl.innerHTML = msg;
    }
  },

  async fetchStorageInfo() {
    const data = await this.safeFetchJSON('/api/adb/storage');
    if (data.success && data.storage) {
      const s = data.storage;
      const meter = document.getElementById('target-storage-meter');
      const text = document.getElementById('target-storage-text');
      if (meter && text) {
        meter.style.width = s.percent || '50%';
        text.textContent = `${s.free} free of ${s.total}`;
      }
    }
  },

  async loadMacShortcuts() {
    const data = await this.safeFetchJSON('/api/mac/shortcuts');
    if (data.success && data.shortcuts) {
      const container = document.getElementById('mac-shortcuts');
      container.innerHTML = '';
      data.shortcuts.forEach((sc, idx) => {
        const chip = document.createElement('button');
        chip.className = `shortcut-chip ${idx === 0 ? 'active' : ''}`;
        chip.innerHTML = `<i data-lucide="${sc.icon}"></i> ${sc.name}`;
        chip.addEventListener('click', () => {
          document.querySelectorAll('#mac-shortcuts .shortcut-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.refreshMac(sc.path);
        });
        container.appendChild(chip);
      });
      lucide.createIcons();
    }
  },

  async loadUSBVolumes() {
    const data = await this.safeFetchJSON('/api/usb/volumes');
    if (data.success && data.volumes) {
      const listEl = document.getElementById('target-file-list');
      const ext = data.volumes.filter(v => v.isUSB);
      if (ext.length === 0) {
        listEl.innerHTML = '<div style="padding:20px; text-align:center; color:var(--color-text-muted);">No external USB storage found under /Volumes</div>';
        return;
      }
      this.refreshTarget(ext[0].path);
    }
  },

  renderBreadcrumbs(pane, fullPath) {
    const container = document.getElementById(`${pane}-breadcrumbs`);
    container.innerHTML = '';

    const parts = fullPath.split('/').filter(Boolean);
    let cumulative = '';

    const rootItem = document.createElement('span');
    rootItem.className = 'breadcrumb-item';
    rootItem.textContent = pane === 'mac' ? '~' : '/';
    rootItem.addEventListener('click', () => {
      pane === 'mac' ? this.refreshMac('/') : this.refreshTarget('/storage/emulated/0');
    });
    container.appendChild(rootItem);

    parts.forEach((p, idx) => {
      cumulative += '/' + p;
      const curPath = cumulative;
      const sep = document.createElement('span');
      sep.textContent = '/';
      sep.style.color = 'var(--color-text-muted)';
      container.appendChild(sep);

      const item = document.createElement('span');
      item.className = `breadcrumb-item ${idx === parts.length - 1 ? 'current' : ''}`;
      item.textContent = p;
      item.addEventListener('click', () => {
        pane === 'mac' ? this.refreshMac(curPath) : this.refreshTarget(curPath);
      });
      container.appendChild(item);
    });
  },

  renderFileList(pane, files) {
    const listEl = document.getElementById(`${pane}-file-list`);
    listEl.innerHTML = '';

    if (!files || files.length === 0) {
      listEl.innerHTML = '<div style="padding:30px; text-align:center; color:var(--color-text-muted);">Folder is empty</div>';
      return;
    }

    files.forEach(file => {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.draggable = true;
      row.dataset.path = file.path;
      row.dataset.isDir = file.isDirectory;
      row.dataset.pane = pane;

      const isChecked = pane === 'mac' ? this.macSelected.has(file.path) : this.targetSelected.has(file.path);
      if (isChecked) row.classList.add('selected');

      const transferIcon = pane === 'mac' ? 'arrow-right' : 'arrow-left';
      const transferTitle = pane === 'mac' ? 'Send to Phone' : 'Pull to Mac';

      row.innerHTML = `
        <div class="col-select">
          <input type="checkbox" ${isChecked ? 'checked' : ''} class="file-chk">
        </div>
        <div class="col-name" title="${file.name}">
          <i data-lucide="${this.getIconForType(file.type)}" class="file-icon ${file.type}"></i>
          <span class="file-name-text">${file.name}</span>
        </div>
        <div class="col-size">${file.formattedSize || '--'}</div>
        <div class="col-date">${file.date || '--'}</div>
        <div class="col-actions">
          <button class="row-action-btn transfer-btn" title="${transferTitle}">
            <i data-lucide="${transferIcon}"></i>
          </button>
          ${!file.isDirectory ? `
          <button class="row-action-btn preview-btn" title="Quick Preview">
            <i data-lucide="eye"></i>
          </button>` : ''}
          <button class="row-action-btn delete" title="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;

      // Click to open directory
      row.querySelector('.col-name').addEventListener('click', () => {
        if (file.isDirectory) {
          pane === 'mac' ? this.refreshMac(file.path) : this.refreshTarget(file.path);
        } else {
          PreviewsManager.previewFile(pane, file);
        }
      });

      // Checkbox
      const chk = row.querySelector('.file-chk');
      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleSelect(pane, file.path, chk.checked);
      });

      // Transfer Button
      row.querySelector('.transfer-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (pane === 'mac') {
          TransferManager.sendMacFilesToDevice([file], this.targetCurrentPath);
        } else {
          TransferManager.sendDeviceFilesToMac([file], this.macCurrentPath);
        }
      });

      // Preview Button
      const prevBtn = row.querySelector('.preview-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          PreviewsManager.previewFile(pane, file);
        });
      }

      // Delete Button
      row.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete "${file.name}"?`)) {
          this.deleteItem(pane, file.path);
        }
      });

      listEl.appendChild(row);
    });

    lucide.createIcons();
  },

  getIconForType(type) {
    switch(type) {
      case 'folder': return 'folder';
      case 'image': return 'image';
      case 'video': return 'film';
      case 'audio': return 'music';
      case 'document': return 'file-text';
      case 'apk': return 'smartphone';
      case 'archive': return 'archive';
      default: return 'file';
    }
  },

  toggleSelect(pane, filePath, checked) {
    const selectedSet = pane === 'mac' ? this.macSelected : this.targetSelected;
    if (checked) {
      selectedSet.add(filePath);
    } else {
      selectedSet.delete(filePath);
    }
    this.updateSelectedCount(pane);
  },

  updateSelectedCount(pane) {
    const selectedSet = pane === 'mac' ? this.macSelected : this.targetSelected;
    const el = document.getElementById(`${pane}-selected-count`);
    if (el) el.textContent = `${selectedSet.size} selected`;
  },

  filterFiles(files, query, category) {
    let result = files;
    if (category && category !== 'all') {
      result = result.filter(f => f.type === category || f.isDirectory);
    }
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }
    return result;
  },

  initDragAndDrop() {
    const macContainer = document.getElementById('mac-file-container');
    const targetContainer = document.getElementById('target-file-container');
    const macOverlay = document.getElementById('mac-drop-overlay');
    const targetOverlay = document.getElementById('target-drop-overlay');

    // Panes Drag Events
    [
      { container: macContainer, overlay: macOverlay, destPane: 'mac' },
      { container: targetContainer, overlay: targetOverlay, destPane: 'target' }
    ].forEach(({ container, overlay, destPane }) => {
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        overlay.classList.add('active');
      });

      container.addEventListener('dragleave', (e) => {
        if (!container.contains(e.relatedTarget)) {
          overlay.classList.remove('active');
        }
      });

      container.addEventListener('drop', (e) => {
        e.preventDefault();
        overlay.classList.remove('active');

        // Check if internal row drag
        const draggedData = e.dataTransfer.getData('text/plain');
        if (draggedData) {
          try {
            const data = JSON.parse(draggedData);
            if (data.sourcePane !== destPane) {
              if (destPane === 'target') {
                TransferManager.sendMacFilesToDevice([{ path: data.filePath, name: data.fileName }], this.targetCurrentPath);
              } else {
                TransferManager.sendDeviceFilesToMac([{ path: data.filePath, name: data.fileName }], this.macCurrentPath);
              }
              return;
            }
          } catch (err) {}
        }

        // Browser Native Files Drop
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const files = Array.from(e.dataTransfer.files);
          if (destPane === 'target') {
            TransferManager.uploadBrowserFilesToDevice(files, this.targetCurrentPath);
          } else {
            this.uploadFilesToMac(files, this.macCurrentPath);
          }
        }
      });
    });

    // Row dragstart
    document.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.file-row');
      if (row) {
        row.classList.add('dragging');
        const payload = {
          sourcePane: row.dataset.pane,
          filePath: row.dataset.path,
          fileName: row.querySelector('.file-name-text').textContent
        };
        e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      }
    });

    document.addEventListener('dragend', (e) => {
      const row = e.target.closest('.file-row');
      if (row) row.classList.remove('dragging');
    });
  },

  async uploadFilesToMac(files, targetDir) {
    App.showToast(`Saving ${files.length} file(s) to Mac...`, 'info');
    const formData = new FormData();
    formData.append('targetDir', targetDir || '');
    for (const f of files) formData.append('files', f);

    try {
      const res = await fetch(App.apiUrl('/api/transfer/upload-to-mac'), { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        App.showToast(`Saved ${files.length} file(s) to Mac`, 'success');
        this.refreshMac(this.macCurrentPath);
      }
    } catch (e) {
      App.showToast('Upload error', 'error');
    }
  },

  async createFolder(pane, name) {
    if (!name || !name.trim()) return;
    const basePath = pane === 'mac' ? this.macCurrentPath : this.targetCurrentPath;
    const newPath = basePath.endsWith('/') ? basePath + name : `${basePath}/${name}`;
    const pathUrl = pane === 'mac' ? '/api/mac/mkdir' : '/api/adb/mkdir';

    try {
      const res = await fetch(App.apiUrl(pathUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath })
      });
      const data = await res.json();
      if (data.success) {
        App.showToast(`Folder "${name}" created`, 'success');
        pane === 'mac' ? this.refreshMac(basePath) : this.refreshTarget(basePath);
      } else {
        App.showToast(`Failed to create folder: ${data.error}`, 'error');
      }
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  async deleteItem(pane, itemPath) {
    const pathUrl = pane === 'mac' ? '/api/mac/delete' : '/api/adb/delete';
    try {
      const res = await fetch(App.apiUrl(pathUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: itemPath })
      });
      const data = await res.json();
      if (data.success) {
        App.showToast('Item deleted', 'info');
        pane === 'mac' ? this.refreshMac(this.macCurrentPath) : this.refreshTarget(this.targetCurrentPath);
      } else {
        App.showToast(`Delete failed: ${data.error}`, 'error');
      }
    } catch (e) {
      App.showToast(e.message, 'error');
    }
  },

  showPromptModal(title, onConfirm) {
    const modal = document.getElementById('modal-prompt');
    const titleEl = document.getElementById('prompt-title');
    const input = document.getElementById('prompt-input');
    const confirmBtn = document.getElementById('btn-prompt-confirm');

    titleEl.textContent = title;
    input.value = '';
    modal.classList.add('active');
    input.focus();

    const handler = () => {
      const val = input.value.trim();
      if (val) {
        onConfirm(val);
        modal.classList.remove('active');
      }
      confirmBtn.removeEventListener('click', handler);
    };

    confirmBtn.onclick = handler;
  }
};
