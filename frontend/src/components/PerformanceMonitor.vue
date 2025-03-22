<template>
  <div class="performance-monitor">
    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold text-gray-800">Performance Monitor</h3>
        <button @click="toggleExpanded" class="text-blue-500 hover:text-blue-700">
          {{ expanded ? 'Collapse' : 'Expand' }}
        </button>
      </div>
      
      <div v-if="expanded" class="card-body">
        <div class="metrics-grid">
          <!-- Word Cloud Metrics -->
          <div class="metric-group">
            <h4 class="text-md font-medium text-gray-700">Word Cloud</h4>
            <div class="metric">
              <span class="metric-label">Last Render Time:</span>
              <span class="metric-value">{{ wordCloudMetrics.lastRenderTime }}ms</span>
            </div>
            <div class="metric">
              <span class="metric-label">Average Render Time:</span>
              <span class="metric-value">{{ wordCloudMetrics.avgRenderTime }}ms</span>
            </div>
            <div class="metric">
              <span class="metric-label">Word Count:</span>
              <span class="metric-value">{{ wordCloudMetrics.wordCount }}</span>
            </div>
          </div>
          
          <!-- Word Frequency Service Metrics -->
          <div class="metric-group">
            <h4 class="text-md font-medium text-gray-700">Word Frequency Service</h4>
            <div class="metric">
              <span class="metric-label">Avg Processing Time:</span>
              <span class="metric-value">{{ wordFrequencyMetrics.averageProcessingTime }}ms</span>
            </div>
            <div class="metric">
              <span class="metric-label">Total Messages Processed:</span>
              <span class="metric-value">{{ wordFrequencyMetrics.totalProcessed }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Queue Length:</span>
              <span class="metric-value">{{ wordFrequencyMetrics.queueLength }}</span>
            </div>
            <div class="metric">
              <span class="metric-label">Cache Hit Rate:</span>
              <span class="metric-value">{{ wordFrequencyMetrics.cacheHitRate }}</span>
            </div>
          </div>
          
          <!-- Memory Usage -->
          <div class="metric-group">
            <h4 class="text-md font-medium text-gray-700">Memory Usage</h4>
            <div class="metric">
              <span class="metric-label">JS Heap Used:</span>
              <span class="metric-value">{{ memoryMetrics.usedJSHeapSize }} MB</span>
            </div>
            <div class="metric">
              <span class="metric-label">JS Heap Total:</span>
              <span class="metric-value">{{ memoryMetrics.totalJSHeapSize }} MB</span>
            </div>
            <div class="metric">
              <span class="metric-label">Heap Usage:</span>
              <span class="metric-value">{{ memoryMetrics.heapUsagePercent }}%</span>
            </div>
          </div>
          
          <!-- Performance Test Controls -->
          <div class="metric-group">
            <h4 class="text-md font-medium text-gray-700">Performance Tests</h4>
            <div class="flex space-x-2 mt-2">
              <button @click="runWordCloudTest" class="btn-primary">
                Test Word Cloud
              </button>
              <button @click="simulateMessages" class="btn-secondary">
                Simulate 100 Messages
              </button>
            </div>
            <div v-if="testResults" class="mt-2 text-sm text-gray-600">
              {{ testResults }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import wordFrequencyService from '../wordFrequencyService';

// State
const expanded = ref(false);
const updateInterval = ref(null);
const wordCloudMetrics = ref({
  lastRenderTime: 0,
  avgRenderTime: 0,
  renderTimes: [],
  wordCount: 0
});
const wordFrequencyMetrics = ref({
  averageProcessingTime: '0',
  totalProcessed: 0,
  queueLength: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheHitRate: '0%'
});
const memoryMetrics = ref({
  usedJSHeapSize: 0,
  totalJSHeapSize: 0,
  heapUsagePercent: 0
});
const testResults = ref('');

// Methods
const toggleExpanded = () => {
  expanded.value = !expanded.value;
  
  if (expanded.value) {
    startMetricsUpdates();
  } else {
    stopMetricsUpdates();
  }
};

const updateMetrics = () => {
  // Update word frequency service metrics
  const metrics = wordFrequencyService.getPerformanceMetrics();
  wordFrequencyMetrics.value = metrics;
  
  // Update memory metrics if available
  if (performance.memory) {
    memoryMetrics.value = {
      usedJSHeapSize: (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
      totalJSHeapSize: (performance.memory.totalJSHeapSize / (1024 * 1024)).toFixed(2),
      heapUsagePercent: ((performance.memory.usedJSHeapSize / performance.memory.totalJSHeapSize) * 100).toFixed(1)
    };
  }
};

const startMetricsUpdates = () => {
  updateMetrics();
  updateInterval.value = setInterval(updateMetrics, 1000);
};

const stopMetricsUpdates = () => {
  if (updateInterval.value) {
    clearInterval(updateInterval.value);
    updateInterval.value = null;
  }
};

const handleWordCloudRendered = (event) => {
  const { renderTime, wordCount } = event.detail;
  
  // Update metrics
  wordCloudMetrics.value.lastRenderTime = renderTime.toFixed(2);
  wordCloudMetrics.value.wordCount = wordCount;
  
  // Track average
  wordCloudMetrics.value.renderTimes.push(renderTime);
  if (wordCloudMetrics.value.renderTimes.length > 10) {
    wordCloudMetrics.value.renderTimes.shift();
  }
  
  // Calculate average
  const sum = wordCloudMetrics.value.renderTimes.reduce((a, b) => a + b, 0);
  wordCloudMetrics.value.avgRenderTime = (sum / wordCloudMetrics.value.renderTimes.length).toFixed(2);
};

const runWordCloudTest = () => {
  testResults.value = 'Running word cloud rendering test...';
  
  // Force a word cloud redraw by dispatching a custom event
  window.dispatchEvent(new CustomEvent('wordcloud:test'));
  
  setTimeout(() => {
    testResults.value = `Test completed. Render time: ${wordCloudMetrics.value.lastRenderTime}ms`;
  }, 1000);
};

const simulateMessages = () => {
  testResults.value = 'Simulating 100 messages...';
  
  // Get the current room ID from the URL or use a default
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room') || 'test-room';
  
  // Simulate batch messages
  const result = wordFrequencyService.simulateBatchMessages(roomId, 100);
  
  testResults.value = `Queued ${result.queued} messages for processing`;
};

// Lifecycle hooks
onMounted(() => {
  // Listen for word cloud render events
  window.addEventListener('wordcloud:rendered', handleWordCloudRendered);
});

onUnmounted(() => {
  stopMetricsUpdates();
  window.removeEventListener('wordcloud:rendered', handleWordCloudRendered);
});
</script>

<style scoped>
.performance-monitor {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  margin-bottom: 1rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background-color: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.card-body {
  padding: 1rem;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

@media (min-width: 768px) {
  .metrics-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.metric-group {
  background-color: #f9fafb;
  padding: 0.75rem;
  border-radius: 0.375rem;
}

.metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
}

.metric-label {
  font-size: 0.875rem;
  color: #4b5563;
}

.metric-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: #111827;
}

.btn-primary {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  background-color: #3b82f6;
  color: white;
  font-size: 0.875rem;
  border-radius: 0.25rem;
  transition-property: background-color;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

.btn-primary:hover {
  background-color: #2563eb;
}

.btn-secondary {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  background-color: #e5e7eb;
  color: #1f2937;
  font-size: 0.875rem;
  border-radius: 0.25rem;
  transition-property: background-color;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

.btn-secondary:hover {
  background-color: #d1d5db;
}
</style>
