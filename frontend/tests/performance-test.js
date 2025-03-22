// ChatCloud Performance Test Script
// This script tests the performance of the word cloud and word frequency service

const puppeteer = require('puppeteer');

async function runPerformanceTest() {
  console.log('Starting ChatCloud Performance Test');
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Use non-headless mode for debugging
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Add these arguments for better compatibility
  });
  
  // Create a new page
  const page = await browser.newPage();
  
  // Enable performance metrics and inject test helpers
  await page.evaluateOnNewDocument(() => {
    window.performanceData = {
      wordCloudRenders: [],
      wordProcessingTimes: [],
      cacheHits: 0,
      cacheMisses: 0,
      testReady: false
    };
    
    // Listen for word cloud render events
    window.addEventListener('wordcloud:rendered', (event) => {
      // Use the current test word count if available, otherwise use the one from the event
      const wordCount = window.currentTestWordCount || event.detail.wordCount;
      
      window.performanceData.wordCloudRenders.push({
        renderTime: event.detail.renderTime,
        wordCount: wordCount,
        timestamp: event.detail.timestamp || new Date().toISOString(),
        batchSize: event.detail.batchSize,
        batches: event.detail.batches
      });
      
      // Mark test as ready when we get a render event
      window.performanceData.testReady = true;
      
      console.log(`Word cloud rendered in ${event.detail.renderTime.toFixed(2)}ms with ${wordCount} words (${event.detail.batches} batches of ${event.detail.batchSize})`);
    });
    
    // Create a global helper to manually trigger a test event
    window.triggerWordCloudTest = () => {
      console.log('Manually triggering word cloud test event');
      window.dispatchEvent(new CustomEvent('wordcloud:test'));
      return true;
    };
  });
  
  // Navigate to the app with debug mode and test word count
  const appUrl = 'http://localhost:3000/?debug=true&testWordCount=200';
  console.log(`Navigating to: ${appUrl}`);
  
  await page.goto(appUrl, {
    waitUntil: 'networkidle2'
  });
  
  console.log('Page loaded, waiting for initial render...');
  
  // Wait for the page to fully load
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Explicitly generate test words first
  await page.evaluate((wordCount) => {
    console.log(`Generating ${wordCount} test words...`);
    // Dispatch event to generate test words
    window.dispatchEvent(new CustomEvent('generate:testwords', { 
      detail: { count: wordCount } 
    }));
    console.log('Test words generation event dispatched');
    
    // After a short delay, trigger the word cloud test event
    setTimeout(() => {
      console.log('Triggering word cloud test event');
      window.dispatchEvent(new CustomEvent('wordcloud:test'));
    }, 500);
    
    return document.body.innerHTML.includes('word-cloud');
  }, 200);
  
  // Wait a bit longer for the events to be processed
  console.log('Waiting for word cloud to render...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check if words were rendered
  const wordsRendered = await page.evaluate(() => {
    // Updated selector to match the actual implementation
    const wordCloudSvg = document.querySelector('svg.word-cloud');
    const wordElements = wordCloudSvg ? wordCloudSvg.querySelectorAll('text') : [];
    console.log(`Found ${wordElements.length} word elements in the SVG`);
    return wordElements.length > 0;
  });
  
  console.log(wordsRendered ? 'Words rendered successfully!' : 'No words rendered in the cloud!');
  
  if (!wordsRendered) {
    // Try to debug why words aren't rendering
    await page.evaluate(() => {
      console.log('DEBUG: Current words data:', JSON.stringify(window.debugWordData || 'No debug word data'));
      console.log('DEBUG: Word cloud component exists:', !!document.querySelector('svg.word-cloud'));
      console.log('DEBUG: SVG content:', document.querySelector('svg') ? document.querySelector('svg').innerHTML : 'No SVG content');
    });
  }
  
  // Run tests with different word counts
  const testWordCounts = [50, 100, 200, 300, 500];
  
  for (const wordCount of testWordCounts) {
    console.log(`Testing with ${wordCount} words...`);
    
    // Navigate to the app with the current test word count
    const testUrl = `http://localhost:3000/?debug=true&testWordCount=${wordCount}`;
    console.log(`Navigating to: ${testUrl}`);
    
    await page.goto(testUrl, {
      waitUntil: 'networkidle2'
    });
    
    // Wait for the page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Reset the test ready flag
    await page.evaluate(() => {
      window.performanceData.testReady = false;
      console.log('Reset test ready flag');
    });
    
    // Explicitly generate test words and trigger word cloud test
    await page.evaluate((testCount) => {
      console.log(`Generating ${testCount} test words for this iteration...`);
      // Generate test words
      window.dispatchEvent(new CustomEvent('generate:testwords', { 
        detail: { count: testCount } 
      }));
      
      // After a short delay, trigger the word cloud test
      setTimeout(() => {
        console.log('Triggering word cloud test event');
        window.dispatchEvent(new CustomEvent('wordcloud:test'));
      }, 500);
    }, wordCount);
    
    // Wait longer for the events to be processed
    console.log(`Waiting for ${wordCount} words to render...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if words were rendered
    const wordsRendered = await page.evaluate(() => {
      const wordCloudSvg = document.querySelector('svg.word-cloud');
      const wordElements = wordCloudSvg ? wordCloudSvg.querySelectorAll('text') : [];
      console.log(`Found ${wordElements.length} word elements in the SVG`);
      return wordElements.length > 0;
    });
    
    console.log(wordsRendered ? `${wordCount} words rendered successfully!` : `No words rendered for ${wordCount} test!`);
    
    if (!wordsRendered) {
      // Add window.debugWordData in App.vue to expose the current words data
      await page.evaluate(() => {
        console.log('DEBUG: Current words array:', JSON.stringify(window.debugWordData || 'No debug word data'));
      });
    }
    
    // Run the word cloud test via the performance monitor
    await page.evaluate(() => {
      // Find and click the "Test Word Cloud" button in the PerformanceMonitor
      const testButton = Array.from(document.querySelectorAll('button'))
        .find(button => button.textContent.includes('Test Word Cloud'));
      
      if (testButton) {
        testButton.click();
      }
    });
    
    // Wait a moment for the test to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate batch messages
    await page.evaluate(() => {
      // Find and click the "Simulate 100 Messages" button
      const simulateButton = Array.from(document.querySelectorAll('button'))
        .find(button => button.textContent.includes('Simulate 100 Messages'));
      
      if (simulateButton) {
        simulateButton.click();
      }
    });
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Collect performance metrics
    const metrics = await page.evaluate(() => {
      // Get the last word cloud render time
      const lastRender = window.performanceData.wordCloudRenders[
        window.performanceData.wordCloudRenders.length - 1
      ];
      
      // Get word frequency service metrics from the DOM
      const averageProcessingTime = document.querySelector('.metric-value')?.textContent || 'N/A';
      
      return {
        wordCount: lastRender ? lastRender.wordCount : 0,
        renderTime: lastRender ? lastRender.renderTime : 0,
        processingTime: averageProcessingTime
      };
    });
    
    console.log(`Results for ${wordCount} words:`);
    console.log(`- Render time: ${metrics.renderTime.toFixed(2)}ms`);
    console.log(`- Processing time: ${metrics.processingTime}`);
    console.log('-----------------------------------');
  }
  
  // Get final performance summary
  const summary = await page.evaluate(() => {
    const renders = window.performanceData.wordCloudRenders || [];
    
    if (renders.length === 0) {
      return { 
        totalTests: 0,
        avgRenderTime: 0,
        minRenderTime: 0,
        maxRenderTime: 0,
        hasData: false
      };
    }
    
    // Calculate average render time
    const totalRenderTime = renders.reduce((sum, item) => sum + item.renderTime, 0);
    const avgRenderTime = totalRenderTime / renders.length;
    
    // Find min and max render times
    const minRenderTime = Math.min(...renders.map(item => item.renderTime));
    const maxRenderTime = Math.max(...renders.map(item => item.renderTime));
    
    // Group by word count - ensure we have numeric word counts
    const byWordCount = {};
    renders.forEach(render => {
      // Convert to number and ensure it's valid
      const count = parseInt(render.wordCount, 10);
      if (isNaN(count)) return; // Skip invalid word counts
      
      if (!byWordCount[count]) {
        byWordCount[count] = [];
      }
      byWordCount[count].push(render.renderTime);
    });
    
    // Log the raw data for debugging
    console.log('Raw render data:', JSON.stringify(renders.map(r => ({ 
      wordCount: r.wordCount, 
      renderTime: r.renderTime.toFixed(2) 
    }))));
    
    return {
      totalTests: renders.length,
      avgRenderTime,
      minRenderTime,
      maxRenderTime,
      byWordCount,
      hasData: true,
      rawRenders: renders
    };
  });
  
  console.log('\nPerformance Summary:');
  
  if (!summary.hasData) {
    console.log('No performance data was collected during the test.');
    console.log('This could be because:');
    console.log('1. The word cloud component is not emitting the "wordcloud:rendered" event');
    console.log('2. The test didn\'t wait long enough for the events to fire');
    console.log('3. There might be an error in the word cloud rendering logic');
  } else {
    console.log(`Total tests: ${summary.totalTests}`);
    console.log(`Average render time: ${summary.avgRenderTime.toFixed(2)}ms`);
    console.log(`Min render time: ${summary.minRenderTime.toFixed(2)}ms`);
    console.log(`Max render time: ${summary.maxRenderTime.toFixed(2)}ms`);
    
    console.log('\nBreakdown by word count:');
    for (const [count, times] of Object.entries(summary.byWordCount)) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      console.log(`  ${count} words: ${avg.toFixed(2)}ms avg (${min.toFixed(2)}ms - ${max.toFixed(2)}ms) [${times.length} samples]`);
    }
  }
  
  // Close the browser
  await browser.close();
  
  console.log('\nPerformance test completed.');
}

// Run the test
runPerformanceTest().catch(error => {
  console.error('Error during performance test:', error);
  process.exit(1);
});
