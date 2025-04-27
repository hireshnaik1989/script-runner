const { chromium } = require('playwright');
const fs = require('fs');

// Define paths and URLs
const sessionFile = 'auth.json';
const loginUrl = 'https://ds4-phoenix-retail.grofers.com/v2/login';

(async () => {
  const browser = await chromium.launch({
    headless: false,  // Set 'true' for headless mode
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
    ],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to the login URL
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  // Log when page is fully loaded
  console.log('Page loaded successfully.');

  // 1. Wait for the search input field and type "Goa"
  await page.waitForSelector('input[type="search"]#site', { timeout: 30000 });
  console.log('Search input field found.');
  
  // Type "Goa" in the search input field
  await page.fill('input[type="search"]#site', 'Goa');
  console.log('Typed "Goa" in the search field.');

  // 2. Wait for the dropdown options to load and then click on the "Goa - Feeder" option
  await page.waitForSelector('div.ant-select-item-option-content', { timeout: 30000 });
  console.log('Dropdown options found.');

  // Select the "Goa - Feeder" option
  await page.click('div.ant-select-item-option-content:has-text("Goa - Feeder")');
  console.log('Selected Goa - Feeder option.');

  // 3. Wait for the passcode input field and enter the passcode
  await page.waitForSelector('#passcode', { timeout: 30000 });
  await page.fill('#passcode', 'Z2NlejI1MzE3fjhaYlpKa0dSZW0=');
  console.log('Passcode filled in.');

  // 4. Wait for the login button to be enabled (i.e., not disabled)
  await page.waitForSelector('.ant-btn.login-form-button:not([disabled])', { timeout: 30000 });
  console.log('Login button enabled.');

  // 5. Click the login button
  await page.click('.ant-btn.login-form-button');
  console.log('Clicked login button.');

  // Wait for navigation or the dashboard to load after clicking login
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 });

  console.log('Login attempt completed successfully.');

  // Save session state for future use
  const storage = await context.storageState();
  fs.writeFileSync(sessionFile, JSON.stringify(storage, null, 2));

  // Close the browser after the task is done
  await browser.close();
})();
