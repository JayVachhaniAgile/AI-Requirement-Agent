import { test, expect } from "@playwright/test";

const PROJECT_NAME = `E2E Test ${Date.now()}`;
const PROJECT_IDEA = `A mobile health tracking app that monitors user vitals and provides AI-powered health recommendations. 
Key features: 
- Real-time heart rate and step tracking
- AI-powered health insights and recommendations
- Integration with wearable devices
- Secure data storage with HIPAA compliance
- Doctor appointment scheduling`;

test.describe("Create Project Flow", () => {

  test("1. New project page loads with both entry modes", async ({ page }) => {
    await page.goto("/projects/new", { waitUntil: "networkidle", timeout: 15000 });
    
    await expect(page.getByRole("heading", { name: "New Analysis" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /Manual Entry/ })).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("button", { name: /AI Interview/ })).toBeVisible({ timeout: 3000 });
  });

  test("2. Form validates empty submission", async ({ page }) => {
    await page.goto("/projects/new", { waitUntil: "networkidle", timeout: 15000 });
    
    await page.getByRole("button", { name: /Create Project|Create/ }).click();
    
    // Toast notification shows validation error
    await expect(page.getByRole("status").first()).toBeVisible({ timeout: 5000 });
  });

  test("3. Fill project details and create project (manual entry)", async ({ page }) => {
    await page.goto("/projects/new", { waitUntil: "networkidle", timeout: 15000 });
    
    // Fill project name
    await page.getByLabel("Project Name").fill(PROJECT_NAME);
    
    // Fill project idea
    await page.getByLabel(/Description/).fill(PROJECT_IDEA);
    
    // Submit
    await page.getByRole("button", { name: /Create Project/ }).click();
    
    // Wait for redirect to project workspace
    await page.waitForURL(/\/projects\//, { timeout: 60000 });
    
    // Should land on the project workspace with summary
    await expect(page.getByRole("heading", { name: /Requirement Generation Summary/ })).toBeVisible({ timeout: 120000 });
  });

  test("4. Can toggle between manual and AI interview modes", async ({ page }) => {
    await page.goto("/projects/new", { waitUntil: "networkidle", timeout: 15000 });
    
    // Click AI Interview
    await page.getByRole("button", { name: /AI Interview/ }).click();
    await page.waitForTimeout(500);
    
    await expect(page).toHaveURL(/\/projects\/new/, { timeout: 3000 });
    
    // Switch back to manual
    await page.getByRole("button", { name: /Manual Entry/ }).click();
    await page.waitForTimeout(500);
    
    // Manual form should be visible again
    await expect(page.getByLabel("Project Name")).toBeVisible({ timeout: 3000 });
  });

  test("5. File upload UI works", async ({ page }) => {
    await page.goto("/projects/new", { waitUntil: "networkidle", timeout: 15000 });
    
    await expect(page.getByText("Drag & drop or click")).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(".txt, .md, .csv")).toBeVisible({ timeout: 3000 });
  });

  test("6. Project creation without idea shows validation", async ({ page }) => {
    await page.goto("/projects/new", { waitUntil: "networkidle", timeout: 15000 });
    
    await page.getByLabel("Project Name").fill("Test Project");
    await page.getByRole("button", { name: /Create Project/ }).click();
    
    // Toast notification should show
    await expect(page.getByRole("status").first()).toBeVisible({ timeout: 5000 });
  });

  test("7. Cancel returns to dashboard", async ({ page }) => {
    await page.goto("/projects/new", { waitUntil: "networkidle", timeout: 15000 });
    
    await page.getByRole("button", { name: /Cancel/ }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8000 });
  });
});
