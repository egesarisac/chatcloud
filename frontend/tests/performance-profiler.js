// Performance Profiler for ChatCloud
// Focuses on D3.js word cloud rendering performance

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:8080',
  reportDir: path.join(__dirname, 'performance-reports'),
  iterations: 5,
  wordCounts: [10, 50, 100, 200, 500],
  scenarios: [
    { name: 'initial-render', description: 'Initial page load and word cloud rendering' },
    { name: 'word-update', description: 'Adding new words to the cloud' },
    { name: 'resize-event', description: 'Resizing the browser window' },
    { name: 'hover-interaction', description: 'Hovering over words in the cloud' },
    { name: 'click-interaction', description: 'Clicking on words in the cloud' },
  ]
};

// Ensure report directory exists
if (!fs.existsSync(CONFIG.reportDir)) {
  fs.mkdirSync(CONFIG.reportDir, { recursive: true });
}

// Performance metrics
const metrics = {
  scenarios: {},
};

// Helper to generate random words
function generateRandomWords(count) {
  const words = [];
  const baseSize = 20;
  const maxSize = 80;
  
  for (let i = 0; i < count; i++) {
    const length = Math.floor(Math.random() * 10) + 3; // 3-12 characters
    let word = '';
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    
    for (let j = 0; j < length; j++) {
      word += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    // Random size between baseSize and maxSize
    const size = baseSize + Math.floor(Math.random() * (maxSize - baseSize));
    
    words.push({
      text: word,
      size,
      count: size - baseSize + 1,
    });
  }
  
  return words;
}

// Main profiling function
async function runPerformanceTests() {
  console.log('Starting Performance Profiling');
  console.log(`Testing URL: ${CONFIG.baseUrl}`);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  // Initialize metrics structure
  for (const scenario of CONFIG.scenarios) {
    metrics.scenarios[scenario.name] = {
      description: scenario.description,
      wordCounts: {},
    };
    
    for (const wordCount of CONFIG.wordCounts) {
      metrics.scenarios[scenario.name].wordCounts[wordCount] = {
        renderTimes: [],
        memoryUsage: [],
        fps: [],
      };
    }
  }
  
  // Run tests for each word count
  for (const wordCount of CONFIG.wordCounts) {
    console.log(`\nTesting with ${wordCount} words`);
    
    // Generate test words
    const testWords = generateRandomWords(wordCount);
    
    // Run multiple iterations for statistical significance
    for (let iteration = 1; iteration <= CONFIG.iterations; iteration++) {
      console.log(`  Iteration ${iteration}/${CONFIG.iterations}`);
      
      const page = await browser.newPage();
      
      // Enable performance metrics collection
      await page.evaluateOnNewDocument(() => {
        window.performanceMetrics = {
          renderStart: 0,
          renderEnd: 0,
          memoryUsage: 0,
          fps: 0,
          events: [],
        };
        
        // Override requestAnimationFrame to measure FPS
        let frameCount = 0;
        let lastFrameTime = performance.now();
        
        const originalRAF = window.requestAnimationFrame;
        window.requestAnimationFrame = function(callback) {
          frameCount++;
          const now = performance.now();
          
          if (now - lastFrameTime >= 1000) {
            window.performanceMetrics.fps = frameCount;
            frameCount = 0;
            lastFrameTime = now;
          }
          
          return originalRAF(callback);
        };
      });
      
      // Inject performance monitoring code
      await page.evaluateOnNewDocument(() => {
        // Track D3 rendering time
        const originalD3Select = window.d3 ? window.d3.select : null;
        
        if (originalD3Select) {
          window.d3.select = function(...args) {
            const selection = originalD3Select.apply(this, args);
            
            // Override append method to track rendering
            const originalAppend = selection.append;
            selection.append = function(...appendArgs) {
              if (appendArgs[0] === 'g' || appendArgs[0] === 'text') {
                window.performanceMetrics.renderStart = performance.now();
              }
              
              const result = originalAppend.apply(this, appendArgs);
              
              if (appendArgs[0] === 'g' || appendArgs[0] === 'text') {
                window.performanceMetrics.renderEnd = performance.now();
                window.performanceMetrics.events.push({
                  type: 'render',
                  element: appendArgs[0],
                  duration: window.performanceMetrics.renderEnd - window.performanceMetrics.renderStart,
                  timestamp: new Date().toISOString(),
                });
              }
              
              return result;
            };
            
            return selection;
          };
        }
      });
      
      // Navigate to the page
      await page.goto(CONFIG.baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for the word cloud to be rendered
      await page.waitForSelector('svg text', { timeout: 30000 });
      
      // Run each scenario
      for (const scenario of CONFIG.scenarios) {
        console.log(`    Testing scenario: ${scenario.name}`);
        
        // Reset metrics for this test
        await page.evaluate(() => {
          window.performanceMetrics = {
            renderStart: 0,
            renderEnd: 0,
            memoryUsage: 0,
            fps: 0,
            events: [],
          };
        });
        
        // Inject test words
        if (scenario.name === 'initial-render' || scenario.name === 'word-update') {
          await page.evaluate((words) => {
            // Find the Vue component and update its words prop
            if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) {
              const app = window.__VUE_DEVTOOLS_GLOBAL_HOOK__.apps[0];
              if (app && app.componentInstances) {
                const wordCloudComponent = app.componentInstances.find(c => 
                  c.name === 'WordCloud' || c.$options.name === 'WordCloud'
                );
                
                if (wordCloudComponent) {
                  wordCloudComponent.words = words;
                }
              }
            } else {
              // Fallback: Try to find the component in the DOM
              const event = new CustomEvent('test:update-words', { detail: words });
              document.dispatchEvent(event);
            }
          }, testWords);
        }
        
        // Execute scenario-specific actions
        switch (scenario.name) {
          case 'resize-event':
            // Resize the viewport several times
            await page.setViewport({ width: 800, height: 600 });
            await page.waitForTimeout(500);
            await page.setViewport({ width: 1200, height: 800 });
            await page.waitForTimeout(500);
            await page.setViewport({ width: 1000, height: 700 });
            break;
            
          case 'hover-interaction':
            // Hover over several words
            const words = await page.$$('svg text');
            for (let i = 0; i < Math.min(10, words.length); i++) {
              await words[i].hover();
              await page.waitForTimeout(200);
            }
            break;
            
          case 'click-interaction':
            // Click on a word
            const clickableWords = await page.$$('svg text');
            if (clickableWords.length > 0) {
              await clickableWords[0].click();
              await page.waitForTimeout(500);
              
              // Go back to main page
              await page.goBack();
              await page.waitForSelector('svg text', { timeout: 30000 });
            }
            break;
        }
        
        // Collect metrics
        const scenarioMetrics = await page.evaluate(() => {
          return {
            renderTime: window.performanceMetrics.renderEnd - window.performanceMetrics.renderStart,
            memoryUsage: performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : 0,
            fps: window.performanceMetrics.fps,
            events: window.performanceMetrics.events,
          };
        });
        
        // Store metrics
        metrics.scenarios[scenario.name].wordCounts[wordCount].renderTimes.push(scenarioMetrics.renderTime);
        metrics.scenarios[scenario.name].wordCounts[wordCount].memoryUsage.push(scenarioMetrics.memoryUsage);
        metrics.scenarios[scenario.name].wordCounts[wordCount].fps.push(scenarioMetrics.fps);
        
        console.log(`      Render time: ${scenarioMetrics.renderTime.toFixed(2)}ms`);
        console.log(`      Memory usage: ${scenarioMetrics.memoryUsage.toFixed(2)}MB`);
        console.log(`      FPS: ${scenarioMetrics.fps}`);
      }
      
      // Close the page
      await page.close();
    }
  }
  
  // Close the browser
  await browser.close();
  
  // Process and save results
  processResults();
}

// Process results and generate report
function processResults() {
  const results = {
    timestamp: new Date().toISOString(),
    summary: {},
    details: metrics,
  };
  
  // Calculate averages for each scenario and word count
  for (const scenarioName in metrics.scenarios) {
    const scenario = metrics.scenarios[scenarioName];
    results.summary[scenarioName] = { wordCounts: {} };
    
    for (const wordCount in scenario.wordCounts) {
      const data = scenario.wordCounts[wordCount];
      
      // Calculate averages
      const avgRenderTime = data.renderTimes.reduce((sum, time) => sum + time, 0) / data.renderTimes.length;
      const avgMemoryUsage = data.memoryUsage.reduce((sum, mem) => sum + mem, 0) / data.memoryUsage.length;
      const avgFps = data.fps.reduce((sum, fps) => sum + fps, 0) / data.fps.length;
      
      results.summary[scenarioName].wordCounts[wordCount] = {
        avgRenderTime,
        avgMemoryUsage,
        avgFps,
      };
    }
  }
  
  // Save JSON results
  const jsonPath = path.join(CONFIG.reportDir, `performance-results-${Date.now()}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${jsonPath}`);
  
  // Generate HTML report
  generateHtmlReport(results);
}

// Generate HTML report
function generateHtmlReport(results) {
  const reportPath = path.join(CONFIG.reportDir, `performance-report-${Date.now()}.html`);
  
  // Create chart data
  const chartData = {
    labels: CONFIG.wordCounts.map(String),
    datasets: CONFIG.scenarios.map(scenario => ({
      label: scenario.name,
      data: CONFIG.wordCounts.map(wordCount => 
        results.summary[scenario.name].wordCounts[wordCount].avgRenderTime
      ),
    })),
  };
  
  const reportContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChatCloud Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
    h1 { color: #3B82F6; }
    .chart-container { height: 400px; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
    .scenario-section { margin-bottom: 40px; }
  </style>
</head>
<body>
  <h1>ChatCloud Performance Report</h1>
  <p>Generated on ${new Date(results.timestamp).toLocaleString()}</p>
  
  <h2>Render Time by Word Count</h2>
  <div class="chart-container">
    <canvas id="renderTimeChart"></canvas>
  </div>
  
  <h2>Memory Usage by Word Count</h2>
  <div class="chart-container">
    <canvas id="memoryUsageChart"></canvas>
  </div>
  
  <h2>FPS by Word Count</h2>
  <div class="chart-container">
    <canvas id="fpsChart"></canvas>
  </div>
  
  <h2>Detailed Results</h2>
  
  ${CONFIG.scenarios.map(scenario => `
    <div class="scenario-section">
      <h3>${scenario.name} - ${scenario.description}</h3>
      <table>
        <thead>
          <tr>
            <th>Word Count</th>
            <th>Avg. Render Time (ms)</th>
            <th>Avg. Memory Usage (MB)</th>
            <th>Avg. FPS</th>
          </tr>
        </thead>
        <tbody>
          ${CONFIG.wordCounts.map(wordCount => {
            const data = results.summary[scenario.name].wordCounts[wordCount];
            return `
              <tr>
                <td>${wordCount}</td>
                <td>${data.avgRenderTime.toFixed(2)}</td>
                <td>${data.avgMemoryUsage.toFixed(2)}</td>
                <td>${data.avgFps.toFixed(1)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `).join('')}
  
  <script>
    // Render Time Chart
    new Chart(document.getElementById('renderTimeChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(CONFIG.wordCounts)},
        datasets: ${JSON.stringify(CONFIG.scenarios.map(scenario => ({
          label: scenario.name,
          data: CONFIG.wordCounts.map(wordCount => 
            results.summary[scenario.name].wordCounts[wordCount].avgRenderTime
          ),
          borderColor: getRandomColor(),
          fill: false,
        })))}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: {
              display: true,
              text: 'Render Time (ms)'
            },
            beginAtZero: true
          },
          x: {
            title: {
              display: true,
              text: 'Word Count'
            }
          }
        }
      }
    });
    
    // Memory Usage Chart
    new Chart(document.getElementById('memoryUsageChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(CONFIG.wordCounts)},
        datasets: ${JSON.stringify(CONFIG.scenarios.map(scenario => ({
          label: scenario.name,
          data: CONFIG.wordCounts.map(wordCount => 
            results.summary[scenario.name].wordCounts[wordCount].avgMemoryUsage
          ),
          borderColor: getRandomColor(),
          fill: false,
        })))}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: {
              display: true,
              text: 'Memory Usage (MB)'
            },
            beginAtZero: true
          },
          x: {
            title: {
              display: true,
              text: 'Word Count'
            }
          }
        }
      }
    });
    
    // FPS Chart
    new Chart(document.getElementById('fpsChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(CONFIG.wordCounts)},
        datasets: ${JSON.stringify(CONFIG.scenarios.map(scenario => ({
          label: scenario.name,
          data: CONFIG.wordCounts.map(wordCount => 
            results.summary[scenario.name].wordCounts[wordCount].avgFps
          ),
          borderColor: getRandomColor(),
          fill: false,
        })))}
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: {
              display: true,
              text: 'FPS'
            },
            beginAtZero: true
          },
          x: {
            title: {
              display: true,
              text: 'Word Count'
            }
          }
        }
      }
    });
    
    function getRandomColor() {
      const letters = '0123456789ABCDEF';
      let color = '#';
      for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
      }
      return color;
    }
  </script>
</body>
</html>
  `;
  
  fs.writeFileSync(reportPath, reportContent);
  console.log(`HTML report generated: ${reportPath}`);
}

// Run the performance tests
runPerformanceTests().catch(error => {
  console.error('Fatal error in performance tests:', error);
  process.exit(1);
});
