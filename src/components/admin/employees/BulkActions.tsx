// components/admin/employees/BulkActions.tsx
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Clock } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import {
  Users,
  UserPlus,
  FileSpreadsheet,
  Upload,
  Download,
  Trash2,
} from 'lucide-react';
import type { Employee } from '@/types/employee';

interface BulkActionsProps {
  selectedEmployees: Employee[];
  onBulkUpdate: (action: string, value: any) => Promise<void>;
  departments: string[];
  shifts: { code: string; name: string }[];
}

export function BulkActions({
  selectedEmployees,
  onBulkUpdate,
  departments,
  shifts,
}: BulkActionsProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [actionType, setActionType] = useState<string>('');
  const [actionValue, setActionValue] = useState<string>('');

  const handleAction = async () => {
    await onBulkUpdate(actionType, actionValue);
    setShowDialog(false);
    setActionType('');
    setActionValue('');
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="ml-auto">
            <Users className="mr-2 h-4 w-4" />
            Bulk Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              setActionType('department');
              setShowDialog(true);
            }}
          >
            <Users className="mr-2 h-4 w-4" />
            Change Department
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setActionType('shift');
              setShowDialog(true);
            }}
          >
            <Clock className="mr-2 h-4 w-4" />
            Update Shift
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setActionType('export');
              setShowDialog(true);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Selected
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setActionType('delete');
              setShowDialog(true);
            }}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'department' && 'Change Department'}
              {actionType === 'shift' && 'Update Shift'}
              {actionType === 'export' && 'Export Employees'}
              {actionType === 'delete' && 'Delete Employees'}
            </DialogTitle>
            <DialogDescription>
              This action will affect {selectedEmployees.length} selected
              employee(s).
            </DialogDescription>
          </DialogHeader>

          {actionType === 'department' && (
            <div className="space-y-4">
              <div>
                <Label>New Department</Label>
                <Select onValueChange={setActionValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {actionType === 'shift' && (
            <div className="space-y-4">
              <div>
                <Label>New Shift</Label>
                <Select onValueChange={setActionValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {shifts.map((shift) => (
                      <SelectItem key={shift.code} value={shift.code}>
                        {shift.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {actionType === 'delete' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  This action cannot be undone. This will permanently delete the
                  selected employees.
                </AlertDescription>
              </Alert>
              <div>
                <Label>Type DELETE to confirm</Label>
                <Input
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  placeholder="DELETE"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              variant={actionType === 'delete' ? 'destructive' : 'default'}
              onClick={handleAction}
              disabled={
                actionType === 'delete'
                  ? actionValue !== 'DELETE'
                  : !actionValue
              }
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
