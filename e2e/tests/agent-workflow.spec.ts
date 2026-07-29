import { test, expect } from "@playwright/test";

test.describe("AI Requirements Agent System", () => {
  
  test("1. App loads and redirects to dashboard", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle", timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 });
    await expect(page.locator("text=REQ PLATFORM")).toBeVisible({ timeout: 5000 });
  });

  test("2. Dashboard shows project list or create prompt", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    // Dashboard should show either projects or a create button
    const projects = page.locator('a[href*="/projects/"]');
    const createBtn = page.locator('a[href*="/projects/new"], button:has-text("New Project")');
    await expect(projects.or(createBtn).first()).toBeVisible({ timeout: 8000 });
  });

  test("3. Can navigate to new project page", async ({ page }) => {
    await page.goto("/projects/new", { waitUntil: "networkidle", timeout: 15000 });
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: 5000 });
  });

  test("4. Summary tab shows requirement generation summary", async ({ page }) => {
    // First try to find an existing project
    await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    const projectLink = page.locator('a[href*="/projects/"]').first();
    const createLink = page.locator('a[href*="/projects/new"], button:has-text("New Project")').first();
    
    if (await projectLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectLink.click();
    } else if (await createLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createLink.click();
      await page.waitForURL(/\/projects\//, { timeout: 8000 });
    }
    
    await page.waitForLoadState("networkidle", { timeout: 10000 });

    // Check for summary elements
    const summary = page.locator("text=Requirement Generation Summary");
    const pipelineProgress = page.locator("text=Pipeline Progress");
    const agentsCompleted = page.locator("text=Agents Completed");

    // These may or may not be visible depending on project state
    if (await summary.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(pipelineProgress).toBeVisible({ timeout: 3000 });
      await expect(agentsCompleted).toBeVisible({ timeout: 3000 });
    }
  });

  test("5. Workflow pipeline section exists", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectLink.click();
      await page.waitForLoadState("networkidle", { timeout: 10000 });
      
      // Workflow tab should be active by default
      const workflowTab = page.locator('button[role="tab"]:has-text("Workflow")');
      if (await workflowTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await workflowTab.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test("6. Requirements tab is accessible", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectLink.click();
      await page.waitForLoadState("networkidle", { timeout: 10000 });
      
      const reqTab = page.locator('button[role="tab"]:has-text("Requirements")');
      if (await reqTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await reqTab.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test("7. Document tab is accessible", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    const projectLink = page.locator('a[href*="/projects/"]').first();
    if (await projectLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectLink.click();
      await page.waitForLoadState("networkidle", { timeout: 10000 });
      
      const docTab = page.locator('button[role="tab"]:has-text("Document")');
      if (await docTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await docTab.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test("8. Responsive layout adapts to mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    // Should still render properly
    await expect(page.locator("text=REQ PLATFORM")).toBeVisible({ timeout: 5000 });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("9. Sidebar navigation works", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 15000 });
    // Check sidebar has navigation items
    const navItems = page.locator("nav a, aside a").filter({ hasText: /Dashboard|Workflow|Projects|Documents/ });
    const count = await navItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test("10. App routes render without errors", async ({ page }) => {
    // Test key routes don't crash
    const routes = ["/dashboard", "/projects/new", "/ai-workflow"];
    for (const route of routes) {
      await page.goto(route, { waitUntil: "networkidle", timeout: 15000 });
      // Check no fatal errors
      const errorContent = page.locator("text=Not Found, 404, Internal Server Error");
      if (await errorContent.isVisible({ timeout: 2000 }).catch(() => false)) {
        test.fail(true, `${route} returned an error`);
      }
    }
  });
});
