// components/payroll/DeprecationWrapper.tsx
import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { PayrollContainerProps } from '@/types/payroll/components';

interface DeprecationWrapperProps {
  componentName: string;
  children: React.ReactNode;
}

export const DeprecationWrapper: React.FC<DeprecationWrapperProps> = ({
  componentName,
  children,
}) => {
  if (process.env.NODE_ENV === 'development') {
    return (
      <div className="space-y-4">
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Deprecated Component</AlertTitle>
          <AlertDescription>
            {componentName} is deprecated and will be removed in the next major
            version. Please use PayrollAdminDashboard or PayrollCalculation
            instead.
          </AlertDescription>
        </Alert>
        {children}
      </div>
    );
  }

  return <>{children}</>;
};

// Usage example for PayrollContainer:
/**
 * @deprecated Use PayrollAdminDashboard instead
 */
export const PayrollContainer: React.FC<PayrollContainerProps> = (props) => {
  return (
    <DeprecationWrapper componentName="PayrollContainer">
      {/* Original PayrollContainer implementation */}
    </DeprecationWrapper>
  );
};
