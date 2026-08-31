Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public class Win32Helper {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
  }
"@

$proc = Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = '💎 OCTAVA REAL-TIME CORNER LIVE MONITOR (ATLAS CLOUD)'; cd 'c:\dev\octava\octava-backend'; node scripts/corner_live_monitor.js" -PassThru

Start-Sleep -Milliseconds 1200

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$width = [Math]::Min(1020, [int]($screen.Width * 0.55))
$height = [Math]::Min(750, [int]($screen.Height * 0.90))
$x = $screen.Width - $width - 10
$y = 10

if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
  [Win32Helper]::SetWindowPos($proc.MainWindowHandle, [IntPtr]::Zero, $x, $y, $width, $height, 0x0040)
  [Win32Helper]::SetForegroundWindow($proc.MainWindowHandle)
}
