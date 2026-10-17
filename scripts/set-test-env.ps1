# Writes the four variables that scripts/verify-supabase.mjs needs into .env, for a DEDICATED, DISPOSABLE
# Supabase TEST project. Run it yourself in your own PowerShell window; nothing is sent anywhere.
#
#   powershell -ExecutionPolicy Bypass -File scripts\set-test-env.ps1
#
# It asks for the project URL, then the public anon/publishable key (typing is masked and never echoed), then
# an explicit confirmation. The project ref is taken from the URL, so it cannot disagree with it. It refuses a
# service-role or secret key, never prints the key, and will not overwrite a .env you have already filled in
# unless you pass -Force. Parameters exist so the script can be tested; normal use needs none.
[CmdletBinding()]
param(
  [string]$Path = (Join-Path (Split-Path $PSScriptRoot -Parent) '.env'),
  [string]$Url,
  [securestring]$AnonKey,
  [switch]$ConfirmTest,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
function Fail($message) { Write-Host "Not written: $message" -ForegroundColor Red; exit 2 }

if (-not $Url) { $Url = (Read-Host 'Test project URL (https://<project-ref>.supabase.co)').Trim() }
$match = [regex]::Match($Url, '^https://([a-z0-9]{20})\.supabase\.co/?$')
if (-not $match.Success) { Fail 'the URL must look like https://<20-character-ref>.supabase.co (local and custom domains are not accepted).' }
$ref = $match.Groups[1].Value

if (-not $AnonKey) { $AnonKey = Read-Host 'Public anon / publishable key (input is hidden)' -AsSecureString }
$key = ([System.Net.NetworkCredential]::new('', $AnonKey)).Password.Trim()
if (-not $key) { Fail 'no key was entered.' }
if ($key -match '^sb_secret_') { Fail 'that is a secret key. Use the public anon / publishable key only.' }
$parts = $key.Split('.')
if ($parts.Count -eq 3) {
  try {
    $payload = $parts[1].Replace('-', '+').Replace('_', '/')
    $payload = $payload.PadRight($payload.Length + (4 - $payload.Length % 4) % 4, '=')
    $role = ([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json).role
    if ($role -eq 'service_role') { Fail 'that is a service-role key. Use the public anon / publishable key only.' }
  } catch { }
}

if (-not $ConfirmTest) {
  Write-Host 'This writes a verification setup for the project above. Only continue for a DISPOSABLE TEST project, never production.'
  if ((Read-Host 'Type YES to confirm this is a disposable test project') -ne 'YES') { Fail 'not confirmed.' }
}

if ((Test-Path $Path) -and -not $Force) {
  $existing = Get-Content -Raw -Path $Path
  if ($existing -match '(?m)^(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)=(?!.*(your-|example))\S+') {
    Fail "$Path already contains real values. Nothing was changed. Re-run with -Force to replace it."
  }
}

$text = @"
# Local settings for the dedicated TEST Supabase project (git-ignored; never commit this file).
# Both VITE_ values are PUBLIC. Never put a service-role / secret key or a password in a VITE_ variable.
VITE_SUPABASE_URL=https://$ref.supabase.co
VITE_SUPABASE_ANON_KEY=$key

# Only for scripts/verify-supabase.mjs. Not VITE_ variables, so never bundled. Disposable TEST project only.
ARCLOOP_TEST_PROJECT_REF=$ref
ARCLOOP_CONFIRM_TEST_PROJECT=yes
"@
# UTF-8 without a byte-order mark, so the first line is read correctly by node --env-file.
[System.IO.File]::WriteAllText($Path, $text.Replace("`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))
$key = $null; $text = $null
Write-Host "Saved $Path (4 variables set; values not shown)." -ForegroundColor Green
Write-Host 'Next: node --env-file=.env scripts/verify-supabase.mjs --preflight'
