from __future__ import annotations

from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from tests.test_desktop_browser_e2e_v4 import LUMI_PORT, lumi_server


def test_queue_submit_browser_boundary(tmp_path: Path) -> None:
    data_dir = tmp_path / "lumi-data"
    download_dir = tmp_path / "downloads"
    temp_dir = tmp_path / "temporary"
    for path in (data_dir, download_dir, temp_dir):
        path.mkdir(parents=True, exist_ok=True)

    with lumi_server(data_dir, download_dir, temp_dir):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            queue_requests: list[str] = []
            queue_responses: list[str] = []
            page_errors: list[str] = []
            console_errors: list[str] = []

            page.on("request", lambda request: queue_requests.append(
                f"{request.method} {request.url}"
            ) if request.url.endswith("/api/queues") else None)

            def record_response(response) -> None:
                if not response.url.endswith("/api/queues"):
                    return
                try:
                    body = response.text()[:1000]
                except Exception as error:
                    body = f"<response body unavailable: {error}>"
                queue_responses.append(f"{response.status} {response.url} {body}")

            page.on("response", record_response)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.on("console", lambda message: console_errors.append(message.text)
                    if message.type == "error" else None)

            page.add_init_script("""
                document.addEventListener('submit', event => {
                  if (event.target && event.target.id === 'queue-form') {
                    document.documentElement.setAttribute('data-queue-submit-seen', 'yes');
                  }
                }, true);
            """)

            page.goto(f"http://127.0.0.1:{LUMI_PORT}", wait_until="domcontentloaded")
            page.locator("#app-shell").wait_for(state="visible", timeout=20_000)
            page.wait_for_timeout(500)

            page.locator('.nav-item[data-view="queues"]').click()
            page.locator('[data-action="open-queue-modal"]').click()
            expect(page.locator("#queue-modal")).to_be_visible()
            page.locator('#queue-form input[name="name"]').fill("Diagnostic Queue")
            page.locator('#queue-form input[name="id"]').fill("diagnostic-queue")
            page.locator('#queue-form input[name="max_running"]').fill("2")
            page.locator('#queue-form button[type="submit"]').click()
            page.wait_for_timeout(1500)

            submit_seen = page.locator("html").get_attribute("data-queue-submit-seen")
            modal_hidden = page.locator("#queue-modal").get_attribute("hidden") is not None
            toast_text = page.locator("#toast-stack").inner_text().strip()

            print("QUEUE_SUBMIT_SEEN=", submit_seen)
            print("QUEUE_REQUESTS=", queue_requests)
            print("QUEUE_RESPONSES=", queue_responses)
            print("QUEUE_MODAL_HIDDEN=", modal_hidden)
            print("QUEUE_TOAST=", toast_text)
            print("QUEUE_PAGE_ERRORS=", page_errors)
            print("QUEUE_CONSOLE_ERRORS=", console_errors)

            assert submit_seen == "yes", "browser did not emit queue-form submit"
            assert queue_requests, "queue-form submit emitted but Lumi sent no /api/queues request"
            assert queue_responses, "queue request was sent but no response was observed"
            browser.close()
