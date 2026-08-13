from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = 7000


def wait_port():
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.4):
                return
        except OSError:
            time.sleep(0.1)
    raise AssertionError("server not ready")


@contextmanager
def server(tmp_path: Path):
    for name in ("data", "downloads", "temp"):
        (tmp_path / name).mkdir()
    env = os.environ.copy()
    env.update({
        "LUMIDM_DATA_DIR": str(tmp_path / "data"),
        "LUMIDM_DOWNLOAD_DIR": str(tmp_path / "downloads"),
        "LUMIDM_TEMP_DIR": str(tmp_path / "temp"),
    })
    p = subprocess.Popen(
        [sys.executable, "server.py", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    try:
        wait_port()
        yield
    finally:
        p.terminate()
        try: p.wait(timeout=5)
        except subprocess.TimeoutExpired: p.kill()


def test_os_helper_diagnostic(tmp_path: Path):
    with server(tmp_path):
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            helper = []
            errors = []
            page.on("response", lambda r: helper.append((r.status, r.url)) if "operating-systems-open.js" in r.url else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"http://127.0.0.1:{PORT}", wait_until="domcontentloaded")
            page.locator("#app-shell").wait_for(state="visible", timeout=20000)
            page.locator(".nav-group-toggle").click()
            page.locator('.nav-item[data-view="operating_systems"]').click()
            page.wait_for_timeout(1800)
            print("HELPER=", helper)
            print("GLOBAL=", page.evaluate("typeof window.LumiOperatingSystemsOpen"))
            print("OPEN=", page.evaluate("typeof window.LumiOperatingSystemsOpen?.open"))
            print("VIEW=", page.locator("#view-operating_systems").get_attribute("class"))
            print("HTML=", page.locator("#view-operating_systems").inner_html()[:1200])
            print("ERRORS=", errors)
            browser.close()
