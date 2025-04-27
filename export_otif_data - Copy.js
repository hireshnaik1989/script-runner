const { chromium } = require('playwright');
const fs = require('fs');
const axios = require('axios');  // Make sure axios is installed: npm install axios

const sessionFile = 'auth.json';
const dashboardUrl = 'https://ds4-phoenix-retail.grofers.com/v2/outbound-dashboard';
const googleSheetWebhookURL = 'https://script.google.com/macros/s/AKfycbwV1BvLwAoN8vWe2AzTcJaijCZJlxktr6rjfY-ppxB6aEjjDCadhiD35JXqA5zIOlwKSQ/exec';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    permissions: ['clipboard-read', 'clipboard-write'],
    javaScriptEnabled: true,
    bypassCSP: true,
    locale: 'en-US'
  });

  if (fs.existsSync(sessionFile)) {
    const storage = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    await context.addCookies(storage.cookies);
    await context.addInitScript(storage.initScript);
  }

  const page = await context.newPage();
  await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' });

  try {
    console.log('Waiting for Show All Slots button...');
    await page.waitForSelector('#outbound-dashboard\\.picking-summary\\.show-all-slots', { timeout: 30000 });
    await page.click('#outbound-dashboard\\.picking-summary\\.show-all-slots');
    await page.waitForTimeout(2000);

    const slots = await page.$$('div[id^="outbound-dashboard.slots-details-sidebar.slot"]');
    console.log(`Found ${slots.length} slots.`);

    const allData = [];

    for (const slot of slots) {
      await slot.scrollIntoViewIfNeeded();
      await slot.click();
      await page.waitForTimeout(2000);

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
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
})();

async function getTabData(page, tabName) {
  const tabSelector = `#outbound-dashboard\\.slots-details-sidebar\\.process-tabs-tab-${tabName}`;
  await page.click(tabSelector);
  await page.waitForTimeout(1000);

  const panelSelector = `div[role="tabpanel"][id^="outbound-dashboard.slots-details-sidebar.process-tabs-panel-${tabName}"]`;
  await page.waitForSelector(panelSelector);

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
  await page.waitForTimeout(1000);

  const panelSelector = `div[role="tabpanel"][id^="outbound-dashboard.slots-details-sidebar.process-tabs-panel-Sortation"]`;
  await page.waitForSelector(panelSelector);

  const texts = await page.$$eval(`${panelSelector} span.ant-typography.tw-flex`, spans => spans.map(span => span.innerText.trim()));
  return {
    OTIF: texts[0] || '',
    PendingQty: texts[1] || ''
  };
}
