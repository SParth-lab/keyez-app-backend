# 📚 Complete API Documentation

## 🚀 Overview

This messaging API provides a complete backend solution for real-time messaging with user authentication, role-based permissions, and Firebase integration for instant updates.

**Base URL**: `http://localhost:8081`

## 🔐 Authentication

All API endpoints (except registration and login) require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## 📋 API Endpoints

### 🔐 Authentication Endpoints

#### 1. Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123"
}
```

**Response (201 Created):**
```json
{
  "message": "User registered successfully",
  "user": {
    "username": "newuser",
    "isAdmin": false,
    "id": "user_id"
  },
  "token": "jwt_token_here"
}
```

**Error Responses:**
- `400 Bad Request`: Username already exists, invalid input
- `500 Internal Server Error`: Server error

#### 2. Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "username",
  "password": "password"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "user": {
    "username": "username",
    "isAdmin": false,
    "id": "user_id"
  },
  "token": "jwt_token_here"
}
```

**Error Responses:**
- `400 Bad Request`: Missing username/password
- `401 Unauthorized`: Invalid credentials

### 💬 Messaging Endpoints

#### 3. Send Message
```http
POST /api/chat/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "to": "recipient_user_id",
  "text": "Hello! This is a message."
}
```

**Response (201 Created):**
```json
{
  "message": "Message sent successfully",
  "data": {
    "id": "message_id",
    "from": {
      "_id": "sender_id",
      "username": "sender_username",
      "isAdmin": false,
      "id": "sender_id"
    },
    "to": {
      "_id": "recipient_id",
      "username": "recipient_username",
      "isAdmin": true,
      "id": "recipient_id"
    },
    "text": "Hello! This is a message.",
    "timestamp": "2025-08-05T18:39:10.411Z",
    "formattedTimestamp": "2025-08-05T18:39:10.411Z"
  },
  "realtime": {
    "firebasePath": "chats/sender_id_recipient_id",
    "messageId": "message_id"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Missing recipient/text, empty message
- `401 Unauthorized`: No token provided, invalid token
- `403 Forbidden`: Regular user trying to message another regular user
- `404 Not Found`: Recipient not found

#### 4. Get Conversation
```http
GET /api/chat/messages/:userId
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "conversation": [
    {
      "id": "message_id",
      "from": {
        "id": "sender_id",
        "username": "sender_username",
        "isAdmin": false
      },
      "to": {
        "id": "recipient_id",
        "username": "recipient_username",
        "isAdmin": true
      },
      "text": "Message text",
      "timestamp": "2025-08-05T18:39:10.411Z",
      "formattedTimestamp": "2025-08-05T18:39:10.411Z"
    }
  ],
  "total": 1,
  "firebasePath": "chats/user1_id_user2_id"
}
```

**Error Responses:**
- `401 Unauthorized`: No token provided, invalid token
- `403 Forbidden`: Regular user trying to view conversation with another regular user
- `404 Not Found`: Target user not found

#### 5. Get All Conversations
```http
GET /api/chat/conversations
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "conversations": [
    {
      "partner": {
        "id": "partner_id",
        "username": "partner_username",
        "isAdmin": true
      },
      "lastMessage": {
        "text": "Last message text",
        "timestamp": "2025-08-05T18:39:21.196Z",
        "formattedTimestamp": "2025-08-05T18:39:21.196Z"
      },
      "messageCount": 2,
      "firebasePath": "chats/user1_id_user2_id"
    }
  ],
  "total": 1
}
```

**Error Responses:**
- `401 Unauthorized`: No token provided, invalid token

#### 6. Get Sent Messages
```http
GET /api/chat/sent
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "messages": [
    {
      "id": "message_id",
      "to": {
        "id": "recipient_id",
        "username": "recipient_username",
        "isAdmin": true
      },
      "text": "Message text",
      "timestamp": "2025-08-05T18:39:10.411Z",
      "formattedTimestamp": "2025-08-05T18:39:10.411Z"
    }
  ],
  "total": 1
}
```

**Error Responses:**
- `401 Unauthorized`: No token provided, invalid token

#### 7. Get Received Messages
```http
GET /api/chat/received
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "messages": [
    {
      "id": "message_id",
      "from": {
        "id": "sender_id",
        "username": "sender_username",
        "isAdmin": true
      },
      "text": "Message text",
      "timestamp": "2025-08-05T18:39:21.196Z",
      "formattedTimestamp": "2025-08-05T18:39:21.196Z"
    }
  ],
  "total": 1
}
```

**Error Responses:**
- `401 Unauthorized`: No token provided, invalid token

### 🔧 System Endpoints

#### 8. Health Check
```http
GET /health
```

**Response (200 OK):**
```json
{
  "status": "OK",
  "message": "Server is running",
  "timestamp": "2025-08-05T18:40:34.448Z"
}
```

## 🔥 Real-time Integration

### Firebase Path Structure
Firebase paths follow the format: `chats/{user1Id}_{user2Id}` (sorted for consistency)

### Setting up Real-time Listeners
```javascript
// Example using Firebase Web SDK
import { getDatabase, ref, onValue } from 'firebase/database';

const database = getDatabase();
const chatRef = ref(database, 'chats/user1_user2');

const unsubscribe = onValue(chatRef, (snapshot) => {
  const data = snapshot.val();
  if (data) {
    // Handle new messages
    console.log('New message:', data);
  }
});

// Clean up when component unmounts
unsubscribe();
```

### Message Structure in Firebase
```json
{
  "message_id": {
    "id": "message_id",
    "from": {
      "id": "sender_id",
      "username": "sender_username",
      "isAdmin": false
    },
    "to": {
      "id": "recipient_id",
      "username": "recipient_username",
      "isAdmin": true
    },
    "text": "Message text",
    "timestamp": 1754419150411,
    "formattedTimestamp": "2025-08-05T18:39:10.411Z"
  }
}
```

## 🚨 Error Responses

### Authentication Errors
```json
{
  "error": "No token provided"
}
```
```json
{
  "error": "Invalid token"
}
```

### Validation Errors
```json
{
  "error": "Recipient and message text are required"
}
```
```json
{
  "error": "Message text cannot be empty"
}
```

### Permission Errors
```json
{
  "error": "Regular users can only send messages to administrators"
}
```

### User Not Found
```json
{
  "error": "User not found"
}
```

## 🔒 Security Rules

### User Permissions
- **Regular Users**: Can only send messages to administrators
- **Administrators**: Can send messages to any user
- **All Users**: Can view conversations they're part of

### Authentication
- All endpoints (except registration and login) require valid JWT token
- Tokens expire after 24 hours by default
- Invalid or expired tokens return 401 Unauthorized

## 📊 Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created (message sent) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (permission denied) |
| 404 | Not Found (user not found) |
| 500 | Internal Server Error |

## 📮 Postman Collection

### Import Instructions
1. Download `Messaging_API_Postman_Collection.json`
2. Open Postman
3. Click **Import** and select the file
4. The collection includes all endpoints with automated tests

### Collection Features
- ✅ **Automated Tests**: Each request includes validation tests
- ✅ **Variable Management**: Automatic token and user ID handling
- ✅ **Error Testing**: Comprehensive error scenario coverage
- ✅ **Real-time Testing**: Firebase path validation

### Test Workflow
1. **Health Check** → Verify server status
2. **Login User** → Get authentication token
3. **Send Message** → Test messaging functionality
4. **Get Conversation** → Verify message persistence
5. **Error Tests** → Validate error handling

## 🚀 Getting Started

### 1. Server Setup
```bash
# Start the server
npm start

# Server will run on http://localhost:8081
```

### 2. Authentication
```bash
# Register a new user
curl -X POST http://localhost:8081/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "password123"}'

# Login
curl -X POST http://localhost:8081/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### 3. Send Message
```bash
# Send a message
curl -X POST http://localhost:8081/api/chat/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{"to": "recipient_id", "text": "Hello!"}'
```

### 4. Real-time Integration
```javascript
// Use the firebasePath from the send message response
const firebasePath = "chats/user1_user2";
const chatRef = ref(database, firebasePath);

onValue(chatRef, (snapshot) => {
  const messages = snapshot.val();
  // Update your UI with new messages
});
```

## 📝 Example Frontend Integration

```javascript
// Login and get token
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'user', password: 'pass' })
});
const { token } = await loginResponse.json();

// Send message
const sendResponse = await fetch('/api/chat/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    to: 'recipient_id',
    text: 'Hello!'
  })
});
const { realtime } = await sendResponse.json();

// Set up real-time listener
const chatRef = ref(database, realtime.firebasePath);
onValue(chatRef, (snapshot) => {
  const messages = snapshot.val();
  // Update UI with new messages
});
```

## 🎯 Testing Checklist

- ✅ **Authentication**: Register, login, token validation
- ✅ **Messaging**: Send, receive, conversation history
- ✅ **Permissions**: Admin vs regular user access
- ✅ **Error Handling**: Invalid inputs, missing tokens
- ✅ **Real-time**: Firebase integration, path generation
- ✅ **Security**: Role-based access control
- ✅ **Validation**: Input sanitization, required fields

## 📚 Additional Resources

- **Postman Setup Guide**: `POSTMAN_SETUP_GUIDE.md`
- **Testing Report**: `TESTING_VALIDATION_REPORT.md`
- **API Documentation**: `API_DOCUMENTATION.md`

## 🎉 Ready for Production!

The API is fully tested, documented, and ready for frontend integration with comprehensive real-time messaging capabilities. 