import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface OvertimeRates {
  workdayOutsideShift: number; // For isInsideShift: false, isDayOffOvertime: false
  weekendInsideShiftFulltime: number; // For isInsideShift: true, isDayOffOvertime: true, fulltime
  weekendInsideShiftParttime: number; // For isInsideShift: true, isDayOffOvertime: true, parttime
  weekendOutsideShift: number; // For isInsideShift: false, isDayOffOvertime: true
}

interface PayrollSettingsData {
  overtimeRates: {
    fulltime: OvertimeRates;
    parttime: OvertimeRates;
    probation: OvertimeRates;
  };
  allowances: {
    transportation: number;
    meal: {
      fulltime: number;
      parttime: number;
      probation: number;
    };
    housing: number;
  };
  deductions: {
    socialSecurityRate: number;
    socialSecurityMinBase: number;
    socialSecurityMaxBase: number;
  };
  rules: {
    payrollPeriodStart: number;
    payrollPeriodEnd: number;
    overtimeMinimumMinutes: number;
    roundOvertimeTo: number;
  };
}

export default function PayrollSettings() {
  const [settings, setSettings] = useState<PayrollSettingsData>({
    overtimeRates: {
      fulltime: {
        workdayOutsideShift: 1.5,
        weekendInsideShiftFulltime: 1.0,
        weekendInsideShiftParttime: 2.0,
        weekendOutsideShift: 3.0,
      },
      parttime: {
        workdayOutsideShift: 1.5,
        weekendInsideShiftFulltime: 1.0,
        weekendInsideShiftParttime: 2.0,
        weekendOutsideShift: 3.0,
      },
      probation: {
        workdayOutsideShift: 1.5,
        weekendInsideShiftFulltime: 1.0,
        weekendInsideShiftParttime: 2.0,
        weekendOutsideShift: 3.0,
      },
    },
    allowances: {
      transportation: 0,
      meal: {
        fulltime: 0,
        parttime: 30,
        probation: 0,
      },
      housing: 0,
    },
    deductions: {
      socialSecurityRate: 0.05,
      socialSecurityMinBase: 1650,
      socialSecurityMaxBase: 15000,
    },
    rules: {
      payrollPeriodStart: 26,
      payrollPeriodEnd: 25,
      overtimeMinimumMinutes: 30,
      roundOvertimeTo: 30,
    },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/settings/payroll');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data);
      setError(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to fetch settings',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch('/api/admin/settings/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error('Failed to save settings');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to save settings',
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overtime">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overtime">Overtime Rates</TabsTrigger>
          <TabsTrigger value="allowances">Allowances</TabsTrigger>
          <TabsTrigger value="deductions">Deductions</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="overtime">
          <Card>
            <CardHeader>
              <CardTitle>Overtime Rate Settings</CardTitle>
            </CardHeader>
            <CardContent>
              {['fulltime', 'parttime', 'probation'].map((employeeType) => (
                <div key={employeeType} className="mb-6">
                  <h3 className="text-lg font-semibold capitalize mb-4">
                    {employeeType} Rates
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Workday (Outside Shift)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={
                          settings.overtimeRates[
                            employeeType as keyof typeof settings.overtimeRates
                          ].workdayOutsideShift
                        }
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            overtimeRates: {
                              ...settings.overtimeRates,
                              [employeeType]: {
                                ...settings.overtimeRates[
                                  employeeType as keyof typeof settings.overtimeRates
                                ],
                                workdayOutsideShift: parseFloat(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Weekend (Inside Shift)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={
                          settings.overtimeRates[
                            employeeType as keyof typeof settings.overtimeRates
                          ].weekendInsideShiftFulltime
                        }
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            overtimeRates: {
                              ...settings.overtimeRates,
                              [employeeType]: {
                                ...settings.overtimeRates[
                                  employeeType as keyof typeof settings.overtimeRates
                                ],
                                weekendInsideShiftFulltime: parseFloat(
                                  e.target.value,
                                ),
                              },
                            },
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Weekend (Outside Shift)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={
                          settings.overtimeRates[
                            employeeType as keyof typeof settings.overtimeRates
                          ].weekendOutsideShift
                        }
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            overtimeRates: {
                              ...settings.overtimeRates,
                              [employeeType]: {
                                ...settings.overtimeRates[
                                  employeeType as keyof typeof settings.overtimeRates
                                ],
                                weekendOutsideShift: parseFloat(e.target.value),
                              },
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allowances">
          <Card>
            <CardHeader>
              <CardTitle>Allowance Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <Label>Transportation Allowance</Label>
                  <Input
                    type="number"
                    value={settings.allowances.transportation}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        allowances: {
                          ...settings.allowances,
                          transportation: parseFloat(e.target.value),
                        },
                      })
                    }
                  />
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Meal Allowance</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {['fulltime', 'parttime', 'probation'].map((type) => (
                      <div key={type}>
                        <Label className="capitalize">{type}</Label>
                        <Input
                          type="number"
                          value={
                            settings.allowances.meal[
                              type as keyof typeof settings.allowances.meal
                            ]
                          }
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              allowances: {
                                ...settings.allowances,
                                meal: {
                                  ...settings.allowances.meal,
                                  [type]: parseFloat(e.target.value),
                                },
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Housing Allowance</Label>
                  <Input
                    type="number"
                    value={settings.allowances.housing}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        allowances: {
                          ...settings.allowances,
                          housing: parseFloat(e.target.value),
                        },
                      })
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
              <CardTitle>Deduction Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Social Security Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={settings.deductions.socialSecurityRate * 100}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        deductions: {
                          ...settings.deductions,
                          socialSecurityRate: parseFloat(e.target.value) / 100,
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Social Security Minimum Base</Label>
                  <Input
                    type="number"
                    value={settings.deductions.socialSecurityMinBase}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        deductions: {
                          ...settings.deductions,
                          socialSecurityMinBase: parseFloat(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Social Security Maximum Base</Label>
                  <Input
                    type="number"
                    value={settings.deductions.socialSecurityMaxBase}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        deductions: {
                          ...settings.deductions,
                          socialSecurityMaxBase: parseFloat(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>Payroll Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Period Start Day</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={settings.rules.payrollPeriodStart}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          rules: {
                            ...settings.rules,
                            payrollPeriodStart: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Period End Day</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={settings.rules.payrollPeriodEnd}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          rules: {
                            ...settings.rules,
                            payrollPeriodEnd: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Minimum Overtime Minutes</Label>
                    <Input
                      type="number"
                      value={settings.rules.overtimeMinimumMinutes}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          rules: {
                            ...settings.rules,
                            overtimeMinimumMinutes: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Round Overtime To (minutes)</Label>
                    <Input
                      type="number"
                      value={settings.rules.roundOvertimeTo}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          rules: {
                            ...settings.rules,
                            roundOvertimeTo: parseInt(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Settings</Button>
      </div>
    </div>
  );
}