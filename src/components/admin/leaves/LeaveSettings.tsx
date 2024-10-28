// components/admin/leaves/LeaveSettings.tsx

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';

interface LeaveSettings {
  annualLeaveDefault: number;
  sickLeaveDefault: number;
  businessLeaveDefault: number;
  minServiceForAnnualLeave: number;
  maxConsecutiveSickDays: number;
  requireMedicalCertificate: boolean;
  medicalCertificateThreshold: number;
  allowHalfDayLeave: boolean;
  maxAdvanceBookingDays: number;
  minAdvanceNotice: number;
  allowLeaveCarryOver: boolean;
  maxCarryOverDays: number;
  carryOverExpiryMonths: number;
  requireManagerApproval: boolean;
  autoApproveEmergency: boolean;
}

export default function LeaveSettings() {
  const [settings, setSettings] = useState<LeaveSettings>({
    annualLeaveDefault: 12,
    sickLeaveDefault: 30,
    businessLeaveDefault: 3,
    minServiceForAnnualLeave: 3,
    maxConsecutiveSickDays: 3,
    requireMedicalCertificate: true,
    medicalCertificateThreshold: 3,
    allowHalfDayLeave: true,
    maxAdvanceBookingDays: 90,
    minAdvanceNotice: 3,
    allowLeaveCarryOver: true,
    maxCarryOverDays: 5,
    carryOverExpiryMonths: 3,
    requireManagerApproval: true,
    autoApproveEmergency: false,
  });

  const { toast } = useToast();

  const handleSubmit = async () => {
    try {
      const response = await fetch('/api/admin/leave-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      // components/admin/leaves/LeaveSettings.tsx (continued)

      if (!response.ok) throw new Error('Failed to save settings');

      toast({
        title: 'Success',
        description: 'Leave settings updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Default Leave Allocations */}
      <Card>
        <CardHeader>
          <CardTitle>Default Leave Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Annual Leave Days</Label>
              <Input
                type="number"
                value={settings.annualLeaveDefault}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    annualLeaveDefault: parseInt(e.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Sick Leave Days</Label>
              <Input
                type="number"
                value={settings.sickLeaveDefault}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sickLeaveDefault: parseInt(e.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Business Leave Days</Label>
              <Input
                type="number"
                value={settings.businessLeaveDefault}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    businessLeaveDefault: parseInt(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Policies */}
      <Card>
        <CardHeader>
          <CardTitle>Leave Policies</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Minimum Service Period for Annual Leave (months)</Label>
                <Input
                  type="number"
                  value={settings.minServiceForAnnualLeave}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minServiceForAnnualLeave: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Maximum Consecutive Sick Days</Label>
                <Input
                  type="number"
                  value={settings.maxConsecutiveSickDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxConsecutiveSickDays: parseInt(e.target.value),
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Require Medical Certificate</Label>
                  <p className="text-sm text-gray-500">
                    Require medical certificate for extended sick leave
                  </p>
                </div>
                <Switch
                  checked={settings.requireMedicalCertificate}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      requireMedicalCertificate: checked,
                    })
                  }
                />
              </div>

              {settings.requireMedicalCertificate && (
                <div className="space-y-2">
                  <Label>Days Before Medical Certificate Required</Label>
                  <Input
                    type="number"
                    value={settings.medicalCertificateThreshold}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        medicalCertificateThreshold: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Booking Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Booking Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Allow Half-Day Leave</Label>
                <p className="text-sm text-gray-500">
                  Enable half-day leave requests
                </p>
              </div>
              <Switch
                checked={settings.allowHalfDayLeave}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    allowHalfDayLeave: checked,
                  })
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Maximum Advance Booking Days</Label>
                <Input
                  type="number"
                  value={settings.maxAdvanceBookingDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxAdvanceBookingDays: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Advance Notice Days</Label>
                <Input
                  type="number"
                  value={settings.minAdvanceNotice}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minAdvanceNotice: parseInt(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Carry Over */}
      <Card>
        <CardHeader>
          <CardTitle>Leave Carry Over</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Allow Leave Carry Over</Label>
                <p className="text-sm text-gray-500">
                  Enable carrying over unused leave to next year
                </p>
              </div>
              <Switch
                checked={settings.allowLeaveCarryOver}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    allowLeaveCarryOver: checked,
                  })
                }
              />
            </div>

            {settings.allowLeaveCarryOver && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Maximum Carry Over Days</Label>
                  <Input
                    type="number"
                    value={settings.maxCarryOverDays}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        maxCarryOverDays: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Carry Over Expiry Period (months)</Label>
                  <Input
                    type="number"
                    value={settings.carryOverExpiryMonths}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        carryOverExpiryMonths: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Approval Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Approval Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Require Manager Approval</Label>
                <p className="text-sm text-gray-500">
                  All leave requests must be approved by a manager
                </p>
              </div>
              <Switch
                checked={settings.requireManagerApproval}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    requireManagerApproval: checked,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-approve Emergency Leave</Label>
                <p className="text-sm text-gray-500">
                  Automatically approve emergency leave requests
                </p>
              </div>
              <Switch
                checked={settings.autoApproveEmergency}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    autoApproveEmergency: checked,
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end space-x-4">
        <Button
          variant="outline"
          onClick={() =>
            setSettings({
              annualLeaveDefault: 12,
              sickLeaveDefault: 30,
              businessLeaveDefault: 3,
              minServiceForAnnualLeave: 3,
              maxConsecutiveSickDays: 3,
              requireMedicalCertificate: true,
              medicalCertificateThreshold: 3,
              allowHalfDayLeave: true,
              maxAdvanceBookingDays: 90,
              minAdvanceNotice: 3,
              allowLeaveCarryOver: true,
              maxCarryOverDays: 5,
              carryOverExpiryMonths: 3,
              requireManagerApproval: true,
              autoApproveEmergency: false,
            })
          }
        >
          Reset to Defaults
        </Button>
        <Button onClick={handleSubmit}>Save Changes</Button>
      </div>
    </div>
  );
}
