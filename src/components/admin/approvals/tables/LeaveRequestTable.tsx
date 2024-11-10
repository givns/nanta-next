// components/admin/approvals/tables/LeaveRequestTable.tsx
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface ApprovalRequest {
  id: string;
  type: 'leave' | 'overtime';
  employeeId: string;
  employeeName: string;
  department: string;
  requestDate: Date;
  details: {
    startDate?: Date;
    endDate?: Date;
    startTime?: string;
    endTime?: string;
    reason: string;
    leaveType?: string;
    durationMinutes?: number;
  };
  status: string;
  isUrgent: boolean;
}

interface LeaveRequestTableProps {
  requests: ApprovalRequest[];
  onApprove: (ids: string[], type: 'leave' | 'overtime') => Promise<void>;
  onReject: (id: string, type: 'leave' | 'overtime') => Promise<void>;
  isProcessing: boolean;
  selectedRequests: string[];
  onSelectRequest: (ids: string[], selected: boolean) => void;
}

export const LeaveRequestTable = ({
  requests,
  onApprove,
  onReject,
  isProcessing,
  selectedRequests,
  onSelectRequest,
}: LeaveRequestTableProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="w-[30px]">
          <Checkbox
            checked={selectedRequests.length === requests.length}
            onCheckedChange={(checked) => {
              onSelectRequest(
                requests.map((request) => request.id),
                !!checked,
              );
            }}
          />
        </TableHead>
        <TableHead>Employee</TableHead>
        <TableHead>Department</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Duration</TableHead>
        <TableHead>Reason</TableHead>
        <TableHead>Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {requests.map((request) => (
        <TableRow key={request.id}>
          <TableCell>
            <Checkbox
              checked={selectedRequests.includes(request.id)}
              onCheckedChange={(checked) => {
                onSelectRequest([request.id], !!checked);
              }}
            />
          </TableCell>
          <TableCell>
            <div className="font-medium">{request.employeeName}</div>
          </TableCell>
          <TableCell>{request.department}</TableCell>
          <TableCell>
            <Badge>{request.details.leaveType}</Badge>
          </TableCell>
          <TableCell>
            <div>
              {format(new Date(request.details.startDate!), 'dd MMM yyyy', {
                locale: th,
              })}{' '}
              -{' '}
              {format(new Date(request.details.endDate!), 'dd MMM yyyy', {
                locale: th,
              })}
            </div>
          </TableCell>
          <TableCell>{request.details.reason}</TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => onApprove([request.id], 'leave')}
                disabled={isProcessing}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReject(request.id, 'leave')}
                disabled={isProcessing}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export const LeaveRequestCard = ({
  request,
  onApprove,
  onReject,
  isSelected,
  onSelect,
  isProcessing,
}: {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  isProcessing: boolean;
}) => (
  <Card className="mb-4">
    <CardContent className="p-4">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(!!checked)}
          />
          <div>
            <div className="font-medium">{request.employeeName}</div>
            <div className="text-sm text-gray-500">{request.department}</div>
          </div>
        </div>
        <Badge>{request.details.leaveType}</Badge>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center text-sm">
          <Calendar className="h-4 w-4 mr-2" />
          <span>
            {format(new Date(request.details.startDate!), 'dd MMMM yyyy', {
              locale: th,
            })}{' '}
            -{' '}
            {format(new Date(request.details.endDate!), 'dd MMMM yyyy', {
              locale: th,
            })}
          </span>
        </div>

        <div className="text-sm text-gray-600 mt-2">
          <p className="font-medium">เหตุผล:</p>
          <p>{request.details.reason}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={onApprove}
          disabled={isProcessing}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onReject}
          disabled={isProcessing}
        >
          <XCircle className="h-4 w-4 mr-1" />
          Reject
        </Button>
      </div>
    </CardContent>
  </Card>
);
