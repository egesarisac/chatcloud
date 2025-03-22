// Browser Compatibility Testing for ChatCloud
// Uses Puppeteer to test the application across different browser environments

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:8080',
  screenshotDir: path.join(__dirname, 'screenshots'),
  browsers: [
    { name: 'Chrome', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    { name: 'Firefox', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0' },
    { name: 'Safari', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' },
    { name: 'Mobile-iOS', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', viewport: { width: 375, height: 812 } },
    { name: 'Mobile-Android', userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36', viewport: { width: 412, height: 915 } },
  ],
  testCases: [
    { name: 'Homepage', path: '/', actions: [] },
    { name: 'JoinRoom', path: '/', actions: [
      async (page) => {
        // Click on a word in the word cloud (first word)
        await page.waitForSelector('svg text');
        const words = await page.$$('svg text');
        if (words.length > 0) {
          await words[0].click();
        }
      }
    ]},
    { name: 'SendMessage', path: '/', actions: [
      async (page) => {
        // Click on a word in the word cloud (first word)
        await page.waitForSelector('svg text');
        const words = await page.$$('svg text');
        if (words.length > 0) {
          await words[0].click();
        }
        
        // Wait for chat input and send a message
        await page.waitForSelector('input[type="text"]');
        await page.type('input[type="text"]', 'Test message from compatibility test');
        await page.keyboard.press('Enter');
      }
    ]},
  ]
};

// Ensure screenshot directory exists
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  details: [],
};

// Main test function
async function runCompatibilityTests() {
  console.log('Starting Browser Compatibility Tests');
  console.log(`Testing URL: ${CONFIG.baseUrl}`);
  console.log(`Testing ${CONFIG.browsers.length} browsers and ${CONFIG.testCases.length} test cases`);
  
  for (const browser of CONFIG.browsers) {
    console.log(`\nTesting with ${browser.name}`);
    
    // Launch browser with specified user agent
    const puppeteerOptions = {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    
    const browserInstance = await puppeteer.launch(puppeteerOptions);
    const page = await browserInstance.newPage();
    
    // Set user agent and viewport
    await page.setUserAgent(browser.userAgent);
    if (browser.viewport) {
      await page.setViewport(browser.viewport);
    } else {
      await page.setViewport({ width: 1280, height: 800 });
    }
    
    // Enable console logging
    page.on('console', message => {
      console.log(`${browser.name} Console: ${message.text()}`);
    });
    
    // Run each test case
    for (const testCase of CONFIG.testCases) {
      try {
        console.log(`  Running test: ${testCase.name}`);
        
        // Navigate to the page
        await page.goto(`${CONFIG.baseUrl}${testCase.path}`, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Take initial screenshot
        const screenshotPath = path.join(CONFIG.screenshotDir, `${browser.name}-${testCase.name}-initial.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`    Screenshot saved: ${screenshotPath}`);
        
        // Perform test actions
        for (const action of testCase.actions) {
          await action(page);
        }
        
        // Take final screenshot after actions
        const finalScreenshotPath = path.join(CONFIG.screenshotDir, `${browser.name}-${testCase.name}-final.png`);
        await page.screenshot({ path: finalScreenshotPath, fullPage: true });
        console.log(`    Final screenshot saved: ${finalScreenshotPath}`);
        
        // Check for error elements
        const errorElements = await page.$$('.error, .error-message, [data-test="error"]');
        if (errorElements.length > 0) {
          throw new Error(`Found ${errorElements.length} error elements on the page`);
        }
        
        // Test passed
        results.passed++;
        results.details.push({
          browser: browser.name,
          testCase: testCase.name,
          status: 'passed',
          screenshots: [screenshotPath, finalScreenshotPath],
        });
        
        console.log(`    ✅ Test passed`);
        
      } catch (error) {
        // Test failed
        results.failed++;
        results.details.push({
          browser: browser.name,
          testCase: testCase.name,
          status: 'failed',
          error: error.message,
        });
        
        console.error(`    ❌ Test failed: ${error.message}`);
        
        // Take error screenshot
        try {
          const errorScreenshotPath = path.join(CONFIG.screenshotDir, `${browser.name}-${testCase.name}-error.png`);
          await page.screenshot({ path: errorScreenshotPath, fullPage: true });
          console.log(`    Error screenshot saved: ${errorScreenshotPath}`);
        } catch (screenshotError) {
          console.error(`    Failed to take error screenshot: ${screenshotError.message}`);
        }
      }
    }
    
    // Close browser
    await browserInstance.close();
  }
  
  // Generate report
  generateReport();
}

// Generate HTML report
function generateReport() {
  const reportPath = path.join(CONFIG.screenshotDir, 'compatibility-report.html');
  
  const reportContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatCloud Browser Compatibility Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
    h1 { color: #3B82F6; }
    .summary { display: flex; gap: 20px; margin-bottom: 20px; }
    .summary-item { padding: 15px; border-radius: 8px; min-width: 120px; text-align: center; }
    .passed { background-color: #10B981; color: white; }
    .failed { background-color: #EF4444; color: white; }
    .skipped { background-color: #F59E0B; color: white; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
    tr.failed { background-color: #FEE2E2; }
    tr.passed { background-color: #D1FAE5; }
    .screenshot { max-width: 300px; margin: 5px; border: 1px solid #ddd; }
    .browser-group { margin-bottom: 30px; }
  </style>
</head>
<body>
  <h1>ChatCloud Browser Compatibility Report</h1>
  <p>Generated on ${new Date().toLocaleString()}</p>
  
  <div class="summary">
    <div class="summary-item passed">
      <h2>${results.passed}</h2>
      <p>Passed</p>
    </div>
    <div class="summary-item failed">
      <h2>${results.failed}</h2>
      <p>Failed</p>
    </div>
    <div class="summary-item skipped">
      <h2>${results.skipped}</h2>
      <p>Skipped</p>
    </div>
  </div>
  
  <h2>Test Results</h2>
  
  ${CONFIG.browsers.map(browser => `
    <div class="browser-group">
      <h3>${browser.name}</h3>
      <table>
        <thead>
          <tr>
            <th>Test Case</th>
            <th>Status</th>
            <th>Details</th>
            <th>Screenshots</th>
          </tr>
        </thead>
        <tbody>
          ${results.details
            .filter(detail => detail.browser === browser.name)
            .map(detail => `
              <tr class="${detail.status}">
                <td>${detail.testCase}</td>
                <td>${detail.status === 'passed' ? '✅ Passed' : '❌ Failed'}</td>
                <td>${detail.error || 'No issues detected'}</td>
                <td>
                  ${detail.screenshots ? detail.screenshots.map(screenshot => 
                    `<a href="${path.relative(CONFIG.screenshotDir, screenshot)}" target="_blank">
                      <img class="screenshot" src="${path.relative(CONFIG.screenshotDir, screenshot)}" alt="Screenshot" />
                    </a>`
                  ).join('') : 'No screenshots available'}
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `).join('')}
</body>
</html>
  `;
  
  fs.writeFileSync(reportPath, reportContent);
  console.log(`\nReport generated: ${reportPath}`);
  
  // Print summary
  console.log('\nTest Summary:');
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Total: ${results.passed + results.failed + results.skipped}`);
}

// Run the tests
runCompatibilityTests().catch(error => {
  console.error('Fatal error in compatibility tests:', error);
  process.exit(1);
});
