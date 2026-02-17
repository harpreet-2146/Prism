# PRISM Frontend - Deployment Guide

## 🚀 Deploy to Vercel (Recommended)

### Prerequisites
- GitHub account
- Vercel account (free tier)
- Backend deployed on Railway

### Step 1: Push to GitHub
```bash
cd frontend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/prism-frontend.git
git push -u origin main
```

### Step 2: Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure project:
```
Framework Preset: Vite
Root Directory: ./
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

### Step 3: Set Environment Variables

Add these in Vercel dashboard:
```
VITE_API_URL=https://your-backend.railway.app
VITE_APP_NAME=PRISM
```

### Step 4: Deploy

Click "Deploy" - Vercel will build and deploy automatically.

**Your app will be live at:** `https://your-project.vercel.app`

---

## 🔄 Automatic Deployments

Vercel automatically redeploys on every push to `main` branch.

To deploy from a different branch:
1. Go to Project Settings → Git
2. Change "Production Branch" to your branch name

---

## 🌐 Custom Domain

1. Go to Project Settings → Domains
2. Add your domain (e.g., `prism.yourcompany.com`)
3. Add DNS records as shown
4. Wait for DNS propagation (~24h)

---

## 📊 Environment Configuration

### Development
```bash
VITE_API_URL=http://localhost:5000
VITE_DEBUG=true
```

### Production
```bash
VITE_API_URL=https://your-backend.railway.app
VITE_DEBUG=false
```

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Vercel project created
- [ ] Environment variables set
- [ ] Build successful
- [ ] App accessible via Vercel URL
- [ ] Backend API connected (check Network tab)
- [ ] Login/register works
- [ ] File upload works
- [ ] Chat streaming works
- [ ] Export functions work

---

## 🐛 Troubleshooting

### Build fails on Vercel

Check build logs in Vercel dashboard. Common issues:
- Missing environment variables
- Dependency version conflicts
- ESLint errors blocking build

**Solution:** Fix errors locally first, then push.

### API calls fail in production

Check:
1. `VITE_API_URL` is set correctly
2. Backend CORS allows your Vercel domain
3. Backend is running (check Railway logs)

### Blank page after deployment

Check browser console for errors. Usually:
- Incorrect `VITE_API_URL`
- Missing environment variables
- CORS issues

---

## 📈 Performance Tips

1. **Enable caching** - Vercel does this automatically
2. **Use CDN** - Vercel Edge Network
3. **Optimize images** - Use WebP format
4. **Code splitting** - Already done by Vite
5. **Lazy loading** - For large components

---

## 🔒 Security in Production

1. Always use HTTPS (Vercel provides free SSL)
2. Set secure headers in `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

3. Never expose API keys in frontend
4. Use environment variables for all secrets

---

## 💰 Cost Estimate

**Vercel Free Tier:**
- ✅ 100GB bandwidth/month
- ✅ Unlimited deployments
- ✅ Auto SSL
- ✅ Analytics (basic)

**Hobby tier ($20/month) includes:**
- 1TB bandwidth
- Advanced analytics
- Password protection
- More team members

**For PRISM demo:** Free tier is sufficient! 🎉