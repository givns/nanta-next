// components/payroll/cards/DesktopCards.tsx
import { PayrollComponentProps } from '@/types/payroll/components';
import { OverviewCards } from './OverviewCards';
import { AttendanceDetails } from './AttendanceDetails';
import { LeaveDetails } from './LeaveDetails';
import { PayrollCalculation } from './PayrollCalculation';

interface DesktopCardsProps extends PayrollComponentProps {
  activeTab: string;
}

export const DesktopCards: React.FC<DesktopCardsProps> = ({
  payrollData,
  activeTab,
}) => (
  <div className="hidden md:block space-y-6">
    {activeTab === 'overview' && <OverviewCards payrollData={payrollData} />}
    {activeTab === 'attendance' && (
      <AttendanceDetails payrollData={payrollData} />
    )}
    {activeTab === 'leaves' && <LeaveDetails payrollData={payrollData} />}
    {activeTab === 'calculation' && (
      <PayrollCalculation payrollData={payrollData} />
    )}
  </div>
);
