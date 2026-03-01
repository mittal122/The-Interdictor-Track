# Generate self-signed SSL/TLS certificates for local development
# Usage: powershell scripts/generate-certs.ps1

$certsDir = Join-Path $PSScriptRoot ".." "certs"

if (-Not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir -Force | Out-Null
    Write-Host "Created certs/ directory." -ForegroundColor Green
}

$certFile = Join-Path $certsDir "cert.pem"
$keyFile = Join-Path $certsDir "key.pem"

if ((Test-Path $certFile) -and (Test-Path $keyFile)) {
    Write-Host "Certificates already exist in certs/. Delete them first to regenerate." -ForegroundColor Yellow
    exit 0
}

Write-Host "Generating self-signed SSL certificate for localhost..." -ForegroundColor Cyan

try {
    openssl req -x509 -newkey rsa:2048 `
        -keyout $keyFile `
        -out $certFile `
        -days 365 `
        -nodes `
        -subj "/CN=localhost/O=Interdictor/C=US"

    Write-Host ""
    Write-Host "SSL certificates generated successfully!" -ForegroundColor Green
    Write-Host "  Certificate: certs/cert.pem" -ForegroundColor Gray
    Write-Host "  Private Key: certs/key.pem" -ForegroundColor Gray
    Write-Host ""
    Write-Host "WARNING: These are self-signed certs for LOCAL DEV ONLY." -ForegroundColor Yellow
    Write-Host "For production, use certificates from a trusted CA." -ForegroundColor Yellow
} catch {
    Write-Host "ERROR: OpenSSL not found. Install OpenSSL and add it to PATH." -ForegroundColor Red
    Write-Host "  Download: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Gray
    exit 1
}
