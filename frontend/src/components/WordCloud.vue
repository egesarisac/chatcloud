<template>
  <div class="w-full h-[65vh] mx-auto relative rounded-xl bg-gradient-to-br from-gray-100 via-white to-gray-100 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden border border-gray-200 p-4">
    <!-- Top gradient bar -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-400 z-10"></div>
    <div class="absolute inset-0 bg-gradient-to-br from-primary-light/5 to-primary-dark/5 rounded-xl"></div>
    <svg ref="wordCloudSvg" width="100%" height="100%" class="relative z-10 word-cloud"></svg>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import * as d3 from 'd3';

// Simple word cloud layout function
function createSimpleLayout() {
  return {
    size: function(size) { this._size = size; return this; },
    words: function(words) { this._words = words; return this; },
    padding: function() { return this; },
    rotate: function() { return this; },
    font: function() { return this; },
    fontSize: function() { return this; },
    on: function(event, callback) { 
      if (event === 'end') this._callback = callback;
      return this; 
    },
    start: function() {
      if (!this._callback || !this._words || !this._size) return this;
      
      const words = this._words;
      const width = this._size[0];
      const height = this._size[1];
      
      // Process words with a simple grid layout
      const cols = Math.ceil(Math.sqrt(words.length));
      const processedWords = words.map((d, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const size = d.size || 10;
        
        // Calculate position in grid
        const gridSize = Math.min(width, height) * 0.8;
        const cellSize = gridSize / cols;
        const x = (col * cellSize) - (gridSize / 2) + (cellSize / 2);
        const y = (row * cellSize) - (gridSize / 2) + (cellSize / 2);
        
        return {
          ...d,
          size: d.size || 10,
          x: x,
          y: y,
          rotate: 0
        };
      });
      
      // Call the callback with processed words
      setTimeout(() => this._callback(processedWords), 0);
      return this;
    }
  };
}

export default {
  name: 'WordCloud',
  props: {
    words: {
      type: Array,
      required: true
    }
  },
  emits: ['word-clicked'],
  setup(props, { emit }) {
    const wordCloudSvg = ref(null);
    let resizeObserver = null;

    // Only redraw when the words array actually changes in content
    let drawTimeout = null;
    let previousWordsHash = '';
    
    // Memoized word comparison to prevent unnecessary redraws
    const getWordsHash = (words) => {
      // Create a minimal representation of the words array for comparison
      return words.map(w => `${w.text}:${w.size}`).sort().join('|');
    };
    
    watch(() => props.words, (newWords) => {
      // Generate hash for new words
      const newWordsHash = getWordsHash(newWords);
      
      // Only redraw if the words have actually changed
      if (newWordsHash !== previousWordsHash) {
        previousWordsHash = newWordsHash;
        
        if (drawTimeout) clearTimeout(drawTimeout);
        drawTimeout = setTimeout(() => {
          drawWordCloud();
        }, 300); // Longer timeout to prevent rapid redraws
      }
    }, { deep: true });
    
    const drawWordCloud = () => {
      if (!wordCloudSvg.value) return;
      
      // Performance metric - start time
      const startTime = performance.now();

      const svg = d3.select(wordCloudSvg.value);
      svg.selectAll('*').remove();

      const width = wordCloudSvg.value.clientWidth || 500; // Fallback width
      const height = wordCloudSvg.value.clientHeight || 400; // Fallback height
      
      // Don't proceed if we don't have valid dimensions
      if (width <= 0 || height <= 0) return;
      
      // Create a container group for the words
      const container = svg.append('g')
        .attr('transform', `translate(${width/2},${height/2})`);
      
      // Show loading indicator
      container.append('text')
        .attr('class', 'loading-indicator')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', '18px')
        .attr('fill', '#6B7280')
        .text('Generating word cloud...');
      
      // Process the words array to prepare for rendering
      const words = props.words.map(word => ({
        text: word.text || '',
        size: word.size || 10,
        value: word.value || 1,
        color: word.color || null
      }));
      
      // Create a color scale
      const colorScale = d3.scaleOrdinal()
        .range(['#3B82F6', '#60A5FA', '#2563EB', '#8B5CF6', '#6366F1', '#10B981', '#0EA5E9']);
      
      // Create a simple layout
      const layout = createSimpleLayout()
        .size([width, height])
        .words(words)
        .on('end', (processedWords) => {
          // Remove loading indicator
          container.select('.loading-indicator').remove();
          
          // Add the words with event listeners
          container.selectAll('text')
            .data(processedWords)
            .enter()
            .append('text')
            .style('font-size', d => `${d.size}px`)
            .style('font-family', 'Inter, system-ui, sans-serif')
            .style('fill', d => d.color || colorScale(d.text))
            .style('fill-opacity', 0.9)
            .attr('text-anchor', 'middle')
            .attr('transform', d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
            .attr('class', 'word-cloud-text')
            .style('cursor', 'pointer')
            .text(d => d.text)
            .style('opacity', 0)
            .on('click', (event, d) => emit('word-clicked', d))
            .on('mouseover', function(event, d) {
              d3.select(this)
                .transition()
                .duration(200)
                .style('font-size', `${d.size * 1.2}px`)
                .style('font-weight', '600')
                .style('fill-opacity', 1);
                
              // Show tooltip with frequency information if available
              if (d.value) {
                let tooltip = svg.select('.shared-tooltip');
                if (tooltip.empty()) {
                  tooltip = svg.append('g')
                    .attr('class', 'shared-tooltip')
                    .style('opacity', 0);
                    
                  tooltip.append('rect')
                    .attr('rx', 4)
                    .attr('ry', 4)
                    .attr('fill', 'rgba(17, 24, 39, 0.8)');
                    
                  tooltip.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('y', 16)
                    .attr('fill', 'white')
                    .attr('font-size', '12px')
                    .attr('font-family', 'Inter, system-ui, sans-serif');
                }
                
                const tooltipText = tooltip.select('text');
                tooltipText.text(`${d.text}: ${d.value} mentions`);
                
                const textBBox = tooltipText.node().getBBox();
                tooltip.select('rect')
                  .attr('width', textBBox.width + 20)
                  .attr('height', 30)
                  .attr('x', -textBBox.width / 2 - 10)
                  .attr('y', -5);
                
                const tooltipX = d.x + width / 2;
                const tooltipY = d.y + height / 2 - 30;
                
                tooltip
                  .attr('transform', `translate(${tooltipX}, ${tooltipY})`)
                  .style('opacity', 1);
              }
            })
            .on('mouseout', function(event, d) {
              d3.select(this)
                .transition()
                .duration(200)
                .style('font-size', `${d.size}px`)
                .style('font-weight', 'normal')
                .style('fill-opacity', 0.9);
                
              // Hide tooltip
              svg.select('.shared-tooltip')
                .style('opacity', 0);
            })
            .transition()
            .delay((d, i) => i * 10)
            .duration(300)
            .style('opacity', 1);
            
          // Record render time
          const renderTime = performance.now() - startTime;
          console.log(`Word cloud rendered ${words.length} words in ${renderTime.toFixed(2)}ms`);
          
          // Dispatch render event for performance testing
          window.dispatchEvent(new CustomEvent('wordcloud:rendered', {
            detail: {
              renderTime: renderTime,
              wordCount: words.length,
              timestamp: new Date().toISOString()
            }
          }));
        });
      
      // Start the layout process
      layout.start();
    };
    
    // Simple throttle function to limit function calls
    const throttle = (func, limit) => {
      let inThrottle;
      return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
          func.apply(context, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    };

    onMounted(() => {
      // Wait for the next tick to ensure the DOM is fully rendered
      nextTick(() => {
        if (wordCloudSvg.value) {
          drawWordCloud();
          
          // Use the throttle utility from our optimizer
          let lastWidth = wordCloudSvg.value.clientWidth || 0;
          let lastHeight = wordCloudSvg.value.clientHeight || 0;
          
          // Create throttled resize handler
          const throttledResize = throttle(handleResize, 500);
          
          resizeObserver = new ResizeObserver(() => {
            throttledResize();
          });
          
          function handleResize() {
            // Check if element still exists
            if (!wordCloudSvg.value) return;
            
            const newWidth = wordCloudSvg.value.clientWidth || 0;
            const newHeight = wordCloudSvg.value.clientHeight || 0;
            
            // Only redraw if size changed by more than 10% (increased threshold) and we have a valid size
            if (lastWidth > 0 && lastHeight > 0) {
              const widthChange = Math.abs(newWidth - lastWidth) / lastWidth;
              const heightChange = Math.abs(newHeight - lastHeight) / lastHeight;
              
              if (widthChange > 0.1 || heightChange > 0.1) {
                lastWidth = newWidth;
                lastHeight = newHeight;
                drawWordCloud();
              }
            } else {
              // First valid measurement
              lastWidth = newWidth;
              lastHeight = newHeight;
              if (newWidth > 0 && newHeight > 0) {
                drawWordCloud();
              }
            }
          }
          
          // Observe the SVG element for size changes
          resizeObserver.observe(wordCloudSvg.value);
        }
      });
    });

    onUnmounted(() => {
      // Clean up resize observer
      if (resizeObserver && wordCloudSvg.value) {
        resizeObserver.unobserve(wordCloudSvg.value);
        resizeObserver.disconnect();
      }
      
      // Clear any pending timeouts
      if (drawTimeout) clearTimeout(drawTimeout);
      
      // Clean up D3 elements
      if (wordCloudSvg.value) {
        d3.select(wordCloudSvg.value).selectAll('*').remove();
      }
    });

    return {
      wordCloudSvg
    };
  }
};
</script>

<style scoped>
/* Add CSS animations for better performance than D3 transitions */
.pulsing-word {
  animation: pulse 3s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { fill-opacity: 1; }
  50% { fill-opacity: 0.7; }
}

.word-hovered {
  filter: drop-shadow(0 0 2px rgba(59, 130, 246, 0.5));
  transition: font-size 0.2s ease, font-weight 0.2s ease, fill-opacity 0.2s ease;
  will-change: font-size, font-weight, fill-opacity;
}

.shared-tooltip {
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.loading-indicator {
  font-family: Inter, system-ui, sans-serif;
  font-size: 16px;
  fill: #6B7280;
}

/* Add hardware acceleration for animations */
.pulsing-word {
  transform: translateZ(0);
  backface-visibility: hidden;
  perspective: 1000px;
}
</style>
