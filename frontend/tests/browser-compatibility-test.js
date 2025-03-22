// ChatCloud Browser Compatibility Test
// ===============================
//
// This script uses Puppeteer to test ChatCloud across multiple browser configurations
// It verifies core functionality works across different browsers and viewport sizes

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Test configurations
const viewports = [
  { name: 'Mobile', width: 375, height: 667 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop', width: 1366, height: 768 }
];

// Browser configurations to test
// Note: This uses Puppeteer's built-in Chromium. For testing in other browsers,
// you would need to configure puppeteer-firefox or similar extensions.
const browserConfigs = [
  { name: 'Chrome', args: ['--no-sandbox'] },
  // For Firefox testing, uncomment and install puppeteer-firefox:
  // { name: 'Firefox', product: 'firefox' },
];

// Test scenarios to run
const testScenarios = [
  {
    name: 'Home Page Load',
    test: async (page) => {
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
      return await page.evaluate(() => {
        const wordCloud = document.querySelector('.word-cloud');
        return {
          success: !!wordCloud,
          details: wordCloud ? 'Word cloud loaded successfully' : 'Word cloud not found'
        };
      });
    }
  },
  {
    name: 'Create New Topic',
    test: async (page) => {
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
      
      // Generate a unique topic name
      const topicName = `Test Topic ${Date.now()}`;
      
      // Type in the new topic input
      await page.type('input[placeholder="Enter a new topic"]', topicName);
      
      // Click the add button
      const addButton = await page.$('button[type="submit"]');
      await addButton.click();
      
      // Wait for the topic to appear in the word cloud
      await page.waitForTimeout(2000);
      
      return await page.evaluate((topic) => {
        const wordElements = Array.from(document.querySelectorAll('.word-cloud text'));
        const foundTopic = wordElements.some(el => el.textContent.includes(topic));
        return {
          success: foundTopic,
          details: foundTopic ? `Topic "${topic}" was added successfully` : `Topic "${topic}" was not found in word cloud`
        };
      }, topicName);
    }
  },
  {
    name: 'Join Chat Room',
    test: async (page) => {
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
      
      // Click on the first word in the cloud to join a room
      const firstWord = await page.$('.word-cloud text');
      if (!firstWord) {
        return {
          success: false,
          details: 'No words found in the word cloud'
        };
      }
      
      await firstWord.click();
      
      // Wait for the chat room to load
      await page.waitForTimeout(2000);
      
      return await page.evaluate(() => {
        const chatRoom = document.querySelector('.chat-container');
        const messageInput = document.querySelector('textarea[placeholder*="message"]');
        
        return {
          success: !!chatRoom && !!messageInput,
          details: (chatRoom && messageInput) ? 
            'Successfully joined chat room' : 
            'Failed to join chat room or message input not found'
        };
      });
    }
  },
  {
    name: 'Send Message',
    test: async (page) => {
      // First join a room
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
      const firstWord = await page.$('.word-cloud text');
      if (firstWord) {
        await firstWord.click();
        await page.waitForTimeout(2000);
      } else {
        // If no existing topics, create one
        const topicName = `Test Topic ${Date.now()}`;
        await page.type('input[placeholder="Enter a new topic"]', topicName);
        const addButton = await page.$('button[type="submit"]');
        await addButton.click();
        await page.waitForTimeout(2000);
        
        // Now click on the newly created topic
        const words = await page.$$('.word-cloud text');
        for (const word of words) {
          const text = await page.evaluate(el => el.textContent, word);
          if (text.includes(topicName)) {
            await word.click();
            break;
          }
        }
        await page.waitForTimeout(2000);
      }
      
      // Now send a message
      const testMessage = `Test message ${Date.now()}`;
      await page.type('textarea[placeholder*="message"]', testMessage);
      await page.keyboard.press('Enter');
      
      // Wait for the message to appear
      await page.waitForTimeout(1000);
      
      return await page.evaluate((msg) => {
        const messages = Array.from(document.querySelectorAll('.message-content'));
        const foundMessage = messages.some(el => el.textContent.includes(msg));
        return {
          success: foundMessage,
          details: foundMessage ? 
            `Message "${msg}" was sent and displayed successfully` : 
            `Message "${msg}" was not found in the chat`
        };
      }, testMessage);
    }
  },
  {
    name: 'Mobile Sidebar Toggle',
    test: async (page) => {
      // Only run this test on mobile viewport
      const viewport = page.viewport();
      if (viewport.width >= 768) {
        return { success: true, details: 'Test skipped - not applicable for this viewport size' };
      }
      
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
      
      // Check if sidebar is initially hidden on mobile
      const initialState = await page.evaluate(() => {
        const sidebar = document.querySelector('.rooms-sidebar');
        return {
          visible: window.getComputedStyle(sidebar).display !== 'none',
          transform: window.getComputedStyle(sidebar).transform
        };
      });
      
      // Click the toggle button
      const toggleButton = await page.$('button[class*="md:hidden"]');
      await toggleButton.click();
      
      // Wait for animation
      await page.waitForTimeout(500);
      
      // Check if sidebar is now visible
      const afterToggle = await page.evaluate(() => {
        const sidebar = document.querySelector('.rooms-sidebar');
        return {
          visible: window.getComputedStyle(sidebar).display !== 'none',
          transform: window.getComputedStyle(sidebar).transform
        };
      });
      
      return {
        success: initialState.transform !== afterToggle.transform,
        details: `Sidebar toggle ${initialState.transform !== afterToggle.transform ? 'worked' : 'failed'}`
      };
    }
  }
];

// Create results directory if it doesn't exist
const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir);
}

// Main test runner
async function runTests() {
  console.log('Starting ChatCloud Browser Compatibility Tests');
  console.log('============================================');
  
  const startTime = Date.now();
  const results = [];
  
  for (const browserConfig of browserConfigs) {
    console.log(`\nTesting with ${browserConfig.name}...`);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: browserConfig.args || [],
      product: browserConfig.product
    });
    
    for (const viewport of viewports) {
      console.log(`\n  Testing ${viewport.name} viewport (${viewport.width}x${viewport.height})...`);
      
      // Take screenshots for this browser/viewport combination
      const screenshotDir = path.join(resultsDir, `${browserConfig.name}_${viewport.name}`);
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir);
      }
      
      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height
      });
      
      // Run each test scenario
      for (const scenario of testScenarios) {
        console.log(`    Running test: ${scenario.name}...`);
        
        try {
          const testResult = await scenario.test(page);
          
          // Take screenshot after test
          await page.screenshot({
            path: path.join(screenshotDir, `${scenario.name.replace(/\s+/g, '_')}.png`)
          });
          
          results.push({
            browser: browserConfig.name,
            viewport: viewport.name,
            scenario: scenario.name,
            success: testResult.success,
            details: testResult.details
          });
          
          console.log(`      ${testResult.success ? '✅ PASS' : '❌ FAIL'}: ${testResult.details}`);
        } catch (error) {
          console.error(`      ❌ ERROR: ${error.message}`);
          
          results.push({
            browser: browserConfig.name,
            viewport: viewport.name,
            scenario: scenario.name,
            success: false,
            details: `Error: ${error.message}`
          });
          
          // Take error screenshot
          await page.screenshot({
            path: path.join(screenshotDir, `${scenario.name.replace(/\s+/g, '_')}_ERROR.png`)
          });
        }
      }
      
      await page.close();
    }
    
    await browser.close();
  }
  
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  
  // Generate HTML report
  generateReport(results, duration);
  
  console.log(`\nAll tests completed in ${duration.toFixed(2)} seconds`);
  console.log(`Report generated at: ${path.join(resultsDir, 'report.html')}`);
}

// Generate HTML report
function generateReport(results, duration) {
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  const successRate = (successCount / results.length * 100).toFixed(2);
  
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatCloud Browser Compatibility Test Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .summary { display: flex; margin: 20px 0; background: #f8f9fa; padding: 15px; border-radius: 5px; }
    .summary-item { flex: 1; text-align: center; }
    .summary-item h3 { margin: 0; color: #6c757d; font-size: 14px; text-transform: uppercase; }
    .summary-item p { margin: 5px 0 0; font-size: 24px; font-weight: bold; }
    .success-rate { color: ${successRate > 90 ? '#28a745' : successRate > 70 ? '#fd7e14' : '#dc3545'}; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f8f9fa; font-weight: 600; }
    tr:hover { background-color: #f1f1f1; }
    .status { font-weight: bold; }
    .pass { color: #28a745; }
    .fail { color: #dc3545; }
    .filters { margin: 20px 0; display: flex; gap: 15px; }
    .filter-group { margin-right: 15px; }
    .filter-group label { display: block; font-size: 14px; color: #6c757d; margin-bottom: 5px; }
    select { padding: 8px 12px; border-radius: 4px; border: 1px solid #ced4da; }
  </style>
</head>
<body>
  <h1>ChatCloud Browser Compatibility Test Report</h1>
  
  <div class="summary">
    <div class="summary-item">
      <h3>Total Tests</h3>
      <p>${results.length}</p>
    </div>
    <div class="summary-item">
      <h3>Passed</h3>
      <p class="pass">${successCount}</p>
    </div>
    <div class="summary-item">
      <h3>Failed</h3>
      <p class="fail">${failCount}</p>
    </div>
    <div class="summary-item">
      <h3>Success Rate</h3>
      <p class="success-rate">${successRate}%</p>
    </div>
    <div class="summary-item">
      <h3>Duration</h3>
      <p>${duration.toFixed(2)}s</p>
    </div>
  </div>
  
  <div class="filters">
    <div class="filter-group">
      <label for="browser-filter">Filter by Browser</label>
      <select id="browser-filter">
        <option value="all">All Browsers</option>
        ${[...new Set(results.map(r => r.browser))].map(browser => 
          `<option value="${browser}">${browser}</option>`
        ).join('')}
      </select>
    </div>
    
    <div class="filter-group">
      <label for="viewport-filter">Filter by Viewport</label>
      <select id="viewport-filter">
        <option value="all">All Viewports</option>
        ${[...new Set(results.map(r => r.viewport))].map(viewport => 
          `<option value="${viewport}">${viewport}</option>`
        ).join('')}
      </select>
    </div>
    
    <div class="filter-group">
      <label for="status-filter">Filter by Status</label>
      <select id="status-filter">
        <option value="all">All Status</option>
        <option value="pass">Pass</option>
        <option value="fail">Fail</option>
      </select>
    </div>
  </div>
  
  <table id="results-table">
    <thead>
      <tr>
        <th>Browser</th>
        <th>Viewport</th>
        <th>Test</th>
        <th>Status</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      ${results.map(result => `
        <tr data-browser="${result.browser}" data-viewport="${result.viewport}" data-status="${result.success ? 'pass' : 'fail'}">
          <td>${result.browser}</td>
          <td>${result.viewport}</td>
          <td>${result.scenario}</td>
          <td class="status ${result.success ? 'pass' : 'fail'}">${result.success ? 'PASS' : 'FAIL'}</td>
          <td>${result.details}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <script>
    // Simple filtering functionality
    function applyFilters() {
      const browserFilter = document.getElementById('browser-filter').value;
      const viewportFilter = document.getElementById('viewport-filter').value;
      const statusFilter = document.getElementById('status-filter').value;
      
      const rows = document.querySelectorAll('#results-table tbody tr');
      
      rows.forEach(row => {
        const browser = row.getAttribute('data-browser');
        const viewport = row.getAttribute('data-viewport');
        const status = row.getAttribute('data-status');
        
        const browserMatch = browserFilter === 'all' || browser === browserFilter;
        const viewportMatch = viewportFilter === 'all' || viewport === viewportFilter;
        const statusMatch = statusFilter === 'all' || status === statusFilter;
        
        if (browserMatch && viewportMatch && statusMatch) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    }
    
    document.getElementById('browser-filter').addEventListener('change', applyFilters);
    document.getElementById('viewport-filter').addEventListener('change', applyFilters);
    document.getElementById('status-filter').addEventListener('change', applyFilters);
  </script>
</body>
</html>
  `;
  
  fs.writeFileSync(path.join(resultsDir, 'report.html'), html);
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});
