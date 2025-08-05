# 💬 Real-time Messaging API

A complete backend messaging system with real-time capabilities, user authentication, and Firebase integration.

## 🚀 Features

- ✅ **User Authentication**: JWT-based authentication with role-based permissions
- ✅ **Real-time Messaging**: Firebase Realtime Database integration
- ✅ **Role-based Access**: Admin and regular user permissions
- ✅ **Conversation Management**: Send, receive, and view message history
- ✅ **Error Handling**: Comprehensive validation and error responses
- ✅ **API Documentation**: Complete documentation with examples
- ✅ **Postman Collection**: Ready-to-use API testing collection

## 📁 Project Structure

```
new/
├── config/                 # Configuration files
│   ├── database.js        # MongoDB connection
│   └── firebase.js        # Firebase configuration
├── models/                # Database models
│   ├── Message.js         # Message schema
│   └── User.js           # User schema
├── routes/                # API routes
│   ├── auth.js           # Authentication endpoints
│   ├── chat.js           # Messaging endpoints
│   └── users.js          # User management
├── scripts/               # Utility scripts
│   ├── testFirebaseRealtime.js
│   └── ...               # Other test scripts
├── Messaging_API_Postman_Collection.json  # Postman collection
├── COMPLETE_API_DOCUMENTATION.md          # Full API docs
├── POSTMAN_SETUP_GUIDE.md                 # Postman setup guide
├── TESTING_VALIDATION_REPORT.md           # Test results
├── API_DOCUMENTATION.md                   # API reference
└── server.js             # Main server file
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Create a `.env` file:
```env
PORT=8081
MONGODB_URI=mongodb://localhost:27017/messaging
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h

# Firebase (optional for development)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
```

### 3. Start Server
```bash
npm start
```

Server will run on `http://localhost:8081`

## 📮 Postman Collection

### Import the Collection
1. Download `Messaging_API_Postman_Collection.json`
2. Open Postman
3. Click **Import** and select the file
4. All endpoints are ready with automated tests

### Quick Test
1. **Health Check** → Verify server status
2. **Login User** → Get authentication token
3. **Send Message** → Test messaging
4. **Get Conversation** → View message history

## 📚 Documentation

- **[Complete API Documentation](COMPLETE_API_DOCUMENTATION.md)** - Full API reference with examples
- **[Postman Setup Guide](POSTMAN_SETUP_GUIDE.md)** - How to use the Postman collection
- **[Testing Report](TESTING_VALIDATION_REPORT.md)** - Comprehensive test results
- **[API Documentation](API_DOCUMENTATION.md)** - Quick API reference

## 🔥 Real-time Features

### Firebase Integration
- Messages are automatically pushed to Firebase
- Real-time updates for instant messaging
- Consistent path structure: `chats/{user1Id}_{user2Id}`

### Frontend Integration
```javascript
// Get Firebase path from API response
const { realtime } = await sendMessageResponse.json();

// Set up real-time listener
const chatRef = ref(database, realtime.firebasePath);
onValue(chatRef, (snapshot) => {
  const messages = snapshot.val();
  // Update UI with new messages
});
```

## 🔐 Authentication

### JWT Tokens
- All endpoints require JWT authentication (except registration/login)
- Tokens expire after 24 hours
- Include in headers: `Authorization: Bearer <token>`

### User Roles
- **Admin Users**: Can message any user
- **Regular Users**: Can only message administrators

## 📋 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | User login |
| POST | `/api/chat/send` | Send message |
| GET | `/api/chat/messages/:userId` | Get conversation |
| GET | `/api/chat/conversations` | Get all conversations |
| GET | `/api/chat/sent` | Get sent messages |
| GET | `/api/chat/received` | Get received messages |
| GET | `/health` | Health check |

## 🧪 Testing

### Automated Tests
All endpoints include comprehensive tests:
- ✅ Status code validation
- ✅ Response structure validation
- ✅ Error handling verification
- ✅ Authentication testing
- ✅ Permission validation

### Test Coverage
- **Authentication**: Register, login, token validation
- **Messaging**: Send, receive, conversation history
- **Permissions**: Admin vs regular user access
- **Error Handling**: Invalid inputs, missing tokens
- **Real-time**: Firebase integration

## 🔒 Security Features

- **JWT Authentication**: Secure token-based auth
- **Role-based Access**: Admin and user permissions
- **Input Validation**: Sanitized inputs and required fields
- **Error Handling**: Proper error responses
- **MongoDB Security**: Secure database connections

## 🚀 Production Ready

The API is fully tested and ready for production with:
- ✅ Complete error handling
- ✅ Input validation
- ✅ Security measures
- ✅ Real-time capabilities
- ✅ Comprehensive documentation
- ✅ Postman collection for testing

## 📞 Support

For questions or issues:
1. Check the documentation files
2. Review the testing report
3. Use the Postman collection for testing
4. Check server logs for detailed error messages

## 🎉 Ready for Frontend Integration!

The backend is complete and ready for frontend development with comprehensive real-time messaging capabilities. 