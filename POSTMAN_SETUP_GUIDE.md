# 📮 Postman Collection Setup Guide

## 🚀 Quick Start

### 1. Import the Collection
1. Open Postman
2. Click **Import** button
3. Select the `Messaging_API_Postman_Collection.json` file
4. The collection will be imported with all endpoints and tests

### 2. Set Up Environment Variables
The collection uses the following variables that are automatically set during testing:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `base_url` | API server URL | `http://localhost:8081` |
| `auth_token` | JWT authentication token | Auto-set after login |
| `user_id` | Current user ID | Auto-set after login |
| `admin_user_id` | Admin user ID for testing | `68924b50388d20690eac70db` |
| `is_admin` | Whether current user is admin | Auto-set after login |
| `last_message_id` | ID of last sent message | Auto-set after sending |
| `firebase_path` | Firebase path for real-time | Auto-set after sending |
| `received_count` | Number of received messages | Auto-set after retrieval |

## 📋 Collection Structure

### 🔐 Authentication Folder
- **Register User**: Create new user account
- **Login User**: Authenticate and get JWT token
- **Login User (Invalid Credentials)**: Test error handling

### 💬 Messaging Folder
- **Send Message**: Send message to another user
- **Send Message (Empty Text)**: Test validation
- **Send Message (No Token)**: Test authentication
- **Get Conversation**: Retrieve conversation history
- **Get All Conversations**: List all user conversations
- **Get Sent Messages**: View sent messages
- **Get Received Messages**: View received messages

### 🔧 System Folder
- **Health Check**: Verify server status

## 🧪 Testing Workflow

### Step 1: Health Check
1. Run **Health Check** to verify server is running
2. Should return status "OK"

### Step 2: Authentication
1. **Register User** (optional - creates new test user)
2. **Login User** with admin credentials:
   ```json
   {
     "username": "admin",
     "password": "admin123"
   }
   ```
3. The `auth_token` variable will be automatically set

### Step 3: Test Messaging
1. **Send Message** to test messaging functionality
2. **Get Conversation** to verify message was saved
3. **Get All Conversations** to see conversation list
4. **Get Sent Messages** and **Get Received Messages** to test message retrieval

### Step 4: Test Error Handling
1. **Login User (Invalid Credentials)** - should return 401
2. **Send Message (Empty Text)** - should return 400
3. **Send Message (No Token)** - should return 401

## 🔥 Real-time Features

### Firebase Integration
- Messages are automatically pushed to Firebase for real-time updates
- Firebase paths are provided in API responses
- Use the `firebase_path` variable for frontend integration

### Example Firebase Path
```
chats/68924b50388d20690eac70db_68924fb7f6338f24af3916c9
```

## 📊 Test Results

Each request includes automated tests that verify:
- ✅ Correct HTTP status codes
- ✅ Response structure validation
- ✅ Error message accuracy
- ✅ Authentication token handling
- ✅ Firebase path generation

## 🔒 Security Testing

The collection includes tests for:
- **Authentication**: Missing/invalid tokens
- **Authorization**: User permission validation
- **Input Validation**: Empty messages, required fields
- **Error Handling**: Proper error responses

## 🎯 Advanced Usage

### Custom User Testing
1. Register a new user with **Register User**
2. Login with the new user credentials
3. Test messaging between different user types

### Admin vs Regular User Testing
- **Admin users** can message any user
- **Regular users** can only message administrators
- Test both scenarios with different user accounts

### Real-time Testing
1. Send a message using **Send Message**
2. Note the `firebase_path` from the response
3. Use this path in your frontend Firebase listener

## 📝 Example Test Flow

```bash
# 1. Health Check
GET /health → 200 OK

# 2. Login as Admin
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}
→ 200 OK + JWT token

# 3. Send Message
POST /api/chat/send
Authorization: Bearer <token>
{
  "to": "user_id",
  "text": "Hello from Postman!"
}
→ 201 Created + Firebase path

# 4. Get Conversation
GET /api/chat/messages/user_id
Authorization: Bearer <token>
→ 200 OK + conversation history

# 5. Get All Conversations
GET /api/chat/conversations
Authorization: Bearer <token>
→ 200 OK + conversations list
```

## 🛠️ Troubleshooting

### Common Issues

1. **Server Not Running**
   - Ensure the Node.js server is running on port 8081
   - Check the health endpoint first

2. **Authentication Errors**
   - Verify the JWT token is valid
   - Check token expiration (24 hours default)
   - Re-login if token is expired

3. **Permission Errors**
   - Regular users can only message administrators
   - Admin users can message anyone
   - Check user roles in the database

4. **Firebase Errors**
   - Firebase configuration is optional for development
   - Messages will still be saved to MongoDB
   - Real-time features require Firebase setup

### Debug Variables
Check these collection variables for debugging:
- `auth_token`: Current authentication token
- `user_id`: Current user ID
- `is_admin`: Whether user is admin
- `firebase_path`: Last Firebase path generated

## 📚 Additional Resources

- **API Documentation**: See `API_DOCUMENTATION.md`
- **Testing Report**: See `TESTING_VALIDATION_REPORT.md`
- **Server Logs**: Check console for detailed error messages

## 🎉 Ready to Test!

The Postman collection is now ready for comprehensive API testing. All endpoints include automated tests and proper error handling validation. 