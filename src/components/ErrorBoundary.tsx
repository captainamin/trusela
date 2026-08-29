import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorDetails = '';
      try {
        // Check if it's a Firestore error JSON
        const parsed = JSON.parse(this.state.error?.message || '');
        if (parsed.error) {
          errorDetails = parsed.error;
        }
      } catch (e) {
        errorDetails = this.state.error?.message || 'An unexpected error occurred';
      }

      return (
        <div className="min-h-screen bg-navy flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-10 h-10 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-navy mb-2">Something went wrong</h1>
            <p className="text-gray-600 mb-6">
              {errorDetails}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full btn-primary py-4 flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-5 h-5" />
              Try Again
            </button>
            <p className="mt-6 text-[10px] text-gray-400 uppercase tracking-widest font-bold">
              Trusela Security System
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
