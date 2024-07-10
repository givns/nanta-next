// components/ErrorBoundary.tsx

import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <p className="mb-2">Please try refreshing the page.</p>
          <details className="mt-4">
            <summary className="cursor-pointer">
              Error Details (for debugging)
            </summary>
            <pre className="mt-2 p-2 bg-red-50 rounded overflow-auto">
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
