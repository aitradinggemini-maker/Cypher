import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMsg: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-950 flex flex-col items-center justify-center p-6 text-stone-200 font-mono">
          <h1 className="text-2xl font-bold mb-4 text-red-500">Application Error</h1>
          <p className="mb-4">The application crashed. Error details:</p>
          <pre className="bg-stone-900 p-4 rounded border border-stone-800 text-xs overflow-auto max-w-full">
            {this.state.errorMsg}
          </pre>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
