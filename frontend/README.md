# PRISM Frontend

**Intelligent Visual Assistant for SAP® Software**

AI-powered frontend for analyzing SAP documentation with step-by-step visual guides.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Backend API running on `http://localhost:5000`

### Installation
```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env and set VITE_API_URL to your backend URL

# Start development server
npm run dev
```

The app will open at `http://localhost:5173`

## 📦 Available Scripts
```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # Check code quality
npm run lint:fix   # Fix linting issues
npm run format     # Format code with Prettier
```

## 🏗️ Project Structure
```
src/
├── components/     # React components
│   ├── ui/        # shadcn/ui components
│   ├── layout/    # Layout components (Sidebar, Header)
│   ├── chat/      # Chat interface components
│   ├── documents/ # Document management
│   └── auth/      # Authentication forms
├── pages/         # Page components
├── hooks/         # Custom React hooks
├── lib/           # Utilities and helpers
└── context/       # React Context providers
```

## 🎨 Tech Stack

- **React 18** - UI library
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **shadcn/ui** - UI components
- **React Router** - Routing
- **Axios** - HTTP client
- **React Hook Form** - Form handling
- **Zod** - Validation

## 🔧 Configuration

### Environment Variables

See `.env.example` for all available options.

**Required:**
- `VITE_API_URL` - Backend API URL

**Optional:**
- `VITE_APP_NAME` - Application name
- `VITE_DEBUG` - Enable debug logs

## 📝 Legal

**Disclaimer:** This product is not affiliated with, endorsed by, or sponsored by SAP SE. SAP® is a registered trademark of SAP SE in Germany and other countries.

## 🤝 Contributing

1. Follow the ESLint and Prettier configurations
2. Write clean, readable code
3. Test all changes before committing

## 📄 License

[Your License Here]