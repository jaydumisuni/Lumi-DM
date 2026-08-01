"""Capture all approved Lumi screens and compare their perceptual structure.

The frozen reference hashes were recovered from the fifteen owner-approved
1672x941 mockups. The gate renders the current readable UI at the same viewport,
computes a 256-bit difference hash for every screen, and rejects structural drift.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path
import re

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
OUTPUT = ROOT / "artifacts" / "visual"
VIEWPORT = {"width": 1672, "height": 941}

SCREENS = [
    ("Overview + controls", "01_Overview", "overview", "gear"),
    ("All Downloads", "02_All_Downloads", "downloads", "view"),
    ("Unfinished", "03_Unfinished", "unfinished", "view"),
    ("Finished", "04_Finished", "finished", "view"),
    ("Queues", "05_Queues", "queues", "view"),
    ("Categories", "06_Categories", "categories", "view"),
    ("LinkGrabber", "07_LinkGrabber", "grabber", "view"),
    ("Mobile Firmware", "08_Mobile_Firmware", "firmware", "view"),
    ("Operating Systems", "09_Operating_Systems", "operating-systems", "view"),
    ("Settings", "10_Settings", "settings", "view"),
    ("Speed Test", "11_Speed_Test_Popup", "overview", "speed"),
    ("Browser Extension", "12_Browser_Extension", "browser-extension", "view"),
    ("Check for Updates", "13_Check_For_Updates", "overview", "updates"),
    ("Help / Report a Bug", "14_Help_Report_A_Bug", "help", "view"),
    ("About Lumi", "15_About_Lumi", "about", "view"),
]

REFERENCE_DHASH = {
    "01_Overview": "2a6490ac914c32488b2eb1e43162b650b052946792adb1ca516a916a346a8159",
    "02_All_Downloads": "23249098926d326c8936b2853245b316b156b126918cb18c51d8d1d8339c986c",
    "03_Unfinished": "2b7490b3924c324c992407583552b153b152b45395539553345394321152931a",
    "04_Finished": "227490939b6c3364993632c8325ab356b146b05693163356515693163146b106",
    "05_Queues": "2a749423949534b492d4a92c02be9aa2bb269aa69b2893a65b26d3261066b6b1",
    "06_Categories": "22f491299ab4329492d2b49132919652b25ab24a964ab64a565ad65a164ab64a",
    "07_LinkGrabber": "20f4d2339a0d314c932cb70c3ab4b8b4948d958494ac9c8c54a4d4a910ac9165",
    "08_Mobile_Firmware": "26749125902b36559704a4943495b495b495b4959495b4b55495d5953495b5a8",
    "09_Operating_Systems": "2764d825d0013205954ab46a3a98b06ab25ab25a925a925a525ac25a19998a40",
    "10_Settings": "2b6494e5951233199259b59b355bb392959c9139925ab2c9531ac532115a82de",
    "11_Speed_Test_Popup": "2a6591b8909a32908b5ab1ec3364b652b552946393adb1ca516a916a34eac959",
    "12_Browser_Extension": "26649923980b3ae59118b118288cb498b365b8b1989198915890ccb81924b90e",
    "13_Check_For_Updates": "2a6490b5914932498e25b4673522b530b4729e27972fb60a516ad16a346a8139",
    "14_Help_Report_A_Bug": "266591259048381499e1b9693966b862b9689060926295635539d9b8146a8005",
    "15_About_Lumi": "2665d0e4da322bc983c9a36527c5a3618c998cf38cf38ea34b67ce930692816a",
}

MAX_DISTANCE = {
    "01_Overview": 57,
    "02_All_Downloads": 76,
    "03_Unfinished": 84,
    "04_Finished": 76,
    "05_Queues": 93,
    "06_Categories": 87,
    "07_LinkGrabber": 81,
    "08_Mobile_Firmware": 109,
    "09_Operating_Systems": 92,
    "10_Settings": 91,
    "11_Speed_Test_Popup": 65,
    "12_Browser_Extension": 61,
    "13_Check_For_Updates": 64,
    "14_Help_Report_A_Bug": 56,
    "15_About_Lumi": 96,
}


def dhash(path: Path, size: int = 16) -> str:
    """Return a stable 256-bit horizontal difference hash."""
    image = Image.open(path).convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    values = np.asarray(image)
    bits = (values[:, 1:] > values[:, :-1]).flatten()
    result = 0
    for bit in bits:
        result = (result << 1) | int(bit)
    return f"{result:0{size * size // 4}x}"


def hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def standalone_html() -> str:
    """Inline CSS and image assets while leaving JavaScript for Playwright injection."""
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    css = (STATIC / "lumi-approved-ui.css").read_text(encoding="utf-8")
    logo = base64.b64encode((STATIC / "lumi-approved-brand.svg").read_bytes()).decode("ascii")
    html = re.sub(r"<script>document\.write\([\s\S]*?</script>", "", html, count=1)
    html = html.replace('<link rel="stylesheet" href="lumi-approved-ui.css">', f"<style>{css}</style>")
    html = html.replace('src="lumi-approved-brand.svg"', f'src="data:image/svg+xml;base64,{logo}"')
    html = re.sub(r'<script src="(?:lumi-approved-ui|lumi-approved-integration|lumi-release-gate-hotfix)\.js"></script>', "", html)
    return html


def set_screen(page, view: str, state: str) -> None:
    page.evaluate(
        """([view, state]) => {
          const replica = window.LumiReplica;
          if (!replica || !replica.state) throw new Error('Approved renderer unavailable');
          replica.state.view = view;
          replica.state.theme = 'dark';
          replica.render();
          document.getElementById('gear-menu').hidden = true;
          document.getElementById('floating-panel').hidden = true;
          document.getElementById('modal').hidden = true;
          document.getElementById('overlay').hidden = true;
          if (state === 'gear') {
            document.getElementById('gear-menu').hidden = false;
            document.getElementById('gear-button').setAttribute('aria-expanded', 'true');
          } else if (state === 'speed') {
            replica.openSpeedTest();
          } else if (state === 'updates') {
            replica.openUpdateDialog();
          }
        }""",
        [view, state],
    )


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "gate-started.txt").write_text("visual gate started\n", encoding="utf-8")
    errors: list[str] = []
    rows: list[dict[str, object]] = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.set_content(standalone_html(), wait_until="load", timeout=30_000)
            page.add_script_tag(content=(STATIC / "lumi-approved-ui.js").read_text(encoding="utf-8"))
            page.wait_for_function("() => Boolean(window.LumiReplica && window.LumiReplica.state)", timeout=10_000)
            page.wait_for_timeout(250)
            for label, key, view, state in SCREENS:
                set_screen(page, view, state)
                page.wait_for_timeout(100)
                capture = OUTPUT / f"{key}.png"
                page.screenshot(path=str(capture))
                actual = dhash(capture)
                distance = hamming(REFERENCE_DHASH[key], actual)
                rows.append(
                    {
                        "screen": label,
                        "reference_dhash": REFERENCE_DHASH[key],
                        "capture_dhash": actual,
                        "distance": distance,
                        "maximum": MAX_DISTANCE[key],
                        "passed": distance <= MAX_DISTANCE[key],
                    }
                )
            browser.close()
    except Exception as error:
        errors.append(f"visual gate exception: {error}")

    average = sum(int(row["distance"]) for row in rows) / len(rows) if rows else 256.0
    report = {
        "viewport": VIEWPORT,
        "method": "256-bit dHash against fifteen owner-approved mockups",
        "average_distance": round(average, 2),
        "maximum_average": 80,
        "page_errors": errors,
        "screens": rows,
    }
    (OUTPUT / "visual-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    assert not errors, errors
    assert len(rows) == 15, f"expected 15 captures, got {len(rows)}"
    assert all(bool(row["passed"]) for row in rows), "one or more approved screens drifted"
    assert average <= 80, f"average visual distance {average:.2f} exceeded 80"


if __name__ == "__main__":
    main()
