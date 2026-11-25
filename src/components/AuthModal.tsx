import React, { useState } from 'react';
import { Headphones, Loader2, Lock, Mail, X } from 'lucide-react';
import { useNocturne } from '../context/NocturneContext';

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try logging in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/popup-closed-by-user':
      return 'Google Sign-In popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Sign-In popup was blocked by your browser. Allow popups or use Email/Password.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication -> Sign-in method). You can use Google Sign-In or Guest Mode.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  }
}

export function AuthModal() {
  const {
    isAuthOpen,
    setAuthOpen,
    signIn,
    signUp,
    signInWithGoogle,
    continueAsGuest,
  } = useNocturne();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAuthOpen) return null;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'signup' && !displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, displayName, bio);
      }
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleClick = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Account Authentication"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md rounded-3xl bg-[#11111A] border border-white/12 p-6 relative">
        <button
          type="button"
          onClick={() => setAuthOpen(false)}
          aria-label="Close sign in dialog"
          className="absolute top-4 right-4 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {mode === 'login' ? 'Sign In to Nocturne' : 'Create Nocturne Account'}
            </h2>
            <p className="text-xs text-zinc-400">
              Real-time Firestore sync across devices · Offline IndexedDB stays local
            </p>
          </div>
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleGoogleClick}
          className="w-full py-2.5 px-4 rounded-xl bg-white text-zinc-950 hover:bg-zinc-100 disabled:opacity-60 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors mb-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[11px] text-zinc-500">or with email</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#09090E] border border-white/8 mb-4">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`py-2 text-xs font-medium rounded-lg ${
              mode === 'login' ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); }}
            className={`py-2 text-xs font-medium rounded-lg ${
              mode === 'signup' ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-300 mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl bg-[#09090E] border border-white/12 pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-zinc-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full rounded-xl bg-[#09090E] border border-white/12 pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>

          {mode === 'signup' && (
            <>
              <div>
                <label htmlFor="auth-displayname" className="block text-xs font-medium text-zinc-300 mb-1">
                  Display Name
                </label>
                <input
                  id="auth-displayname"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Mercer"
                  className="w-full rounded-xl bg-[#09090E] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label htmlFor="auth-bio" className="block text-xs font-medium text-zinc-300 mb-1">
                  Bio (optional)
                </label>
                <input
                  id="auth-bio"
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Late-night synth & podcast fan"
                  className="w-full rounded-xl bg-[#09090E] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-400"
                />
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2 leading-relaxed">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 disabled:opacity-60 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {mode === 'login' ? 'Sign In with Email' : 'Create Account'}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-white/8">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={continueAsGuest}
            className="w-full py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 text-xs font-medium border border-white/10"
          >
            Continue in Guest Mode (Local Device Only)
          </button>
        </div>
      </div>
    </div>
  );
}
