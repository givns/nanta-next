import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, CalendarDays, Users, Settings2 } from 'lucide-react';

export default function OvertimeSettings() {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Regular Rate
                </p>
                <p className="text-2xl font-bold mt-1">1.5x</p>
                <p className="text-sm text-gray-500 mt-1">
                  Basic overtime rate
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Holiday Rate
                </p>
                <p className="text-2xl font-bold mt-1">2.0x</p>
                <p className="text-sm text-gray-500 mt-1">
                  Holiday overtime rate
                </p>
              </div>
              <CalendarDays className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Eligible Staff
                </p>
                <p className="text-2xl font-bold mt-1">245</p>
                <p className="text-sm text-gray-500 mt-1">
                  Can request overtime
                </p>
              </div>
              <Users className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rate Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Overtime Rates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label>Regular Overtime Rate (×)</Label>
                <Input type="number" defaultValue="1.5" step="0.1" />
                <p className="text-sm text-gray-500 mt-1">
                  Applied to overtime hours on regular workdays
                </p>
              </div>
              <div>
                <Label>Holiday Rate (×)</Label>
                <Input type="number" defaultValue="2.0" step="0.1" />
                <p className="text-sm text-gray-500 mt-1">
                  Applied to overtime hours on holidays
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Special Holiday Rate (×)</Label>
                <Input type="number" defaultValue="3.0" step="0.1" />
                <p className="text-sm text-gray-500 mt-1">
                  Applied on special holidays and events
                </p>
              </div>
              <div>
                <Label>Night Shift Premium (×)</Label>
                <Input type="number" defaultValue="0.2" step="0.1" />
                <p className="text-sm text-gray-500 mt-1">
                  Additional rate for night shift overtime
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Limits and Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Overtime Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Maximum Hours Per Day</Label>
                <Input type="number" defaultValue="4" />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum overtime hours allowed per day
                </p>
              </div>
              <div>
                <Label>Maximum Hours Per Week</Label>
                <Input type="number" defaultValue="20" />
                <p className="text-sm text-gray-500 mt-1">
                  Maximum overtime hours allowed per week
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Require Manager Approval</Label>
                  <p className="text-sm text-gray-500">
                    All overtime requests must be approved by a manager
                  </p>
                </div>
                <Switch />
              </div>

              <div>
                <Label>Auto-approval Limit (hours)</Label>
                <Input type="number" defaultValue="2" />
                <p className="text-sm text-gray-500 mt-1">
                  Requests below this limit will be auto-approved
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Department Restrictions */}
      <Card>
        <CardHeader>
          <CardTitle>Department Restrictions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Restricted Departments</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select departments" />
                </SelectTrigger>
                <SelectContent>{/* Add department options */}</SelectContent>
              </Select>
              <p className="text-sm text-gray-500 mt-1">
                Selected departments require additional approval
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Weekend Overtime</Label>
                <p className="text-sm text-gray-500">
                  Allow overtime on weekends
                </p>
              </div>
              <Switch />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Holiday Overtime</Label>
                <p className="text-sm text-gray-500">
                  Allow overtime on holidays
                </p>
              </div>
              <Switch />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline">Reset to Defaults</Button>
        <Button>Save Changes</Button>
      </div>
    </div>
  );
}
