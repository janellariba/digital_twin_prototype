# Starts the three lab camera nodes, each in its own PowerShell window (separate processes).
# Run from the camera_node folder:   .\start_lab_nodes.ps1
# Close a window (or press Ctrl+C in it) to stop that camera only.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
foreach ($cam in @("LAB-A", "LAB-B", "LAB-C")) {
    $cmd = "Set-Location '$here'; .\.venv\Scripts\Activate.ps1; `$host.UI.RawUI.WindowTitle = '$cam'; python -m node --config config/$cam.json"
    Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $cmd
}
