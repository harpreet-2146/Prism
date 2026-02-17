# PRISM Frontend - Complete Installation Guide

## 📋 Prerequisites

- **Node.js 18+** and **npm 9+**
- Backend API running on `http://localhost:5000` (or configured URL)

Check versions:
```bash
node --version  # Should be v18.0.0 or higher
npm --version   # Should be v9.0.0 or higher
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd frontend
npm install
```

**Expected output:** ~924 packages installed

### 2. Configure Environment
```bash
# Copy environment template
cp .env.example .env

# Edit .env file
# Set VITE_API_URL to your backend URL
```

**`.env` file:**
```bash
VITE_API_URL=http://localhost:5000
VITE_APP_NAME=PRISM
VITE_DEBUG=false
```

### 3. Start Development Server
```bash
npm run dev
```

**Expected output:**
```
VITE v5.4.11  ready in 324 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
➜  press h + enter to show help
```

Open `http://localhost:5173` in your browser.

---

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (port 5173) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Check code quality |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Prettier |

---

## 📁 Project Structure
```
frontend/
├── public/              # Static assets
├── src/
│   ├── components/      # React components
│   │   ├── ui/         # Base UI components (shadcn/ui)
│   │   ├── layout/     # Layout components
│   │   ├── chat/       # Chat interface
│   │   ├── documents/  # Document management
│   │   └── auth/       # Authentication forms
│   ├── pages/          # Page components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utilities and helpers
│   ├── context/        # React Context providers
│   ├── main.jsx        # Entry point
│   └── App.jsx         # Root component
├── .env.example        # Environment template
├── package.json        # Dependencies
└── vite.config.js      # Vite configuration
```

---

## 🎨 Tech Stack

- **React 18** - UI library
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **shadcn/ui** - UI components
- **React Router** - Routing
- **Axios** - HTTP client
- **React Hook Form** - Form handling
- **Zod** - Validation
- **React Markdown** - Markdown rendering

---

## 🧪 Testing the App

### 1. Check Health Endpoint
```bash
curl http://localhost:5173
```

Should load the login page.

### 2. Register a User

1. Click "Sign up"
2. Fill in name, email, password
3. Submit form
4. Should redirect to chat page

### 3. Upload a Document

1. Go to "Documents" page
2. Drag & drop a PDF file
3. Click "Upload Document"
4. Should see processing status

### 4. Test Chat

1. Go to "Chat" page
2. Type a message
3. Should see streaming response
4. Test export buttons (PDF/DOCX)

---

## ⚠️ Troubleshooting

### Issue: Port 5173 already in use
```bash
# Option 1: Kill the process
npx kill-port 5173

# Option 2: Use different port
npm run dev -- --port 5174
```

### Issue: "Cannot find module" errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Issue: API connection failed

Check your `.env` file:
```bash
# Make sure backend URL is correct
VITE_API_URL=http://localhost:5000
```

Test backend health:
```bash
curl http://localhost:5000/api/health
```

### Issue: Styling not working
```bash
# Rebuild Tailwind
npm run dev
```

---

## 📦 Building for Production

### 1. Build the app
```bash
npm run build
```

Output will be in `dist/` folder.

### 2. Preview production build
```bash
npm run preview
```

### 3. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Follow the prompts to connect your project.

**Environment variables for Vercel:**
- `VITE_API_URL` → Your production backend URL (e.g., `https://your-backend.railway.app`)

---

## 🔒 Security Notes

- Never commit `.env` file
- Always use HTTPS in production
- Set strong JWT secrets in backend
- Enable CORS only for your domain

---

## 📝 Development Workflow

1. **Make changes** → Files auto-reload via Vite HMR
2. **Check linting** → `npm run lint`
3. **Format code** → `npm run format`
4. **Test changes** → Manual testing
5. **Build** → `npm run build`
6. **Deploy** → Push to Vercel

---

## 🐛 Known Issues

1. **Streaming chat** - Requires SSE support (works in most browsers)
2. **File upload** - Max 50MB PDF files only
3. **Export** - Requires backend processing (may take time)

---

## 💡 Tips

- Use React DevTools for debugging
- Check browser console for errors
- Use Network tab to debug API calls
- Enable `VITE_DEBUG=true` for verbose logging

---

## 📞 Support

- **Frontend issues** → Check browser console
- **Backend issues** → Check backend logs
- **API errors** → Check Network tab in DevTools

---

## ✅ Checklist

- [ ] Node.js 18+ installed
- [ ] Backend running on port 5000
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file configured
- [ ] Dev server started (`npm run dev`)
- [ ] Can access http://localhost:5173
- [ ] Can register/login
- [ ] Can upload documents
- [ ] Can chat with AI
- [ ] Can export conversations

**All done? You're ready to use PRISM! 🎉**