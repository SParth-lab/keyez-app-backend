# 📚 API Documentation

## 🔐 Authentication

All API endpoints (except registration and login) require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## 👤 User Management

### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123"
}
```

**Response:**
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

### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "username",
  "password": "password"
}
```

**Response:**
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

## 💬 Messaging

### Send Message
```http
POST /api/chat/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "to": "recipient_user_id",
  "text": "Hello! This is a message."
}
```

**Response:**
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

### Get Conversation
```http
GET /api/chat/messages/:userId
Authorization: Bearer <token>
```

**Response:**
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

### Get All Conversations
```http
GET /api/chat/conversations
Authorization: Bearer <token>
```

**Response:**
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

### Get Sent Messages
```http
GET /api/chat/sent
Authorization: Bearer <token>
```

**Response:**
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

### Get Received Messages
```http
GET /api/chat/received
Authorization: Bearer <token>
```

**Response:**
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

## 🚀 Getting Started

1. **Register a user** or **login** to get a JWT token
2. **Include the token** in Authorization header for all requests
3. **Send messages** using the `/api/chat/send` endpoint
4. **Set up Firebase listeners** using the provided Firebase paths
5. **Handle real-time updates** as messages arrive

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