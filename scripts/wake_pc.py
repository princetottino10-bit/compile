# -*- coding: utf-8 -*-
"""Wake-on-LAN でPCを起こす。

起こしたいPCと同じLAN上の端末 (スマホの Termux / Raspberry Pi / 別のPC) から
実行する。マジックパケットはブロードキャストなので、外出先やクラウドからは
そのままでは届かない (ルータ側の転送設定が別途必要)。

    python scripts/wake_pc.py --setup                    # 対話式で設定する
    python scripts/wake_pc.py 3C:7C:3F:11:22:33          # MAC を直に指定
    python scripts/wake_pc.py 3C:7C:3F:11:22:33 \
        --save mypc --ip 192.168.1.20 --default          # 設定に保存
    python scripts/wake_pc.py                            # 既定のターゲットを起こす
    python scripts/wake_pc.py mypc --wait 120            # 起動するまで待つ
    python scripts/wake_pc.py --list                     # 保存済みを見る

設定の保存先は ~/.config/wake_pc.json (環境変数 WAKE_PC_CONFIG か --config で変更可)。
起こされる側のPCの設定は docs/wake-pc.md を参照 (Windows なら
scripts/wake_pc_setup.ps1 で大半を自動化できる)。
"""

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_PORTS = [9]
GLOBAL_BROADCAST = "255.255.255.255"


# ---------------------------------------------------------------- 設定ファイル

def config_path(explicit=None):
    if explicit:
        return Path(explicit).expanduser()
    env = os.environ.get("WAKE_PC_CONFIG")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".config" / "wake_pc.json"


def load_config(path):
    if not path.exists():
        return {"default": None, "targets": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        sys.exit("設定ファイルを読めません (%s): %s" % (path, exc))
    data.setdefault("default", None)
    data.setdefault("targets", {})
    return data


def save_config(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # SecureOn パスワードを書ける以上、他ユーザから読めないようにしておく
    try:
        path.chmod(0o600)
    except OSError:
        pass


# ---------------------------------------------------------------- マジックパケット

def parse_mac(text):
    """AA:BB:CC:DD:EE:FF / AA-BB-... / aabb.ccdd.eeff / 区切りなし を受ける。"""
    raw = re.sub(r"[\s:\-.]", "", text)
    if not re.fullmatch(r"[0-9A-Fa-f]{12}", raw):
        raise ValueError("MAC アドレスの形式が不正です: %s" % text)
    return bytes.fromhex(raw)


def looks_like_mac(text):
    try:
        parse_mac(text)
    except ValueError:
        return False
    return True


def format_mac(mac):
    return ":".join("%02X" % b for b in mac)


def parse_password(text):
    """SecureOn パスワード (4 または 6 バイトの16進)。未設定なら空。"""
    if not text:
        return b""
    raw = re.sub(r"[\s:\-.]", "", text)
    if not re.fullmatch(r"[0-9A-Fa-f]{8}([0-9A-Fa-f]{4})?", raw):
        raise ValueError("SecureOn パスワードは16進 8桁 か 12桁 で指定してください: %s" % text)
    return bytes.fromhex(raw)


def build_packet(mac, password=b""):
    """0xFF x6 + MAC x16 (+ SecureOn パスワード)。"""
    return b"\xff" * 6 + mac * 16 + password


# ---------------------------------------------------------------- 宛先

def local_broadcasts():
    """自分の IPv4 から /24 のブロードキャストアドレスを推定する。

    ルータによってはグローバルブロードキャスト (255.255.255.255) を
    落とすので、サブネット宛のアドレスも併せて投げる。
    """
    found = []
    for probe in ("8.8.8.8", "192.168.0.1"):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # UDP の connect は実際にはパケットを出さない (経路の確認だけ)
            sock.connect((probe, 9))
            ip = sock.getsockname()[0]
        except OSError:
            continue
        finally:
            sock.close()
        if ip.startswith("127."):
            continue
        addr = ip.rsplit(".", 1)[0] + ".255"
        if addr not in found:
            found.append(addr)
    return found


def dedupe(items):
    seen = []
    for item in items:
        if item and item not in seen:
            seen.append(item)
    return seen


def send_packet(packet, hosts, ports, repeat=3, interval=0.3, dry_run=False):
    """各宛先へ repeat 回ずつ投げる。届いた宛先数を返す。"""
    if dry_run:
        for host in hosts:
            for port in ports:
                print("  [dry-run] %s:%d へ %d バイト x%d" % (host, port, len(packet), repeat))
        print("  packet: %s..." % packet[:16].hex())
        return len(hosts) * len(ports)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    ok = 0
    try:
        for attempt in range(repeat):
            if attempt:
                time.sleep(interval)
            for host in hosts:
                for port in ports:
                    try:
                        sock.sendto(packet, (host, port))
                        if attempt == 0:
                            ok += 1
                            print("  送信: %s:%d" % (host, port))
                    except OSError as exc:
                        if attempt == 0:
                            print("  失敗: %s:%d (%s)" % (host, port, exc))
    finally:
        sock.close()
    return ok


# ---------------------------------------------------------------- 起動確認

def host_is_up(ip, check_port=None, timeout=1.0):
    if check_port:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            return sock.connect_ex((ip, check_port)) == 0
        except OSError:
            return False
        finally:
            sock.close()

    count = "-n" if sys.platform.startswith("win") else "-c"
    try:
        done = subprocess.run(
            ["ping", count, "1", ip],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=timeout + 4,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False
    return done.returncode == 0


def wait_for_host(ip, seconds, check_port=None):
    label = "%s:%d" % (ip, check_port) if check_port else ip
    print("%s が起きるのを最大 %d 秒待ちます..." % (label, seconds))
    deadline = time.time() + seconds
    while time.time() < deadline:
        if host_is_up(ip, check_port):
            print("起動を確認しました: %s" % label)
            return True
        time.sleep(2)
    print("時間内に応答がありませんでした: %s" % label)
    return False


# ---------------------------------------------------------------- MAC の自動判別

# 環境によって使えるものが違うので、上から順に試す
ARP_COMMANDS = [
    ["ip", "neigh", "show"],  # 最近の Linux
    ["arp", "-n"],            # Linux / Termux
    ["arp", "-a"],            # Windows / macOS
    ["arp"],                  # macOS
]


def parse_arp_output(text, ip):
    """ARP コマンドの出力から、その IP の行の MAC を取り出す。"""
    here = re.compile(r"(?<![\d.])%s(?![\d.])" % re.escape(ip))
    # macOS は 3c:7c:3f:1:22:33 のように先頭の 0 を落とすので 1桁も受ける
    mac_re = re.compile(r"(?<![0-9A-Fa-f:-])([0-9A-Fa-f]{1,2}(?:[:-][0-9A-Fa-f]{1,2}){5})(?![0-9A-Fa-f:-])")
    for line in text.splitlines():
        if not here.search(line):
            continue
        found = mac_re.search(line)
        if not found:
            continue
        octets = re.split(r"[:-]", found.group(1))
        mac = ":".join("%02X" % int(o, 16) for o in octets)
        if mac in ("00:00:00:00:00:00", "FF:FF:FF:FF:FF:FF"):
            continue  # incomplete / ブロードキャストの行
        return mac
    return None


def arp_lookup(ip):
    """今つながっている相手の MAC を ARP テーブルから引く。無ければ None。"""
    host_is_up(ip)  # テーブルに載せるための ping。失敗しても続ける
    for base in ARP_COMMANDS:
        try:
            done = subprocess.run(
                base + [ip], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                universal_newlines=True, errors="replace", timeout=5,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        mac = parse_arp_output(done.stdout or "", ip)
        if mac:
            return mac
    return None


# ---------------------------------------------------------------- サブコマンド

def ask(label, default=None):
    suffix = " [%s]" % default if default else ""
    try:
        answer = input("%s%s: " % (label, suffix)).strip()
    except EOFError:
        answer = ""
    return answer or (default or "")


def cmd_setup(cfg, path):
    """対話式でターゲットを1つ作って保存する。"""
    if not sys.stdin.isatty():
        print("--setup は対話式です。端末から実行するか、--save を使ってください。", file=sys.stderr)
        return 1

    print("Wake-on-LAN の設定をします。")
    print("起こしたいPCは、いまは電源を入れて同じLANに繋いでおいてください (MAC を自動で拾います)。")
    print("PC側のBIOS/NICの設定がまだなら docs/wake-pc.md を先に読んでください。")
    print()

    name = ask("この設定の名前", "mypc")
    if name in (cfg.get("targets") or {}):
        if ask("%s は既にあります。上書きしますか? (y/N)" % name, "N").lower() not in ("y", "yes"):
            print("やめました。")
            return 1

    ip = ask("そのPCのIPアドレス (分かれば。空欄可)")
    guess = None
    if ip:
        print("  %s の MAC を調べています..." % ip)
        guess = arp_lookup(ip)
        print("  見つかりました: %s" % guess if guess else "  分かりませんでした。MAC を手で入れてください。")

    while True:
        text = ask("MAC アドレス", guess)
        if not text:
            print("  MAC アドレスは省略できません。")
            continue
        try:
            mac = parse_mac(text)
            break
        except ValueError as exc:
            print("  %s" % exc)

    entry = {"mac": format_mac(mac)}
    if ip:
        entry["ip"] = ip

    hint = ", ".join(local_broadcasts()) or "推定できませんでした"
    bcast = ask("ブロードキャストアドレス (空欄なら自動: %s)" % hint)
    if bcast:
        entry["broadcast"] = bcast

    if ip:
        port = ask("起動確認に使う TCP ポート (空欄なら ping で確認)")
        if port:
            try:
                entry["check_port"] = int(port)
            except ValueError:
                print("  ポート番号として読めないので、ping で確認します: %s" % port)

    cfg.setdefault("targets", {})[name] = entry
    if not cfg.get("default") or ask("既定のターゲットにしますか? (Y/n)", "Y").lower() in ("y", "yes"):
        cfg["default"] = name
    save_config(path, cfg)

    print()
    print("保存しました: %s" % path)
    print("これから起こすときは:")
    print("    python scripts/wake_pc.py" + ("" if cfg.get("default") == name else " " + name))
    if ip:
        print("    python scripts/wake_pc.py %s --wait 120   # 起動を待つ" % name)
    return 0


def cmd_list(cfg, path):
    targets = cfg.get("targets") or {}
    if not targets:
        print("保存済みのターゲットはありません (%s)" % path)
        return 0
    print("設定: %s" % path)
    for name, entry in sorted(targets.items()):
        mark = " *" if name == cfg.get("default") else "  "
        detail = [entry.get("mac", "?")]
        if entry.get("ip"):
            detail.append("ip=%s" % entry["ip"])
        if entry.get("broadcast"):
            detail.append("broadcast=%s" % entry["broadcast"])
        if entry.get("port"):
            detail.append("port=%s" % entry["port"])
        if entry.get("check_port"):
            detail.append("check_port=%s" % entry["check_port"])
        print("%s %-12s %s" % (mark, name, " ".join(detail)))
    if cfg.get("default"):
        print("(* は既定のターゲット)")
    return 0


def cmd_delete(cfg, path, name):
    targets = cfg.get("targets") or {}
    if name not in targets:
        print("そのターゲットはありません: %s" % name, file=sys.stderr)
        return 1
    del targets[name]
    if cfg.get("default") == name:
        cfg["default"] = None
    save_config(path, cfg)
    print("削除しました: %s" % name)
    return 0


def resolve_target(args, cfg):
    """コマンドラインと設定から、実際に使うターゲットを組み立てる。"""
    entry = {}
    name = None

    if args.target and looks_like_mac(args.target):
        entry["mac"] = args.target
    elif args.target:
        name = args.target
        entry = dict((cfg.get("targets") or {}).get(name) or {})
        if not entry:
            known = ", ".join(sorted((cfg.get("targets") or {}).keys())) or "(なし)"
            sys.exit("ターゲットが見つかりません: %s\n保存済み: %s" % (name, known))
    else:
        name = cfg.get("default")
        if not name:
            sys.exit(
                "起こす相手が分かりません。MAC アドレスを渡すか、\n"
                "  python scripts/wake_pc.py <MAC> --save mypc --default\n"
                "で先に保存してください。"
            )
        entry = dict((cfg.get("targets") or {}).get(name) or {})
        if not entry:
            sys.exit("既定のターゲット %s の設定が壊れています。--list で確認してください。" % name)

    # コマンドラインの指定が常に優先
    if args.ip:
        entry["ip"] = args.ip
    if args.broadcast:
        entry["broadcast"] = args.broadcast
    if args.port:
        entry["port"] = args.port
    if args.password is not None:
        entry["password"] = args.password
    if args.check_port:
        entry["check_port"] = args.check_port
    return name, entry


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Wake-on-LAN でPCを起こす (同じLAN上の端末から実行する)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="PC側の事前設定は docs/wake-pc.md を参照。",
    )
    parser.add_argument("target", nargs="?", help="保存済みの名前、または MAC アドレス")
    parser.add_argument("--ip", help="そのPCの固定IP (起動確認と、ユニキャスト送信に使う)")
    parser.add_argument("--broadcast", help="ブロードキャストアドレス (例 192.168.1.255)")
    parser.add_argument("--port", type=int, action="append", help="送信先ポート (既定 9、複数指定可)")
    parser.add_argument("--password", help="SecureOn パスワード (16進 8桁か12桁)")
    parser.add_argument("--repeat", type=int, default=3, help="送信回数 (既定 3)")
    parser.add_argument("--interval", type=float, default=0.3, help="送信間隔の秒数 (既定 0.3)")
    parser.add_argument("--wait", type=int, metavar="SEC", help="起動するまで最大この秒数待つ")
    parser.add_argument("--check-port", type=int, help="起動確認に使う TCP ポート (既定は ping)")
    parser.add_argument("--save", metavar="NAME", help="この設定を名前を付けて保存する")
    parser.add_argument("--default", action="store_true", help="--save と併せて、既定のターゲットにする")
    parser.add_argument("--delete", metavar="NAME", help="保存済みのターゲットを削除する")
    parser.add_argument("--list", action="store_true", help="保存済みのターゲットを一覧する")
    parser.add_argument("--setup", action="store_true", help="対話式で設定する (MAC は可能なら自動判別)")
    parser.add_argument("--dry-run", action="store_true", help="実際には送らず、宛先だけ表示する")
    parser.add_argument("--config", help="設定ファイルのパス")
    args = parser.parse_args(argv)

    path = config_path(args.config)
    cfg = load_config(path)

    if args.setup:
        return cmd_setup(cfg, path)
    if args.list:
        return cmd_list(cfg, path)
    if args.delete:
        return cmd_delete(cfg, path, args.delete)

    name, entry = resolve_target(args, cfg)

    try:
        mac = parse_mac(entry.get("mac", ""))
        password = parse_password(entry.get("password"))
    except ValueError as exc:
        sys.exit(str(exc))

    if args.save:
        saved = {"mac": format_mac(mac)}
        for key in ("ip", "broadcast", "port", "check_port", "password"):
            if entry.get(key):
                saved[key] = entry[key]
        cfg.setdefault("targets", {})[args.save] = saved
        if args.default or not cfg.get("default"):
            cfg["default"] = args.save
        save_config(path, cfg)
        print("保存しました: %s -> %s (%s)" % (args.save, saved["mac"], path))
        name = args.save

    ports = entry.get("port") or DEFAULT_PORTS
    if isinstance(ports, int):
        ports = [ports]
    hosts = dedupe([entry.get("broadcast")] + local_broadcasts() + [GLOBAL_BROADCAST, entry.get("ip")])

    label = "%s (%s)" % (name, format_mac(mac)) if name else format_mac(mac)
    print("起こします: %s" % label)
    packet = build_packet(mac, password)
    if not send_packet(packet, hosts, ports, args.repeat, args.interval, args.dry_run):
        print("どの宛先にも送れませんでした。ネットワークを確認してください。", file=sys.stderr)
        return 1

    if args.wait:
        ip = entry.get("ip")
        if not ip:
            print("--wait には --ip が必要です (起動を確認する相手が分からないため)。", file=sys.stderr)
            return 1
        if not wait_for_host(ip, args.wait, entry.get("check_port")):
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
