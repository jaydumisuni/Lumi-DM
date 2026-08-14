from __future__ import annotations

import json
import time
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright

from tests.test_desktop_browser_e2e_v4 import (
    LUMI_PORT,
    fixture_server,
    lumi_server,
)


def test_direct_download_finalization_boundary(tmp_path: Path) -> None:
    fixture_dir = tmp_path / "fixture-http"
    fixture_dir.mkdir()
    payload = (b"LUMI-DIRECT-DIAGNOSTIC-" * 8192) + b"\n"
    (fixture_dir / "fixture.bin").write_bytes(payload)

    data_dir = tmp_path / "lumi-data"
    download_dir = tmp_path / "downloads"
    temp_dir = tmp_path / "temporary"
    for path in (data_dir, download_dir, temp_dir):
        path.mkdir(parents=True, exist_ok=True)

    with fixture_server(fixture_dir) as fixture_port, lumi_server(data_dir, download_dir, temp_dir):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            page = context.new_page()
            responses: list[str] = []
            page_errors: list[str] = []
            console_errors: list[str] = []

            def response_log(response) -> None:
                if "/api/downloads/start" not in response.url:
                    return
                try:
                    body = response.text()[:2000]
                except Exception as error:
                    body = f"<body unavailable: {error}>"
                responses.append(f"{response.status} {response.request.method} {response.url} {body}")

            page.on("response", response_log)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on("console", lambda message: console_errors.append(message.text)
                    if message.type == "error" else None)

            page.goto(f"http://127.0.0.1:{LUMI_PORT}", wait_until="domcontentloaded")
            page.locator("#app-shell").wait_for(state="visible", timeout=20_000)
            page.wait_for_timeout(500)

            page.locator("#new-download-btn").click()
            expect(page.locator("#new-modal")).to_be_visible()
            page.locator('#source-tabs button[data-source="direct"]').click()
            direct = page.locator('#source-body form[data-source-form="direct"]')
            direct.locator('textarea[name="urls"]').fill(
                f"http://127.0.0.1:{fixture_port}/fixture.bin"
            )
            direct.locator('input[name="target_dir"]').fill(str(download_dir))
            direct.locator('input[name="filename"]').fill("fixture.bin")
            connections = direct.locator('select[name="connections"]')
            if connections.count():
                connections.select_option(index=0)
            direct.locator('button[type="submit"]').click()
            expect(page.locator("#new-modal")).to_be_hidden(timeout=15_000)

            time.sleep(4.0)
            cookies = {item["name"]: item["value"] for item in context.cookies()}
            api_response = requests.get(
                f"http://127.0.0.1:{LUMI_PORT}/api/downloads?limit=5000",
                cookies=cookies,
                headers={"X-Lumi-Client": "browser-diagnostic"},
                timeout=10,
            )
            try:
                tasks = api_response.json()
            except Exception:
                tasks = {"raw": api_response.text[:4000]}

            print("DIRECT_START_RESPONSES=", responses)
            print("DIRECT_TASKS_STATUS=", api_response.status_code)
            print("DIRECT_TASKS=", json.dumps(tasks, indent=2, default=str)[:12000])
            print("DIRECT_DOWNLOAD_TREE=", [str(p.relative_to(download_dir)) for p in download_dir.rglob("*")])
            print("DIRECT_TEMP_TREE=", [str(p.relative_to(temp_dir)) for p in temp_dir.rglob("*")])
            print("DIRECT_DATA_TREE=", [str(p.relative_to(data_dir)) for p in data_dir.rglob("*")])
            final_file = download_dir / "fixture.bin"
            print("DIRECT_FINAL_EXISTS=", final_file.exists())
            print("DIRECT_FINAL_SIZE=", final_file.stat().st_size if final_file.exists() else 0)
            print("DIRECT_PAGE_ERRORS=", page_errors)
            print("DIRECT_CONSOLE_ERRORS=", console_errors)

            assert responses, "UI did not submit /api/downloads/start"
            assert api_response.status_code == 200, api_response.text
            browser.close()
