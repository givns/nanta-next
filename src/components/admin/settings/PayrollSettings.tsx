// components/admin/settings/PayrollSettings.tsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PayrollSettingsData {
  rates: {
    regularHourlyBase: number;
    overtimeMultiplier: number;
    holidayMultiplier: number;
    weekendMultiplier: number;
  };
  allowances: {
    transportation: number;
    meal: number;
    housing: number;
  };
  deductions: {
    socialSecurityRate: number;
    taxRate: number;
  };
  rules: {
    payrollPeriodStart: number; // Day of month (e.g., 26)
    payrollPeriodEnd: number; // Day of month (e.g., 25)
    overtimeMinimumMinutes: number;
    roundOvertimeTo: number; // minutes (e.g., 30)
  };
}

export default function PayrollSettings() {
  const [settings, setSettings] = useState<PayrollSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings/payroll');
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (values: PayrollSettingsData) => {
    try {
      await fetch('/api/admin/settings/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Rate Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label>Base Hourly Rate</label>
              <Input
                type="number"
                value={settings?.rates.regularHourlyBase}
                onChange={(e) =>
                  setSettings({
                    ...settings!,
                    rates: {
                      ...settings!.rates,
                      regularHourlyBase: parseFloat(e.target.value),
                    },
                  })
                }
              />
            </div>
            {/* Add other rate inputs */}
          </div>
        </CardContent>
      </Card>

      {/* Repeat similar cards for other settings sections */}
    </div>
  );
}
