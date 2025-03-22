// Word Frequency Service
// Tracks and manages word frequencies across all chat messages with optimized performance

// Store word frequencies by room
let wordFrequencies = {};

// Cache for word cloud data to avoid recalculating on every request
let wordCloudCache = {};

// Cache for word size calculations
let wordSizeCache = {};

// Performance metrics tracking
const performanceMetrics = {
  processingTime: [],
  totalProcessed: 0,
  cacheHits: 0,
  cacheMisses: 0
};

// Message queue for batch processing
let messageQueue = [];
let processingTimer = null;
let isProcessing = false;

// Batch processing configuration
const BATCH_SIZE = 20; // Process 20 messages at once
const BATCH_INTERVAL = 300; // Process every 300ms

// Load saved frequencies from localStorage if available
try {
  const savedFrequencies = localStorage.getItem('chatcloud_word_frequencies');
  if (savedFrequencies) {
    wordFrequencies = JSON.parse(savedFrequencies);
    console.log('Loaded word frequencies from localStorage');
  }
} catch (e) {
  console.error('Failed to load word frequencies from localStorage:', e);
  // Reset to empty object if corrupted
  wordFrequencies = {};
}

// Common words to exclude from frequency counting (stop words)
const stopWords = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
  'be', 'been', 'being', 'to', 'of', 'for', 'with', 'by', 'about', 
  'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
  'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just',
  'should', 'now', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 
  'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he',
  'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
  'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what',
  'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'have',
  'has', 'had', 'do', 'does', 'did', 'doing', 'would', 'could', 'should',
  'ought', 'im', 'ive', 'id', 'youre', 'youve', 'youll', 'youve', 'hes',
  'shes', 'its', 'were', 'theyve', 'theyre', 'thats', 'whats'
]);

// Minimum word length to consider
const MIN_WORD_LENGTH = 3;

// Maximum size for word in the cloud
const MAX_WORD_SIZE = 80;

// Minimum size for word in the cloud
const MIN_WORD_SIZE = 15;

// Queue a message for batch processing
const processMessage = (message, roomId) => {
  if (!message || !message.content || !roomId) return;
  
  // Add to processing queue
  messageQueue.push({ message, roomId });
  
  // Invalidate cache for this room
  if (wordCloudCache[roomId]) {
    wordCloudCache[roomId] = null;
  }
  
  // Start batch processing if not already running
  if (!processingTimer && !isProcessing) {
    processingTimer = setTimeout(processBatch, BATCH_INTERVAL);
  }
};

// Process message queue in batches for better performance
const processBatch = () => {
  if (isProcessing || messageQueue.length === 0) {
    return;
  }
  
  isProcessing = true;
  const startTime = performance.now();
  
  // Take a batch of messages from the queue
  const batch = messageQueue.splice(0, Math.min(BATCH_SIZE, messageQueue.length));
  
  // Group messages by room for more efficient processing
  const messagesByRoom = {};
  batch.forEach(({ message, roomId }) => {
    if (!messagesByRoom[roomId]) {
      messagesByRoom[roomId] = [];
    }
    messagesByRoom[roomId].push(message);
  });
  
  // Process each room's messages in bulk
  Object.entries(messagesByRoom).forEach(([roomId, messages]) => {
    processMessageBatch(messages, roomId);
  });
  
  // Track performance metrics
  const endTime = performance.now();
  performanceMetrics.processingTime.push(endTime - startTime);
  performanceMetrics.totalProcessed += batch.length;
  
  // Keep only the last 50 metrics
  if (performanceMetrics.processingTime.length > 50) {
    performanceMetrics.processingTime.shift();
  }
  
  // Persist to localStorage (throttled)
  throttledPersist();
  
  isProcessing = false;
  
  // If there are more messages, schedule the next batch
  if (messageQueue.length > 0) {
    processingTimer = setTimeout(processBatch, BATCH_INTERVAL);
  }
};

// Process a batch of messages for a single room
const processMessageBatch = (messages, roomId) => {
  // Initialize room if it doesn't exist
  if (!wordFrequencies[roomId]) {
    wordFrequencies[roomId] = {};
  }
  
  // Process all messages in the batch at once
  const wordCounts = {};
  
  messages.forEach(message => {
    if (!message.content) return;
    
    // Extract words from message content
    const words = message.content
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/) // Split by whitespace
      .filter(word => word.length >= MIN_WORD_LENGTH && !stopWords.has(word));
    
    // Count word frequencies in this message
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });
  
  // Update the global word frequencies
  Object.entries(wordCounts).forEach(([word, count]) => {
    wordFrequencies[roomId][word] = (wordFrequencies[roomId][word] || 0) + count;
  });
};

// Throttled localStorage persistence to avoid excessive writes
let persistTimeout = null;
const throttledPersist = () => {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
  }
  
  persistTimeout = setTimeout(() => {
    try {
      localStorage.setItem('chatcloud_word_frequencies', JSON.stringify(wordFrequencies));
    } catch (e) {
      console.error('Failed to save word frequencies to localStorage:', e);
      // If storage quota exceeded, prune data
      if (e.name === 'QuotaExceededError') {
        pruneWordFrequencies();
        try {
          localStorage.setItem('chatcloud_word_frequencies', JSON.stringify(wordFrequencies));
        } catch (innerError) {
          console.error('Still unable to save after pruning:', innerError);
        }
      }
    }
  }, 2000); // Only persist every 2 seconds at most
};

// Prune word frequencies if storage is full
const pruneWordFrequencies = () => {
  const roomIds = Object.keys(wordFrequencies);
  
  // For each room, keep only the most frequent words
  roomIds.forEach(roomId => {
    const entries = Object.entries(wordFrequencies[roomId]);
    if (entries.length > 100) { // Keep only top 100 words per room
      entries.sort((a, b) => b[1] - a[1]); // Sort by frequency (descending)
      
      // Keep only the most frequent words
      const wordsToKeep = entries.slice(0, 100);
      wordFrequencies[roomId] = {};
      
      wordsToKeep.forEach(([word, count]) => {
        wordFrequencies[roomId][word] = count;
      });
    }
  });
  
  // Clear caches
  wordCloudCache = {};
  wordSizeCache = {};
};

// Get word cloud data for a specific room with caching
const getWordCloudData = (roomId, maxWords = 50) => {
  if (!roomId || !wordFrequencies[roomId]) {
    return [];
  }
  
  // Check cache first
  const cacheKey = `${roomId}-${maxWords}`;
  if (wordCloudCache[cacheKey]) {
    performanceMetrics.cacheHits++;
    return wordCloudCache[cacheKey];
  }
  performanceMetrics.cacheMisses++;
  
  const startTime = performance.now();
  
  // Convert frequencies to array of objects
  const wordArray = Object.entries(wordFrequencies[roomId])
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxWords);
  
  // If we have no words, return empty array
  if (wordArray.length === 0) {
    wordCloudCache[cacheKey] = [];
    return [];
  }
  
  // Find the max and min counts - use reduce for better performance than spread operator
  let maxCount = 0;
  let minCount = Infinity;
  
  wordArray.forEach(word => {
    if (word.count > maxCount) maxCount = word.count;
    if (word.count < minCount) minCount = word.count;
  });
  
  // Scale word sizes between MIN_WORD_SIZE and MAX_WORD_SIZE
  const result = wordArray.map(word => {
    // Use memoized size calculation if available
    const sizeKey = `${word.count}-${minCount}-${maxCount}`;
    let size;
    
    if (wordSizeCache[sizeKey] !== undefined) {
      size = wordSizeCache[sizeKey];
    } else {
      // Linear scaling: size = min + (value - minValue) * (max - min) / (maxValue - minValue)
      size = minCount === maxCount 
        ? (MIN_WORD_SIZE + MAX_WORD_SIZE) / 2 // If all words have same count, use middle size
        : MIN_WORD_SIZE + (word.count - minCount) * (MAX_WORD_SIZE - MIN_WORD_SIZE) / (maxCount - minCount);
      
      // Cache the calculated size
      wordSizeCache[sizeKey] = Math.round(size);
    }
    
    return {
      text: word.text,
      size: Math.round(size),
      count: word.count,
      isNew: false // Default to false, can be updated elsewhere
    };
  });
  
  // Cache the result
  wordCloudCache[cacheKey] = result;
  
  const endTime = performance.now();
  console.log(`Word cloud data generated in ${(endTime - startTime).toFixed(2)}ms for ${wordArray.length} words`);
  
  return result;
};

// Get global word cloud data across all rooms with caching
const getGlobalWordCloudData = (maxWords = 50) => {
  // Check cache first
  const cacheKey = `global-${maxWords}`;
  if (wordCloudCache[cacheKey]) {
    performanceMetrics.cacheHits++;
    return wordCloudCache[cacheKey];
  }
  performanceMetrics.cacheMisses++;
  
  const startTime = performance.now();
  
  // Combine frequencies from all rooms
  const globalFrequencies = {};
  
  // Use a more efficient approach to combine frequencies
  for (const roomId in wordFrequencies) {
    const roomFreqs = wordFrequencies[roomId];
    for (const word in roomFreqs) {
      globalFrequencies[word] = (globalFrequencies[word] || 0) + roomFreqs[word];
    }
  }
  
  // Convert to array and sort
  const wordArray = [];
  for (const text in globalFrequencies) {
    wordArray.push({ text, count: globalFrequencies[text] });
  }
  
  // Sort and limit to maxWords
  wordArray.sort((a, b) => b.count - a.count);
  const limitedWordArray = wordArray.slice(0, maxWords);
  
  // If we have no words, return empty array
  if (limitedWordArray.length === 0) {
    wordCloudCache[cacheKey] = [];
    return [];
  }
  
  // Find the max and min counts using reduce
  let maxCount = 0;
  let minCount = Infinity;
  
  limitedWordArray.forEach(word => {
    if (word.count > maxCount) maxCount = word.count;
    if (word.count < minCount) minCount = word.count;
  });
  
  // Scale word sizes between MIN_WORD_SIZE and MAX_WORD_SIZE
  const result = limitedWordArray.map(word => {
    // Use memoized size calculation if available
    const sizeKey = `${word.count}-${minCount}-${maxCount}`;
    let size;
    
    if (wordSizeCache[sizeKey] !== undefined) {
      size = wordSizeCache[sizeKey];
    } else {
      size = minCount === maxCount 
        ? (MIN_WORD_SIZE + MAX_WORD_SIZE) / 2
        : MIN_WORD_SIZE + (word.count - minCount) * (MAX_WORD_SIZE - MIN_WORD_SIZE) / (maxCount - minCount);
      
      // Cache the calculated size
      wordSizeCache[sizeKey] = Math.round(size);
    }
    
    return {
      text: word.text,
      size: Math.round(size),
      count: word.count,
      isNew: false
    };
  });
  
  // Cache the result
  wordCloudCache[cacheKey] = result;
  
  const endTime = performance.now();
  console.log(`Global word cloud data generated in ${(endTime - startTime).toFixed(2)}ms for ${limitedWordArray.length} words`);
  
  return result;
};

// Process multiple messages at once (e.g., when loading history)
const processMessages = (messages, roomId) => {
  if (!messages || !Array.isArray(messages) || !roomId) return;
  
  // Add all messages to the queue at once
  messages.forEach(message => {
    messageQueue.push({ message, roomId });
  });
  
  // Invalidate cache for this room
  if (wordCloudCache[roomId]) {
    wordCloudCache[roomId] = null;
  }
  
  // Start batch processing if not already running
  if (!processingTimer && !isProcessing) {
    processingTimer = setTimeout(processBatch, BATCH_INTERVAL);
  }
  
  return { queued: messages.length };
};

// Clear data for a specific room
const clearRoomData = (roomId) => {
  if (roomId && wordFrequencies[roomId]) {
    delete wordFrequencies[roomId];
    
    // Clear cache for this room
    Object.keys(wordCloudCache).forEach(key => {
      if (key.startsWith(`${roomId}-`)) {
        delete wordCloudCache[key];
      }
    });
    
    // Persist changes
    throttledPersist();
  }
};

// Clear all data
const clearAllData = () => {
  // Reset all data structures
  wordFrequencies = {};
  wordCloudCache = {};
  wordSizeCache = {};
  messageQueue = [];
  
  // Clear any pending timers
  if (processingTimer) {
    clearTimeout(processingTimer);
    processingTimer = null;
  }
  
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = null;
  }
  
  // Reset performance metrics
  performanceMetrics.processingTime = [];
  performanceMetrics.totalProcessed = 0;
  performanceMetrics.cacheHits = 0;
  performanceMetrics.cacheMisses = 0;
  
  // Clear localStorage
  try {
    localStorage.removeItem('chatcloud_word_frequencies');
  } catch (e) {
    console.error('Failed to clear word frequencies from localStorage:', e);
  }
};

// Add a custom word to the global frequency data
const addWord = (word) => {
  if (!word || word.length < MIN_WORD_LENGTH || stopWords.has(word.toLowerCase())) {
    return false;
  }
  
  // Create a special room ID for user-added topics
  const customTopicsRoom = 'user-added-topics';
  
  // Initialize if needed
  if (!wordFrequencies[customTopicsRoom]) {
    wordFrequencies[customTopicsRoom] = {};
  }
  
  // Add or increment the word
  const cleanWord = word.toLowerCase().trim();
  if (wordFrequencies[customTopicsRoom][cleanWord]) {
    wordFrequencies[customTopicsRoom][cleanWord] += 3; // Give more weight to manually added words
  } else {
    wordFrequencies[customTopicsRoom][cleanWord] = 5; // Start with higher weight than regular messages
  }
  
  // Save to localStorage for persistence
  try {
    localStorage.setItem('chatcloud_word_frequencies', JSON.stringify(wordFrequencies));
  } catch (e) {
    console.error('Failed to save word frequencies to localStorage:', e);
  }
  
  return true;
};

// Get performance metrics for monitoring
const getPerformanceMetrics = () => {
  const avgTime = performanceMetrics.processingTime.length > 0 ?
    performanceMetrics.processingTime.reduce((a, b) => a + b, 0) / performanceMetrics.processingTime.length : 0;
  
  return {
    averageProcessingTime: avgTime.toFixed(2),
    totalProcessed: performanceMetrics.totalProcessed,
    queueLength: messageQueue.length,
    cacheHits: performanceMetrics.cacheHits,
    cacheMisses: performanceMetrics.cacheMisses,
    cacheHitRate: performanceMetrics.cacheHits + performanceMetrics.cacheMisses > 0 ?
      (performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses) * 100).toFixed(2) + '%' : '0%'
  };
};

// Mark all words as seen (not new) for a room
const markAllWordsSeen = (roomId) => {
  if (!roomId) return;
  
  // Update isNew flag in cache
  Object.keys(wordCloudCache).forEach(key => {
    if (key.startsWith(`${roomId}-`)) {
      if (wordCloudCache[key]) {
        wordCloudCache[key].forEach(word => {
          word.isNew = false;
        });
      }
    }
  });
};

// Simulate batch processing of messages for testing
const simulateBatchMessages = (roomId, count = 100) => {
  const messages = [];
  const words = [
    'javascript', 'vue', 'react', 'angular', 'svelte', 'typescript',
    'node', 'express', 'mongodb', 'postgres', 'mysql', 'redis',
    'graphql', 'rest', 'api', 'frontend', 'backend', 'fullstack',
    'developer', 'engineer', 'code', 'programming', 'software',
    'web', 'app', 'mobile', 'desktop', 'cloud', 'server', 'client'
  ];
  
  console.log(`Simulating ${count} messages for room ${roomId}`);
  
  // Generate random messages
  for (let i = 0; i < count; i++) {
    // Create a message with 3-10 random words
    const wordCount = 3 + Math.floor(Math.random() * 8);
    let content = '';
    
    for (let j = 0; j < wordCount; j++) {
      const randomIndex = Math.floor(Math.random() * words.length);
      content += words[randomIndex] + ' ';
    }
    
    messages.push({
      content: content.trim(),
      roomId,
      userId: `test-user-${Math.floor(Math.random() * 10)}`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Process the messages
  processMessages(messages, roomId);
  
  return {
    queued: messages.length,
    roomId
  };
};

export default {
  processMessage,
  processMessages,
  getWordCloudData,
  getGlobalWordCloudData,
  clearRoomData,
  clearAllData,
  addWord,
  getPerformanceMetrics,
  markAllWordsSeen,
  simulateBatchMessages
};
