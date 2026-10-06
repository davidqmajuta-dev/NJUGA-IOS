$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required. Install Node.js, then rerun this script."
  exit 1
}

npm install
npx cap add android
npx cap sync android
npx cap open android
