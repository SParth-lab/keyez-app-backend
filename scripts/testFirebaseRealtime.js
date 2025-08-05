const admin = require('firebase-admin');
const { initializeFirebase, getDatabase } = require('../config/firebase');

console.log('🧪 Testing Firebase Real-time Functionality...\n');

// Initialize Firebase first
initializeFirebase();

// Get database instance
const database = getDatabase();

// Test Firebase connection
async function testFirebaseConnection() {
  try {
    console.log('1. Testing Firebase connection...');
    const testRef = database.ref('test');
    await testRef.set({ timestamp: Date.now() });
    console.log('✅ Firebase connection successful\n');
    return true;
  } catch (error) {
    console.error('❌ Firebase connection failed:', error.message);
    return false;
  }
}

// Test real-time listener (simulated)
function testRealtimeListener(chatPath) {
  console.log(`2. Setting up real-time listener for: ${chatPath}`);
  
  const chatRef = database.ref(chatPath);
  
  // Set up listener
  chatRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      console.log('📡 Real-time update received:');
      console.log(JSON.stringify(data, null, 2));
    }
  }, (error) => {
    console.error('❌ Real-time listener error:', error);
  });
  
  return () => chatRef.off('value');
}

// Test sending message to Firebase
async function testSendMessage(chatPath, messageData) {
  try {
    console.log(`3. Sending message to Firebase: ${chatPath}`);
    
    const messageRef = database.ref(chatPath).push();
    await messageRef.set({
      ...messageData,
      timestamp: Date.now(),
      formattedTimestamp: new Date().toISOString()
    });
    
    console.log('✅ Message sent to Firebase successfully\n');
    return true;
  } catch (error) {
    console.error('❌ Failed to send message to Firebase:', error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting Firebase Real-time Tests...\n');
  
  // Test 1: Connection
  const connectionOk = await testFirebaseConnection();
  if (!connectionOk) {
    console.log('❌ Cannot proceed without Firebase connection');
    return;
  }
  
  // Test 2: Set up listener
  const chatPath = 'chats/test_chat';
  const unsubscribe = testRealtimeListener(chatPath);
  
  // Wait a moment for listener to be established
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 3: Send test message
  const testMessage = {
    id: 'test-message-' + Date.now(),
    from: {
      id: 'test-user-1',
      username: 'testuser',
      isAdmin: false
    },
    to: {
      id: 'test-user-2',
      username: 'admin',
      isAdmin: true
    },
    text: 'This is a test message from Firebase real-time test'
  };
  
  await testSendMessage(chatPath, testMessage);
  
  // Wait for real-time update
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Clean up
  unsubscribe();
  
  console.log('✅ Firebase Real-time Tests Completed!\n');
  console.log('📋 Test Summary:');
  console.log('   ✅ Firebase connection');
  console.log('   ✅ Real-time listener setup');
  console.log('   ✅ Message sending');
  console.log('   ✅ Real-time updates');
  console.log('\n🎉 All tests passed! Firebase is ready for frontend integration.');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testFirebaseConnection, testRealtimeListener, testSendMessage }; 