# MacFileBridge 🚀
### Ultra-Fast File Transfer Studio for macOS, Android (USB/ADB), Flash Drives & AirBridge

**MacFileBridge** is a modern, high-speed, glassmorphic desktop application built for macOS that solves the notorious difficulty of transferring files between Mac and Android devices, external USB drives, and wireless peer devices.

---

## ✨ Key Features

1. **📱 Android Phone File Transfer (USB / ADB & MTP)**
   - **High-Speed Bi-directional Transfer**: Push files to Android and pull files to Mac at up to 40–80 MB/s over USB.
   - **Full Storage Access**: Browse `/storage/emulated/0`, `DCIM` (Photos), `Download`, `Pictures`, `Music`, `Documents`, and `Movies`.
   - **Drag & Drop**: Drag files directly from Finder into the device pane to copy them immediately.
   - **Automatic Media Indexing**: Broadcasts Android media scanner events so transferred photos and videos show up instantly in Google Photos and Gallery.
   - **Real-Time Live Screen Capture**: Take live screenshots of your connected Android phone right from the top navigation bar.

2. **💾 USB Flash Drives & External Drives**
   - Auto-detects all mounted USB drives and external volumes in `/Volumes`.
   - Displays real-time disk storage breakdown (Used vs. Free space).
   - Fast batch copying, moving, and deletion.

3. **📡 Wireless AirBridge (WebDrop)**
   - Scan dynamic **QR Code** with any iPhone, Android phone, iPad, or secondary Mac on the same Wi-Fi.
   - **Zero App Installation**: Instant browser-based drop zone to upload photos/videos directly into your Mac's `~/Downloads/MacFileBridge_Received` folder.

4. **⚡ Real-Time Transfer Engine**
   - WebSocket streaming progress bar.
   - Live speed calculation (MB/s) and estimated time remaining (ETA).
   - Active queue and history manager.

5. **🎨 Apple-Grade Sonoma / Sequoia Glassmorphic Interface**
   - Dark mode & Light mode support.
   - Built-in media previewer for Photos, Videos, Audio, Code, and Text files.
   - Category filtering (Photos, Videos, Audio, Documents, APKs).
   - Interactive troubleshooting assistant for enabling USB Debugging on Nothing OS, Samsung One UI, Xiaomi/MIUI, Pixel, and OnePlus.

---

## 🚀 Quick Start

### 1. Launch with One Click
Double-click `launch.command` directly from your Desktop or project directory.

### 2. Launch via Terminal
```bash
./start.sh
```
Or:
```bash
npm start
```
Then open: [http://localhost:54321](http://localhost:54321)

---

## 📱 Android USB Setup (One-time)
1. On your Android phone, go to **Settings > About phone** and tap **Build number** 7 times.
2. Go to **Settings > System > Developer options** and enable **USB debugging**.
3. Plug in the USB cable and tap **"Always allow from this computer"** when prompted on your phone.

---

## 📂 Project Structure
- `server/`
  - `server.js`: Central Express & WebSocket API server.
  - `adbManager.js`: High-speed ADB bridge controller.
  - `usbManager.js`: Mac volume and external drive watcher.
  - `networkManager.js`: Local Wi-Fi discovery and QR code engine.
  - `transferEngine.js`: Real-time transfer monitor and speed calculator.
- `public/`
  - `index.html`: Main desktop user interface.
  - `airbridge.html`: Mobile WebDrop portal.
  - `css/`: Glassmorphic styling & components.
  - `js/`: Explorer, transfer engine, previews, and app orchestrator.
- `launch.command`: Double-clickable macOS launcher.
- `start.sh`: Shell launcher.
