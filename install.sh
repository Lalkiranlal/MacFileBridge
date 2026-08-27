#!/bin/bash
set -e

echo "=================================================="
echo "🚀 Installing MacFileBridge for macOS..."
echo "=================================================="

APP_DEST="/Applications/MacFileBridge.app"
DOWNLOAD_URL="https://github.com/Lalkiranlal/MacFileBridge/releases/latest/download/MacFileBridge-1.0.0-arm64.dmg"
TEMP_DMG="/tmp/MacFileBridge-installer.dmg"
MOUNT_DIR="/tmp/MacFileBridge-Mount"

# 1. Download DMG
echo "📥 Downloading latest MacFileBridge..."
curl -L -o "$TEMP_DMG" "$DOWNLOAD_URL" --progress-bar

# 2. Mount DMG
echo "📦 Extracting installer..."
mkdir -p "$MOUNT_DIR"
hdiutil attach "$TEMP_DMG" -mountpoint "$MOUNT_DIR" -nobrowse -quiet

# 3. Copy to Applications
echo "📂 Installing to /Applications..."
rm -rf "$APP_DEST"
cp -R "$MOUNT_DIR/MacFileBridge.app" "$APP_DEST"

# 4. Unmount and Clean
hdiutil detach "$MOUNT_DIR" -quiet || true
rm -rf "$TEMP_DMG" "$MOUNT_DIR"

# 5. Remove Quarantine Flags (Eliminates "Damaged" or "Unidentified Developer" prompt)
echo "🔓 Authorizing app permissions..."
xattr -cr "$APP_DEST" || true

# 6. Create Desktop Shortcut
DESKTOP_LINK="$HOME/Desktop/MacFileBridge"
rm -f "$DESKTOP_LINK"
ln -s "$APP_DEST" "$DESKTOP_LINK" || true

echo ""
echo "=================================================="
echo "✅ Installation Complete!"
echo "🎉 MacFileBridge is now in your Applications folder and on your Desktop."
echo "🚀 Launching MacFileBridge..."
echo "=================================================="

open "$APP_DEST"
