/**
 * WordCloud Performance Monitor
 * 
 * This script monitors and analyzes the performance of the D3.js word cloud component.
 * It tracks metrics such as render time, FPS, memory usage, and DOM operations.
 * Results are saved to an HTML report for analysis.
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  baseUrl: 'http://localhost:8080',
  testDuration: 60000, // 1 minute of monitoring
  sampleInterval: 1000, // Take measurements every second
  wordCounts: [50, 100, 200, 500, 1000], // Test with different word counts
  iterations: 3, // Run each test multiple times for more reliable results
  reportDir: path.join(__dirname, '../reports/performance'),
};

// Ensure report directory exists
if (!fs.existsSync(config.reportDir)) {
  fs.mkdirSync(config.reportDir, { recursive: true });
}

// Performance metrics to track
class PerformanceMetrics {
  constructor() {
    this.renderTimes = [];
    this.fps = [];
    this.memoryUsage = [];
    this.domOperations = [];
    this.wordCount = 0;
  }

  addRenderTime(time) {
    this.renderTimes.push(time);
  }

  addFps(fps) {
    this.fps.push(fps);
  }

  addMemoryUsage(memory) {
    this.memoryUsage.push(memory);
  }

  addDomOperations(count) {
    this.domOperations.push(count);
  }

  getAverageRenderTime() {
    return this.renderTimes.length > 0 
      ? this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length 
      : 0;
  }

  getAverageFps() {
    return this.fps.length > 0 
      ? this.fps.reduce((a, b) => a + b, 0) / this.fps.length 
      : 0;
  }

  getAverageMemoryUsage() {
    return this.memoryUsage.length > 0 
      ? this.memoryUsage.reduce((a, b) => a + b, 0) / this.memoryUsage.length 
      : 0;
  }

  getAverageDomOperations() {
    return this.domOperations.length > 0 
      ? this.domOperations.reduce((a, b) => a + b, 0) / this.domOperations.length 
      : 0;
  }
}

// Main test function
async function runPerformanceTests() {
  console.log('Starting WordCloud performance tests...');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];

  try {
    // Test each word count
    for (const wordCount of config.wordCounts) {
      console.log(`Testing with ${wordCount} words...`);
      
      const metrics = new PerformanceMetrics();
      metrics.wordCount = wordCount;
      
      // Run multiple iterations for more reliable results
      for (let i = 0; i < config.iterations; i++) {
        console.log(`  Iteration ${i + 1}/${config.iterations}`);
        const page = await browser.newPage();
        
        // Enable performance metrics
        await page.evaluateOnNewDocument(() => {
          window.performanceMetrics = {
            renderTimes: [],
            domMutations: 0,
          };
          
          // Track render times from custom events
          window.addEventListener('wordcloud:rendered', (event) => {
            window.performanceMetrics.renderTimes.push(event.detail.renderTime);
          });
          
          // Track DOM mutations
          const observer = new MutationObserver((mutations) => {
            window.performanceMetrics.domMutations += mutations.length;
          });
          
          // Start observing once DOM is loaded
          document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { 
              childList: true, 
              subtree: true,
              attributes: true,
            });
          });
        });
        
        // Navigate to the app with a specific word count parameter
        await page.goto(`${config.baseUrl}/?testWordCount=${wordCount}`, { waitUntil: 'networkidle2' });
        
        // Wait for the word cloud to be visible
        await page.waitForSelector('.word-cloud-container svg', { visible: true, timeout: 30000 });
        
        // Start monitoring
        console.log('    Monitoring performance...');
        const startTime = Date.now();
        
        while (Date.now() - startTime < config.testDuration / config.iterations) {
          // Collect metrics
          const performanceMetrics = await page.evaluate(() => {
            const memory = performance.memory ? {
              usedJSHeapSize: performance.memory.usedJSHeapSize,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
            } : { usedJSHeapSize: 0, totalJSHeapSize: 0 };
            
            // Calculate FPS
            let fps = 0;
            if (window.requestAnimationFrame) {
              let lastTime = performance.now();
              let frames = 0;
              
              window.requestAnimationFrame(function measure(time) {
                frames++;
                if (time - lastTime >= 1000) {
                  fps = frames;
                  frames = 0;
                  lastTime = time;
                }
                window.requestAnimationFrame(measure);
              });
              
              // Wait a bit to get a valid FPS reading
              return new Promise(resolve => {
                setTimeout(() => {
                  resolve({
                    renderTimes: window.performanceMetrics.renderTimes,
                    fps,
                    memory,
                    domMutations: window.performanceMetrics.domMutations,
                  });
                }, 1000);
              });
            }
            
            return {
              renderTimes: window.performanceMetrics.renderTimes,
              fps: 0,
              memory,
              domMutations: window.performanceMetrics.domMutations,
            };
          });
          
          // Add metrics to our tracker
          if (performanceMetrics.renderTimes.length > 0) {
            metrics.addRenderTime(performanceMetrics.renderTimes[performanceMetrics.renderTimes.length - 1]);
          }
          metrics.addFps(performanceMetrics.fps);
          metrics.addMemoryUsage(performanceMetrics.memory.usedJSHeapSize / (1024 * 1024)); // Convert to MB
          metrics.addDomOperations(performanceMetrics.domMutations);
          
          // Wait before next sample
          await new Promise(resolve => setTimeout(resolve, config.sampleInterval));
        }
        
        // Trigger a few word cloud updates to measure render time
        for (let j = 0; j < 5; j++) {
          await page.evaluate(() => {
            // Simulate adding new words to trigger a redraw
            if (window.app && window.app.$store) {
              const store = window.app.$store;
              if (store.dispatch) {
                store.dispatch('simulateNewMessage', { 
                  text: `Test message ${Date.now()} with some random words to trigger update`,
                  userId: 'test-user',
                  roomId: 'test-room'
                });
              }
            }
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Take a screenshot for the report
        const screenshotPath = path.join(config.reportDir, `wordcloud-${wordCount}-words.png`);
        await page.screenshot({ path: screenshotPath });
        
        await page.close();
      }
      
      // Add results for this word count
      results.push({
        wordCount,
        averageRenderTime: metrics.getAverageRenderTime(),
        averageFps: metrics.getAverageFps(),
        averageMemoryUsage: metrics.getAverageMemoryUsage(),
        averageDomOperations: metrics.getAverageDomOperations(),
      });
      
      console.log(`  Results for ${wordCount} words:`);
      console.log(`    Average Render Time: ${metrics.getAverageRenderTime().toFixed(2)}ms`);
      console.log(`    Average FPS: ${metrics.getAverageFps().toFixed(2)}`);
      console.log(`    Average Memory Usage: ${metrics.getAverageMemoryUsage().toFixed(2)}MB`);
      console.log(`    Average DOM Operations: ${metrics.getAverageDomOperations().toFixed(0)}`);
    }
    
    // Generate HTML report
    generateReport(results);
    
  } catch (error) {
    console.error('Error during performance testing:', error);
  } finally {
    await browser.close();
  }
}

// Generate HTML report with charts
function generateReport(results) {
  const reportPath = path.join(config.reportDir, 'wordcloud-performance-report.html');
  
  const wordCounts = results.map(r => r.wordCount);
  const renderTimes = results.map(r => r.averageRenderTime);
  const fpsList = results.map(r => r.averageFps);
  const memoryUsage = results.map(r => r.averageMemoryUsage);
  const domOperations = results.map(r => r.averageDomOperations);
  
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WordCloud Performance Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f7fa;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background-color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    h1 {
      color: #2563eb;
      text-align: center;
      margin-bottom: 30px;
    }
    .chart-container {
      margin-bottom: 40px;
      padding: 20px;
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
    }
    .metrics-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      margin-bottom: 40px;
    }
    .metrics-table th, .metrics-table td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: center;
    }
    .metrics-table th {
      background-color: #2563eb;
      color: white;
    }
    .metrics-table tr:nth-child(even) {
      background-color: #f2f7ff;
    }
    .screenshot-gallery {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 20px;
      margin-top: 40px;
    }
    .screenshot {
      max-width: 400px;
      border-radius: 8px;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    }
    .timestamp {
      text-align: center;
      margin-top: 40px;
      color: #666;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>WordCloud Performance Report</h1>
    
    <div class="chart-container">
      <canvas id="renderTimeChart"></canvas>
    </div>
    
    <div class="chart-container">
      <canvas id="fpsChart"></canvas>
    </div>
    
    <div class="chart-container">
      <canvas id="memoryChart"></canvas>
    </div>
    
    <div class="chart-container">
      <canvas id="domOperationsChart"></canvas>
    </div>
    
    <h2>Performance Metrics Summary</h2>
    <table class="metrics-table">
      <thead>
        <tr>
          <th>Word Count</th>
          <th>Render Time (ms)</th>
          <th>FPS</th>
          <th>Memory Usage (MB)</th>
          <th>DOM Operations</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(r => `
          <tr>
            <td>${r.wordCount}</td>
            <td>${r.averageRenderTime.toFixed(2)}</td>
            <td>${r.averageFps.toFixed(2)}</td>
            <td>${r.averageMemoryUsage.toFixed(2)}</td>
            <td>${r.averageDomOperations.toFixed(0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <h2>Screenshots</h2>
    <div class="screenshot-gallery">
      ${wordCounts.map(count => `
        <div>
          <h3>${count} Words</h3>
          <img src="wordcloud-${count}-words.png" alt="WordCloud with ${count} words" class="screenshot">
        </div>
      `).join('')}
    </div>
    
    <div class="timestamp">
      Report generated on ${new Date().toLocaleString()}
    </div>
  </div>
  
  <script>
    // Render Time Chart
    new Chart(document.getElementById('renderTimeChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(wordCounts)},
        datasets: [{
          label: 'Average Render Time (ms)',
          data: ${JSON.stringify(renderTimes)},
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Render Time vs Word Count',
            font: { size: 16 }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Word Count'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Render Time (ms)'
            },
            beginAtZero: true
          }
        }
      }
    });
    
    // FPS Chart
    new Chart(document.getElementById('fpsChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(wordCounts)},
        datasets: [{
          label: 'Average FPS',
          data: ${JSON.stringify(fpsList)},
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'FPS vs Word Count',
            font: { size: 16 }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Word Count'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Frames Per Second'
            },
            beginAtZero: true
          }
        }
      }
    });
    
    // Memory Usage Chart
    new Chart(document.getElementById('memoryChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(wordCounts)},
        datasets: [{
          label: 'Average Memory Usage (MB)',
          data: ${JSON.stringify(memoryUsage)},
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Memory Usage vs Word Count',
            font: { size: 16 }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Word Count'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Memory Usage (MB)'
            },
            beginAtZero: true
          }
        }
      }
    });
    
    // DOM Operations Chart
    new Chart(document.getElementById('domOperationsChart'), {
      type: 'line',
      data: {
        labels: ${JSON.stringify(wordCounts)},
        datasets: [{
          label: 'Average DOM Operations',
          data: ${JSON.stringify(domOperations)},
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'DOM Operations vs Word Count',
            font: { size: 16 }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Word Count'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Number of DOM Operations'
            },
            beginAtZero: true
          }
        }
      }
    });
  </script>
</body>
</html>
  `;
  
  fs.writeFileSync(reportPath, htmlContent);
  console.log(`Performance report generated at: ${reportPath}`);
}

// Run the tests
runPerformanceTests().catch(console.error);
