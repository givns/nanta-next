// components/payroll/PayrollPeriodManagement.tsx
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PayrollPeriod } from '@/types/payroll/payroll';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';

type DateRange = {
  from?: Date;
  to?: Date;
};

export default function PayrollPeriodManagement() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<DateRange | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchPayrollPeriods();
  }, []);

  const fetchPayrollPeriods = async () => {
    try {
      const response = await fetch('/api/payroll/periods');
      if (response.ok) {
        const data = await response.json();
        setPeriods(data);
      }
    } catch (error) {
      console.error('Error fetching payroll periods:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createPayrollPeriod = async () => {
    if (!selectedDates?.from || !selectedDates?.to) return;

    setIsCreating(true);
    try {
      const response = await fetch('/api/payroll/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: selectedDates.from,
          endDate: selectedDates.to,
        }),
      });

      if (response.ok) {
        fetchPayrollPeriods();
      }
    } catch (error) {
      console.error('Error creating payroll period:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const getStatusBadge = (status: PayrollPeriod['status']) => {
    switch (status) {
      case 'processing':
        return <Badge variant="warning">Processing</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'approved':
        return <Badge variant="success">Approved</Badge>;
      default:
        return <Badge variant="default">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Create New Payroll Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button>Select Period</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Select Payroll Period</DialogTitle>
                </DialogHeader>
                <Calendar
                  mode="range"
                  selected={
                    selectedDates
                      ? {
                          from: selectedDates.from,
                          to: selectedDates.to,
                        }
                      : undefined
                  }
                  onSelect={(range) => {
                    if (range) {
                      setSelectedDates(range);
                    } else {
                      setSelectedDates(null);
                    }
                  }}
                />
                <Button
                  onClick={createPayrollPeriod}
                  disabled={!selectedDates || isCreating}
                >
                  Create Period
                </Button>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payroll Periods</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((period) => (
                <TableRow key={period.id}>
                  <TableCell>
                    {format(new Date(period.startDate), 'MMM dd')} -{' '}
                    {format(new Date(period.endDate), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell>{getStatusBadge(period.status)}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
