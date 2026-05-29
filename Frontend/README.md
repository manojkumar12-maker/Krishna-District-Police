# Krishna District Police - Frontend

## Overview
This is the frontend for the Krishna District Police PC/WPC Data Management System.
Designed to run on **GitHub Pages** (free static hosting).

## File Structure
```
frontend/
├── index.html          # Main entry point
├── styles.css          # All styles
├── config.js           # Configuration & constants
├── api.js              # API helper functions
├── auth.js             # Authentication module
├── dashboard.js        # Dashboard & data display
├── personnel.js        # Personnel CRUD operations
├── deputation.js       # Deputation management
├── export.js           # Export functionality
└── app.js              # Main app initialization
```

## Deployment on GitHub Pages

### 1. Create a GitHub Repository
- Go to [github.com](https://github.com)
- Create a new repository (e.g., `krishna-police-frontend`)
- Make it **Public**

### 2. Upload Files
Upload all files from the `frontend/` folder to your repository.

### 3. Enable GitHub Pages
- Go to repository **Settings** → **Pages**
- Under "Source", select **Deploy from a branch**
- Select **main** branch and **/(root)** folder
- Click **Save**

### 4. Access Your Site
After a few minutes, your site will be live at:
```
https://yourusername.github.io/krishna-police-frontend/
```

## Important Configuration

### Update API URL
Before deploying, update the backend URL in `config.js`:
```javascript
const API_BASE_URL = 'https://your-render-app.onrender.com/api';
```
Replace `your-render-app.onrender.com` with your actual Render deployment URL.

## Features
- **Login/Register** - JWT-based authentication
- **Dashboard** - View district-wise personnel counts
- **Erstwhile Krishna District** - CIVIL & AR personnel management
- **Krishna District (New)** - Rank-wise strength with sanctioned vs actual
- **Deputation** - 19 deputation units with consolidated reports
- **Export** - CSV and PDF export functionality
- **Responsive Design** - Works on mobile and desktop

## Browser Compatibility
- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers
