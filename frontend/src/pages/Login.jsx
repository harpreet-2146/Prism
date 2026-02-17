import { Link } from 'react-router-dom';
import LoginForm from '@components/auth/LoginForm';
import { APP_NAME, APP_TAGLINE } from '@lib/constants';

export default function Login() {
  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="hidden w-1/2 bg-gradient-to-br from-primary-600 to-primary-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <h1 className="text-4xl font-bold">{APP_NAME}</h1>
          <p className="mt-2 text-xl text-primary-100">{APP_TAGLINE}</p>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg bg-white/10 p-6 backdrop-blur">
            <h3 className="text-lg font-semibold">📄 Upload SAP Documentation</h3>
            <p className="mt-2 text-sm text-primary-100">
              Upload SAP Note PDFs and let AI analyze the content with visual context
            </p>
          </div>

          <div className="rounded-lg bg-white/10 p-6 backdrop-blur">
            <h3 className="text-lg font-semibold">💬 Interactive Q&A</h3>
            <p className="mt-2 text-sm text-primary-100">
              Ask questions and get step-by-step guides with screenshots from your documents
            </p>
          </div>

          <div className="rounded-lg bg-white/10 p-6 backdrop-blur">
            <h3 className="text-lg font-semibold">📊 Export Guides</h3>
            <p className="mt-2 text-sm text-primary-100">
              Save conversations as professional PDF or DOCX documents
            </p>
          </div>
        </div>

        <p className="text-xs text-primary-200">
          Disclaimer: This product is not affiliated with, endorsed by, or sponsored by SAP SE.
          SAP® is a registered trademark of SAP SE.
        </p>
      </div>

      {/* Right side - Login form */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-1/2">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Welcome back</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to your account to continue
            </p>
          </div>

          <LoginForm />

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}