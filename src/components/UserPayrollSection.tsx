import React, { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AlertCircle, FileSpreadsheet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PayrollSummary from './PayrollSummary';
import {
  PayrollSummaryResponse,
  PayrollPeriodResponse,
  PayrollSettings,
} from '@/types/api';

interface UserPayrollSectionProps {
  employeeId: string;
}

const UserPayrollSection: React.FC<UserPayrollSectionProps> = ({
  employeeId,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payrollData, setPayrollData] = useState<PayrollSummaryResponse | null>(
    null,
  );
  const [periods, setPeriods] = useState<PayrollPeriodResponse | null>(null);
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');

  // Fetch all necessary payroll data
  useEffect(() => {
    const fetchPayrollData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [periodsData, settingsData] = await Promise.all([
          fetch(`/api/payroll/periods?employeeId=${employeeId}`).then((res) =>
            res.json(),
          ),
          fetch(`/api/payroll/settings?employeeId=${employeeId}`).then((res) =>
            res.json(),
          ),
        ]);

        setPeriods(periodsData);
        setSettings(settingsData);

        // Set initial selected period to current period
        if (periodsData.currentPeriod) {
          setSelectedPeriod(
            format(parseISO(periodsData.currentPeriod.startDate), 'yyyy-MM'),
          );

          // Fetch initial payroll summary
          const summaryData = await fetch(
            `/api/payroll/summary?employeeId=${employeeId}&period=${periodsData.currentPeriod.startDate}`,
          ).then((res) => res.json());

          setPayrollData(summaryData);
        }
      } catch (err) {
        setError('Failed to load payroll data. Please try again later.');
        console.error('Error fetching payroll data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayrollData();
  }, [employeeId]);

  // Handle period selection
  const handlePeriodChange = async (value: string) => {
    try {
      setIsLoading(true);
      setSelectedPeriod(value);

      const date = startOfMonth(parseISO(`${value}-01`));
      const response = await fetch(
        `/api/payroll/summary?employeeId=${employeeId}&period=${date.toISOString()}`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch payroll data');
      }

      const data = await response.json();
      setPayrollData(data);
    } catch (err) {
      setError('Failed to load payroll data for selected period.');
      console.error('Error fetching period data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !payrollData || !periods) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-500" />
            <span>Loading payroll data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5" />
            <span>Payroll Information</span>
          </CardTitle>
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periods.periods.map((period) => (
                <SelectItem
                  key={format(parseISO(period.startDate), 'yyyy-MM')}
                  value={format(parseISO(period.startDate), 'yyyy-MM')}
                >
                  {format(parseISO(period.startDate), 'MMMM yyyy', {
                    locale: th,
                  })}
                  {period.isCurrentPeriod && ' (Current)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {settings && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-blue-900 mb-2">
                Payroll Information
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm text-blue-800">
                <div>
                  <p>Regular Rate: ฿{settings.regularHourlyRate}/hour</p>
                  <p>OT Rate: {settings.overtimeRates.regular}x</p>
                  <p>Holiday Rate: {settings.overtimeRates.holiday}x</p>
                </div>
                <div>
                  <p>Transportation: ฿{settings.allowances.transportation}</p>
                  <p>Meal: ฿{settings.allowances.meal}</p>
                  <p>Housing: ฿{settings.allowances.housing}</p>
                </div>
              </div>
            </div>
          )}
          <PayrollSummary payrollData={payrollData} />
        </CardContent>
      </Card>
    </div>
  );
};

export default UserPayrollSection;
