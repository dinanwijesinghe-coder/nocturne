import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Nocturne ErrorBoundary caught:', error, info);
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let readable = this.state.message;
    try {
      const parsed = JSON.parse(this.state.message);
      if (parsed?.error && parsed?.operationType) {
        readable = `Cloud Sync (${parsed.operationType} on ${parsed.path || 'database'}): ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }

    return (
      <div className="min-h-screen bg-[#09090E] text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl bg-[#11111A] border border-rose-500/30 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Sync or Playback Interrupted</h1>
              <p className="text-xs text-zinc-400">Your offline IndexedDB downloads remain safe on this device.</p>
            </div>
          </div>

          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 break-words">
            {readable}
          </p>

          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="w-full py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Resume Nocturne
          </button>
        </div>
      </div>
    );
  }
}
