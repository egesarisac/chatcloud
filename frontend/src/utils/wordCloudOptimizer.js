/**
 * WordCloudOptimizer
 * 
 * This utility provides optimization strategies for the D3.js word cloud rendering
 * to improve performance, especially with large datasets.
 */

// Throttle function to limit how often a function can be called
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

// Debounce function to delay execution until after a quiet period
const debounce = (func, delay) => {
  let debounceTimer;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(context, args), delay);
  };
};

/**
 * Optimizes word cloud data to improve rendering performance
 * @param {Array} words - Array of word objects with text and size properties
 * @param {Object} options - Configuration options
 * @returns {Array} - Optimized array of words
 */
function optimizeWordCloudData(words, options = {}) {
  const {
    maxWords = 150,
    minSize = 10,
    sizeThreshold = 15,
    similarityThreshold = 0.8,
    prioritizeRecent = true
  } = options;
  
  if (!words || words.length === 0) return [];
  
  // Make a copy to avoid mutating the original
  let optimizedWords = [...words];
  
  // Step 1: Filter out very small words if we have too many
  if (optimizedWords.length > maxWords) {
    optimizedWords = optimizedWords.filter(word => word.size >= minSize);
  }
  
  // Step 2: If we still have too many words, prioritize by size and recency
  if (optimizedWords.length > maxWords) {
    if (prioritizeRecent) {
      // Sort by combination of size and timestamp (if available)
      optimizedWords.sort((a, b) => {
        const aScore = a.size + (a.timestamp ? Date.now() - a.timestamp : 0) / 86400000;
        const bScore = b.size + (b.timestamp ? Date.now() - b.timestamp : 0) / 86400000;
        return bScore - aScore;
      });
    } else {
      // Sort by size only
      optimizedWords.sort((a, b) => b.size - a.size);
    }
    
    // Limit to maxWords
    optimizedWords = optimizedWords.slice(0, maxWords);
  }
  
  // Step 3: Combine very similar words
  const combinedWords = [];
  const usedIndices = new Set();
  
  for (let i = 0; i < optimizedWords.length; i++) {
    if (usedIndices.has(i)) continue;
    
    const word = optimizedWords[i];
    const similarWords = [];
    
    // Find similar words
    for (let j = i + 1; j < optimizedWords.length; j++) {
      if (usedIndices.has(j)) continue;
      
      const otherWord = optimizedWords[j];
      
      // Check for similarity (simple case-insensitive check)
      if (areWordsSimilar(word.text, otherWord.text, similarityThreshold)) {
        similarWords.push(otherWord);
        usedIndices.add(j);
      }
    }
    
    // If we found similar words, combine them
    if (similarWords.length > 0) {
      // Use the largest word as the representative
      const allRelatedWords = [word, ...similarWords];
      const largest = allRelatedWords.reduce((prev, current) => 
        (prev.size > current.size) ? prev : current
      );
      
      // Sum the sizes
      largest.size = Math.min(100, allRelatedWords.reduce((sum, w) => sum + w.size, 0));
      
      combinedWords.push(largest);
    } else {
      combinedWords.push(word);
    }
  }
  
  return combinedWords;
}

/**
 * Checks if two words are similar based on string similarity
 * @param {string} word1 - First word
 * @param {string} word2 - Second word
 * @param {number} threshold - Similarity threshold (0-1)
 * @returns {boolean} - True if words are similar
 */
function areWordsSimilar(word1, word2, threshold) {
  // Simple case: exact match after normalization
  const normalized1 = word1.toLowerCase().trim();
  const normalized2 = word2.toLowerCase().trim();
  
  if (normalized1 === normalized2) return true;
  
  // Check for plural forms or common variations
  if (normalized1 + 's' === normalized2 || normalized2 + 's' === normalized1) return true;
  if (normalized1 + 'es' === normalized2 || normalized2 + 'es' === normalized1) return true;
  
  // For more complex similarity, use Levenshtein distance
  if (threshold < 1) {
    const distance = levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    const similarity = 1 - (distance / maxLength);
    return similarity >= threshold;
  }
  
  return false;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Levenshtein distance
 */
function levenshteinDistance(a, b) {
  const matrix = [];
  
  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Creates an optimized layout function for D3 cloud
 * @param {Function} d3CloudLayout - Original d3.layout.cloud function
 * @param {Object} options - Optimization options
 * @returns {Function} - Optimized layout function
 */
function createOptimizedLayout(d3CloudLayout, options = {}) {
  const {
    cacheEnabled = true,
    cacheSize = 50,
    throttleTime = 100
  } = options;
  
  // Simple LRU cache for layouts
  const layoutCache = new Map();
  
  // Function to generate cache key from words array
  const generateCacheKey = (words) => {
    return words.map(w => `${w.text}:${w.size}`).sort().join('|');
  };
  
  // Throttled layout function
  const throttledLayout = throttle((words, callback) => {
    d3CloudLayout
      .words(words)
      .on('end', callback)
      .start();
  }, throttleTime);
  
  // Return the optimized layout function
  return function optimizedLayout(words, callback) {
    // First optimize the word data
    const optimizedWords = optimizeWordCloudData(words, options);
    
    // If caching is enabled, check cache first
    if (cacheEnabled) {
      const cacheKey = generateCacheKey(optimizedWords);
      
      if (layoutCache.has(cacheKey)) {
        // Use cached layout
        const cachedResult = layoutCache.get(cacheKey);
        setTimeout(() => callback(cachedResult), 0);
        return;
      }
      
      // Wrap callback to cache result
      const wrappedCallback = (result) => {
        // Limit cache size (LRU implementation)
        if (layoutCache.size >= cacheSize) {
          const firstKey = layoutCache.keys().next().value;
          layoutCache.delete(firstKey);
        }
        
        // Cache the result
        layoutCache.set(cacheKey, result);
        
        // Call original callback
        callback(result);
      };
      
      // Run layout with throttling
      throttledLayout(optimizedWords, wrappedCallback);
    } else {
      // Run layout with throttling but no caching
      throttledLayout(optimizedWords, callback);
    }
  };
}

/**
 * Measures and reports word cloud performance metrics
 */
class WordCloudPerformanceMonitor {
  constructor() {
    this.metrics = {
      renderTimes: [],
      processingTimes: [],
      wordCounts: [],
      cacheHits: 0,
      cacheMisses: 0
    };
    
    this.maxSamples = 20;
  }
  
  /**
   * Record a render time
   * @param {number} renderTime - Time in milliseconds
   * @param {number} wordCount - Number of words rendered
   */
  recordRenderTime(renderTime, wordCount) {
    this.metrics.renderTimes.push(renderTime);
    this.metrics.wordCounts.push(wordCount);
    
    // Keep only the most recent samples
    if (this.metrics.renderTimes.length > this.maxSamples) {
      this.metrics.renderTimes.shift();
      this.metrics.wordCounts.shift();
    }
    
    // Dispatch event for performance monitoring
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wordcloud:rendered', {
        detail: { renderTime, wordCount }
      }));
    }
  }
  
  /**
   * Record a processing time
   * @param {number} processingTime - Time in milliseconds
   */
  recordProcessingTime(processingTime) {
    this.metrics.processingTimes.push(processingTime);
    
    // Keep only the most recent samples
    if (this.metrics.processingTimes.length > this.maxSamples) {
      this.metrics.processingTimes.shift();
    }
  }
  
  /**
   * Record a cache hit or miss
   * @param {boolean} isHit - Whether this was a cache hit
   */
  recordCacheAccess(isHit) {
    if (isHit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
  }
  
  /**
   * Get the average render time
   * @returns {number} - Average render time in milliseconds
   */
  getAverageRenderTime() {
    if (this.metrics.renderTimes.length === 0) return 0;
    
    const sum = this.metrics.renderTimes.reduce((a, b) => a + b, 0);
    return sum / this.metrics.renderTimes.length;
  }
  
  /**
   * Get the average processing time
   * @returns {number} - Average processing time in milliseconds
   */
  getAverageProcessingTime() {
    if (this.metrics.processingTimes.length === 0) return 0;
    
    const sum = this.metrics.processingTimes.reduce((a, b) => a + b, 0);
    return sum / this.metrics.processingTimes.length;
  }
  
  /**
   * Get the cache hit rate
   * @returns {string} - Cache hit rate as a percentage
   */
  getCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (total === 0) return '0%';
    
    const rate = (this.metrics.cacheHits / total) * 100;
    return `${rate.toFixed(1)}%`;
  }
  
  /**
   * Get all metrics
   * @returns {Object} - All performance metrics
   */
  getAllMetrics() {
    return {
      averageRenderTime: this.getAverageRenderTime(),
      averageProcessingTime: this.getAverageProcessingTime(),
      cacheHitRate: this.getCacheHitRate(),
      sampleCount: this.metrics.renderTimes.length,
      lastWordCount: this.metrics.wordCounts[this.metrics.wordCounts.length - 1] || 0
    };
  }
  
  /**
   * Get a specific measurement by name
   * @param {string} name - Name of the measurement to retrieve
   * @returns {number|null} - The measurement value or 0 if not found
   */
  getMeasurement(name) {
    // Map measurement names to their values
    const measurements = {
      'processWords': this.getAverageProcessingTime(),
      'layoutGeneration': this.getAverageProcessingTime() * 0.6, // Estimate layout time as 60% of processing
      'drawWordCloud': this.getAverageRenderTime(),
      'totalTime': this.getAverageRenderTime() + this.getAverageProcessingTime()
    };
    
    // Return the requested measurement or 0 if not found
    return measurements[name] || 0;
  }
  
  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      renderTimes: [],
      processingTimes: [],
      wordCounts: [],
      cacheHits: 0,
      cacheMisses: 0
    };
  }
}

// Export all utilities
export {
  throttle,
  debounce,
  optimizeWordCloudData,
  createOptimizedLayout,
  WordCloudPerformanceMonitor
};
