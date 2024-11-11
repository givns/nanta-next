import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Download, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';

interface LeaveBalance {
  employeeId: string;
  employeeName: string;
  department: string;
  sickLeave: {
    total: number;
    used: number;
    remaining: number;
  };
  annualLeave: {
    total: number;
    used: number;
    remaining: number;
  };
  businessLeave: {
    total: number;
    used: number;
    remaining: number;
  };
}

export default function LeaveBalances() {
  const {
    user,
    isLoading: authLoading,
    isAuthorized,
  } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  const { lineUserId } = useLiff();

  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<LeaveBalance | null>(
    null,
  );

  useEffect(() => {
    if (user?.lineUserId) {
      fetchLeaveBalances();
    }
  }, [user, departmentFilter]);

  const fetchLeaveBalances = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/leaves/leave-balances', {
        headers: {
          'x-line-userid': lineUserId || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch leave balances');
      const data = await response.json();
      setLeaveBalances(data);
    } catch (error) {
      setError('Failed to load leave balances');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Mobile card component
  const BalanceCard = ({ balance }: { balance: LeaveBalance }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div>
          <div className="font-medium">{balance.employeeName}</div>
          <div className="text-sm text-gray-500">{balance.department}</div>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-sm text-gray-500">Sick Leave</div>
              <div className="font-medium">
                {balance.sickLeave.remaining}/{balance.sickLeave.total}
              </div>
              <div className="text-xs text-gray-500">
                Used: {balance.sickLeave.used}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Annual</div>
              <div className="font-medium">
                {balance.annualLeave.remaining}/{balance.annualLeave.total}
              </div>
              <div className="text-xs text-gray-500">
                Used: {balance.annualLeave.used}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Business</div>
              <div className="font-medium">
                {balance.businessLeave.remaining}/{balance.businessLeave.total}
              </div>
              <div className="text-xs text-gray-500">
                Used: {balance.businessLeave.used}
              </div>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full mt-4"
          onClick={() => {
            setSelectedEmployee(balance);
            setShowAdjustDialog(true);
          }}
        >
          Adjust Balance
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Leave Balances</CardTitle>
          <Button variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <Select
              value={departmentFilter}
              onValueChange={setDepartmentFilter}
            >
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {/* Add department options */}
              </SelectContent>
            </Select>

            <div className="flex-1">
              <Input
                placeholder="Search employee..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Mobile View */}
        <div className="md:hidden">
          {leaveBalances.map((balance) => (
            <BalanceCard key={balance.employeeId} balance={balance} />
          ))}
        </div>

        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Sick Leave</TableHead>
                <TableHead>Annual Leave</TableHead>
                <TableHead>Business Leave</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveBalances.map((balance) => (
                <TableRow key={balance.employeeId}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{balance.employeeName}</div>
                      <div className="text-sm text-gray-500">
                        {balance.department}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-center">
                      <div className="font-medium">
                        {balance.sickLeave.remaining}/{30}
                      </div>
                      <div className="text-sm text-gray-500">
                        Used: {balance.sickLeave.used}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-center">
                      <div className="font-medium">
                        {balance.annualLeave.remaining}/
                        {balance.annualLeave.total}
                      </div>
                      <div className="text-sm text-gray-500">
                        Used: {balance.annualLeave.used}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-center">
                      <div className="font-medium">
                        {balance.businessLeave.remaining}/{3}
                      </div>
                      <div className="text-sm text-gray-500">
                        Used: {balance.businessLeave.used}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedEmployee(balance);
                        setShowAdjustDialog(true);
                      }}
                    >
                      Adjust Balance
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Adjust Balance Dialog */}
        <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adjust Leave Balance</DialogTitle>
            </DialogHeader>
            {selectedEmployee && (
              <div className="space-y-4">
                <div>
                  <div className="font-medium">
                    {selectedEmployee.employeeName}
                  </div>
                  <div className="text-sm text-gray-500">
                    {selectedEmployee.department}
                  </div>
                </div>

                {/* Add balance adjustment form fields */}
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowAdjustDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button>Save Changes</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
