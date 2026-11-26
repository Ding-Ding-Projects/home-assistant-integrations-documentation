// Run with @playwright/test or playwright installed and a local Chromium.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(
  process.env.ATLAS_PLAYWRIGHT || "@playwright/test",
);

async function verify() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 360, height: 700 },
    });
    const script = fs.readFileSync(
      path.join(__dirname, "../docs/settings.js"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(__dirname, "../docs/settings.css"),
      "utf8",
    );
    const requests = [];
    await page.route("**/*", async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><meta charset="utf-8">
        <style>${css}</style><button id="reader-settings">Settings</button><main>
        <article class="reading"><div class="reader-body"><p id="text">Find an integration</p></div></article><code>integration</code>
        <input placeholder="Find an integration" aria-label="Search integrations"></main><script>${script}</script>`,
      });
    });
    await page.goto("http://localhost/reader-test");
    const trigger = page.locator("#reader-settings");
    const control = (suffix) => page.locator("#reader-" + suffix);
    await trigger.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("dialog").evaluate((d) => d.open), true);
    await control("size").selectOption("150");
    await control("motion").selectOption("reduced");
    await control("type").selectOption("system");
    await control("spacing").selectOption("spacious");
    await control("measure").selectOption("narrow");
    await control("color").selectOption("dark");
    assert.equal(
      await page.locator("html").evaluate((el) => el.style.fontSize),
      "150%",
    );
    assert(
      await page
        .locator("html")
        .evaluate((el) => el.hasAttribute("data-reader-reduced-motion")),
    );
    assert.equal(await page.locator("html").getAttribute("data-reader-type"), "system");
    assert.equal(await page.locator("html").getAttribute("data-reader-spacing"), "spacious");
    assert.equal(await page.locator("html").getAttribute("data-reader-measure"), "narrow");
    assert.equal(await page.locator("html").getAttribute("data-reader-color"), "dark");
    const widthMatches = await page.locator(".reading").evaluate((el) => {
      const actual = getComputedStyle(el).maxWidth;
      el.style.maxWidth = "58ch";
      const expected = getComputedStyle(el).maxWidth;
      el.style.removeProperty("max-width");
      return actual === expected;
    });
    assert(widthMatches, "Narrow reading width should resolve to 58ch");
    assert.equal(await page.locator("#text").evaluate((el) => {
      const style = getComputedStyle(el);
      return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
    }), 2);
    await control("language").selectOption("yue");
    assert.equal(await trigger.textContent(), "設定");
    assert.equal(await page.locator("#text").textContent(), "搵整合");
    await control("language").selectOption("both");
    assert.equal(await trigger.textContent(), "Settings · 設定");
    await control("language").selectOption("en");
    const upload = async (raw) => {
      await control("file").setInputFiles({
        name: "words.json",
        mimeType: "application/json",
        buffer: Buffer.from(raw),
      });
    };
    await upload('{"schemaVersion":1,"entries":{"integration":"component"}}');
    await control("status").filter({ hasText: "Wording imported." }).waitFor();
    assert.equal(
      await page.locator("#text").textContent(),
      "Find an component",
    );
    assert.equal(await page.locator("code").textContent(), "integration");
    assert.equal(
      await page.locator("main input").getAttribute("placeholder"),
      "Find an component",
    );
    for (const invalid of [
      '{"schemaVersion":1,"entries":{"a":"x","a":"y"}}',
      '{"schemaVersion":1,"entries":{"__proto__":"x"}}',
      Buffer.from([0xff]),
    ]) {
      await upload(invalid);
      await control("status").filter({ hasText: "Import failed." }).waitFor();
      assert.equal(
        await page.locator("#text").textContent(),
        "Find an component",
      );
    }
    await upload(" ".repeat(262145));
    await control("status").filter({ hasText: "256 KiB" }).waitFor();
    await page.reload();
    assert.equal(
      await page.locator("#text").textContent(),
      "Find an component",
    );
    await trigger.click();
    assert.equal(await control("size").inputValue(), "150");
    assert.equal(await control("type").inputValue(), "system");
    assert.equal(await control("spacing").inputValue(), "spacious");
    assert.equal(await control("measure").inputValue(), "narrow");
    assert.equal(await control("color").inputValue(), "dark");
    await control("reset").click();
    assert.equal(
      await page.locator("#text").textContent(),
      "Find an integration",
    );
    assert.equal(
      await page.locator("html").evaluate((el) => el.style.fontSize),
      "100%",
    );
    assert.equal(await page.locator("html").getAttribute("data-reader-type"), "editorial");
    assert.equal(await page.locator("html").getAttribute("data-reader-spacing"), "relaxed");
    assert.equal(await page.locator("html").getAttribute("data-reader-measure"), "standard");
    assert.equal(await page.locator("html").getAttribute("data-reader-color"), "system");
    await page.keyboard.press("Escape");
    assert.equal(
      await trigger.evaluate((el) => document.activeElement === el),
      true,
    );
    assert.equal(await page.locator("dialog").evaluate((d) => d.open), false);
    assert.deepEqual(requests, [
      "http://localhost/reader-test",
      "http://localhost/reader-test",
    ]);
    console.log(
      "Reader settings: import, validation, cache, reset, language, motion, font size, keyboard and network isolation passed.",
    );
  } finally {
    await browser.close();
  }
}
verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
