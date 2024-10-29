// components/admin/employees/EmployeeCard.tsx
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Briefcase, Calendar, Building2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import type { Employee } from '@/types/employee';

interface EmployeeCardProps {
  employee: Employee;
  onEdit: (employee: Employee) => void;
}

export function EmployeeCard({ employee, onEdit }: EmployeeCardProps) {
  const getEmployeeTypeBadge = (type: string) => {
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
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              {employee.profilePictureUrl ? (
                <img
                  src={employee.profilePictureUrl}
                  alt={employee.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-gray-400" />
              )}
            </div>
            <div>
              <h3 className="font-medium">{employee.name}</h3>
              <p className="text-sm text-gray-500">ID: {employee.employeeId}</p>
            </div>
          </div>
          {getEmployeeTypeBadge(employee.employeeType)}
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2">
            <Briefcase className="w-4 h-4 text-gray-400 mt-1" />
            <div>
              <p className="text-sm font-medium">{employee.role}</p>
              <p className="text-sm text-gray-500">{employee.departmentName}</p>
            </div>
          </div>

          {employee.workStartDate && (
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500">Start Date</p>
                <p className="text-sm">
                  {format(new Date(employee.workStartDate), 'd MMMM yyyy', {
                    locale: th,
                  })}
                </p>
              </div>
            </div>
          )}

          {employee.shiftCode && (
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500">Shift Code</p>
                <p className="text-sm">{employee.shiftCode}</p>
              </div>
            </div>
          )}

          {employee.company && (
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500">Company</p>
                <p className="text-sm">{employee.company}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div>
            <p className="text-gray-500">Sick Leave</p>
            <p className="font-medium">{employee.sickLeaveBalance}</p>
          </div>
          <div>
            <p className="text-gray-500">Business</p>
            <p className="font-medium">{employee.businessLeaveBalance}</p>
          </div>
          <div>
            <p className="text-gray-500">Annual</p>
            <p className="font-medium">{employee.annualLeaveBalance}</p>
          </div>
        </div>

        <div className="mt-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onEdit(employee)}
          >
            Edit Employee
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
