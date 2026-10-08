"""Re-generate the README screenshots in docs/screenshots/ from the built single file.

  python scripts/build.py
  python scripts/screenshots.py

Needs the dev requirements (pip install -r requirements-dev.txt; python -m playwright install chromium).
Uses a clean browser profile, so no personal favourites/notes appear in the images.
"""
import os
import sys
import tempfile

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SINGLE = os.path.join(ROOT, "dist", "cairo-giza-medical-network.html")
OUT = os.path.join(ROOT, "docs", "screenshots")
URL = "file:///" + SINGLE.replace("\\", "/").lstrip("/")


def launch(p):
    channel = os.environ.get("PW_CHANNEL", "msedge" if os.name == "nt" else "")
    return p.chromium.launch(channel=channel) if channel else p.chromium.launch()


def fresh(ctx, url=URL):
    pg = ctx.new_page()
    pg.goto(url)
    pg.evaluate("localStorage.clear()")
    pg.reload()
    pg.wait_for_timeout(600)
    if pg.is_visible("#noticeClose"):
        pg.click("#noticeClose")
    pg.evaluate("document.activeElement.blur(); scrollTo(0, 0)")
    return pg


def main():
    if not os.path.exists(SINGLE):
        sys.exit("Build first: python scripts/build.py")
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        b = launch(p)

        ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
        pg = fresh(ctx)
        pg.screenshot(path=os.path.join(OUT, "desktop-light.png"))
        print("desktop-light.png")

        pg.goto(URL + "?q=zamalek")
        pg.wait_for_timeout(500)
        pg.click("#themeBtn")
        pg.click("[data-view=list]")
        pg.wait_for_timeout(400)
        pg.locator("#results .card").first.locator("h3").click()
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, "desktop-dark-list.png"))
        print("desktop-dark-list.png")

        pg.click("#themeBtn")
        pg.click("[data-view=cards]")
        pg.goto(URL)
        pg.click("#pdfBtn")
        pg.wait_for_function("document.querySelector('#pdfInfo').textContent.includes('page')", timeout=90000)
        pg.wait_for_timeout(1200)
        pg.screenshot(path=os.path.join(OUT, "pdf-dialog.png"))
        print("pdf-dialog.png")
        pg.check("input[name=pscope][value=all]", force=True)
        pg.wait_for_function("document.querySelector('#pdfInfo').textContent.includes('page')", timeout=90000)
        with pg.expect_download() as d:
            pg.click("#pdfDownload")
        pdf = os.path.join(tempfile.gettempdir(), "cgmn-shot.pdf")
        d.value.save_as(pdf)
        ctx.close()

        m = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mp = fresh(m)
        mp.evaluate("document.documentElement.style.scrollBehavior = 'auto'; document.querySelectorAll('#results details.group')[1].scrollIntoView()")
        mp.wait_for_timeout(500)
        mp.screenshot(path=os.path.join(OUT, "mobile.png"))
        print("mobile.png")
        b.close()

    try:
        import pymupdf
    except ImportError:
        print("pymupdf not installed - skipping PDF page images")
        return
    doc = pymupdf.open(pdf)
    doc[0].get_pixmap(dpi=90).save(os.path.join(OUT, "pdf-cover.png"))
    doc[3].get_pixmap(dpi=90).save(os.path.join(OUT, "pdf-page.png"))
    doc.close()
    os.remove(pdf)
    print("pdf-cover.png, pdf-page.png")
    print("Saved to", OUT)


if __name__ == "__main__":
    main()
