import { Link } from 'react-router-dom';
import RegisterForm from '@components/auth/RegisterForm';
import { APP_NAME, APP_TAGLINE } from '@lib/constants';

export default function Register() {
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
            <h3 className="text-lg font-semibold">🚀 Get Started in Minutes</h3>
            <p className="mt-2 text-sm text-primary-100">
              Create your free account and start analyzing SAP documentation instantly
            </p>
          </div>

          <div className="rounded-lg bg-white/10 p-6 backdrop-blur">
            <h3 className="text-lg font-semibold">🔒 Secure & Private</h3>
            <p className="mt-2 text-sm text-primary-100">
              Your documents and conversations are encrypted and private to your account
            </p>
          </div>

          <div className="rounded-lg bg-white/10 p-6 backdrop-blur">
            <h3 className="text-lg font-semibold">💡 Intelligent Analysis</h3>
            <p className="mt-2 text-sm text-primary-100">
              Powered by advanced AI to understand SAP documentation with visual context
            </p>
          </div>
        </div>

        <p className="text-xs text-primary-200">
          Disclaimer: This product is not affiliated with, endorsed by, or sponsored by SAP SE.
          SAP® is a registered trademark of SAP SE.
        </p>
      </div>

      {/* Right side - Register form */}
      <div className="flex w-full items-center justify-center bg-background p-8 lg:w-1/2">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Create your account</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start analyzing SAP documentation with AI
            </p>
          </div>

          <RegisterForm />

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}