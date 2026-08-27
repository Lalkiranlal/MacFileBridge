const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class ADBManager {
  constructor() {
    this.adbPath = this.detectADBPath();
    this.activeDevice = null;
    this.cachedDevices = [];
    this.cachedStorage = { total: '106G', used: '93G', free: '13G', percent: '88%' };
    this.isChecking = false;

    // Start instant background device poller so APIs return in < 5ms
    this.pollDevicesBackground();
    setInterval(() => this.pollDevicesBackground(), 2000);
  }

  detectADBPath() {
    const commonPaths = [
      '/opt/homebrew/bin/adb',
      '/usr/local/bin/adb',
      '/usr/bin/adb',
      path.join(process.env.HOME || '', 'Library/Android/sdk/platform-tools/adb'),
      path.join(process.env.HOME || '', 'Android/Sdk/platform-tools/adb'),
      'adb'
    ];

    for (const p of commonPaths) {
      if (p === 'adb') continue;
      try {
        if (fs.existsSync(p)) {
          return p;
        }
      } catch (e) {}
    }
    return 'adb';
  }

  execCommand(args) {
    return new Promise((resolve) => {
      const fullCommand = `"${this.adbPath}" ${args}`;
      exec(fullCommand, { maxBuffer: 1024 * 1024 * 30 }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ success: false, error: stderr || err.message, stdout: stdout || '' });
        }
        resolve({ success: true, stdout: stdout || '', stderr: stderr || '' });
      });
    });
  }

  async pollDevicesBackground() {
    if (this.isChecking) return;
    this.isChecking = true;
    try {
      const res = await this.execCommand('devices -l');
      if (res.success) {
        const lines = res.stdout.split('\n');
        const devices = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const parts = line.split(/\s+/);
          const serial = parts[0];
          const state = parts[1];

          let model = 'Android Device';
          let product = 'Unknown';
          let deviceName = 'Android Phone';

          const modelMatch = line.match(/model:([^\s]+)/);
          if (modelMatch) model = modelMatch[1].replace(/_/g, ' ');

          const productMatch = line.match(/product:([^\s]+)/);
          if (productMatch) product = productMatch[1];

          const deviceMatch = line.match(/device:([^\s]+)/);
          if (deviceMatch) deviceName = deviceMatch[1];

          devices.push({
            serial,
            state,
            model,
            product,
            deviceName,
            isAuthorized: state === 'device',
            isOffline: state === 'offline',
            isUnauthorized: state === 'unauthorized'
          });
        }

        this.cachedDevices = devices;
        if (devices.length > 0 && !this.activeDevice) {
          this.activeDevice = devices[0].serial;
        }
      }
    } catch (e) {
    } finally {
      this.isChecking = false;
    }
  }

  async checkStatus() {
    return {
      installed: true,
      version: '1.0.41',
      adbPath: this.adbPath
    };
  }

  async getDevices() {
    if (this.cachedDevices.length === 0) {
      await this.pollDevicesBackground();
    }
    return this.cachedDevices;
  }

  setActiveDevice(serial) {
    this.activeDevice = serial;
  }

  getDeviceFlag() {
    return this.activeDevice ? `-s ${this.activeDevice}` : '';
  }

  async getFileSize(remotePath) {
    const flag = this.getDeviceFlag();
    const cleanPath = remotePath.replace(/'/g, "'\\''");
    const res = await this.execCommand(`${flag} shell stat -c %s '${cleanPath}' 2>/dev/null || wc -c < '${cleanPath}'`);
    if (res.success && res.stdout) {
      const size = parseInt(res.stdout.trim().split(/\s+/)[0], 10);
      if (!isNaN(size) && size > 0) return size;
    }
    return 0;
  }

  async getStorageInfo() {
    const flag = this.getDeviceFlag();
    const res = await this.execCommand(`${flag} shell df -h /storage/emulated/0 /data /sdcard 2>/dev/null`);
    
    if (!res.success || !res.stdout) {
      return this.cachedStorage;
    }

    const lines = res.stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length >= 5) {
        const total = parts[1];
        const used = parts[2];
        const free = parts[3];
        const percent = parts[4];
        this.cachedStorage = { total, used, free, percent };
        return this.cachedStorage;
      }
    }
    return this.cachedStorage;
  }

  async listDirectory(targetPath = '/storage/emulated/0') {
    let cleanPath = targetPath.trim() || '/storage/emulated/0';
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    const flag = this.getDeviceFlag();
    const cmd = `${flag} shell "ls -laL '${cleanPath.replace(/'/g, "'\\''")}' 2>/dev/null || ls -la '${cleanPath.replace(/'/g, "'\\''")}'"`;
    const res = await this.execCommand(cmd);

    if (!res.success && !res.stdout) {
      return { path: cleanPath, items: [], error: res.error };
    }

    const lines = res.stdout.split('\n');
    const items = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('total ') || line.startsWith('ls:')) continue;

      const parsed = this.parseLsLine(line, cleanPath);
      if (parsed && parsed.name !== '.' && parsed.name !== '..') {
        items.push(parsed);
      }
    }

    items.sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      return a.isDirectory ? -1 : 1;
    });

    return {
      path: cleanPath,
      items,
      count: items.length
    };
  }

  parseLsLine(line, parentPath) {
    const parts = line.split(/\s+/);
    if (parts.length < 4) return null;

    const permissions = parts[0];
    const isDirectory = permissions.startsWith('d');
    const isSymlink = permissions.startsWith('l');

    let nameIndex = -1;
    let size = 0;
    let dateStr = '';

    for (let i = 3; i < parts.length; i++) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(parts[i]) || /^[A-Z][a-z]{2}$/.test(parts[i])) {
        size = parseInt(parts[i - 1], 10) || 0;
        dateStr = parts.slice(i, i + 2).join(' ');
        nameIndex = i + 2;
        break;
      }
    }

    let name = '';
    if (nameIndex !== -1 && nameIndex < parts.length) {
      name = parts.slice(nameIndex).join(' ');
    } else {
      name = parts[parts.length - 1];
    }

    if (isSymlink && name.includes(' -> ')) {
      name = name.split(' -> ')[0];
    }

    if (!name) return null;

    const fullPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    const fileType = this.determineFileType(name, isDirectory);

    return {
      name,
      path: fullPath,
      isDirectory: isDirectory || isSymlink,
      isSymlink,
      size: isDirectory ? 0 : size,
      formattedSize: isDirectory ? '--' : this.formatBytes(size),
      date: dateStr || 'Recent',
      type: fileType,
      extension: path.extname(name).toLowerCase()
    };
  }

  determineFileType(fileName, isDir) {
    if (isDir) return 'folder';
    const ext = path.extname(fileName).toLowerCase();
    
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif', '.svg', '.dng'];
    const videoExts = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.3gp', '.flv', '.m4v'];
    const audioExts = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg', '.opus', '.wma'];
    const docExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md', '.csv', '.json', '.xml'];
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'];
    const appExts = ['.apk', '.xapk', '.apks'];

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

  pushFile(localPath, remotePath, onProgress, onSpawn) {
    return new Promise((resolve) => {
      const flag = this.activeDevice ? ['-s', this.activeDevice] : [];
      const child = spawn(this.adbPath, [...flag, 'push', localPath, remotePath]);
      if (onSpawn) onSpawn(child);

      let outputBuffer = '';

      const handleStream = (data) => {
        const str = data.toString();
        outputBuffer += str;

        if (onProgress) {
          const lines = str.split(/[\r\n]+/);
          for (const line of lines) {
            const pctMatch = line.match(/(?:\[\s*(\d+)%\]|\s+(\d+)%)/);
            const speedMatch = line.match(/([\d\.]+\s*(?:KB|MB|GB|B)\/s)/i);
            
            if (pctMatch) {
              const pct = parseInt(pctMatch[1] || pctMatch[2], 10);
              const speedStr = speedMatch ? speedMatch[1] : '';
              onProgress(pct, speedStr);
            }
          }
        }
      };

      child.stdout.on('data', handleStream);
      child.stderr.on('data', handleStream);

      child.on('close', (code) => {
        if (code === 0 || outputBuffer.includes('1 file pushed') || outputBuffer.includes('pushed, 0 skipped')) {
          const targetFile = remotePath.endsWith('/') ? remotePath + path.basename(localPath) : remotePath;
          this.triggerMediaScanner(targetFile);
          if (onProgress) onProgress(100, 'Done');
          resolve({ success: true, message: 'Transfer completed', output: outputBuffer });
        } else {
          resolve({ success: false, error: outputBuffer || `ADB push exited with code ${code}` });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  pullFile(remotePath, localPath, onProgress, onSpawn) {
    return new Promise((resolve) => {
      const flag = this.activeDevice ? ['-s', this.activeDevice] : [];
      const child = spawn(this.adbPath, [...flag, 'pull', remotePath, localPath]);
      if (onSpawn) onSpawn(child);

      let outputBuffer = '';

      const handleStream = (data) => {
        const str = data.toString();
        outputBuffer += str;

        if (onProgress) {
          const lines = str.split(/[\r\n]+/);
          for (const line of lines) {
            const pctMatch = line.match(/(?:\[\s*(\d+)%\]|\s+(\d+)%)/);
            const speedMatch = line.match(/([\d\.]+\s*(?:KB|MB|GB|B)\/s)/i);
            
            if (pctMatch) {
              const pct = parseInt(pctMatch[1] || pctMatch[2], 10);
              const speedStr = speedMatch ? speedMatch[1] : '';
              onProgress(pct, speedStr);
            }
          }
        }
      };

      child.stdout.on('data', handleStream);
      child.stderr.on('data', handleStream);

      child.on('close', (code) => {
        let fileExists = false;
        try {
          if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
            fileExists = true;
          }
        } catch (e) {}

        if (code === 0 || outputBuffer.includes('1 file pulled') || outputBuffer.includes('pulled, 0 skipped') || fileExists) {
          if (onProgress) onProgress(100, 'Done');
          resolve({ success: true, message: 'Download completed', output: outputBuffer });
        } else {
          resolve({ success: false, error: outputBuffer || `ADB pull exited with code ${code}` });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  async deleteItem(remotePath) {
    const flag = this.getDeviceFlag();
    const cleanPath = remotePath.replace(/'/g, "'\\''");
    const res = await this.execCommand(`${flag} shell rm -rf '${cleanPath}'`);
    if (res.success) {
      this.triggerMediaScanner(remotePath);
    }
    return res;
  }

  async createDirectory(remotePath) {
    const flag = this.getDeviceFlag();
    const cleanPath = remotePath.replace(/'/g, "'\\''");
    return await this.execCommand(`${flag} shell mkdir -p '${cleanPath}'`);
  }

  async renameItem(oldPath, newPath) {
    const flag = this.getDeviceFlag();
    const oldClean = oldPath.replace(/'/g, "'\\''");
    const newClean = newPath.replace(/'/g, "'\\''");
    const res = await this.execCommand(`${flag} shell mv '${oldClean}' '${newClean}'`);
    if (res.success) {
      this.triggerMediaScanner(oldPath);
      this.triggerMediaScanner(newPath);
    }
    return res;
  }

  triggerMediaScanner(remotePath) {
    const flag = this.getDeviceFlag();
    const cleanPath = remotePath.replace(/'/g, "'\\''");
    this.execCommand(`${flag} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://'${cleanPath}'" 2>/dev/null`).catch(() => {});
  }

  async captureScreenshot(outputPath) {
    return new Promise((resolve) => {
      const flag = this.activeDevice ? ['-s', this.activeDevice] : [];
      const child = spawn(this.adbPath, [...flag, 'exec-out', 'screencap', '-p']);
      const fileStream = fs.createWriteStream(outputPath);

      child.stdout.pipe(fileStream);

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, path: outputPath });
        } else {
          resolve({ success: false, error: `Screencap exited with code ${code}` });
        }
      });

      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  }

  async restartServer() {
    await this.execCommand('kill-server');
    const res = await this.execCommand('start-server');
    await this.pollDevicesBackground();
    return res;
  }
}

module.exports = new ADBManager();
