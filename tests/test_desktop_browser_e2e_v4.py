from __future__ import annotations

from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import threading
import time

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
LUMI_PORT = 7000
ACTIVE = re.compile(r"(^|\s)active(\s|$)")


def wait_port(port: int, timeout: float = 25.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.1)
    raise AssertionError(f"port {port} did not become ready")


@contextmanager
def fixture_server(directory: Path):
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        partial(SimpleHTTPRequestHandler, directory=str(directory)),
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_port
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


@contextmanager
def lumi_server(data_dir: Path, download_dir: Path, temp_dir: Path):
    env = os.environ.copy()
    env.update({
        "PYTHONUNBUFFERED": "1",
        "LUMIDM_DATA_DIR": str(data_dir),
        "LUMIDM_DOWNLOAD_DIR": str(download_dir),
        "LUMIDM_TEMP_DIR": str(temp_dir),
    })
    process = subprocess.Popen(
        [sys.executable, "server.py", "--host", "127.0.0.1", "--port", str(LUMI_PORT)],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        wait_port(LUMI_PORT)
        yield process
    finally:
        process.terminate()
        try:
            process.wait(timeout=6)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


def wait_for_file_under(root: Path, filename: str, expected: bytes, timeout: float = 20.0) -> Path:
    deadline = time.monotonic() + timeout
    last_candidates: list[Path] = []
    while time.monotonic() < deadline:
        last_candidates = [path for path in root.rglob(filename) if path.is_file()]
        for path in last_candidates:
            if path.read_bytes() == expected:
                resolved_root = root.resolve()
                resolved_path = path.resolve()
                if not resolved_path.is_relative_to(resolved_root):
                    raise AssertionError(f"download escaped requested root: {resolved_path}")
                return path
        time.sleep(0.15)
    details = [
        f"{path.relative_to(root)}:{path.stat().st_size}"
        for path in last_candidates
    ]
    raise AssertionError(
        f"downloaded file mismatch under {root}: candidates={details}"
    )


def click_view(page, view: str) -> None:
    page.locator(f'.nav-item[data-view="{view}"]').click()
    expect(page.locator(f"#view-{view}")).to_have_class(ACTIVE)


def print_visible_buttons(page) -> None:
    print("=== VISIBLE BUTTON CONTRACT INVENTORY ===")
    buttons = page.locator("button:visible")
    for index in range(buttons.count()):
        button = buttons.nth(index)
        attrs = []
        for name in (
            "id", "class", "data-view", "data-action", "data-main-open-new",
            "data-main-view", "data-main-task-action", "data-main-settings-tab",
            "data-main-shell-action", "data-shell-action", "data-source",
            "data-firmware-action", "data-os-action", "data-contract-ready",
        ):
            value = button.get_attribute(name)
            if value is not None:
                attrs.append(f"{name}={value!r}")
        print(index, button.inner_text().strip().replace("\n", " ")[:100], " | ", " ".join(attrs))


def test_desktop_ui_full_interaction_and_local_download(tmp_path: Path) -> None:
    fixture_dir = tmp_path / "fixture-http"
    fixture_dir.mkdir()
    payload = (b"LUMI-DESKTOP-E2E-" * 8192) + b"\n"
    (fixture_dir / "fixture.bin").write_bytes(payload)
    (fixture_dir / "links.html").write_text(
        '<!doctype html><html><body><a href="fixture.bin">fixture</a></body></html>',
        encoding="utf-8",
    )

    data_dir = tmp_path / "lumi-data"
    download_dir = tmp_path / "downloads"
    temp_dir = tmp_path / "temporary"
    for path in (data_dir, download_dir, temp_dir):
        path.mkdir(parents=True, exist_ok=True)

    with fixture_server(fixture_dir) as fixture_port, lumi_server(data_dir, download_dir, temp_dir):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            page_errors: list[str] = []
            console_errors: list[str] = []
            http_failures: list[str] = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error" else None,
            )
            page.on(
                "response",
                lambda response: http_failures.append(
                    f"{response.status} {response.request.method} {response.url}"
                ) if response.status >= 400 else None,
            )

            page.goto(f"http://127.0.0.1:{LUMI_PORT}", wait_until="domcontentloaded")
            page.locator("#app-shell").wait_for(state="visible", timeout=20_000)
            page.wait_for_timeout(500)
            initial_audit = page.locator("html").get_attribute("data-lumi-interaction-contract")
            print("INITIAL_INTERACTION_AUDIT=", initial_audit)
            if initial_audit != "ready":
                print_visible_buttons(page)

            for view in (
                "overview", "downloads", "unfinished", "finished",
                "queues", "categories", "grabber",
            ):
                click_view(page, view)

            technician = page.locator(".nav-group-toggle")
            technician.click()
            expect(technician).to_have_attribute("aria-expanded", "true")
            expect(page.locator(".nav-group .nav-submenu")).to_be_visible()

            page.locator('.nav-item[data-view="firmware"]').click()
            expect(page.locator("#view-firmware")).to_have_class(ACTIVE)
            page.locator("#view-firmware .firmware-shell").wait_for(state="visible", timeout=10_000)
            expect(technician).to_have_attribute("aria-expanded", "true")

            page.locator('.nav-item[data-view="operating_systems"]').click()
            expect(page.locator("#view-operating_systems")).to_have_class(ACTIVE)
            page.locator("#view-operating_systems .os-catalogue-shell").wait_for(state="visible", timeout=10_000)
            expect(technician).to_have_attribute("aria-expanded", "true")
            assert page.evaluate("Boolean(window.LumiOperatingSystems?.open)"), "canonical OS workspace API is unavailable"

            linux = page.locator('#view-operating_systems [data-os-family="Linux"]')
            linux.click()
            assert page.evaluate("sessionStorage.getItem('LUMI.osFamily')") == "Linux", "Linux click did not reach the OS state handler"
            expect(linux).to_have_class(ACTIVE)
            expect(page.locator('#view-operating_systems input[name="family"]')).to_have_value("Linux")
            click_view(page, "overview")
            technician.click()
            expect(technician).to_have_attribute("aria-expanded", "true")
            expect(page.locator(".nav-group .nav-submenu")).to_be_visible()
            page.locator('.nav-item[data-view="operating_systems"]').click()
            expect(page.locator("#view-operating_systems")).to_have_class(ACTIVE)
            expect(page.locator('#view-operating_systems [data-os-family="Linux"]')).to_have_class(ACTIVE)
            expect(page.locator('#view-operating_systems input[name="family"]')).to_have_value("Linux")

            click_view(page, "overview")
            page.locator('[data-main-view="settings"]').first.click()
            expect(page.locator("#view-settings")).to_have_class(ACTIVE)
            page.locator('[data-main-settings-tab="storage"]').click()
            expect(page.locator('[data-main-settings-section="storage"]')).to_have_class(ACTIVE)
            page.locator('[data-main-settings-tab="security"]').click()
            expect(page.locator('[data-main-settings-section="security"]')).to_have_class(ACTIVE)

            click_view(page, "queues")
            page.locator('[data-action="open-queue-modal"]').click()
            expect(page.locator("#queue-modal")).to_be_visible()
            page.locator('#queue-form input[name="name"]').fill("E2E Queue")
            page.locator('#queue-form input[name="id"]').fill("e2e-queue")
            page.locator('#queue-form input[name="max_running"]').fill("2")
            page.locator('#queue-form button[type="submit"]').click()
            expect(page.locator("#queue-modal")).to_be_hidden(timeout=10_000)
            expect(page.locator("#view-queues")).to_contain_text("E2E Queue")
            queue_card = page.locator("#view-queues .lumi-card").filter(has_text="E2E Queue")
            queue_menu = queue_card.locator('.lumi-card-menu[data-contract-ready="queue-menu"]')
            queue_menu.wait_for(state="visible", timeout=5_000)
            queue_menu.click()
            expect(queue_card.locator(".lumi-card-contract-menu")).to_be_visible()
            expect(queue_card.locator('[data-contract-forward="toggle-queue"]')).to_be_visible()
            page.keyboard.press("Escape")

            click_view(page, "categories")
            page.locator('[data-action="open-category-modal"]').click()
            expect(page.locator("#category-modal")).to_be_visible()
            page.locator('#category-form input[name="name"]').fill("E2E Files")
            page.locator('#category-form input[name="id"]').fill("e2e-files")
            page.locator('#category-form input[name="extensions"]').fill("bin")
            page.locator('#category-form input[name="folder"]').fill("E2E")
            page.locator('#category-form button[type="submit"]').click()
            expect(page.locator("#category-modal")).to_be_hidden(timeout=10_000)
            expect(page.locator("#view-categories")).to_contain_text("E2E Files")

            click_view(page, "grabber")
            grab = page.locator('#view-grabber form[data-form="grabber"]')
            grab.locator('textarea[name="url"]').fill(
                f"http://127.0.0.1:{fixture_port}/links.html"
            )
            grab.locator('button[type="submit"]').click()
            page.locator("#view-grabber [data-grab-index]").first.wait_for(
                state="visible", timeout=12_000
            )
            expect(page.locator("#view-grabber")).to_contain_text("fixture.bin")

            page.locator("#new-download-btn").click()
            expect(page.locator("#new-modal")).to_be_visible()
            for source, selector in {
                "direct": 'form[data-source-form="direct"]',
                "video": 'form[data-source-form="media-inspect"]',
                "torrent": 'form[data-source-form="torrent-inspect"]',
                "archive": 'form[data-source-form="archive"]',
            }.items():
                page.locator(f'#source-tabs button[data-source="{source}"]').click()
                page.locator(f"#source-body {selector}").wait_for(state="visible", timeout=5_000)

            page.locator('#source-tabs button[data-source="direct"]').click()
            direct = page.locator('#source-body form[data-source-form="direct"]')
            direct.locator('textarea[name="urls"]').fill(
                f"http://127.0.0.1:{fixture_port}/fixture.bin"
            )
            direct.locator('input[name="target_dir"]').fill(str(download_dir))
            direct.locator('input[name="filename"]').fill("fixture.bin")
            connections = direct.locator('select[name="connections"]')
            if connections.locator('option[value="1"]').count():
                connections.select_option("1")
            else:
                connections.select_option(index=0)
            direct.locator('button[type="submit"]').click()

            expect(page.locator("#new-modal")).to_be_hidden(timeout=15_000)
            expect(page.locator("#view-downloads")).to_have_class(ACTIVE)
            final_file = wait_for_file_under(download_dir, "fixture.bin", payload, timeout=20.0)
            print("FINAL_DOWNLOAD_PATH=", final_file.relative_to(download_dir))
            page.wait_for_timeout(800)
            expect(page.locator("#view-downloads")).to_contain_text("fixture.bin")

            final_audit = page.locator("html").get_attribute("data-lumi-interaction-contract")
            print("FINAL_INTERACTION_AUDIT=", final_audit)
            if http_failures:
                print("BROWSER_HTTP_FAILURES=", http_failures)
            if console_errors:
                print("BROWSER_CONSOLE_ERRORS=", console_errors)
            assert final_audit == "ready", "interaction contract audit did not finish ready"
            assert not http_failures, "browser HTTP failures: " + " | ".join(http_failures)
            assert not console_errors, "browser console errors: " + " | ".join(console_errors)
            assert not page_errors, "renderer page errors: " + " | ".join(page_errors)
            browser.close()