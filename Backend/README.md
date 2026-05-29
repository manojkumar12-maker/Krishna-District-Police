# Krishna District Police - Backend API

## Overview
This is the backend API for the Krishna District Police PC/WPC Data Management System.

## Deployment on Render

### 1. Create a new Web Service on Render
- Go to [render.com](https://render.com)
- Click "New" → "Web Service"
- Connect your GitHub repository or use "Deploy from Git"

### 2. Configure the service
- **Name**: `krishna-police-api` (or your preferred name)
- **Runtime**: Node
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Plan**: Free

### 3. Add Environment Variables
In the Render dashboard, go to Environment and add:
```
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=production
```

### 4. Deploy
Click "Create Web Service" and wait for deployment.

### 5. Update Frontend
Once deployed, copy your Render URL (e.g., `https://krishna-police-api.onrender.com`)
and update the `API_BASE_URL` in `frontend/config.js`:
```javascript
const API_BASE_URL = 'https://krishna-police-api.onrender.com/api';
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Personnel
- `GET /api/personnel` - Get all personnel
- `GET /api/personnel/:id` - Get personnel by ID
- `POST /api/personnel` - Create new personnel
- `PUT /api/personnel/:id` - Update personnel
- `DELETE /api/personnel/:id` - Delete personnel
- `DELETE /api/personnel` - Clear all personnel

### Sanctioned Strength
- `GET /api/sanctioned-strength` - Get all sanctioned strength
- `POST /api/sanctioned-strength` - Update sanctioned strength

### Deputation Strength
- `GET /api/deputation-strength` - Get all deputation strength
- `POST /api/deputation-strength` - Update deputation strength

## Important Notes
- This uses an in-memory database. Data will be lost when the server restarts.
- For production, connect to MongoDB Atlas or PostgreSQL.
- All API endpoints (except auth) require Bearer token authentication.
