#!/usr/bin/env bash
# Prepare the Android platform folder for `flutter build apk`.
#
# Hand-written Gradle wrappers are fragile, so this script lets the installed
# Flutter SDK generate android/ for its own version and then applies the
# permissions and SDK levels this app needs (microphone, sockets, cleartext
# HTTP for local development only).
#
# Usage:  cd flutter_app && tool/android_setup.sh [api_base_url]
set -euo pipefail

API_BASE_URL="${1:-http://10.0.2.2:8000}"

cd "$(dirname "$0")/.."

if ! command -v flutter >/dev/null 2>&1; then
  echo "Flutter SDK not found. Install it from https://docs.flutter.dev/get-started/install" >&2
  exit 1
fi

echo "→ generating the android/ folder for the installed Flutter version"
flutter create --platforms=android --project-name ton_voice .

MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  echo "→ adding microphone, network and audio permissions"
  python3 - "$MANIFEST" <<'PY'
import sys

path = sys.argv[1]
xml = open(path, encoding="utf-8").read()
permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
]
missing = [item for item in permissions if item not in xml]
if missing:
    closing = xml.index(">", xml.index("<manifest")) + 1
    xml = xml[:closing] + "\n    " + "\n    ".join(missing) + xml[closing:]
if "android:usesCleartextTraffic" not in xml:
    # Development only: the local API is plain HTTP. Production uses HTTPS.
    xml = xml.replace("<application", '<application\n        android:usesCleartextTraffic="true"', 1)
open(path, "w", encoding="utf-8").write(xml)
print("   manifest updated")
PY
fi

for GRADLE in android/app/build.gradle android/app/build.gradle.kts; do
  [ -f "$GRADLE" ] || continue
  echo "→ pinning minSdk 24 (flutter_webrtc requirement)"
  python3 - "$GRADLE" <<'PY'
import re
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()
replacement = "minSdk = 24" if path.endswith(".kts") else "minSdk 24"
text = re.sub(r"minSdkVersion\s+\w+|minSdk\s*=?\s*\w+", replacement, text, count=1)
open(path, "w", encoding="utf-8").write(text)
print("   minSdk set to 24")
PY
done

cat <<EOF

Done. Build the APK with:

  flutter pub get
  flutter build apk --release --dart-define=API_BASE_URL=$API_BASE_URL

Output: build/app/outputs/flutter-apk/app-release.apk
EOF
