import React, { useState, useEffect } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  CalendarDays,
  Users,
  Clock,
  AlertCircle,
  Search,
  Loader2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';

interface Department {
  id: string;
  name: string;
}

interface Shift {
  id: string;
  name: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

interface ShiftAdjustment {
  id: string;
  employeeId: string;
  user: {
    name: string;
    departmentName: string;
  };
  requestedShift: Shift;
  date: string;
  reason: string;
  status: 'approved' | 'pending' | 'rejected';
}

export default function ShiftAdjustmentDashboard() {
  const { user } = useAdmin();
  const { toast } = useToast();
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [adjustments, setAdjustments] = useState<ShiftAdjustment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [targetType, setTargetType] = useState<'department' | 'individual'>(
    'department',
  );
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user?.lineUserId) {
      fetchInitialData();
    }
  }, [user]);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [shiftsResponse, departmentsResponse, adjustmentsResponse] =
        await Promise.all([
          fetch('/api/shifts/shifts', {
            headers: { 'x-line-userid': user?.lineUserId || '' },
          }),
          fetch('/api/departments', {
            headers: { 'x-line-userid': user?.lineUserId || '' },
          }),
          fetch('/api/admin/shifts/adjustments', {
            headers: { 'x-line-userid': user?.lineUserId || '' },
          }),
        ]);

      const shiftsData = await shiftsResponse.json();
      const departmentsData = await departmentsResponse.json();
      const adjustmentsData = await adjustmentsResponse.json();

      setShifts(shiftsData);
      setDepartments(departmentsData);
      setAdjustments(adjustmentsData);
    } catch (error) {
      setError('Failed to load initial data');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/shifts/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          action: 'create',
          adjustments: {
            targetType,
            adjustments:
              targetType === 'department'
                ? selectedDepartments.map((deptId) => ({
                    department: deptId,
                    shiftId: selectedShift,
                  }))
                : [{ employeeId: searchTerm, shiftId: selectedShift }],
            date: selectedDate.toISOString(),
            reason,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit adjustment');
      }

      toast({
        title: 'Success',
        description: 'Shift adjustment created successfully',
      });

      await fetchInitialData();
      setShowAdjustmentDialog(false);
      resetForm();
    } catch (error) {
      setError('Failed to submit shift adjustment');
      console.error('Error:', error);

      toast({
        title: 'Error',
        description: 'Failed to create shift adjustment',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/shifts/adjustments?id=${id}`, {
        method: 'DELETE',
        headers: {
          'x-line-userid': user?.lineUserId || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete adjustment');
      }

      toast({
        title: 'Success',
        description: 'Shift adjustment deleted successfully',
      });

      await fetchInitialData();
    } catch (error) {
      setError('Failed to delete shift adjustment');
      console.error('Error:', error);

      toast({
        title: 'Error',
        description: 'Failed to delete shift adjustment',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTargetType('department');
    setSelectedDepartments([]);
    setSelectedShift('');
    setSelectedDate(new Date());
    setReason('');
  };

  const AdjustmentCard = ({ adjustment }: { adjustment: ShiftAdjustment }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{adjustment.user.name}</div>
            <div className="text-sm text-gray-500">
              {adjustment.user.departmentName}
            </div>
          </div>
          <StatusBadge status={adjustment.status} />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center text-sm">
            <CalendarDays className="h-4 w-4 mr-2" />
            <span>
              {format(new Date(adjustment.date), 'dd MMM yyyy', { locale: th })}
            </span>
          </div>
          <div className="flex items-center text-sm">
            <Clock className="h-4 w-4 mr-2" />
            <span>
              {adjustment.requestedShift.startTime} -{' '}
              {adjustment.requestedShift.endTime}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm text-gray-500">Reason:</div>
          <p className="text-sm mt-1">{adjustment.reason}</p>
        </div>

        <div className="mt-4 flex justify-end space-x-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleDelete(adjustment.id)}
            disabled={isLoading}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Filter section component
  const FilterSection = () => (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Select
          value={targetType}
          onValueChange={(value) =>
            setTargetType(value as 'department' | 'individual')
          }
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Adjustment Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="department">Department</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
    </div>
  );

  // Desktop table component
  const DesktopTable = () => (
    <div className="hidden md:block overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee/Department</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Shift</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adjustments
            .filter((adjustment) =>
              searchTerm
                ? adjustment.user.name
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase()) ||
                  adjustment.user.departmentName
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase())
                : true,
            )
            .map((adjustment) => (
              <TableRow key={adjustment.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{adjustment.user.name}</div>
                    <div className="text-sm text-gray-500">
                      {adjustment.user.departmentName}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {format(new Date(adjustment.date), 'dd MMM yyyy', {
                    locale: th,
                  })}
                </TableCell>
                <TableCell>
                  <div>
                    <div>{adjustment.requestedShift.name}</div>
                    <div className="text-sm text-gray-500">
                      {adjustment.requestedShift.startTime} -{' '}
                      {adjustment.requestedShift.endTime}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={adjustment.status} />
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {adjustment.reason}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(adjustment.id)}
                    disabled={isLoading}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <CardTitle>Shift Adjustments</CardTitle>
          <Button onClick={() => setShowAdjustmentDialog(true)}>
            New Adjustment
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

        <FilterSection />

        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="md:hidden">
              {adjustments
                .filter((adjustment) =>
                  searchTerm
                    ? adjustment.user.name
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                      adjustment.user.departmentName
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase())
                    : true,
                )
                .map((adjustment) => (
                  <AdjustmentCard key={adjustment.id} adjustment={adjustment} />
                ))}
            </div>

            {/* Desktop View */}
            <DesktopTable />

            {adjustments.length === 0 && !isLoading && (
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No adjustments
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating a new shift adjustment
                </p>
              </div>
            )}
          </>
        )}

        {/* New Adjustment Dialog */}
        <Dialog
          open={showAdjustmentDialog}
          onOpenChange={setShowAdjustmentDialog}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Shift Adjustment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Target Type</Label>
                <Select
                  value={targetType}
                  onValueChange={(value: 'department' | 'individual') =>
                    setTargetType(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select target type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {targetType === 'department' ? (
                <div>
                  <Label>Departments</Label>
                  <Select
                    value={selectedDepartments[0]}
                    onValueChange={(value) => setSelectedDepartments([value])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select departments" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Employee ID</Label>
                  <Input
                    placeholder="Enter employee ID"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label>New Shift</Label>
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {shifts.map((shift) => (
                      <SelectItem key={shift.id} value={shift.id}>
                        {shift.name} ({shift.startTime} - {shift.endTime})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  disabled={(date) => date < new Date()}
                  className="rounded-md border"
                />
              </div>

              <div>
                <Label>Reason</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter reason for shift adjustment"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAdjustmentDialog(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !selectedShift || !reason}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Adjustment'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

const StatusBadge = ({ status }: { status: string }) => {
  const styles = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return (
    <Badge className={styles[status as keyof typeof styles]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
};
