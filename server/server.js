const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const mime = require('mime-types');

const adbManager = require('./adbManager');
const usbManager = require('./usbManager');
const networkManager = require('./networkManager');
const transferEngine = require('./transferEngine');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 54321;
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'macfilebridge_uploads');
const DEFAULT_MAC_DROP_DIR = path.join(os.homedir(), 'Downloads', 'MacFileBridge_Received');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_TEMP_DIR)) fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
if (!fs.existsSync(DEFAULT_MAC_DROP_DIR)) fs.mkdirSync(DEFAULT_MAC_DROP_DIR, { recursive: true });

// Enable CORS so hosted frontend (Vercel) can securely talk to local Mac daemon
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_TEMP_DIR),
  filename: (req, file, cb) => {
    const safeName = Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage });

// WebSocket Connection Management
wss.on('connection', (ws) => {
  transferEngine.registerWS(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
      }
    } catch (e) {}
  });
});

// ==================== SYSTEM & STATUS APIS ====================

app.get('/api/status', async (req, res) => {
  try {
    const devices = await adbManager.getDevices();
    const volumes = await usbManager.getMountedVolumes();
    const localIPs = networkManager.getLocalIPs();
    const primaryIP = networkManager.getPrimaryIP();

    res.json({
      success: true,
      port: PORT,
      primaryIP,
      localIPs,
      adb: {
        installed: true,
        version: '1.0.41',
        adbPath: adbManager.adbPath,
        devices,
        activeDevice: adbManager.activeDevice
      },
      volumes,
      downloadsFolder: DEFAULT_MAC_DROP_DIR,
      hostname: os.hostname(),
      platform: os.platform()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ANDROID / ADB APIS ====================

app.get('/api/adb/devices', async (req, res) => {
  try {
    const devices = await adbManager.getDevices();
    res.json({ success: true, devices, activeDevice: adbManager.activeDevice });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/adb/select-device', (req, res) => {
  const { serial } = req.body;
  if (!serial) return res.status(400).json({ success: false, error: 'Device serial required' });
  adbManager.setActiveDevice(serial);
  res.json({ success: true, activeDevice: serial });
});

app.post('/api/adb/restart', async (req, res) => {
  try {
    const out = await adbManager.restartServer();
    res.json({ success: true, output: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/adb/storage', async (req, res) => {
  try {
    const info = await adbManager.getStorageInfo();
    res.json({ success: true, storage: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/adb/files', async (req, res) => {
  try {
    const targetPath = req.query.path || '/storage/emulated/0';
    const result = await adbManager.listDirectory(targetPath);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/adb/mkdir', async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ success: false, error: 'Path is required' });
    const result = await adbManager.createDirectory(folderPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/adb/delete', async (req, res) => {
  try {
    const { path: itemPath } = req.body;
    if (!itemPath) return res.status(400).json({ success: false, error: 'Path is required' });
    const result = await adbManager.deleteItem(itemPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/adb/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ success: false, error: 'oldPath and newPath required' });
    const result = await adbManager.renameItem(oldPath, newPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/adb/download-file', async (req, res) => {
  const remotePath = req.query.path;
  if (!remotePath) return res.status(400).send('Path required');

  const fileName = path.basename(remotePath);
  const tempDest = path.join(UPLOAD_TEMP_DIR, `temp_${Date.now()}_${fileName}`);

  try {
    const pullRes = await adbManager.pullFile(remotePath, tempDest);
    if (!pullRes.success) {
      return res.status(500).send(pullRes.error || 'Failed to pull file from Android');
    }

    const mimeType = mime.lookup(fileName) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    const fileStream = fs.createReadStream(tempDest);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      fs.unlink(tempDest, () => {});
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/adb/preview-file', async (req, res) => {
  const remotePath = req.query.path;
  if (!remotePath) return res.status(400).send('Path required');

  const fileName = path.basename(remotePath);
  const tempDest = path.join(UPLOAD_TEMP_DIR, `preview_${Date.now()}_${fileName}`);

  try {
    const pullRes = await adbManager.pullFile(remotePath, tempDest);
    if (!pullRes.success) {
      return res.status(500).send(pullRes.error || 'Failed to pull preview');
    }

    const mimeType = mime.lookup(fileName) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);

    const fileStream = fs.createReadStream(tempDest);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      setTimeout(() => fs.unlink(tempDest, () => {}), 10000);
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/adb/screenshot', async (req, res) => {
  const tempDest = path.join(UPLOAD_TEMP_DIR, `screencap_${Date.now()}.png`);
  try {
    const result = await adbManager.captureScreenshot(tempDest);
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.setHeader('Content-Type', 'image/png');
    const stream = fs.createReadStream(tempDest);
    stream.pipe(res);
    stream.on('end', () => fs.unlink(tempDest, () => {}));
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== MAC LOCAL STORAGE APIS ====================

app.get('/api/mac/shortcuts', (req, res) => {
  const home = os.homedir();
  const shortcuts = [
    { name: 'Desktop', path: path.join(home, 'Desktop'), icon: 'monitor' },
    { name: 'Downloads', path: path.join(home, 'Downloads'), icon: 'download' },
    { name: 'Documents', path: path.join(home, 'Documents'), icon: 'file-text' },
    { name: 'Pictures', path: path.join(home, 'Pictures'), icon: 'image' },
    { name: 'Movies', path: path.join(home, 'Movies'), icon: 'film' },
    { name: 'Music', path: path.join(home, 'Music'), icon: 'music' },
    { name: 'Home (~)', path: home, icon: 'home' },
    { name: 'Received Files', path: DEFAULT_MAC_DROP_DIR, icon: 'inbox' }
  ];
  res.json({ success: true, shortcuts });
});

app.get('/api/mac/files', (req, res) => {
  const targetPath = req.query.path || path.join(os.homedir(), 'Desktop');
  const result = usbManager.listDirectory(targetPath);
  res.json({ success: true, ...result });
});

app.post('/api/mac/mkdir', (req, res) => {
  try {
    const { path: folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ success: false, error: 'Path required' });
    fs.mkdirSync(folderPath, { recursive: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mac/delete', (req, res) => {
  try {
    const { path: itemPath } = req.body;
    if (!itemPath) return res.status(400).json({ success: false, error: 'Path required' });
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      fs.rmSync(itemPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(itemPath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/mac/preview-file', (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath || !fs.existsSync(targetPath)) return res.status(404).send('File not found');

  const fileName = path.basename(targetPath);
  const mimeType = mime.lookup(fileName) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);

  fs.createReadStream(targetPath).pipe(res);
});

// ==================== USB / EXTERNAL DRIVES APIS ====================

app.get('/api/usb/volumes', async (req, res) => {
  try {
    const volumes = await usbManager.getMountedVolumes();
    res.json({ success: true, volumes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/usb/files', (req, res) => {
  const targetPath = req.query.path;
  if (!targetPath) return res.status(400).json({ success: false, error: 'Path required' });
  const result = usbManager.listDirectory(targetPath);
  res.json({ success: true, ...result });
});

// ==================== TRANSFERS & CANCEL ====================

app.post('/api/transfer/mac-to-android', (req, res) => {
  const { sourcePath, targetDir } = req.body;
  if (!sourcePath || !targetDir) {
    return res.status(400).json({ success: false, error: 'sourcePath and targetDir required' });
  }

  try {
    const dest = targetDir.endsWith('/') ? targetDir : targetDir + '/';
    const transfer = transferEngine.startMacToAndroid(sourcePath, dest);
    res.json({ success: true, transfer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/transfer/android-to-mac', async (req, res) => {
  const { sourcePath, targetDir } = req.body;
  if (!sourcePath || !targetDir) {
    return res.status(400).json({ success: false, error: 'sourcePath and targetDir required' });
  }

  try {
    const fileName = path.basename(sourcePath);
    const dest = path.join(targetDir, fileName);
    const transfer = await transferEngine.startAndroidToMac(sourcePath, dest);
    res.json({ success: true, transfer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/transfer/cancel', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'Transfer id required' });

  const result = transferEngine.cancelTransfer(id);
  res.json(result);
});

// Web Browser Upload directly to Android
app.post('/api/transfer/upload-to-android', upload.array('files'), (req, res) => {
  const targetDir = req.body.targetDir || '/storage/emulated/0/Download';
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files uploaded' });
  }

  const results = [];
  for (const file of files) {
    const originalName = file.originalname;
    const dest = targetDir.endsWith('/') ? targetDir + originalName : targetDir + '/' + originalName;
    const tx = transferEngine.startMacToAndroid(file.path, dest);
    results.push(tx);
  }

  res.json({ success: true, count: results.length, transfers: results });
});

// Web Browser Upload directly to Mac
app.post('/api/transfer/upload-to-mac', upload.array('files'), (req, res) => {
  const targetDir = req.body.targetDir || DEFAULT_MAC_DROP_DIR;
  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files uploaded' });
  }

  const savedFiles = [];
  for (const file of files) {
    const targetFile = path.join(targetDir, file.originalname);
    fs.renameSync(file.path, targetFile);
    savedFiles.push({
      name: file.originalname,
      size: file.size,
      path: targetFile
    });
  }

  transferEngine.broadcast('files_received_on_mac', {
    count: savedFiles.length,
    files: savedFiles,
    targetDir
  });

  res.json({ success: true, count: savedFiles.length, files: savedFiles });
});

app.get('/api/transfers', (req, res) => {
  res.json({ success: true, ...transferEngine.getTransfersStatus() });
});

// ==================== AIRBRIDGE / WIRELESS SHARING APIS ====================

app.get('/api/airbridge/info', async (req, res) => {
  try {
    const primaryIP = networkManager.getPrimaryIP();
    const localIPs = networkManager.getLocalIPs();
    const portalUrl = `http://${primaryIP}:${PORT}/airbridge`;
    const qrCode = await networkManager.generateQRCode(portalUrl);

    res.json({
      success: true,
      port: PORT,
      primaryIP,
      localIPs,
      portalUrl,
      qrCode,
      deviceName: os.hostname()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/airbridge', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'airbridge.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  const primaryIP = networkManager.getPrimaryIP();
  console.log(`\n======================================================`);
  console.log(`🚀 MacFileBridge Server is running!`);
  console.log(`💻 Local Mac UI:  http://localhost:${PORT}`);
  console.log(`📱 Wireless Portal: http://${primaryIP}:${PORT}/airbridge`);
  console.log(`======================================================\n`);
});

module.exports = { app, server };
