const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const adbManager = require('./adbManager');

class TransferEngine extends EventEmitter {
  constructor() {
    super();
    this.activeTransfers = new Map();
    this.childProcesses = new Map();
    this.history = [];
    this.wsClients = new Set();
  }

  registerWS(ws) {
    this.wsClients.add(ws);
    ws.on('close', () => this.wsClients.delete(ws));
  }

  broadcast(event, data) {
    const payload = JSON.stringify({ event, data });
    for (const client of this.wsClients) {
      if (client.readyState === 1) {
        try {
          client.send(payload);
        } catch (e) {}
      }
    }
  }

  createTransferId() {
    return 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  startMacToAndroid(sourceMacPath, targetAndroidPath) {
    const id = this.createTransferId();
    const fileName = path.basename(sourceMacPath);
    let fileSize = 0;

    try {
      if (fs.existsSync(sourceMacPath)) {
        const stat = fs.statSync(sourceMacPath);
        fileSize = stat.size;
      }
    } catch (e) {}

    const transfer = {
      id,
      name: fileName,
      source: 'Mac: ' + sourceMacPath,
      target: 'Android: ' + targetAndroidPath,
      type: 'mac_to_android',
      totalBytes: fileSize,
      transferredBytes: 0,
      progress: 0,
      speedText: '0 MB/s',
      speed: 0,
      eta: 0,
      status: 'transferring',
      startTime: Date.now()
    };

    this.activeTransfers.set(id, transfer);
    this.broadcast('transfer_started', transfer);

    (async () => {
      try {
        const res = await adbManager.pushFile(
          sourceMacPath,
          targetAndroidPath,
          (percent, speedInfo) => {
            if (transfer.status === 'cancelled') return;
            transfer.progress = percent;
            transfer.transferredBytes = Math.round((percent / 100) * fileSize);
            
            if (speedInfo && typeof speedInfo === 'string' && speedInfo !== 'Done') {
              transfer.speedText = speedInfo;
            } else {
              const elapsedSec = (Date.now() - transfer.startTime) / 1000;
              if (elapsedSec > 0) {
                const speedBps = Math.round(transfer.transferredBytes / elapsedSec);
                transfer.speedText = (speedBps / (1024 * 1024)).toFixed(1) + ' MB/s';
                const remainingBytes = fileSize - transfer.transferredBytes;
                transfer.eta = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;
              }
            }

            this.broadcast('transfer_progress', transfer);
          },
          (childProcess) => {
            this.childProcesses.set(id, childProcess);
          }
        );

        if (transfer.status === 'cancelled') return;

        if (res.success) {
          transfer.status = 'completed';
          transfer.progress = 100;
          transfer.transferredBytes = fileSize;
          this.broadcast('transfer_completed', transfer);
        } else {
          transfer.status = 'failed';
          transfer.error = res.error;
          this.broadcast('transfer_failed', transfer);
        }
      } catch (err) {
        if (transfer.status !== 'cancelled') {
          transfer.status = 'failed';
          transfer.error = err.message;
          this.broadcast('transfer_failed', transfer);
        }
      } finally {
        this.childProcesses.delete(id);
        this.history.unshift({ ...transfer, endTime: Date.now() });
        if (this.history.length > 50) this.history.pop();
        this.activeTransfers.delete(id);
      }
    })();

    return transfer;
  }

  async startAndroidToMac(sourceAndroidPath, targetMacPath) {
    const id = this.createTransferId();
    const fileName = path.basename(sourceAndroidPath);

    // 1. Get exact remote file size first for 100% accurate physical progress!
    const remoteSize = await adbManager.getFileSize(sourceAndroidPath);

    const transfer = {
      id,
      name: fileName,
      source: 'Android: ' + sourceAndroidPath,
      target: 'Mac: ' + targetMacPath,
      type: 'android_to_mac',
      totalBytes: remoteSize,
      transferredBytes: 0,
      progress: 0,
      speedText: '0 MB/s',
      speed: 0,
      eta: 0,
      status: 'transferring',
      startTime: Date.now()
    };

    this.activeTransfers.set(id, transfer);
    this.broadcast('transfer_started', transfer);

    (async () => {
      // 2. Start high-frequency disk poller for accurate byte-level progress
      const pollInterval = setInterval(() => {
        if (transfer.status !== 'transferring') {
          clearInterval(pollInterval);
          return;
        }
        try {
          if (fs.existsSync(targetMacPath)) {
            const currentBytes = fs.statSync(targetMacPath).size;
            transfer.transferredBytes = currentBytes;
            if (remoteSize > 0) {
              transfer.progress = Math.min(99, Math.round((currentBytes / remoteSize) * 100));
            }
            const elapsedSec = (Date.now() - transfer.startTime) / 1000;
            if (elapsedSec > 0) {
              const speedBps = Math.round(currentBytes / elapsedSec);
              transfer.speedText = (speedBps / (1024 * 1024)).toFixed(1) + ' MB/s';
              if (remoteSize > currentBytes && speedBps > 0) {
                transfer.eta = Math.round((remoteSize - currentBytes) / speedBps);
              }
            }
            this.broadcast('transfer_progress', transfer);
          }
        } catch (e) {}
      }, 150);

      try {
        const res = await adbManager.pullFile(
          sourceAndroidPath,
          targetMacPath,
          (percent, speedInfo) => {
            if (transfer.status === 'cancelled') return;
            if (percent > transfer.progress) transfer.progress = percent;
            if (speedInfo && typeof speedInfo === 'string' && speedInfo !== 'Done') {
              transfer.speedText = speedInfo;
            }
            this.broadcast('transfer_progress', transfer);
          },
          (childProcess) => {
            this.childProcesses.set(id, childProcess);
          }
        );

        clearInterval(pollInterval);
        if (transfer.status === 'cancelled') return;

        if (res.success) {
          transfer.status = 'completed';
          transfer.progress = 100;
          transfer.transferredBytes = remoteSize || (fs.existsSync(targetMacPath) ? fs.statSync(targetMacPath).size : 0);
          this.broadcast('transfer_completed', transfer);
        } else {
          transfer.status = 'failed';
          transfer.error = res.error;
          this.broadcast('transfer_failed', transfer);
        }
      } catch (err) {
        clearInterval(pollInterval);
        if (transfer.status !== 'cancelled') {
          transfer.status = 'failed';
          transfer.error = err.message;
          this.broadcast('transfer_failed', transfer);
        }
      } finally {
        clearInterval(pollInterval);
        this.childProcesses.delete(id);
        this.history.unshift({ ...transfer, endTime: Date.now() });
        if (this.history.length > 50) this.history.pop();
        this.activeTransfers.delete(id);
      }
    })();

    return transfer;
  }

  cancelTransfer(id) {
    const transfer = this.activeTransfers.get(id);
    if (!transfer) return { success: false, error: 'Transfer not found or already finished' };

    transfer.status = 'cancelled';
    transfer.error = 'Cancelled by user';

    const child = this.childProcesses.get(id);
    if (child) {
      try {
        child.kill('SIGTERM');
        setTimeout(() => {
          try { child.kill('SIGKILL'); } catch (e) {}
        }, 500);
      } catch (e) {}
      this.childProcesses.delete(id);
    }

    // Clean up partial target file if downloading to Mac
    if (transfer.type === 'android_to_mac') {
      const targetPath = transfer.target.replace('Mac: ', '').trim();
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch (e) {}
    }

    this.broadcast('transfer_cancelled', transfer);
    this.history.unshift({ ...transfer, endTime: Date.now() });
    this.activeTransfers.delete(id);

    return { success: true, transfer };
  }

  getTransfersStatus() {
    return {
      active: Array.from(this.activeTransfers.values()),
      history: this.history
    };
  }
}

module.exports = new TransferEngine();
