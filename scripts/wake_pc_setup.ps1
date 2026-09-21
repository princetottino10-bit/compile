<#
.SYNOPSIS
    起こされる側の Windows PC に Wake-on-LAN の設定を入れる。

.DESCRIPTION
    起こされる側のPC上で、管理者権限の PowerShell から実行する。

      - 有線LANアダプタの「マジックパケットで起動」を有効にする
      - リンク切断時にアダプタを眠らせる設定を切る
      - 省電力イーサネット (EEE / Green Ethernet) があれば切る
      - 高速スタートアップを無効にする (シャットダウン状態からも起きるようにする)
      - 最後に、送信側の端末で叩くコマンドを表示する

    BIOS/UEFI の Wake on LAN だけは、ここからは変えられないので手で有効にする。
    送信側は scripts/wake_pc.py を使う。詳しくは docs/wake-pc.md。

.PARAMETER Name
    対象のネットワークアダプタ名。省略すると、繋がっている有線アダプタを自動で選ぶ。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\wake_pc_setup.ps1

.EXAMPLE
    .\wake_pc_setup.ps1 -Name "イーサネット" -WhatIf
    何も変えずに、やろうとしている内容だけを表示する。
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Name
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host "== $Text" -ForegroundColor Cyan
}

function Write-Done {
    param([string]$Text)
    Write-Host "   OK   $Text" -ForegroundColor Green
}

function Write-Miss {
    param([string]$Text)
    Write-Host "   --   $Text" -ForegroundColor Yellow
}

function Write-Adapters {
    Write-Host "   使えるアダプタ:"
    foreach ($item in Get-NetAdapter) {
        Write-Host ("     {0}  [{1}]  {2}  {3}" -f $item.Name, $item.Status, $item.MediaType, $item.MacAddress)
    }
}

# ---------------------------------------------------------------- 前提の確認

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "管理者権限の PowerShell で実行してください。" -ForegroundColor Red
    Write-Host "  スタートメニューで PowerShell を右クリック > 管理者として実行" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------- アダプタを選ぶ

Write-Step "ネットワークアダプタを選ぶ"
if ($Name) {
    try {
        $adapter = Get-NetAdapter -Name $Name -ErrorAction Stop
    } catch {
        Write-Host "アダプタが見つかりません: $Name" -ForegroundColor Red
        Write-Adapters
        exit 1
    }
} else {
    $wired = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" -and $_.MediaType -ne "Native 802.11" })
    $adapter = $wired | Select-Object -First 1
    if (-not $adapter) {
        Write-Host "繋がっている有線アダプタが見つかりません。-Name でアダプタ名を指定してください。" -ForegroundColor Red
        Write-Adapters
        exit 1
    }
    if ($wired.Count -gt 1) {
        Write-Miss "候補が $($wired.Count) 個あります。違うアダプタなら -Name で指定し直してください。"
    }
}
Write-Done "$($adapter.Name) - $($adapter.InterfaceDescription)"
if ($adapter.MediaType -eq "Native 802.11") {
    Write-Miss "Wi-Fi アダプタです。WoL は有線の方が確実に動きます。"
}

# ---------------------------------------------------------------- マジックパケット

Write-Step "マジックパケットでの起動を有効にする"
if ($PSCmdlet.ShouldProcess($adapter.Name, "WakeOnMagicPacket を有効にする")) {
    try {
        Set-NetAdapterPowerManagement -Name $adapter.Name -WakeOnMagicPacket Enabled -ErrorAction Stop
        Write-Done "WakeOnMagicPacket = Enabled"
    } catch {
        Write-Miss "電源管理から設定できませんでした: $($_.Exception.Message)"
    }

    # ドライバ側の詳細設定にも同じ項目があることが多いので、あれば揃えておく
    $magic = Get-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "*WakeOnMagicPacket" -ErrorAction SilentlyContinue
    if ($magic) {
        try {
            Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword "*WakeOnMagicPacket" -RegistryValue 1 -ErrorAction Stop
            Write-Done "ドライバ設定 *WakeOnMagicPacket = 1"
        } catch {
            Write-Miss "ドライバ設定を変えられませんでした: $($_.Exception.Message)"
        }
    }
}

Write-Step "リンクが切れてもアダプタを眠らせない"
if ($PSCmdlet.ShouldProcess($adapter.Name, "DeviceSleepOnDisconnect を無効にする")) {
    try {
        Set-NetAdapterPowerManagement -Name $adapter.Name -DeviceSleepOnDisconnect Disabled -ErrorAction Stop
        Write-Done "DeviceSleepOnDisconnect = Disabled"
    } catch {
        Write-Miss "このアダプタは対応していません (問題ありません)"
    }
}

Write-Step "省電力イーサネット (EEE / Green Ethernet) を切る"
$greenKeywords = @("*EEE", "EnableGreenEthernet", "GreenEthernet", "AdvancedEEE", "EnableEEE", "EnergyEfficientEthernet")
$greenFound = $false
foreach ($keyword in $greenKeywords) {
    $prop = Get-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword $keyword -ErrorAction SilentlyContinue
    if (-not $prop) { continue }
    $greenFound = $true
    if ($PSCmdlet.ShouldProcess($adapter.Name, "$keyword を無効にする")) {
        try {
            Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword $keyword -RegistryValue 0 -ErrorAction Stop
            Write-Done "$keyword = 0"
        } catch {
            Write-Miss "$keyword を変えられませんでした: $($_.Exception.Message)"
        }
    }
}
if (-not $greenFound) {
    Write-Miss "該当する項目はありませんでした (問題ありません)"
}

# ---------------------------------------------------------------- 高速スタートアップ

Write-Step "高速スタートアップを無効にする"
$powerKey = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power"
$hiberboot = (Get-ItemProperty -Path $powerKey -Name "HiberbootEnabled" -ErrorAction SilentlyContinue).HiberbootEnabled
if ($hiberboot -eq 0) {
    Write-Done "既に無効です"
} elseif ($PSCmdlet.ShouldProcess("HiberbootEnabled", "0 にする")) {
    try {
        Set-ItemProperty -Path $powerKey -Name "HiberbootEnabled" -Value 0 -Type DWord -ErrorAction Stop
        Write-Done "無効にしました (シャットダウン状態からも起きるようになります)"
    } catch {
        Write-Miss "変更できませんでした: $($_.Exception.Message)"
    }
}

# ---------------------------------------------------------------- 確認

Write-Step "いまの状態"
try {
    $power = Get-NetAdapterPowerManagement -Name $adapter.Name -ErrorAction Stop
    Write-Host ("   WakeOnMagicPacket       : {0}" -f $power.WakeOnMagicPacket)
    Write-Host ("   WakeOnPattern           : {0}" -f $power.WakeOnPattern)
    Write-Host ("   DeviceSleepOnDisconnect : {0}" -f $power.DeviceSleepOnDisconnect)
} catch {
    Write-Miss "電源管理の状態を読めませんでした: $($_.Exception.Message)"
}
Write-Host "スリープ解除を許可されているデバイス:"
powercfg /devicequery wake_armed

# ---------------------------------------------------------------- 送信側のコマンド

$mac = $adapter.MacAddress -replace "-", ":"
$ip = (Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notlike "169.254.*" } |
       Select-Object -First 1).IPAddress

Write-Step "送信側の端末 (スマホ / Raspberry Pi / 別PC) で実行するコマンド"
Write-Host ""
if ($ip) {
    Write-Host "    python scripts/wake_pc.py $mac --save mypc --ip $ip --default"
} else {
    Write-Host "    python scripts/wake_pc.py $mac --save mypc --default"
}
Write-Host ""
Write-Host "残っている作業:" -ForegroundColor Yellow
Write-Host "  1. BIOS/UEFI の Wake on LAN (Power On By PCI-E / Resume by LAN 等) を有効にする。"
Write-Host "     ここからは変えられないので、再起動して手で設定してください。"
if ($ip) {
    Write-Host "  2. $ip は DHCP だと変わります。ルータで固定するか DHCP 予約を入れてください。"
    Write-Host "  3. 一度シャットダウンして、送信側から起こせるか試してください。"
} else {
    Write-Host "  2. 一度シャットダウンして、送信側から起こせるか試してください。"
}
