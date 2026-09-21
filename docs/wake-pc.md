# Wake-on-LAN でPCを起こす

起こしたいPCと同じLANにいる端末 (スマホの Termux / Raspberry Pi / 別のPC) から
`scripts/wake_pc.py` を実行して、マジックパケットを投げます。
Python 3 の標準ライブラリだけで動くので、追加インストールは要りません。

設定は2か所あります。

| どこ | 何を | やり方 |
| --- | --- | --- |
| 起こされる側のPC | BIOS/UEFI、NIC、高速スタートアップ | `scripts/wake_pc_setup.ps1` (BIOS 以外は自動) |
| 送信する側の端末 | 相手の MAC・IP を覚えさせる | `python scripts/wake_pc.py --setup` |

送信側が iPhone の場合はこのスクリプトを直接は使えないことがあります。「[iPhone から起こす](#iphone-から起こす)」を読んでください。

## 1. 起こされる側のPCの設定

これをやっていないとパケットを投げても起きません。Windows なら、管理者権限の
PowerShell を開いて、リポジトリのルートで次を実行すると、下の 2 と 3 が自動で入り、
5 の MAC アドレスも表示されます。

```powershell
powershell -ExecutionPolicy Bypass -File scripts\wake_pc_setup.ps1

# 何も変えずに、やろうとしている内容だけ見る
powershell -ExecutionPolicy Bypass -File scripts\wake_pc_setup.ps1 -WhatIf

# 有線アダプタが複数あるときは名前で指定する
powershell -ExecutionPolicy Bypass -File scripts\wake_pc_setup.ps1 -Name "イーサネット"
```

最後に、送信側で叩くコマンド (MAC と IP 入り) が表示されるので、それを控えます。
**1 の BIOS/UEFI だけはスクリプトから変えられない**ので手で設定してください。

手でやる場合、または Windows 以外の場合:

1. **BIOS/UEFI** — `Wake on LAN` / `Power On By PCI-E` / `Resume by LAN` などの
   項目を有効にする。名前はメーカーによって違います。
2. **NIC のドライバ** — Windows のデバイスマネージャーでネットワークアダプタを開き、
   - 「詳細設定」で `Wake on Magic Packet` を有効
   - 「電源の管理」で *このデバイスで、コンピューターのスタンバイ状態を解除できるようにする*
     と *Magic Packet でのみ、コンピューターのスタンバイ状態を解除できるようにする* にチェック
3. **高速スタートアップを切る** — Windows の「電源オプション > 電源ボタンの動作を選択する」
   から *高速スタートアップを有効にする* のチェックを外す。これが入っていると
   シャットダウン状態から起きません (スリープ/休止からは起きます)。
4. **有線で繋ぐ** — Wi-Fi の WoL (WoWLAN) は対応していない機器が多く、対応していても
   省電力設定で無効になりがちです。確実なのは有線LANです。
5. **MAC アドレスを控える** — `ipconfig /all` の「物理アドレス」、または
   `getmac /v` で有線アダプタのものを見ます。

## 2. 送信する側の端末の設定

対話式で聞いていくので、これを一度やれば以降は引数なしで起こせます。
**起こしたいPCの電源を入れた状態で**実行すると、IP を答えるだけで MAC を
ARP テーブルから拾ってくれます。

```sh
python scripts/wake_pc.py --setup
```

聞かれるのは、設定の名前 / 相手の IP / MAC / ブロードキャストアドレス /
起動確認に使うポート の5つです。必須なのは MAC だけで、あとは空欄で構いません。
保存先は `~/.config/wake_pc.json` です。

手で指定するなら:

```sh
python scripts/wake_pc.py 3C:7C:3F:11:22:33 --save mypc --ip 192.168.1.20 --default
```

## 使い方

```sh

# 既定のターゲットを起こす
python scripts/wake_pc.py

# 名前を指定して起こし、繋がるまで待つ
python scripts/wake_pc.py mypc --wait 120

# 保存済みを見る / 消す
python scripts/wake_pc.py --list
python scripts/wake_pc.py --delete mypc
```

主なオプション:

| オプション | 説明 |
| --- | --- |
| `--broadcast 192.168.1.255` | ブロードキャストアドレスを明示する (自動推定が外れるとき) |
| `--port 9 --port 7` | 送信先ポート。既定は 9。機器によっては 7 |
| `--password 11:22:33:44:55:66` | SecureOn パスワード。設定している NIC のみ |
| `--repeat 5 --interval 0.5` | 取りこぼし対策に回数と間隔を増やす |
| `--wait 120 --check-port 3389` | 起動確認を ping ではなく TCP 接続で行う |
| `--dry-run` | 送らずに宛先だけ表示する |

設定は `~/.config/wake_pc.json` に保存されます。`--config` か環境変数
`WAKE_PC_CONFIG` で場所を変えられます (このリポジトリには入れないでください)。

## iPhone から起こす

iOS はアプリの外から UDP ブロードキャストを投げるのが難しく、Python を動かせる
a-Shell にも `wol` コマンドがありますが、**パケットが出ないという報告が未解決のまま
残っています** ([a-shell#840](https://github.com/holzschu/a-shell/issues/840))。
そのため iPhone を送信側にするなら、次の順で検討します。

### A. 家に常時起動の機器がある場合 (おすすめ)

Raspberry Pi・NAS・Mac・OpenWrt のルータなど、つけっぱなしの機器が同じLANにあるなら、
そこに `wake_pc.py` を置いて、iPhone からは SSH で叩くのが一番確実です。

ショートカットApp の **「SSHでスクリプトを実行」** アクションが使えるので、
ショートカット名を「PC起こして」にしておけば Siri から呼べます。

```
ホスト : 192.168.1.10      (常時起動の機器のIP)
ポート : 22
ユーザ : pi
認証   : パスワード または SSH 鍵
コマンド: python3 ~/compile/scripts/wake_pc.py mypc
```

Termius などの SSH クライアントアプリから手で叩いても同じです。

なお NAS やルータ自体に WoL 機能が付いていることがあります
(Synology DSM、OpenWrt、ASUS のルータなど)。付いているならそれが一番簡単です。

### B. 常時起動の機器が無い場合

App Store の Wake-on-LAN アプリを使います。MAC アドレスとブロードキャストアドレスを
入れるだけで、多くはショートカットApp にも対応しているので Siri から呼べます。

この場合 `wake_pc.py` は出番がありませんが、**起こされる側のPCの設定
(`wake_pc_setup.ps1` と BIOS) はそのまま必要**です。アプリに入れる MAC は、
`wake_pc_setup.ps1` が最後に表示するものを使ってください。

### C. a-Shell で試す (無料、ダメ元)

a-Shell に `wake_pc.py` を取り込んで `python3 wake_pc.py --setup` から普通に使えます。
初回に「ローカルネットワーク上のデバイスへのアクセス」を許可してください。
`--dry-run` を外して送っても PC が起きないなら、上の A か B に切り替えます。

## 起きないとき

- `--dry-run` で宛先を確認する。推定されたブロードキャストが実際のサブネットと
  違うなら `--broadcast` で明示する。
- スリープからは起きるのにシャットダウンからは起きない → 高速スタートアップが有効。
- 一度起こしてから長時間経つと起きない → ルータの ARP キャッシュが消えると
  ユニキャストが届きません。ブロードキャスト送信ができているか確認する。
- スマホの Termux から実行する場合、Wi-Fi が同じLANに繋がっていることを確認する。
  モバイル回線からは届きません。
- `wake_pc_setup.ps1` を実行したあとも起きない → BIOS/UEFI の Wake on LAN が
  まだ無効な可能性が高いです。スクリプト末尾の `powercfg /devicequery wake_armed`
  の出力に、そのネットワークアダプタが載っているかも確認してください。

## 外出先から起こす

LAN の外からは、次のどちらかが必要です。

- ルータで VPN (WireGuard など) を張り、VPN 経由で同じスクリプトを実行する。**推奨**
- ルータの UDP 9番を、サブネットのブロードキャストアドレスへ転送する設定を入れる
  (対応していない機種が多く、開けたポートは外から叩かれます)。

常時起動している Raspberry Pi などが家にあるなら、そこへ SSH して
このスクリプトを叩くのが一番簡単で安全です。
