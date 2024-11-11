// components/admin/PayrollAdminDashboard.tsx
import { useState, useEffect } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { PayrollUtils } from '@/utils/payrollUtils';
import { PayrollCalculationResult, PayrollApiResponse } from '@/types/payroll';
import { MobileControls, DesktopControls } from './controls';
import PayrollTabs from './PayrollTabs';
import { Button } from '@/components/ui/button';
import { PayrollProcessing } from '@/components/payroll/PayrollProcessing';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isValid, parseISO } from 'date-fns';

function PayrollDashboardContent() {
  const { user } = useAdmin();
  const [state, setState] = useState({
    selectedEmployee: '',
    selectedPeriod: '', // Initialize as empty string
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

  // Modify the useEffect for setting default period
  useEffect(() => {
    const periods = PayrollUtils.generatePayrollPeriods();
    const currentPeriod = periods.find((period) => period.isCurrentPeriod);

    if (currentPeriod && currentPeriod.value) {
      setState((prev) => ({
        ...prev,
        selectedPeriod: currentPeriod.value,
      }));
    }
  }, []);

  useEffect(() => {
    if (user?.lineUserId) {
      fetchEmployees();
    }
  }, [user]);

  const fetchEmployees = async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));
      const response = await fetch('/api/admin/employees', {
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
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  // Modify the handleCalculate function
  const handleCalculate = async () => {
    if (!state.selectedEmployee || !state.selectedPeriod || !user?.lineUserId) {
      setState((prev) => ({
        ...prev,
        error: 'Please select both employee and period',
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Parse period properly using PayrollUtils
      const periodRange = PayrollUtils.parsePeriodValue(state.selectedPeriod);

      if (!periodRange) {
        throw new Error('Invalid period selected');
      }

      const formattedStartDate = PayrollUtils.formatDateForAPI(
        periodRange.startDate,
      );
      const formattedEndDate = PayrollUtils.formatDateForAPI(
        periodRange.endDate,
      );

      // First check if payroll exists
      const payrollResponse = await fetch(
        `/api/admin/payroll/payroll?` +
          new URLSearchParams({
            employeeId: state.selectedEmployee,
            periodStart: formattedStartDate,
            periodEnd: formattedEndDate,
          }).toString(),
        {
          headers: {
            'x-line-userid': user.lineUserId,
          },
        },
      );

      if (payrollResponse.ok) {
        const existingPayroll = await payrollResponse.json();
        if (existingPayroll.success) {
          setState((prev) => ({
            ...prev,
            payrollData: existingPayroll.data,
            isLoading: false,
          }));
          return;
        }
      }

      // Calculate new payroll
      const calculateResponse = await fetch(
        '/api/admin/payroll/calculate-payroll',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-line-userid': user.lineUserId,
          },
          body: JSON.stringify({
            employeeId: state.selectedEmployee,
            periodStart: formattedStartDate,
            periodEnd: formattedEndDate,
          }),
        },
      );

      if (!calculateResponse.ok) {
        const errorData = await calculateResponse.json();
        throw new Error(errorData.message || 'Failed to calculate payroll');
      }

      const calculatedPayroll = await calculateResponse.json();

      setState((prev) => ({
        ...prev,
        payrollData: calculatedPayroll.calculation,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Payroll calculation error:', error);
      setState((prev) => ({
        ...prev,
        error:
          error instanceof Error ? error.message : 'Failed to process payroll',
        isLoading: false,
      }));
    }
  };

  // Update handlePeriodChange to include validation
  const handlePeriodChange = (value: string) => {
    if (!value) {
      setState((prev) => ({
        ...prev,
        error: 'Invalid period selected',
        selectedPeriod: '',
      }));
      return;
    }

    try {
      const [startDate, endDate] = value.split('_');
      if (!startDate || !endDate) {
        throw new Error('Invalid period format');
      }

      // Validate dates
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      if (!isValid(start) || !isValid(end)) {
        throw new Error('Invalid date format');
      }

      setState((prev) => ({
        ...prev,
        selectedPeriod: value,
        error: null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: 'Invalid period format',
        selectedPeriod: '',
      }));
    }
  };

  const fetchPayrollData = async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const period = PayrollUtils.parsePeriodValue(state.selectedPeriod);
      if (!period) throw new Error('Invalid period');

      // Calculate new payroll data regardless of existing record
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

      if (!calculateResponse.ok) {
        const errorData = await calculateResponse.json();
        throw new Error(errorData.error || 'Failed to calculate payroll');
      }

      const calculatedResult = await calculateResponse.json();
      if (!calculatedResult.success) {
        throw new Error(
          calculatedResult.error || 'Failed to calculate payroll',
        );
      }

      // Check for existing record to determine whether to POST or PUT
      const existingResponse = await fetch(
        `/api/admin/payroll/payroll?employeeId=${state.selectedEmployee}&periodStart=${PayrollUtils.formatDateForAPI(period.startDate)}&periodEnd=${PayrollUtils.formatDateForAPI(period.endDate)}`,
        {
          headers: {
            'x-line-userid': user?.lineUserId || '',
          },
        },
      );

      const existingResult = await existingResponse.json();
      const method =
        existingResult.success && existingResult.data ? 'PUT' : 'POST';

      // Save/update the calculated payroll
      const saveResponse = await fetch('/api/admin/payroll/payroll', {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          employeeId: state.selectedEmployee,
          periodStart: PayrollUtils.formatDateForAPI(period.startDate),
          periodEnd: PayrollUtils.formatDateForAPI(period.endDate),
          payrollData: {
            ...calculatedResult.data,
            status: 'draft',
          },
        }),
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || 'Failed to save payroll');
      }

      const savedResult = await saveResponse.json();
      if (!savedResult.success) {
        throw new Error(savedResult.error || 'Failed to save payroll');
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

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Mode Selection Card */}
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Payroll Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <Button
              variant={view === 'calculate' ? 'default' : 'outline'}
              onClick={() => setView('calculate')}
              className="flex-1 sm:flex-none"
            >
              Calculate Individual
            </Button>
            <Button
              variant={view === 'process' ? 'default' : 'outline'}
              onClick={() => setView('process')}
              className="flex-1 sm:flex-none"
            >
              Batch Process
            </Button>
          </div>
        </CardContent>
      </Card>

      {view === 'calculate' ? (
        <>
          {/* Calculation Controls Card */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Payroll Calculation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
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

                {/* Error Display */}
                {state.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{state.error}</AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>

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
            <PayrollTabs
              activeTab={state.activeTab}
              direction={state.direction}
              onTabChange={handleTabChange}
              payrollData={state.payrollData}
            />
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
export default function PayrollAdminDashboard() {
  return <PayrollDashboardContent />;
}
