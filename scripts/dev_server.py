"""開発用の静的サーバ。

標準の ``python -m http.server`` はキャッシュ制御を付けないため、
ES モジュール (js3d/*.js) の編集がブラウザに反映されないことがある。
このサーバは常に no-store を返すので、再読み込みだけで最新が載る。

    python scripts/dev_server.py [port]
"""

import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 404 以外は静かにしておく (アート未生成のカードで大量に出るため)
        if args and str(args[1]).startswith("4"):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    # ブラウザは keep-alive で複数コネクションを張るため、
    # 単一スレッドの TCPServer だと2本目以降が詰まる。必ずスレッド版を使う。
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler) as httpd:
        print("serving on http://localhost:%d" % port)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
