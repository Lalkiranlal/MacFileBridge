const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class USBManager {
  constructor() {
    this.volumesDir = '/Volumes';
  }

  async getMountedVolumes() {
    try {
      if (!fs.existsSync(this.volumesDir)) {
        return [];
      }

      const entries = fs.readdirSync(this.volumesDir, { withFileTypes: true });
      const volumes = [];

      for (const entry of entries) {
        const fullPath = path.join(this.volumesDir, entry.name);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory() || entry.isSymbolicLink()) {
            const isSystem = entry.name === 'Macintosh HD' || entry.name.startsWith('.');
            const spaceInfo = await this.getVolumeSpace(fullPath);

            volumes.push({
              name: entry.name,
              path: fullPath,
              isSystem,
              isUSB: !isSystem,
              type: isSystem ? 'system_drive' : 'usb_drive',
              total: spaceInfo.total,
              used: spaceInfo.used,
              free: spaceInfo.free,
              percent: spaceInfo.percent
            });
          }
        } catch (e) {
          // Inaccessible volume, skip
        }
      }

      return volumes;
    } catch (err) {
      console.error('Error reading /Volumes:', err);
      return [];
    }
  }

  getVolumeSpace(volumePath) {
    return new Promise((resolve) => {
      exec(`df -h "${volumePath.replace(/"/g, '\\"')}"`, (err, stdout) => {
        if (err || !stdout) {
          return resolve({ total: 'N/A', used: 'N/A', free: 'N/A', percent: '0%' });
        }
        const lines = stdout.trim().split('\n');
        if (lines.length >= 2) {
          const parts = lines[1].trim().split(/\s+/);
          if (parts.length >= 5) {
            // Filesystem Size Used Avail Capacity
            return resolve({
              total: parts[1],
              used: parts[2],
              free: parts[3],
              percent: parts[4]
            });
          }
        }
        resolve({ total: 'Unknown', used: 'Unknown', free: 'Unknown', percent: '0%' });
      });
    });
  }

  listDirectory(targetPath) {
    try {
      const stats = fs.statSync(targetPath);
      if (!stats.isDirectory()) {
        throw new Error('Not a directory');
      }

      const entries = fs.readdirSync(targetPath, { withFileTypes: true });
      const items = [];

      for (const entry of entries) {
        if (entry.name.startsWith('._') || entry.name === '.DS_Store') continue;

        const fullPath = path.join(targetPath, entry.name);
        try {
          const itemStats = fs.statSync(fullPath);
          const isDir = itemStats.isDirectory();
          const ext = path.extname(entry.name).toLowerCase();
          const fileType = this.determineFileType(entry.name, isDir);

          items.push({
            name: entry.name,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : itemStats.size,
            formattedSize: isDir ? '--' : this.formatBytes(itemStats.size),
            date: itemStats.mtime.toLocaleDateString() + ' ' + itemStats.mtime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: fileType,
            extension: ext
          });
        } catch (e) {
          // File might be permission restricted or temporary
        }
      }

      items.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) {
          return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }
        return a.isDirectory ? -1 : 1;
      });

      return {
        path: targetPath,
        items,
        count: items.length
      };
    } catch (err) {
      return { path: targetPath, items: [], error: err.message };
    }
  }

  determineFileType(fileName, isDir) {
    if (isDir) return 'folder';
    const ext = path.extname(fileName).toLowerCase();
    
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif', '.svg', '.dng'];
    const videoExts = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.3gp', '.flv', '.m4v'];
    const audioExts = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg', '.opus', '.wma'];
    const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.json', '.xml'];
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.dmg', '.iso'];
    const appExts = ['.app', '.pkg', '.apk'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (docExts.includes(ext)) return 'document';
    if (archiveExts.includes(ext)) return 'archive';
    if (appExts.includes(ext)) return 'apk';
    return 'file';
  }

  formatBytes(bytes) {
    if (bytes === 0 || !bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new USBManager();
