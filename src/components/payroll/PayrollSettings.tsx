// components/payroll/PayrollSettings.tsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import type { PayrollSettings as PayrollSettingsType } from '@/types/payroll/payroll';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function PayrollSettings() {
  const [settings, setSettings] = useState<PayrollSettingsType>({
    regularHourlyRate: 0,
    overtimeRates: {
      regular: 1.5,
      holiday: 2.0,
    },
    allowances: {
      transportation: 0,
      meal: 0,
      housing: 0,
    },
    deductions: {
      socialSecurity: 0.05,
      tax: 0,
    },
    workingHours: {
      regularHoursPerDay: 8,
      regularDaysPerWeek: 6,
    },
    leaveSettings: {
      sickLeavePerYear: 30,
      annualLeavePerYear: 6,
      businessLeavePerYear: 3,
    },
    employeeType: '', // Add the missing employeeType property here
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'success' | 'error' | null>(
    null,
  );

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/payroll/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const response = await fetch('/api/payroll/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setSaveStatus('success');
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="rates">
        <TabsList>
          <TabsTrigger value="rates">Rates & Hours</TabsTrigger>
          <TabsTrigger value="allowances">Allowances</TabsTrigger>
          <TabsTrigger value="deductions">Deductions</TabsTrigger>
          <TabsTrigger value="leave">Leave Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="rates">
          <Card>
            <CardHeader>
              <CardTitle>Rates & Working Hours</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="regularHourlyRate">Regular Hourly Rate</Label>
                  <Input
                    id="regularHourlyRate"
                    type="number"
                    value={settings.regularHourlyRate}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        regularHourlyRate: parseFloat(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overtimeRate">
                    Overtime Rate (multiplier)
                  </Label>
                  <Input
                    id="overtimeRate"
                    type="number"
                    value={settings.overtimeRates.regular}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        overtimeRates: {
                          ...prev.overtimeRates,
                          regular: parseFloat(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="holidayRate">Holiday Rate (multiplier)</Label>
                  <Input
                    id="holidayRate"
                    type="number"
                    value={settings.overtimeRates.holiday}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        overtimeRates: {
                          ...prev.overtimeRates,
                          holiday: parseFloat(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hoursPerDay">Regular Hours Per Day</Label>
                  <Input
                    id="hoursPerDay"
                    type="number"
                    value={settings.workingHours.regularHoursPerDay}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        workingHours: {
                          ...prev.workingHours,
                          regularHoursPerDay: parseInt(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allowances">
          <Card>
            <CardHeader>
              <CardTitle>Allowances</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="transportation">
                    Transportation Allowance
                  </Label>
                  <Input
                    id="transportation"
                    type="number"
                    value={settings.allowances.transportation}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        allowances: {
                          ...prev.allowances,
                          transportation: parseFloat(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="meal">Meal Allowance</Label>
                  <Input
                    id="meal"
                    type="number"
                    value={settings.allowances.meal}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        allowances: {
                          ...prev.allowances,
                          meal: parseFloat(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="housing">Housing Allowance</Label>
                  <Input
                    id="housing"
                    type="number"
                    value={settings.allowances.housing}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        allowances: {
                          ...prev.allowances,
                          housing: parseFloat(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deductions">
          <Card>
            <CardHeader>
              <CardTitle>Deductions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="socialSecurity">
                    Social Security Rate (%)
                  </Label>
                  <Input
                    id="socialSecurity"
                    type="number"
                    value={settings.deductions.socialSecurity * 100}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        deductions: {
                          ...prev.deductions,
                          socialSecurity: parseFloat(e.target.value) / 100,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <Card>
            <CardHeader>
              <CardTitle>Leave Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sickLeave">Sick Leave Days Per Year</Label>
                  <Input
                    id="sickLeave"
                    type="number"
                    value={settings.leaveSettings.sickLeavePerYear}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        leaveSettings: {
                          ...prev.leaveSettings,
                          sickLeavePerYear: parseInt(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annualLeave">
                    Annual Leave Days Per Year
                  </Label>
                  <Input
                    id="annualLeave"
                    type="number"
                    value={settings.leaveSettings.annualLeavePerYear}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        leaveSettings: {
                          ...prev.leaveSettings,
                          annualLeavePerYear: parseInt(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessLeave">
                    Business Leave Days Per Year
                  </Label>
                  <Input
                    id="businessLeave"
                    type="number"
                    value={settings.leaveSettings.businessLeavePerYear}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        leaveSettings: {
                          ...prev.leaveSettings,
                          businessLeavePerYear: parseInt(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end space-x-4">
        <Button onClick={saveSettings} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      {saveStatus === 'success' && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>Settings saved successfully</AlertDescription>
        </Alert>
      )}

      {saveStatus === 'error' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Failed to save settings</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
