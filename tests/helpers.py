"""Shared helpers for the browser tests (Playwright)."""
import functools
import http.server
import os
import socketserver
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
SINGLE = os.path.join(DIST, "cairo-giza-medical-network.html")
SITE = os.path.join(DIST, "site")
SHOTS = os.environ.get("SHOTS")  # set to a folder to save screenshots for visual review

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name + ".png"))


def file_url(path):
    return "file:///" + path.replace("\\", "/").lstrip("/")


def launch(p):
    channel = os.environ.get("PW_CHANNEL", "msedge" if os.name == "nt" else "")
    return p.chromium.launch(channel=channel) if channel else p.chromium.launch()


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(directory):
    """Serve a folder on localhost (needed for service worker / manifest tests). Returns (url, stop)."""
    handler = functools.partial(_Quiet, directory=directory)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_address[1]}/", httpd.shutdown


def finish():
    print(f"\n{'FAILED' if FAILS else 'PASSED'}: {len(FAILS)} failure(s)")
    for f in FAILS:
        print("  -", f)
    return 1 if FAILS else 0
