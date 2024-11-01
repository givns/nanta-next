// components/admin/PayrollAdminDashboard.tsx
import { useState, useEffect } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  Calendar,
  Clock,
  UserCheck,
  DollarSign,
} from 'lucide-react';

import { PayrollUtils } from '@/utils/payrollUtils';
import { PayrollCalculationResult, PayrollApiResponse } from '@/types/payroll';
import { MobileControls, DesktopControls } from './controls';
import { OverviewCards } from './cards/OverviewCards';
import { AttendanceDetails } from './cards/AttendanceDetails';
import { LeaveDetails } from './cards/LeaveDetails';
import { PayrollCalculation } from './cards/PayrollCalculation';

import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import { Button } from '@/components/ui/button';
import { PayrollProcessing } from '@/components/payroll/PayrollProcessing';
import {
  calculatePayroll,
  getPayroll,
  savePayroll,
} from '../../../utils/api/payroll';

// Animation variants
const tabVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
  }),
};

const transition = {
  type: 'tween',
  duration: 0.35,
};

export default function PayrollAdminDashboard() {
  const { user } = useAdmin();
  const [state, setState] = useState({
    selectedEmployee: '',
    selectedPeriod: '',
    payrollData: null as PayrollCalculationResult | null,
    isLoading: false,
    error: null as string | null,
    activeTab: 'overview',
    direction: 0,
  });
  const [employees, setEmployees] = useState<
    Array<{ employeeId: string; name: string }>
  >([]);
  const [view, setView] = useState<'calculate' | 'process'>('calculate');
  const periods = PayrollUtils.generatePayrollPeriods();
  const [isLoading, setIsLoading] = useState(true);

  // Tab management with direction tracking
  const handleTabChange = (newTab: string) => {
    const tabOrder = ['overview', 'attendance', 'leaves', 'calculation'];
    const oldIndex = tabOrder.indexOf(state.activeTab);
    const newIndex = tabOrder.indexOf(newTab);
    const direction = newIndex > oldIndex ? 1 : -1;

    setState((prev) => ({
      ...prev,
      activeTab: newTab,
      direction,
    }));
  };

  // Fetch data logic
  useEffect(() => {
    if (user?.lineUserId) {
      fetchEmployees();
    }
  }, [user]);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/admin/payroll/[employeesId]', {
        headers: {
          'x-line-userid': user?.lineUserId || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch employees');
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: 'Failed to load employees',
      }));
    }
  };

  const handleCalculate = async () => {
    if (!state.selectedEmployee || !state.selectedPeriod || !user?.lineUserId)
      return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // First, check if payroll exists
      const period = PayrollUtils.parsePeriodValue(state.selectedPeriod);
      if (!period) throw new Error('Invalid period');

      const existingPayroll = await getPayroll({
        employeeId: state.selectedEmployee,
        periodStart: PayrollUtils.formatDateForAPI(period.startDate),
        periodEnd: PayrollUtils.formatDateForAPI(period.endDate),
        lineUserId: user.lineUserId,
      });

      if (existingPayroll) {
        setState((prev) => ({
          ...prev,
          payrollData: existingPayroll,
          isLoading: false,
        }));
        return;
      }

      // Calculate new payroll
      const calculatedPayroll = await calculatePayroll({
        employeeId: state.selectedEmployee,
        periodStart: PayrollUtils.formatDateForAPI(period.startDate),
        periodEnd: PayrollUtils.formatDateForAPI(period.endDate),
        lineUserId: user.lineUserId,
      });

      // Save calculated payroll
      const savedPayroll = await savePayroll({
        employeeId: state.selectedEmployee,
        periodStart: PayrollUtils.formatDateForAPI(period.startDate),
        periodEnd: PayrollUtils.formatDateForAPI(period.endDate),
        payrollData: calculatedPayroll,
        lineUserId: user.lineUserId,
      });

      setState((prev) => ({
        ...prev,
        payrollData: savedPayroll,
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error ? error.message : 'Failed to process payroll',
        isLoading: false,
      }));
    }
  };

  const fetchPayrollData = async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const period = PayrollUtils.parsePeriodValue(state.selectedPeriod);
      if (!period) throw new Error('Invalid period');

      // First try to get existing payroll
      const existingResponse = await fetch(
        `/api/admin/payroll/payroll?employeeId=${state.selectedEmployee}&periodStart=${PayrollUtils.formatDateForAPI(period.startDate)}&periodEnd=${PayrollUtils.formatDateForAPI(period.endDate)}`,
        {
          headers: {
            'x-line-userid': user?.lineUserId || '',
          },
        },
      );

      const existingResult: PayrollApiResponse<PayrollCalculationResult> =
        await existingResponse.json();

      if (existingResult.success) {
        setState((prev) => ({
          ...prev,
          payrollData: existingResult.data,
          isLoading: false,
        }));
        return;
      }

      // If no existing payroll, calculate new one
      const calculateResponse = await fetch(
        '/api/admin/payroll/calculate-payroll',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-line-userid': user?.lineUserId || '',
          },
          body: JSON.stringify({
            employeeId: state.selectedEmployee,
            periodStart: PayrollUtils.formatDateForAPI(period.startDate),
            periodEnd: PayrollUtils.formatDateForAPI(period.endDate),
          }),
        },
      );

      const calculatedResult: PayrollApiResponse<PayrollCalculationResult> =
        await calculateResponse.json();

      if (!calculatedResult.success) {
        throw new Error(calculatedResult.error);
      }

      // Save the calculated payroll
      const saveResponse = await fetch('/api/admin/payroll/payroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          employeeId: state.selectedEmployee,
          periodStart: PayrollUtils.formatDateForAPI(period.startDate),
          periodEnd: PayrollUtils.formatDateForAPI(period.endDate),
          payrollData: calculatedResult.data,
        }),
      });

      const savedResult: PayrollApiResponse<PayrollCalculationResult> =
        await saveResponse.json();

      if (!savedResult.success) {
        throw new Error(savedResult.error);
      }

      setState((prev) => ({
        ...prev,
        payrollData: savedResult.data,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Error in fetchPayrollData:', error);
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load payroll data',
        isLoading: false,
      }));
    }
  };

  useEffect(() => {
    if (state.selectedEmployee && state.selectedPeriod && user?.lineUserId) {
      fetchPayrollData();
    }
  }, [state.selectedEmployee, state.selectedPeriod, user?.lineUserId]);

  // Handlers
  const handleEmployeeChange = (value: string) => {
    setState((prev) => ({ ...prev, selectedEmployee: value }));
  };

  const handlePeriodChange = (value: string) => {
    setState((prev) => ({ ...prev, selectedPeriod: value }));
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Header with View Toggle */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-xl md:text-2xl font-bold">Payroll Management</h1>

        <div className="flex space-x-2">
          <Button
            variant={view === 'calculate' ? 'default' : 'outline'}
            onClick={() => setView('calculate')}
          >
            Calculate Individual
          </Button>
          <Button
            variant={view === 'process' ? 'default' : 'outline'}
            onClick={() => setView('process')}
          >
            Batch Process
          </Button>
        </div>
      </div>

      {/* Main Content */}
      {view === 'calculate' ? (
        // Individual Calculation View
        <>
          {/* Controls Section */}
          <div className="w-full md:w-auto mb-6">
            <div className="hidden md:block">
              <DesktopControls
                selectedEmployee={state.selectedEmployee}
                selectedPeriod={state.selectedPeriod}
                employees={employees}
                periods={periods}
                onEmployeeChange={handleEmployeeChange}
                onPeriodChange={handlePeriodChange}
                onCalculate={handleCalculate}
                isLoading={state.isLoading}
              />
            </div>
            <div className="md:hidden">
              <MobileControls
                selectedEmployee={state.selectedEmployee}
                selectedPeriod={state.selectedPeriod}
                employees={employees}
                periods={periods}
                onEmployeeChange={handleEmployeeChange}
                onPeriodChange={handlePeriodChange}
                onCalculate={handleCalculate}
                isLoading={state.isLoading}
              />
            </div>
          </div>

          {/* Error Display */}
          <AnimatePresence>
            {state.error && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-4 p-4 bg-red-50 text-red-700 rounded-md flex items-center"
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                {state.error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Payroll Data Display */}
          {state.payrollData && (
            <Tabs
              value={state.activeTab}
              onValueChange={handleTabChange}
              className="mt-6"
            >
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="leaves">Leaves</TabsTrigger>
                <TabsTrigger value="calculation">Calculation</TabsTrigger>
              </TabsList>

              <AnimatePresence initial={false} custom={state.direction}>
                <motion.div
                  key={state.activeTab}
                  custom={state.direction}
                  variants={tabVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={transition}
                  className="mt-6"
                >
                  <TabsContent value="overview" forceMount>
                    <OverviewCards payrollData={state.payrollData} />
                  </TabsContent>
                  <TabsContent value="attendance" forceMount>
                    <AttendanceDetails payrollData={state.payrollData} />
                  </TabsContent>
                  <TabsContent value="leaves" forceMount>
                    <LeaveDetails payrollData={state.payrollData} />
                  </TabsContent>
                  <TabsContent value="calculation" forceMount>
                    <PayrollCalculation payrollData={state.payrollData} />
                  </TabsContent>
                </motion.div>
              </AnimatePresence>
            </Tabs>
          )}
        </>
      ) : (
        // Batch Processing View
        <PayrollProcessing
          onComplete={() => {
            setView('calculate');
            fetchEmployees(); // Refresh employee list after batch processing
          }}
        />
      )}
    </div>
  );
}

// Add slide animation for tab transitions
const TabContent: React.FC<{
  children: React.ReactNode;
  isActive: boolean;
  direction: number;
}> = ({ children, isActive, direction }) => (
  <motion.div
    initial={{ opacity: 0, x: direction > 0 ? '100%' : '-100%' }}
    animate={{
      opacity: isActive ? 1 : 0,
      x: isActive ? 0 : direction > 0 ? '-100%' : '100%',
    }}
    transition={{ duration: 0.3 }}
    style={{ display: isActive ? 'block' : 'none' }}
  >
    {children}
  </motion.div>
);
