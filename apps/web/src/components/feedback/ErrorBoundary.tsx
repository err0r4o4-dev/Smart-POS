import { Component } from 'react';
import type { ReactNode } from 'react';
import { PageError } from './PageError';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <PageError />;
    return this.props.children;
  }
}
