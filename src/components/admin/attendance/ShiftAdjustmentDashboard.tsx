import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateSelector } from './components/DateSelector';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, Search, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import { useLiff } from '@/contexts/LiffContext';

type AdjustmentType = 'individual' | 'department';

interface Department {
  id: string;
  name: string;
}

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

interface ShiftAdjustment {
  id: string;
  employeeId: string;
  employeeName: string | null; // Make nullable
  departmentId: string;
  departmentName: string | null; // Make nullable
  date: string;
  newShift: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
  } | null; // Make nullable
  status: 'pending' | 'approved' | 'rejected';
}

interface AdjustmentFormData {
  type: AdjustmentType;
  targetId: string; // either employeeId or departmentId
  shiftId: string;
  date: Date;
  reason?: string;
}

export default function ShiftManagementDashboard() {
  const { lineUserId } = useLiff();
  const [isLoading, setIsLoading] = useState(true); // Start with loading true
  const [activeTab, setActiveTab] = useState('adjustments');
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [adjustmentType, setAdjustmentType] =
    useState<AdjustmentType>('individual');

  // Typed state for data
  const [adjustments, setAdjustments] = useState<ShiftAdjustment[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const { toast } = useToast();

  const fetchInitialData = async () => {
    if (!lineUserId) {
      setError('Authentication required');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const headers = {
        'x-line-userid': lineUserId,
        'Content-Type': 'application/json',
      };

      const [shiftsRes, deptsRes, adjustmentsRes] = await Promise.all([
        fetch('/api/shifts/shifts', { headers }),
        fetch('/api/departments', { headers }),
        fetch('/api/admin/shifts/adjustments', { headers }),
      ]);

      // Handle individual response errors
      if (!shiftsRes.ok) throw new Error('Failed to fetch shifts');
      if (!deptsRes.ok) throw new Error('Failed to fetch departments');
      if (!adjustmentsRes.ok) throw new Error('Failed to fetch adjustments');

      const [shiftsData, deptsData, adjustmentsData] = await Promise.all([
        shiftsRes.json(),
        deptsRes.json(),
        adjustmentsRes.json(),
      ]);

      // Validate response data
      if (!Array.isArray(shiftsData)) throw new Error('Invalid shifts data');
      if (!Array.isArray(deptsData))
        throw new Error('Invalid departments data');
      if (!Array.isArray(adjustmentsData))
        throw new Error('Invalid adjustments data');

      setShifts(shiftsData);
      setDepartments(deptsData);
      setAdjustments(adjustmentsData);
      setError(null);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [lineUserId]);

  const handleSubmitAdjustment = async (formData: AdjustmentFormData) => {
    if (!lineUserId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Authentication required',
      });
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/shifts/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to create adjustment');

      toast({
        title: 'Success',
        description: 'Shift adjustment created successfully',
      });

      setShowDialog(false);
      fetchInitialData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter adjustments with null safety
  const filteredAdjustments = adjustments.filter((adj) => {
    const matchesSearch =
      searchTerm === '' ||
      (adj.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ??
        false);
    const matchesDepartment =
      selectedDepartment === 'all' || adj.departmentId === selectedDepartment;
    return matchesSearch && matchesDepartment;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Shift Management</CardTitle>
            <Button onClick={() => setShowDialog(true)}>New Adjustment</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="adjustments">
                Individual Adjustments
              </TabsTrigger>
              <TabsTrigger value="bulk">Bulk Assignment</TabsTrigger>
            </TabsList>

            <TabsContent value="adjustments">
              <div className="space-y-4">
                {/* Search and Filter Controls */}
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search employee..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select
                    value={selectedDepartment}
                    onValueChange={setSelectedDepartment}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Adjustments Table */}
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : error ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : filteredAdjustments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No adjustments found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>New Shift</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAdjustments.map((adjustment) => (
                        <TableRow key={adjustment.id}>
                          <TableCell>
                            {adjustment.employeeName || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {adjustment.departmentName || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {format(new Date(adjustment.date), 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell>
                            {adjustment.newShift ? (
                              <>
                                {adjustment.newShift.name}
                                <div className="text-sm text-gray-500">
                                  {adjustment.newShift.startTime} -{' '}
                                  {adjustment.newShift.endTime}
                                </div>
                              </>
                            ) : (
                              'N/A'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                adjustment.status === 'approved'
                                  ? 'success'
                                  : 'default'
                              }
                            >
                              {adjustment.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>

            <TabsContent value="bulk">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Department</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
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
                  <div>
                    <Label>New Shift</Label>
                    <Select>
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
                </div>
                <div>
                  <Label>Effective Date</Label>
                  <DateSelector
                    date={selectedDate}
                    onChange={(date) => setSelectedDate(date || new Date())}
                    disableFutureDates={false}
                  />
                </div>
                <Button className="w-full">Apply Bulk Assignment</Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* New Adjustment Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Shift Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Adjustment Type</Label>
              <Select
                value={adjustmentType}
                onValueChange={(value: AdjustmentType) =>
                  setAdjustmentType(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {adjustmentType === 'individual' ? (
              <div>
                <Label>Employee ID</Label>
                <Input placeholder="Enter employee ID" />
              </div>
            ) : (
              <div>
                <Label>Department</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
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
            )}

            <div>
              <Label>New Shift</Label>
              <Select>
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
              <Label>Effective Date</Label>
              <DateSelector
                date={selectedDate}
                onChange={(date) => setSelectedDate(date || new Date())}
                disableFutureDates={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                handleSubmitAdjustment({
                  type: adjustmentType,
                  date: selectedDate,
                  targetId: '',
                  shiftId: '',
                })
              }
            >
              Create Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
