/**
 * Explorer Manager for MacFileBridge
 * Manages dual-pane navigation, search, sort, selection, and interactive drag-and-drop.
 */

const Explorer = {
  // Mac State
  macCurrentPath: '',
  macItems: [],
  macSelected: new Set(),
  macFilter: 'all',
  macSearch: '',

  // Target Device State
  targetMode: 'android', // 'android' or 'usb'
  targetCurrentPath: '/storage/emulated/0',
  targetItems: [],
  targetSelected: new Set(),
  targetFilter: 'all',
  targetSearch: '',

  // Drag State
  draggedData: null,

  init() {
    this.bindEvents();
    this.bindInterPaneDragAndDrop();
    this.loadMacShortcuts();
    this.loadMacFiles();
    this.loadTargetFiles();
  },

  bindEvents() {
    // Mac Pane Actions
    document.getElementById('mac-btn-new-folder').addEventListener('click', () => {
      this.promptNewFolder('mac');
    });

    document.getElementById('mac-btn-send-to-device').addEventListener('click', () => {
      const selected = this.getSelectedItems('mac');
      if (selected.length === 0) {
        App.showToast('Select files on Mac first or click the send button on a row', 'info');
        return;
      }
      TransferManager.sendMacFilesToDevice(selected, this.targetCurrentPath);
    });

    // Divider Central Transfer Buttons
    document.getElementById('btn-transfer-mac-to-target').addEventListener('click', () => {
      const selected = this.getSelectedItems('mac');
      if (selected.length === 0) {
        App.showToast('Select files on Mac first', 'info');
        return;
      }
      TransferManager.sendMacFilesToDevice(selected, this.targetCurrentPath);
    });

    document.getElementById('btn-transfer-target-to-mac').addEventListener('click', () => {
      const selected = this.getSelectedItems('target');
      if (selected.length === 0) {
        App.showToast('Select files on Device first', 'info');
        return;
      }
      TransferManager.sendDeviceFilesToMac(selected, this.macCurrentPath);
    });

    // Target Pane Actions
    document.getElementById('target-btn-new-folder').addEventListener('click', () => {
      this.promptNewFolder('target');
    });

    const targetSendToMacBtn = document.getElementById('target-btn-send-to-mac');
    if (targetSendToMacBtn) {
      targetSendToMacBtn.addEventListener('click', () => {
        const selected = this.getSelectedItems('target');
        if (selected.length === 0) {
          App.showToast('Select files on Device first', 'info');
          return;
        }
        TransferManager.sendDeviceFilesToMac(selected, this.macCurrentPath);
      });
    }

    document.getElementById('target-device-selector').addEventListener('change', (e) => {
      this.targetMode = e.target.value;
      if (this.targetMode === 'android') {
        this.targetCurrentPath = '/storage/emulated/0';
        document.getElementById('target-shortcuts').style.display = 'flex';
      } else {
        this.targetCurrentPath = '/Volumes';
        document.getElementById('target-shortcuts').style.display = 'none';
      }
      this.loadTargetFiles();
    });

    // Search Inputs
    document.getElementById('mac-search-input').addEventListener('input', (e) => {
      this.macSearch = e.target.value.toLowerCase();
      this.renderMacList();
    });

    document.getElementById('target-search-input').addEventListener('input', (e) => {
      this.targetSearch = e.target.value.toLowerCase();
      this.renderTargetList();
    });

    // Filter Chips
    document.querySelectorAll('#mac-filter-tabs .filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mac-filter-tabs .filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.macFilter = btn.dataset.filter;
        this.renderMacList();
      });
    });

    document.querySelectorAll('#target-filter-tabs .filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#target-filter-tabs .filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.targetFilter = btn.dataset.filter;
        this.renderTargetList();
      });
    });

    // Target Shortcuts
    document.querySelectorAll('#target-shortcuts .shortcut-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#target-shortcuts .shortcut-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.targetCurrentPath = btn.dataset.path;
        this.loadTargetFiles();
      });
    });

    // Select All
    document.getElementById('mac-select-all').addEventListener('change', (e) => {
      this.toggleSelectAll('mac', e.target.checked);
    });

    document.getElementById('target-select-all').addEventListener('change', (e) => {
      this.toggleSelectAll('target', e.target.checked);
    });
  },

  // ================= DRAG & DROP ENGINE =================

  bindInterPaneDragAndDrop() {
    // 1. Drop on Target Pane (from Mac or OS Finder)
    const targetDropContainer = document.getElementById('target-file-container');
    const targetDropOverlay = document.getElementById('target-drop-overlay');

    targetDropContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!this.draggedData || this.draggedData.source === 'mac') {
        targetDropOverlay.classList.add('active');
      }
    });

    targetDropContainer.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && !targetDropContainer.contains(e.relatedTarget)) {
        targetDropOverlay.classList.remove('active');
      }
    });

    targetDropContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      targetDropOverlay.classList.remove('active');

      // Check if dropped from Finder (files object)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        TransferManager.uploadBrowserFilesToDevice(Array.from(e.dataTransfer.files), this.targetCurrentPath);
        return;
      }

      // Check if dragged from Mac Pane
      if (this.draggedData && this.draggedData.source === 'mac') {
        const items = this.draggedData.items;
        TransferManager.sendMacFilesToDevice(items, this.targetCurrentPath);
        this.draggedData = null;
      }
    });

    // 2. Drop on Mac Pane (from Target Pane or OS Finder)
    const macDropContainer = document.getElementById('mac-file-container');
    const macDropOverlay = document.getElementById('mac-drop-overlay');

    macDropContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (this.draggedData && this.draggedData.source === 'target') {
        macDropOverlay.classList.add('active');
      }
    });

    macDropContainer.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && !macDropContainer.contains(e.relatedTarget)) {
        macDropOverlay.classList.remove('active');
      }
    });

    macDropContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      macDropOverlay.classList.remove('active');

      // Check if dropped from Device Pane to Mac
      if (this.draggedData && this.draggedData.source === 'target') {
        const items = this.draggedData.items;
        TransferManager.sendDeviceFilesToMac(items, this.macCurrentPath);
        this.draggedData = null;
      }
    });
  },

  // ================= MAC FILE METHODS =================

  async loadMacShortcuts() {
    try {
      const res = await fetch('/api/mac/shortcuts');
      const data = await res.json();
      if (data.success) {
        const strip = document.getElementById('mac-shortcuts');
        strip.innerHTML = '';
        data.shortcuts.forEach((sc, idx) => {
          const btn = document.createElement('button');
          btn.className = `shortcut-chip ${idx === 0 ? 'active' : ''}`;
          btn.innerHTML = `<i data-lucide="${sc.icon}"></i> ${sc.name}`;
          btn.addEventListener('click', () => {
            document.querySelectorAll('#mac-shortcuts .shortcut-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.macCurrentPath = sc.path;
            this.loadMacFiles();
          });
          strip.appendChild(btn);
        });
        lucide.createIcons();
      }
    } catch (e) {}
  },

  async loadMacFiles(pathParam) {
    const listEl = document.getElementById('mac-file-list');
    listEl.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Loading files...</div>';

    const url = pathParam ? `/api/mac/files?path=${encodeURIComponent(pathParam)}` : '/api/mac/files';
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        this.macCurrentPath = data.path;
        this.macItems = data.items || [];
        this.macSelected.clear();
        document.getElementById('mac-select-all').checked = false;
        this.renderMacBreadcrumbs();
        this.renderMacList();
      } else {
        listEl.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--danger);">${data.error || 'Failed to read directory'}</div>`;
      }
    } catch (err) {
      listEl.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--danger);">${err.message}</div>`;
    }
  },

  renderMacBreadcrumbs() {
    const wrap = document.getElementById('mac-breadcrumbs');
    wrap.innerHTML = '';

    const parts = this.macCurrentPath.split('/').filter(Boolean);
    let accum = '';

    const rootItem = document.createElement('span');
    rootItem.className = 'breadcrumb-item';
    rootItem.textContent = '/';
    rootItem.addEventListener('click', () => this.loadMacFiles('/'));
    wrap.appendChild(rootItem);

    parts.forEach((part, index) => {
      accum += '/' + part;
      const thisPath = accum;
      
      const sep = document.createElement('span');
      sep.textContent = '>';
      wrap.appendChild(sep);

      const item = document.createElement('span');
      const isCurrent = index === parts.length - 1;
      item.className = `breadcrumb-item ${isCurrent ? 'current' : ''}`;
      item.textContent = part;
      
      if (!isCurrent) {
        item.addEventListener('click', () => this.loadMacFiles(thisPath));
      }
      wrap.appendChild(item);
    });
  },

  renderMacList() {
    const listEl = document.getElementById('mac-file-list');
    listEl.innerHTML = '';

    let filtered = this.macItems.filter(item => {
      const matchSearch = !this.macSearch || item.name.toLowerCase().includes(this.macSearch);
      const matchFilter = this.macFilter === 'all' || item.type === this.macFilter || (item.isDirectory && this.macFilter === 'all');
      return matchSearch && matchFilter;
    });

    document.getElementById('mac-item-count').textContent = `${filtered.length} items`;
    document.getElementById('mac-selected-count').textContent = `${this.macSelected.size} selected`;

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding: 30px; color: var(--text-muted); font-size: 13px;">No files found</div>';
      return;
    }

    filtered.forEach(item => {
      const row = document.createElement('div');
      row.className = `file-row ${this.macSelected.has(item.path) ? 'selected' : ''}`;
      row.setAttribute('draggable', 'true');

      const iconClass = this.getIconForType(item.type, item.isDirectory);
      const isChecked = this.macSelected.has(item.path);

      row.innerHTML = `
        <div class="col-select"><input type="checkbox" ${isChecked ? 'checked' : ''}></div>
        <div class="col-name" title="${item.name}">
          <i data-lucide="${iconClass}" class="file-icon ${item.type}"></i>
          <span class="file-name-text">${item.name}</span>
        </div>
        <div class="col-size">${item.formattedSize}</div>
        <div class="col-date">${item.date}</div>
        <div class="col-actions">
          <button class="row-action-btn transfer-btn" title="Send this file to Device"><i data-lucide="arrow-right"></i></button>
          ${!item.isDirectory ? `<button class="row-action-btn view" title="Preview"><i data-lucide="eye"></i></button>` : ''}
          <button class="row-action-btn delete" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      // Draggable Event
      row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        const selected = this.getSelectedItems('mac');
        const itemsToDrag = selected.some(s => s.path === item.path) ? selected : [item];
        this.draggedData = { source: 'mac', items: itemsToDrag };
        e.dataTransfer.setData('text/plain', item.name);
        e.dataTransfer.effectAllowed = 'copy';
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
      });

      // Folder drop target support
      if (item.isDirectory) {
        row.addEventListener('dragover', (e) => {
          if (this.draggedData && this.draggedData.source === 'target') {
            e.preventDefault();
            e.stopPropagation();
            row.classList.add('folder-drop-target');
          }
        });
        row.addEventListener('dragleave', () => {
          row.classList.remove('folder-drop-target');
        });
        row.addEventListener('drop', (e) => {
          if (this.draggedData && this.draggedData.source === 'target') {
            e.preventDefault();
            e.stopPropagation();
            row.classList.remove('folder-drop-target');
            TransferManager.sendDeviceFilesToMac(this.draggedData.items, item.path);
            this.draggedData = null;
          }
        });
      }

      // Checkbox click
      const cb = row.querySelector('.col-select input');
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cb.checked) {
          this.macSelected.add(item.path);
          row.classList.add('selected');
        } else {
          this.macSelected.delete(item.path);
          row.classList.remove('selected');
        }
        document.getElementById('mac-selected-count').textContent = `${this.macSelected.size} selected`;
      });

      // Row navigation or preview
      row.addEventListener('click', () => {
        if (item.isDirectory) {
          this.loadMacFiles(item.path);
        } else {
          PreviewsManager.openPreview(item, 'mac');
        }
      });

      // Send to Device Button
      const sendBtn = row.querySelector('.row-action-btn.transfer-btn');
      if (sendBtn) {
        sendBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          TransferManager.sendMacFilesToDevice([item], this.targetCurrentPath);
        });
      }

      // Preview Button
      const viewBtn = row.querySelector('.row-action-btn.view');
      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          PreviewsManager.openPreview(item, 'mac');
        });
      }

      // Delete Button
      const delBtn = row.querySelector('.row-action-btn.delete');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteItem('mac', item);
        });
      }

      listEl.appendChild(row);
    });

    lucide.createIcons();
  },

  // ================= TARGET DEVICE FILE METHODS =================

  async loadTargetFiles(pathParam) {
    const listEl = document.getElementById('target-file-list');
    listEl.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Reading device storage...</div>';

    const targetPath = pathParam || this.targetCurrentPath;
    const url = this.targetMode === 'android'
      ? `/api/adb/files?path=${encodeURIComponent(targetPath)}`
      : `/api/usb/files?path=${encodeURIComponent(targetPath)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        this.targetCurrentPath = data.path;
        this.targetItems = data.items || [];
        this.targetSelected.clear();
        document.getElementById('target-select-all').checked = false;
        this.renderTargetBreadcrumbs();
        this.renderTargetList();
        this.updateTargetStorageMeter();
      } else {
        listEl.innerHTML = `<div style="text-align:center; padding: 30px; color: var(--text-muted); font-size: 13px;">
          <i data-lucide="alert-circle" style="width: 32px; height: 32px; color: var(--warning); margin-bottom: 8px;"></i>
          <p>${data.error || 'No device storage found'}</p>
        </div>`;
        lucide.createIcons();
      }
    } catch (err) {
      listEl.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--danger);">${err.message}</div>`;
    }
  },

  async updateTargetStorageMeter() {
    if (this.targetMode === 'android') {
      try {
        const res = await fetch('/api/adb/storage');
        const data = await res.json();
        if (data.success && data.storage) {
          const s = data.storage;
          const meter = document.getElementById('target-storage-meter');
          const text = document.getElementById('target-storage-text');
          meter.style.width = s.percent;
          text.textContent = `${s.free} free of ${s.total} (${s.percent} used)`;
        }
      } catch (e) {}
    }
  },

  renderTargetBreadcrumbs() {
    const wrap = document.getElementById('target-breadcrumbs');
    wrap.innerHTML = '';

    const parts = this.targetCurrentPath.split('/').filter(Boolean);
    let accum = '';

    const rootItem = document.createElement('span');
    rootItem.className = 'breadcrumb-item';
    rootItem.textContent = '/';
    rootItem.addEventListener('click', () => this.loadTargetFiles('/'));
    wrap.appendChild(rootItem);

    parts.forEach((part, index) => {
      accum += '/' + part;
      const thisPath = accum;
      
      const sep = document.createElement('span');
      sep.textContent = '>';
      wrap.appendChild(sep);

      const item = document.createElement('span');
      const isCurrent = index === parts.length - 1;
      item.className = `breadcrumb-item ${isCurrent ? 'current' : ''}`;
      item.textContent = part;
      
      if (!isCurrent) {
        item.addEventListener('click', () => this.loadTargetFiles(thisPath));
      }
      wrap.appendChild(item);
    });
  },

  renderTargetList() {
    const listEl = document.getElementById('target-file-list');
    listEl.innerHTML = '';

    let filtered = this.targetItems.filter(item => {
      const matchSearch = !this.targetSearch || item.name.toLowerCase().includes(this.targetSearch);
      const matchFilter = this.targetFilter === 'all' || item.type === this.targetFilter || (item.isDirectory && this.targetFilter === 'all');
      return matchSearch && matchFilter;
    });

    document.getElementById('target-item-count').textContent = `${filtered.length} items`;
    document.getElementById('target-selected-count').textContent = `${this.targetSelected.size} selected`;

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding: 30px; color: var(--text-muted); font-size: 13px;">Folder is empty</div>';
      return;
    }

    filtered.forEach(item => {
      const row = document.createElement('div');
      row.className = `file-row ${this.targetSelected.has(item.path) ? 'selected' : ''}`;
      row.setAttribute('draggable', 'true');

      const iconClass = this.getIconForType(item.type, item.isDirectory);
      const isChecked = this.targetSelected.has(item.path);

      row.innerHTML = `
        <div class="col-select"><input type="checkbox" ${isChecked ? 'checked' : ''}></div>
        <div class="col-name" title="${item.name}">
          <i data-lucide="${iconClass}" class="file-icon ${item.type}"></i>
          <span class="file-name-text">${item.name}</span>
        </div>
        <div class="col-size">${item.formattedSize}</div>
        <div class="col-date">${item.date}</div>
        <div class="col-actions">
          <button class="row-action-btn transfer-btn" title="Transfer this file to Mac"><i data-lucide="arrow-left"></i></button>
          ${!item.isDirectory ? `
            <button class="row-action-btn view" title="Preview"><i data-lucide="eye"></i></button>
          ` : ''}
          <button class="row-action-btn delete" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      // Draggable Event
      row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        const selected = this.getSelectedItems('target');
        const itemsToDrag = selected.some(s => s.path === item.path) ? selected : [item];
        this.draggedData = { source: 'target', items: itemsToDrag };
        e.dataTransfer.setData('text/plain', item.name);
        e.dataTransfer.effectAllowed = 'copy';
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
      });

      // Folder drop target support
      if (item.isDirectory) {
        row.addEventListener('dragover', (e) => {
          if (this.draggedData && this.draggedData.source === 'mac') {
            e.preventDefault();
            e.stopPropagation();
            row.classList.add('folder-drop-target');
          }
        });
        row.addEventListener('dragleave', () => {
          row.classList.remove('folder-drop-target');
        });
        row.addEventListener('drop', (e) => {
          if (this.draggedData && this.draggedData.source === 'mac') {
            e.preventDefault();
            e.stopPropagation();
            row.classList.remove('folder-drop-target');
            TransferManager.sendMacFilesToDevice(this.draggedData.items, item.path);
            this.draggedData = null;
          }
        });
      }

      // Checkbox click
      const cb = row.querySelector('.col-select input');
      cb.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cb.checked) {
          this.targetSelected.add(item.path);
          row.classList.add('selected');
        } else {
          this.targetSelected.delete(item.path);
          row.classList.remove('selected');
        }
        document.getElementById('target-selected-count').textContent = `${this.targetSelected.size} selected`;
      });

      // Row click
      row.addEventListener('click', () => {
        if (item.isDirectory) {
          this.loadTargetFiles(item.path);
        } else {
          PreviewsManager.openPreview(item, this.targetMode);
        }
      });

      // Pull to Mac Button
      const pullBtn = row.querySelector('.row-action-btn.transfer-btn');
      if (pullBtn) {
        pullBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          TransferManager.sendDeviceFilesToMac([item], this.macCurrentPath);
        });
      }

      // Preview Button
      const viewBtn = row.querySelector('.row-action-btn.view');
      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          PreviewsManager.openPreview(item, this.targetMode);
        });
      }

      // Delete Button
      const delBtn = row.querySelector('.row-action-btn.delete');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteItem('target', item);
        });
      }

      listEl.appendChild(row);
    });

    lucide.createIcons();
  },

  // ================= GENERAL HELPERS =================

  toggleSelectAll(pane, checked) {
    const items = pane === 'mac' ? this.macItems : this.targetItems;
    const selectedSet = pane === 'mac' ? this.macSelected : this.targetSelected;

    selectedSet.clear();
    if (checked) {
      items.forEach(it => selectedSet.add(it.path));
    }

    if (pane === 'mac') this.renderMacList();
    else this.renderTargetList();
  },

  getSelectedItems(pane) {
    const items = pane === 'mac' ? this.macItems : this.targetItems;
    const selectedSet = pane === 'mac' ? this.macSelected : this.targetSelected;
    return items.filter(it => selectedSet.has(it.path));
  },

  async promptNewFolder(pane) {
    const modal = document.getElementById('modal-prompt');
    const input = document.getElementById('prompt-input');
    const confirmBtn = document.getElementById('btn-prompt-confirm');

    input.value = '';
    modal.classList.add('active');
    input.focus();

    const handleConfirm = async () => {
      const name = input.value.trim();
      if (!name) return;
      modal.classList.remove('active');
      confirmBtn.removeEventListener('click', handleConfirm);

      if (pane === 'mac') {
        const full = this.macCurrentPath + '/' + name;
        const res = await fetch('/api/mac/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: full })
        });
        const data = await res.json();
        if (data.success) {
          App.showToast(`Folder "${name}" created on Mac`, 'success');
          this.loadMacFiles(this.macCurrentPath);
        }
      } else {
        const full = this.targetCurrentPath + '/' + name;
        const res = await fetch('/api/adb/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: full })
        });
        const data = await res.json();
        if (data.success) {
          App.showToast(`Folder "${name}" created on Device`, 'success');
          this.loadTargetFiles(this.targetCurrentPath);
        }
      }
    };

    confirmBtn.onclick = handleConfirm;
  },

  async deleteItem(pane, item) {
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;

    if (pane === 'mac') {
      const res = await fetch('/api/mac/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path })
      });
      const data = await res.json();
      if (data.success) {
        App.showToast(`Deleted ${item.name}`, 'success');
        this.loadMacFiles(this.macCurrentPath);
      }
    } else {
      const res = await fetch('/api/adb/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path })
      });
      const data = await res.json();
      if (data.success) {
        App.showToast(`Deleted ${item.name}`, 'success');
        this.loadTargetFiles(this.targetCurrentPath);
      }
    }
  },

  refreshMac() {
    this.loadMacFiles(this.macCurrentPath);
  },

  refreshTarget() {
    this.loadTargetFiles(this.targetCurrentPath);
  },

  getIconForType(type, isDir) {
    if (isDir) return 'folder';
    switch (type) {
      case 'image': return 'image';
      case 'video': return 'film';
      case 'audio': return 'music';
      case 'document': return 'file-text';
      case 'apk': return 'smartphone';
      case 'archive': return 'archive';
      default: return 'file';
    }
  }
};
