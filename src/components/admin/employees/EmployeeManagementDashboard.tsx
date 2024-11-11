// components/admin/EmployeeManagementDashboard.tsx
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import {
  UserPlus,
  Users,
  Building2,
  Calendar,
  AlertCircle,
  History,
  Clock,
  FileSpreadsheet,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { EmployeeCard } from '../employees/EmployeeCard';
import { EmployeeFilters } from '../employees/EmployeeFilters';
import { EmployeeForm } from '../employees/EmployeeForm';
import { BulkActions } from '../employees/BulkActions';
import type { Employee, EmployeeFormData } from '@/types/employee';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { th } from 'date-fns/locale/th';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';

interface BulkActionsProps {
  selectedEmployees: Employee[];
  onBulkUpdate: (action: string, value: any) => Promise<void>;
  departments: Department[];
  shifts: { code: string; name: string }[];
}

interface Department {
  id: string;
  name: string;
}

interface Shift {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

export default function EmployeeManagement() {
  const {
    user,
    isLoading: authLoading,
    isAuthorized,
  } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });
  const { lineUserId } = useLiff();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]); // Add this
  const [shifts, setShifts] = useState<Shift[]>([]); // Add this
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  // Filters
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Remove the old fetchEmployees function and replace with this:
  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [employeesResponse, shiftsResponse, departmentsResponse] =
        await Promise.all([
          fetch('/api/admin/employees', {
            headers: { 'x-line-userid': lineUserId || '' },
          }),
          fetch('/api/shifts/shifts', {
            headers: { 'x-line-userid': lineUserId || '' },
          }),
          fetch('/api/departments', {
            headers: { 'x-line-userid': lineUserId || '' },
          }),
        ]);

      if (
        !employeesResponse.ok ||
        !shiftsResponse.ok ||
        !departmentsResponse.ok
      ) {
        throw new Error('Failed to fetch data');
      }

      const [employeesData, shiftsData, departmentsData] = await Promise.all([
        employeesResponse.json(),
        shiftsResponse.json(),
        departmentsResponse.json(),
      ]);

      setEmployees(employeesData);
      setShifts(shiftsData);
      setDepartments(departmentsData);
    } catch (error) {
      setError('Failed to load initial data');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update the useEffect to use fetchInitialData
  useEffect(() => {
    if (lineUserId) {
      fetchInitialData();
    }
  }, [user]);

  const handleSubmit = async (data: EmployeeFormData) => {
    try {
      const endpoint = selectedEmployee
        ? `/api/admin/employees/${selectedEmployee.id}`
        : '/api/admin/employees';

      const response = await fetch(endpoint, {
        method: selectedEmployee ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId || '',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to save employee');
      }

      await fetchInitialData(); // Change this line from fetchEmployees to fetchInitialData
      setShowForm(false);
      setSelectedEmployee(null);

      toast({
        title: `Employee ${selectedEmployee ? 'Updated' : 'Added'}`,
        description: `Successfully ${selectedEmployee ? 'updated' : 'added'} ${data.name}`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to save employee',
      });
    }
  };

  const handleViewHistory = (employeeId: string) => {
    // Implement view history logic
    console.log('View history for employee:', employeeId);
  };

  const handleDelete = async (employeeId: string) => {
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}`, {
        method: 'DELETE',
        headers: {
          'x-line-userid': lineUserId || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete employee');
      }

      await fetchInitialData();
      toast({
        title: 'Employee Deleted',
        description: 'Successfully deleted employee',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to delete employee',
      });
    }
  };

  const handleBulkUpdate = async (action: string, value: any) => {
    try {
      const response = await fetch('/api/admin/employees/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId || '',
        },
        body: JSON.stringify({
          employeeIds: selectedEmployees,
          action,
          value,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to perform bulk update');
      }

      await fetchInitialData();
      setSelectedEmployees([]);

      toast({
        title: 'Bulk Update Successful',
        description: `Successfully updated ${selectedEmployees.length} employees`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to perform bulk update',
      });
    }
  };

  const filteredEmployees = employees.filter((employee) => {
    const matchesDepartment =
      departmentFilter === 'all' ||
      employee.departmentName === departmentFilter;
    const matchesType =
      employeeTypeFilter === 'all' ||
      employee.employeeType === employeeTypeFilter;
    const matchesSearch =
      !searchTerm ||
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.employeeId.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesDepartment && matchesType && matchesSearch;
  });

  const summaryStats = {
    total: employees.length,
    fulltime: employees.filter((e) => e.employeeType === 'Fulltime').length,
    parttime: employees.filter((e) => e.employeeType === 'Parttime').length,
    probation: employees.filter((e) => e.employeeType === 'Probation').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Employee Management</h1>
          <p className="text-gray-500">
            Manage your organization&#39;s employees
          </p>{' '}
        </div>
        <Button
          onClick={() => {
            setSelectedEmployee(null);
            setShowForm(true);
          }}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add Employee
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Total Employees</p>
                <p className="text-2xl font-bold">{summaryStats.total}</p>
              </div>
              <Users className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Full Time</p>
                <p className="text-2xl font-bold">{summaryStats.fulltime}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Part Time</p>
                <p className="text-2xl font-bold">{summaryStats.parttime}</p>
              </div>
              <Clock className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Probation</p>
                <p className="text-2xl font-bold">{summaryStats.probation}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardContent className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold">Employees</h2>
            <div className="flex gap-4">
              {selectedEmployees.length > 0 && (
                <BulkActions
                  selectedEmployees={employees.filter((e) =>
                    selectedEmployees.includes(e.id),
                  )}
                  onBulkUpdate={handleBulkUpdate}
                  departments={departments.map((department) => department.name)}
                  shifts={shifts}
                />
              )}
              <Button variant="outline">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Export All
              </Button>
            </div>
          </div>

          <EmployeeFilters
            departmentFilter={departmentFilter}
            setDepartmentFilter={setDepartmentFilter}
            employeeTypeFilter={employeeTypeFilter}
            setEmployeeTypeFilter={setEmployeeTypeFilter}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            departments={departments.map((department) => department.name)} // Pass the fetched department names
          />
        </CardContent>
      </Card>

      {/* Employee List */}
      {isLoading ? (
        <EmployeeListSkeleton />
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Mobile View */}
          <div className="md:hidden">
            {filteredEmployees.map((employee) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                onEdit={(employee) => {
                  setSelectedEmployee(employee);
                  setShowForm(true);
                }}
              />
            ))}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]">
                        <Checkbox
                          checked={
                            selectedEmployees.length ===
                            filteredEmployees.length
                          }
                          onCheckedChange={(checked) => {
                            setSelectedEmployees(
                              checked ? filteredEmployees.map((e) => e.id) : [],
                            );
                          }}
                        />
                      </TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedEmployees.includes(employee.id)}
                            onCheckedChange={(checked) => {
                              setSelectedEmployees(
                                checked
                                  ? [...selectedEmployees, employee.id]
                                  : selectedEmployees.filter(
                                      (id) => id !== employee.id,
                                    ),
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {employee.profilePictureUrl ? (
                                <AvatarImage
                                  src={employee.profilePictureUrl}
                                  alt={employee.name}
                                />
                              ) : (
                                <AvatarFallback>
                                  {employee.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .toUpperCase()}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div>
                              <div className="font-medium">{employee.name}</div>
                              <div className="text-sm text-gray-500">
                                ID: {employee.employeeId}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{employee.departmentName}</TableCell>
                        <TableCell>
                          {getEmployeeTypeBadge(employee.employeeType)}
                        </TableCell>
                        <TableCell>
                          {employee.workStartDate &&
                            format(
                              new Date(employee.workStartDate),
                              'd MMM yyyy',
                              { locale: th },
                            )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              employee.isGovernmentRegistered === 'Yes'
                                ? 'success'
                                : 'default'
                            }
                          >
                            {employee.isGovernmentRegistered === 'Yes'
                              ? 'Registered'
                              : 'Unregistered'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedEmployee(employee);
                                  setShowForm(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleViewHistory(employee.id)}
                              >
                                <History className="mr-2 h-4 w-4" />
                                View History
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDelete(employee.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Employee Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedEmployee ? 'Edit Employee' : 'Add New Employee'}
            </DialogTitle>
          </DialogHeader>
          <EmployeeForm
            employee={selectedEmployee || undefined}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setSelectedEmployee(null);
            }}
            departments={departments.map((department) => department.name)}
            shifts={shifts}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper Components
function EmployeeListSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 w-[150px]" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function getEmployeeTypeBadge(type: string) {
  const variants = {
    Probation: 'warning',
    Fulltime: 'success',
    Parttime: 'secondary',
  } as const;

  return (
    <Badge variant={variants[type as keyof typeof variants] || 'default'}>
      {type}
    </Badge>
  );
}
