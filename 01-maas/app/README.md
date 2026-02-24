# MaaS (Model-as-a-Service) App

A full-stack application for managing LLM models and Jupyter notebooks, providing a unified interface for AI platform services.

## Features

- Model Discovery: Search and browse LLM models available through LiteLLM API
- Notebook Management: View, start, and stop JupyterHub notebooks
- API Key Management: Create, view, and manage LiteLLM API keys with per-key usage tracking
- Team Management: Create and manage teams with budget enforcement and spend tracking
- FinOps Dashboard: Server-side spend aggregation via `/global/spend/report`, spend by model/key/team charts, date-filtered reporting
- Budget Alerts: Webhook receiver for LiteLLM budget threshold notifications
- Modern UI with Tailwind CSS and elegant light theme
- Responsive tile-based layout
- Fast and efficient API integration

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

### Configuration
- `GET /api/config` - Get platform configuration (LiteLLM public URL, JupyterHub URL)

### Models
- `GET /api/health` - Health check endpoint
- `GET /api/models` - Get all available models
- `GET /api/model-info` - Get detailed model information with pricing
- `GET /api/model-group-info` - Get model group information
- `GET /api/public-model-hub` - Get published models only
- `PUT /api/models/:modelId/pricing` - Update model pricing metadata

### API Keys
- `GET /api/keys` - List all API keys
- `GET /api/keys/:token` - Get details for a specific key
- `POST /api/keys` - Create a new API key (supports optional `team_id`)
- `PUT /api/keys/:token` - Update an API key
- `DELETE /api/keys/:token` - Delete an API key

### Teams
- `POST /api/teams` - Create a new team (with `team_alias`, `max_budget`, `budget_duration`)
- `GET /api/teams` - List all teams
- `GET /api/teams/:id` - Get team details
- `PUT /api/teams/:id` - Update a team
- `DELETE /api/teams/:id` - Delete a team

### FinOps / Spend Tracking
- `GET /api/spend/report` - Server-side aggregated spend report (params: `start_date`, `end_date`, `group_by`)
- `GET /api/spend/logs` - Get spend logs with token usage (params: `start_date`, `end_date`)

### Webhooks
- `POST /api/webhooks/budget` - Receives LiteLLM budget alert webhooks (`budget_crossed`, `threshold_crossed`, `projected_limit_exceeded`)

### Notebooks (JupyterHub)
- `GET /api/notebooks` - List all running notebooks
- `POST /api/notebooks` - Start a new notebook for a user
- `DELETE /api/notebooks/:serverName` - Stop a user's notebook
- `GET /api/notebooks/status` - Get notebook server status

## Project Structure

```
maas-app/
├── backend/
│   ├── server.js          # Express server with LiteLLM and JupyterHub APIs
│   ├── package.json       # Backend dependencies
│   └── .env              # Environment variables
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Sidebar.jsx           # Navigation sidebar
    │   │   ├── Models.jsx            # Models list page
    │   │   ├── ModelCard.jsx         # Individual model card with cost/capability info
    │   │   ├── ModelDetailModal.jsx  # Model detail view with usage example
    │   │   ├── Notebooks.jsx         # JupyterHub notebooks page
    │   │   ├── ApiKeys.jsx           # API key management
    │   │   ├── ApiKeyUsageModal.jsx  # Per-key usage details modal
    │   │   └── FinOpsDashboard.jsx   # Usage and cost tracking dashboard
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
