/**
 * Previews Manager for MacFileBridge
 * Supports inline preview for images, audio, video, text, and screenshots.
 */

const PreviewsManager = {
  previewContainer: null,
  previewTitle: null,
  previewMeta: null,
  modal: null,

  init() {
    this.previewContainer = document.getElementById('preview-container');
    this.previewTitle = document.getElementById('preview-file-title');
    this.previewMeta = document.getElementById('preview-meta-info');
    this.modal = document.getElementById('modal-preview');
  },

  openPreview(file, source) {
    if (!this.previewContainer) this.init();
    this.previewTitle.textContent = file.name;
    this.previewMeta.textContent = `${file.formattedSize} • ${file.type.toUpperCase()} • ${source === 'mac' ? 'Mac Storage' : 'Connected Device'}`;
    this.previewContainer.innerHTML = '<div style="color:var(--text-muted);">Loading preview...</div>';
    this.modal.classList.add('active');

    let previewUrl = '';
    if (source === 'mac') {
      previewUrl = `/api/mac/preview-file?path=${encodeURIComponent(file.path)}`;
    } else if (source === 'android') {
      previewUrl = `/api/adb/preview-file?path=${encodeURIComponent(file.path)}`;
    } else {
      previewUrl = `/api/mac/preview-file?path=${encodeURIComponent(file.path)}`;
    }

    if (file.type === 'image') {
      const img = document.createElement('img');
      img.src = previewUrl;
      img.alt = file.name;
      img.onload = () => {
        this.previewContainer.innerHTML = '';
        this.previewContainer.appendChild(img);
      };
      img.onerror = () => {
        this.previewContainer.innerHTML = '<div style="color:var(--danger);">Failed to load image preview</div>';
      };
    } else if (file.type === 'video') {
      this.previewContainer.innerHTML = `
        <video controls autoplay style="max-height: 60vh; max-width: 100%; border-radius: 8px;">
          <source src="${previewUrl}" type="video/mp4">
          Your browser does not support video playback.
        </video>
      `;
    } else if (file.type === 'audio') {
      this.previewContainer.innerHTML = `
        <div style="text-align: center; width: 80%;">
          <i data-lucide="music" style="width: 48px; height: 48px; color: var(--accent); margin-bottom: 16px;"></i>
          <audio controls autoplay style="width: 100%;">
            <source src="${previewUrl}">
            Your browser does not support audio playback.
          </audio>
        </div>
      `;
      lucide.createIcons();
    } else if (['document', 'file'].includes(file.type) && ['.txt', '.md', '.json', '.js', '.py', '.html', '.css', '.xml', '.csv'].includes(file.extension)) {
      fetch(previewUrl)
        .then(res => res.text())
        .then(text => {
          this.previewContainer.innerHTML = `<pre class="preview-text-box">${this.escapeHtml(text.slice(0, 50000))}</pre>`;
        })
        .catch(() => {
          this.previewContainer.innerHTML = '<div style="color:var(--danger);">Failed to load file contents</div>';
        });
    } else {
      this.previewContainer.innerHTML = `
        <div style="text-align:center; padding: 20px;">
          <i data-lucide="file" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 12px;"></i>
          <p>Direct preview is not available for this file type (${file.extension || 'file'}).</p>
          <a href="${previewUrl}" download="${file.name}" class="btn btn-primary btn-sm" style="margin-top: 14px;">
            <i data-lucide="download"></i> Download File
          </a>
        </div>
      `;
      lucide.createIcons();
    }
  },

  showScreenshot(url) {
    if (!this.previewContainer) this.init();
    this.previewTitle.textContent = 'Android Live Screen Capture';
    this.previewMeta.textContent = `Captured from USB Device at ${new Date().toLocaleTimeString()}`;
    this.previewContainer.innerHTML = `<img src="${url}" alt="Screenshot" style="max-height: 65vh; border-radius: 8px;">`;
    this.modal.classList.add('active');
  },

  escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }
};
