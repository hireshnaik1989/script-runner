const { chromium } = require('playwright');
const fs = require('fs');
const axios = require('axios');  // Ensure axios is installed: npm install axios

const loginUrl = 'https://ds4-phoenix-retail.grofers.com/v2/login';
const dashboardUrl = 'https://ds4-phoenix-retail.grofers.com/v2/outbound-dashboard';
const googleSheetWebhookURL = 'https://script.google.com/macros/s/AKfycbwV1BvLwAoN8vWe2AzTcJaijCZJlxktr6rjfY-ppxB6aEjjDCadhiD35JXqA5zIOlwKSQ/exec';

(async () => {
  const browser = await chromium.launch({
    headless: true,  // Start in headless mode
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--disable-gpu', // Disable GPU acceleration
      '--disable-software-rasterizer', // Disable software rasterizer
      '--start-maximized', // Make the browser start maximized
    ],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36', // Regular user-agent
    viewport: { width: 1920, height: 1080 },
    permissions: ['clipboard-read', 'clipboard-write'],
    javaScriptEnabled: true,
    bypassCSP: true,
    locale: 'en-US'
  });

  const page = await context.newPage();

  // 1. Navigate to the login URL
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  console.log('Page loaded successfully for login.');

  // 2. Wait for the search input field and type "Goa"
  try {
    await page.waitForSelector('input[type="search"]#site', { timeout: 60000 });
    console.log('Search input field found.');
    await page.fill('input[type="search"]#site', 'Goa');
    console.log('Typed "Goa" in the search field.');
  } catch (err) {
    console.error('Error waiting for search input:', err);
  }

  // 3. Wait for the dropdown options to load and select "Goa - Feeder"
  try {
    await page.waitForSelector('div.ant-select-item-option-content', { timeout: 60000 });
    console.log('Dropdown options found.');
    await page.click('div.ant-select-item-option-content:has-text("Goa - Feeder")');
    console.log('Selected Goa - Feeder option.');
  } catch (err) {
    console.error('Error selecting dropdown option:', err);
  }

  // 4. Wait for the passcode input field and enter the passcode
  try {
    await page.waitForSelector('#passcode', { timeout: 60000 });
    await page.fill('#passcode', 'Z2NlejI1MzE3fjhaYlpKa0dSZW0=');
    console.log('Passcode filled in.');
  } catch (err) {
    console.error('Error filling passcode:', err);
  }

  // 5. Wait for the login button to be enabled and click it
  try {
    await page.waitForSelector('.ant-btn.login-form-button:not([disabled])', { timeout: 60000 });
    console.log('Login button enabled.');
    await page.click('.ant-btn.login-form-button');
    console.log('Clicked login button.');
  } catch (err) {
    console.error('Error clicking login button:', err);
  }

  // 6. Wait for navigation to finish after login (increase timeout for headless mode)
  try {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 });
    console.log('Page navigated successfully after login.');
  } catch (err) {
    console.error('Navigation failed or timed out:', err);
  }

  // 7. Explicitly wait for a known element after login (like a dashboard element)
  try {
    console.log('Waiting for dashboard element...');
    await page.waitForSelector('.ant-layout-content', { timeout: 60000 });
    console.log('Successfully logged in and dashboard is loaded.');
  } catch (err) {
    console.error('Failed to load dashboard element:', err);
  }

  // 8. Now, fetch data from the dashboard
  try {
    await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' });

    console.log('Waiting for Show All Slots button...');
    await page.waitForSelector('#outbound-dashboard\\.picking-summary\\.show-all-slots', { timeout: 15000 });
    await page.click('#outbound-dashboard\\.picking-summary\\.show-all-slots');
    await page.waitForTimeout(1000);  // Reduced wait time

    const slots = await page.$$('div[id^="outbound-dashboard.slots-details-sidebar.slot"]');
    console.log(`Found ${slots.length} slots.`);

    const allData = [];

    for (const slot of slots) {
      await slot.scrollIntoViewIfNeeded();
      await slot.click();
      await page.waitForTimeout(1000);  // Reduced wait time

      const dispatchSpans = await slot.$$('span');
      const dispatchTime = (await dispatchSpans[0]?.innerText())?.trim() || '';
      const dispatchDate = (await dispatchSpans[1]?.innerText())?.trim().replace(' ', '-') || '';

      const pickingData = await getTabData(page, 'Picking');
      const packingData = await getTabData(page, 'Packing');
      const sortationData = await getSortationData(page);

      allData.push([
        dispatchDate,
        dispatchTime,
        pickingData.OTIF,
        pickingData.PendingQty,
        pickingData.MissedFR,
        packingData.OTIF,
        packingData.PendingQty,
        packingData.MissedFR,
        sortationData.OTIF,
        sortationData.PendingQty
      ]);
    }

    // Send data to Google Sheet
    axios.post(googleSheetWebhookURL, allData)
      .then(response => {
        console.log('Data sent to Google Sheet:', response.data);
      })
      .catch(error => {
        console.error('Error sending data to Google Sheet:', error);
      });

  } catch (err) {
    console.error('Error during data fetch:', err);
  } finally {
    await browser.close();
  }
})();

async function getTabData(page, tabName) {
  const tabSelector = `#outbound-dashboard\\.slots-details-sidebar\\.process-tabs-tab-${tabName}`;
  await page.click(tabSelector);
  await page.waitForTimeout(1000); // Reduced wait time

  const panelSelector = `div[role="tabpanel"][id^="outbound-dashboard.slots-details-sidebar.process-tabs-panel-${tabName}"]`;
  await page.waitForSelector(panelSelector, { state: 'attached' });

  const texts = await page.$$eval(`${panelSelector} span.ant-typography`, spans => spans.map(span => span.innerText.trim()));

  let OTIF = '', PendingQty = '', MissedFR = '';
  for (let i = 0; i < texts.length; i++) {
    if (texts[i] === 'Picking OTIF' || texts[i] === 'Packing OTIF') OTIF = texts[i + 1] || '';
    if (texts[i] === 'Pending Qty') PendingQty = texts[i + 1] || '';
    if (texts[i] === 'Missed FR (Qty)') MissedFR = texts[i + 1] || '';
  }
  return { OTIF, PendingQty, MissedFR };
}

async function getSortationData(page) {
  const tabSelector = `#outbound-dashboard\\.slots-details-sidebar\\.process-tabs-tab-Sortation`;
  await page.click(tabSelector);
  await page.waitForTimeout(1000); // Reduced wait time

  const panelSelector = `div[role="tabpanel"][id^="outbound-dashboard.slots-details-sidebar.process-tabs-panel-Sortation"]`;
  await page.waitForSelector(panelSelector, { state: 'attached' });

  const texts = await page.$$eval(`${panelSelector} span.ant-typography.tw-flex`, spans => spans.map(span => span.innerText.trim()));
  return {
    OTIF: texts[0] || '',
    PendingQty: texts[1] || ''
  };
}
