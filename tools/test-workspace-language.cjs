// Use ATLAS_SITE_URL to run the same checks against a deployed site.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.ATLAS_PLAYWRIGHT || "@playwright/test");

async function verify() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const url = process.env.ATLAS_SITE_URL || "http://atlas.test/";
  try {
    for (const language of ["en", "yue", "both"]) {
      const page = await browser.newPage();
      if (!process.env.ATLAS_SITE_URL) {
        await page.route("http://atlas.test/**", async (route) => {
          const file = new URL(route.request().url()).pathname.slice(1) || "index.html";
          await route.fulfill({ path: path.join(__dirname, "../docs", file) });
        });
      }
      await page.addInitScript((language) => {
        localStorage.setItem("integration-atlas:reader:v1", JSON.stringify({ language }));
      }, language);
      let release;
      const pending = new Promise((resolve) => { release = resolve; });
      let fail = true;
      const records = Array.from({ length: 13 }, (_, i) => ["test_" + i, "Test " + i]);
      await page.route("**/lookup.json", async (route) => {
        if (fail) {
          await pending;
          await route.fulfill({ status: 503, body: "" });
        } else {
          await route.fulfill({ json: records });
        }
      });
      const check = async (en, yue) => {
        const expected = language === "en" ? en : language === "yue" ? yue : en + " · " + yue;
        await page.waitForFunction((text) => document.querySelector("#ws-found")?.textContent === text, expected);
      };
      await page.goto(url);
      await page.locator("#workspace-open").click();
      await check("Loading integration names…", "載入緊整合名稱…");
      release();
      await check("Integration search is unavailable. Reopen the workspace to retry.", "暫時用唔到整合搜尋。請重新開啟閱讀工作區再試。");
      await page.keyboard.press("Escape");
      fail = false;
      await page.locator("#workspace-open").click();
      await check("Type to search 13 integrations.", "輸入名稱就可以搜尋 13 個整合。");
      const input = page.locator("#ws-query");
      await input.fill("test");
      await check("Showing 12 of 13 matches", "共搵到 13 個結果，顯示頭 12 個。");
      assert.equal(await page.locator("#ws-results a").count(), 12);
      await input.fill("test_1");
      await check("4 matches", "搵到 4 個結果。");
      await input.fill("test_12");
      await check("1 match", "搵到 1 個結果。");
      await input.fill("missing");
      await check("No matching integrations.", "搵唔到符合條件嘅整合。");
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log("Workspace lookup feedback passed in English, Cantonese and bilingual modes.");
}
verify().catch((error) => { console.error(error); process.exitCode = 1; });
