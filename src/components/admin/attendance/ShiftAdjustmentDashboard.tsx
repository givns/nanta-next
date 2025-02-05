// components/admin/attendance/ShiftAdjustmentDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useLiff } from '@/contexts/LiffContext';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateSelector } from './components/DateSelector';
import { LoadingSpinner } from '../../LoadingSpinnner';
import { Search } from 'lucide-react';
import {
  ShiftAdjustment,
  Department,
  ShiftData,
} from '../../../types/attendance';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function ShiftAdjustmentDashboard() {
  // Initialize state with proper loading handling
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    departments: Department[];
    shifts: ShiftData[];
    adjustments: ShiftAdjustment[];
  }>({
    departments: [],
    shifts: [],
    adjustments: [],
  });

  const { lineUserId } = useLiff();
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    if (!lineUserId) return;

    try {
      setIsLoading(true);
      const headers = { 'x-line-userid': lineUserId };

      // Fetch initial data
      const [shiftsRes, deptsRes] = await Promise.all([
        fetch('/api/shifts/shifts', { headers }),
        fetch('/api/departments', { headers }),
      ]);

      if (!shiftsRes.ok || !deptsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const [shiftsData, deptsData] = await Promise.all([
        shiftsRes.json(),
        deptsRes.json(),
      ]);

      setData((prev) => ({
        ...prev,
        shifts: shiftsData,
        departments: deptsData,
      }));
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Only render main content after data is loaded
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Shift Adjustments</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Content will go here</p>
        </CardContent>
      </Card>
    </div>
  );
}
