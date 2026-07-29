import { test, expect, chromium } from "@playwright/test";

test("DIAGNOSTIC: Browser launch test", async () => {
  const browser = await chromium.launch({ 
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"]
  });
  const page = await browser.newPage();
  
  // Try to reach the frontend
  const urls = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
  ];
  
  let reached = false;
  for (const url of urls) {
    try {
      await page.goto(url, { timeout: 10000, waitUntil: "domcontentloaded" });
      const title = await page.title();
      console.log(`✅ ${url} responded - Title: "${title}"`);
      reached = true;
      break;
    } catch (e) {
      console.log(`❌ ${url} - ${e.message.slice(0, 80)}`);
    }
  }
  
  expect(reached).toBeTruthy();
  await browser.close();
});
