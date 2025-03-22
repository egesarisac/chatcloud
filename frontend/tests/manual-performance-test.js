// ChatCloud Manual Performance Test Script
// ====================================
//
// HOW TO USE:
// 1. Open ChatCloud in your browser at http://localhost:3000/?debug=true
// 2. Open browser console (F12 or right-click > Inspect > Console)
// 3. Copy and paste this entire script into the console
// 4. Press Enter to run the tests
//
// This script will test the performance of the word cloud with different word counts
// and report the results in the console.

// Performance test configuration - feel free to modify these values
const config = {
  wordCounts: [50, 100, 200, 300],  // Word counts to test
  iterations: 2,                    // Number of test iterations per word count
  delay: 1000                       // Delay between tests in milliseconds
};

// Results storage
const results = {
  renderTimes: {},
  processingTimes: {},
  cacheMetrics: {}
};

// Utility function to wait
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Run a single test with specific word count
async function runTest(wordCount) {
  console.log(`%cRunning test with ${wordCount} words...`, 'color: blue; font-weight: bold');
  
  // Clear previous results for this word count
  results.renderTimes[wordCount] = [];
  results.processingTimes[wordCount] = [];
  
  // Update URL with test parameters without full page reload
  const url = new URL(window.location);
  url.searchParams.set('debug', 'true');
  url.searchParams.set('testWordCount', wordCount);
  window.history.pushState({}, '', url);
  
  // Generate test words via App.vue method
  window.dispatchEvent(new CustomEvent('generate:testwords', { 
    detail: { count: wordCount } 
  }));
  
  // Wait for page to update
  await wait(1500);
  
  // Force expand the performance monitor if it exists
  const expandButton = Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent.includes('Expand'));
  
  if (expandButton) {
    expandButton.click();
    await wait(500);
  }
  
  // Run multiple iterations
  for (let i = 0; i < config.iterations; i++) {
    console.log(`Iteration ${i + 1}/${config.iterations}`);
    
    // Set up listener for this iteration
    const renderPromise = new Promise(resolve => {
      const handler = event => {
        const { renderTime, wordCount } = event.detail;
        results.renderTimes[wordCount].push(renderTime);
        window.removeEventListener('wordcloud:rendered', handler);
        resolve();
      };
      
      window.addEventListener('wordcloud:rendered', handler);
    });
    
    // Trigger a word cloud test
    window.dispatchEvent(new CustomEvent('wordcloud:test'));
    
    // Wait for render to complete
    await renderPromise;
    
    // Capture word frequency service metrics
    const metricsElements = document.querySelectorAll('.metric');
    let processingTime = null;
    let cacheHitRate = null;
    
    metricsElements.forEach(el => {
      const label = el.querySelector('.metric-label')?.textContent;
      const value = el.querySelector('.metric-value')?.textContent;
      
      if (label && label.includes('Processing Time')) {
        processingTime = parseFloat(value);
        results.processingTimes[wordCount].push(processingTime);
      }
      
      if (label && label.includes('Cache Hit Rate')) {
        cacheHitRate = value;
        if (!results.cacheMetrics[wordCount]) {
          results.cacheMetrics[wordCount] = [];
        }
        results.cacheMetrics[wordCount].push(cacheHitRate);
      }
    });
    
    // Simulate batch messages
    const simulateButton = Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent.includes('Simulate 100 Messages'));
    
    if (simulateButton) {
      simulateButton.click();
      await wait(1000);
    }
    
    // Wait between iterations
    await wait(config.delay);
  }
}

// Run all tests and report results
async function runAllTests() {
  console.log('Starting ChatCloud Performance Tests');
  console.log('====================================');
  
  for (const count of config.wordCounts) {
    await runTest(count);
  }
  
  // Calculate and display results
  console.log('%c\nTest Results:', 'color: green; font-weight: bold; font-size: 14px');
  console.log('%c============', 'color: green');
  
  // Create a table for better visualization
  const tableData = [];
  
  for (const count of config.wordCounts) {
    const renderTimes = results.renderTimes[count] || [];
    const processingTimes = results.processingTimes[count] || [];
    const cacheMetrics = results.cacheMetrics[count] || [];
    
    if (renderTimes.length > 0) {
      const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
      const minRenderTime = Math.min(...renderTimes);
      const maxRenderTime = Math.max(...renderTimes);
      
      console.log(`%cWord Count: ${count}`, 'color: blue; font-weight: bold');
      console.log(`Render Times: ${renderTimes.map(t => t.toFixed(2)).join(', ')} ms`);
      console.log(`Avg Render Time: ${avgRenderTime.toFixed(2)} ms`);
      console.log(`Min/Max Render Time: ${minRenderTime.toFixed(2)}/${maxRenderTime.toFixed(2)} ms`);
      
      let avgProcessingTime = 'N/A';
      if (processingTimes.length > 0) {
        avgProcessingTime = (processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length).toFixed(2);
        console.log(`Avg Processing Time: ${avgProcessingTime} ms`);
      }
      
      let cacheHitRate = 'N/A';
      if (cacheMetrics.length > 0) {
        cacheHitRate = cacheMetrics[cacheMetrics.length - 1];
        console.log(`Cache Hit Rate: ${cacheHitRate}`);
      }
      
      // Add to table data
      tableData.push({
        'Word Count': count,
        'Avg Render Time (ms)': avgRenderTime.toFixed(2),
        'Min/Max Render (ms)': `${minRenderTime.toFixed(2)}/${maxRenderTime.toFixed(2)}`,
        'Avg Processing Time (ms)': avgProcessingTime,
        'Cache Hit Rate': cacheHitRate
      });
    }
  }
  
  // Display as table for better visualization
  console.table(tableData);
  
  console.log('%c\nPerformance testing completed!', 'color: green; font-weight: bold; font-size: 14px');
  console.log('For detailed analysis, see the Performance Monitor panel at the bottom of the page.');
  console.log('You can run more tests by clicking the buttons in the Performance Monitor panel.');
}

// Start the tests
runAllTests().catch(error => {
  console.error('Error during performance tests:', error);
});

// Note: To run this test, copy everything above this line and paste it into your browser console
// while the ChatCloud app is running with debug mode enabled.
