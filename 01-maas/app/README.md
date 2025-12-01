# LiteLLM Model Discovery App

A full-stack application for discovering and browsing LLM models available through the LiteLLM API.

## Features

- 🎨 Modern UI with Tailwind CSS
- 🔍 Search and filter models
- 📊 Detailed model information display
- 🎯 Responsive tile-based layout
- ⚡ Fast and efficient API integration

## Tech Stack

### Frontend
- React 18
- Vite
- Tailwind CSS
- Axios

### Backend
- Node.js
- Express
- Axios
- CORS

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables (optional):
Edit the `.env` file to set your LiteLLM master key if needed:
```env
PORT=3001
LITELLM_API_BASE=https://litellm-api.up.railway.app
LITELLM_MASTER_KEY=your_master_key_here
```

4. Start the backend server:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## Usage

1. Make sure both backend and frontend servers are running
2. Open your browser and navigate to `http://localhost:3000`
3. You'll see the Model Discovery page with all available models displayed as tiles
4. Use the search bar to filter models by name
5. Click on a model card to view more details (functionality can be extended)

## API Endpoints

The backend exposes the following endpoints:

- `GET /api/health` - Health check endpoint
- `GET /api/models` - Get all available models
- `GET /api/model-info` - Get detailed model information
- `GET /api/model-group-info` - Get model group information

## Project Structure

```
litellm-app/
├── backend/
│   ├── server.js          # Express server
│   ├── package.json       # Backend dependencies
│   └── .env              # Environment variables
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Sidebar.jsx      # Navigation sidebar
    │   │   ├── Models.jsx       # Models list page
    │   │   └── ModelCard.jsx    # Individual model card
    │   ├── App.jsx              # Main app component
    │   ├── main.jsx             # Entry point
    │   └── index.css            # Global styles
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── package.json
```

## Customization

### Adding New Navigation Items

Edit `frontend/src/components/Sidebar.jsx` and add items to the `menuItems` array:

```javascript
const menuItems = [
  { id: 'models', name: 'Models', icon: '🤖' },
  { id: 'new-page', name: 'New Page', icon: '📄' }
];
```

### Styling

The app uses Tailwind CSS. You can customize the theme by editing `frontend/tailwind.config.js`.

### API Configuration

To change the LiteLLM API endpoint, update the `LITELLM_API_BASE` in `backend/.env`.

## Building for Production

### Frontend
```bash
cd frontend
npm run build
```

The build output will be in `frontend/dist/`

### Backend
The backend is production-ready. Just ensure environment variables are properly set in your deployment environment.

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!
