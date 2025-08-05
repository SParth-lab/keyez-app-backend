# Node.js Project with Express, MongoDB, and Firebase

A full-stack Node.js application with Express.js, MongoDB, and Firebase integration.

## Features

- 🔐 **Authentication**: JWT-based authentication with bcrypt password hashing
- 👥 **User Management**: Complete user CRUD operations with role-based access
- 🔥 **Firebase Integration**: Firebase Admin SDK for authentication and real-time features
- 🗄️ **MongoDB**: Mongoose ODM with optimized schemas and indexing
- 🛡️ **Security**: Helmet.js for security headers, CORS configuration
- 📊 **Admin Dashboard**: Admin-only routes for user management and statistics
- 🔄 **Auto-seeding**: Automatic admin user creation on server start

## Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or cloud instance)
- Firebase project with service account

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd new
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your configuration.

4. **Configure MongoDB**
   - Install MongoDB locally or use MongoDB Atlas
   - Update `MONGODB_URI` in `.env`

5. **Configure Firebase**
   - Create a Firebase project
   - Download service account key
   - Update Firebase configuration in `.env`

## Environment Variables

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/myapp

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
# ... other Firebase config

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# Admin Configuration
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
ADMIN_NAME=Default Admin
```

## Firebase Setup

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project

2. **Download Service Account Key**
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Download the JSON file

3. **Enable Realtime Database**
   - Go to Realtime Database
   - Create database
   - Set security rules

4. **Update Environment Variables**
   - Copy values from service account JSON to `.env`

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `PUT /api/auth/change-password` - Change password
- `POST /api/auth/verify-firebase` - Firebase authentication

### User Management (Admin Only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `GET /api/users/stats/overview` - Get user statistics
- `POST /api/users/bulk` - Bulk operations

### Health Check
- `GET /health` - Server health check
- `GET /` - API information

## Default Admin Account

On first run, a default admin account is created:
- **Email**: admin@example.com
- **Password**: admin123

⚠️ **Important**: Change the default password after first login!

## Project Structure

```
├── config/
│   ├── database.js      # MongoDB connection
│   └── firebase.js      # Firebase configuration
├── models/
│   └── User.js          # User model
├── routes/
│   ├── auth.js          # Authentication routes
│   └── users.js         # User management routes
├── scripts/
│   └── seedAdmin.js     # Admin seeding script
├── middleware/           # Custom middleware
├── utils/               # Utility functions
├── server.js            # Main application file
├── package.json         # Dependencies and scripts
└── .env                 # Environment variables
```

## Database Schema

### User Model
- `name`: String (required)
- `email`: String (required, unique)
- `password`: String (hashed)
- `role`: String (user/admin/moderator)
- `isActive`: Boolean
- `lastLogin`: Date
- `firebaseUid`: String (optional)
- `profile`: Object (avatar, bio, phone)
- `preferences`: Object (notifications, theme)
- `timestamps`: Created/updated timestamps

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Role-based access control
- Input validation and sanitization
- Security headers with Helmet.js
- CORS configuration
- Rate limiting (can be added)

## Development

### Adding New Routes
1. Create route file in `routes/` directory
2. Import in `server.js`
3. Add middleware as needed

### Adding New Models
1. Create model file in `models/` directory
2. Define schema with validation
3. Add indexes for performance

### Environment-specific Configuration
- Development: Uses local MongoDB
- Production: Use environment variables for cloud services

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running
- Check connection string in `.env`
- Verify network access

### Firebase Issues
- Verify service account credentials
- Check project ID and database URL
- Ensure Realtime Database is enabled

### JWT Issues
- Verify `JWT_SECRET` is set
- Check token expiration settings

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## License

ISC License

## Support

For issues and questions, please create an issue in the repository. 