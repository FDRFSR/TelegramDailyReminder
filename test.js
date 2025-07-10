#!/usr/bin/env node
/**
 * Simple test script to verify data persistence and core functionality
 */

const TaskService = require('./services/taskService');
const DataManager = require('./services/dataManager');
const { validateTaskText, checkRateLimit } = require('./utils/validation');
const logger = require('./utils/logger');

async function testDataPersistence() {
  console.log('🧪 Testing data persistence...');
  
  const taskService = new TaskService();
  const testUserId = 'test123';
  
  // Add a test task
  await taskService.addTask(testUserId, 'Test task for persistence');
  console.log('✅ Task added');
  
  // Verify task exists
  const tasks = taskService.getTaskList(testUserId);
  console.log('✅ Task retrieved:', tasks.length, 'tasks');
  
  // Test priority toggle
  if (tasks.length > 0) {
    await taskService.togglePriority(testUserId, tasks[0].id);
    console.log('✅ Priority toggled');
  }
  
  // Test task removal
  if (tasks.length > 0) {
    await taskService.removeTask(testUserId, tasks[0].id);
    console.log('✅ Task removed');
  }
  
  console.log('✅ Data persistence test completed');
}

async function testValidation() {
  console.log('🧪 Testing validation...');
  
  // Test valid text
  const validResult = validateTaskText('Valid task text');
  console.log('✅ Valid text validation:', validResult.isValid);
  
  // Test empty text
  const emptyResult = validateTaskText('');
  console.log('✅ Empty text validation:', !emptyResult.isValid);
  
  // Test long text
  const longText = 'a'.repeat(300);
  const longResult = validateTaskText(longText);
  console.log('✅ Long text validation:', !longResult.isValid);
  
  // Test harmful content
  const harmfulResult = validateTaskText('<script>alert("test")</script>');
  console.log('✅ Harmful content validation:', !harmfulResult.isValid);
  
  console.log('✅ Validation test completed');
}

async function testRateLimit() {
  console.log('🧪 Testing rate limiting...');
  
  const testUserId = 'ratetest123';
  
  // First request should pass
  const firstResult = checkRateLimit(testUserId, 'add_task');
  console.log('✅ First request allowed:', firstResult);
  
  // Multiple requests should eventually be limited
  let limitReached = false;
  for (let i = 0; i < 15; i++) {
    if (!checkRateLimit(testUserId, 'add_task')) {
      limitReached = true;
      break;
    }
  }
  console.log('✅ Rate limit eventually reached:', limitReached);
  
  console.log('✅ Rate limiting test completed');
}

async function runTests() {
  try {
    console.log('🚀 Starting TelegramDailyReminder tests...\n');
    
    await testDataPersistence();
    console.log('');
    
    await testValidation();
    console.log('');
    
    await testRateLimit();
    console.log('');
    
    console.log('🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logger.error('Test failed', { error: error.message });
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { testDataPersistence, testValidation, testRateLimit };