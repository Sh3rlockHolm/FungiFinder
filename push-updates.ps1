param(
  [string]$Message = "Update FungiFinder"
)

$ErrorActionPreference = "Stop"

$RepoPath = "C:\Users\holmr\OneDrive\Desktop\FungiFinder"
Set-Location -Path $RepoPath

try {
  Write-Host "Repo folder: $RepoPath"

  git status
  git add .
  git commit -m $Message
  git push origin main

  Write-Host ""
  Write-Host "Done. GitHub Pages deploy workflow should run automatically." -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "ERROR:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}
finally {
  Write-Host ""
cmd /c pause
  Read-Host "Press Enter to close"
}