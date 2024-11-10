// components/admin/approvals/tables/OvertimeRequestTable.tsx

import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect, useRef } from 'react';

interface CheckboxRef extends HTMLButtonElement {
  indeterminate?: boolean;
}

interface ApprovalRequest {
  id: string;
  type: 'leave' | 'overtime';
  employeeId: string;
  employeeName: string;
  department: string;
  requestDate: Date;
  details: {
    startTime?: string;
    endTime?: string;
    reason: string;
    leaveType?: string;
    durationMinutes?: number;
  };
  status: string;
  isUrgent: boolean;
}

// Format duration for display
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
}

interface GroupedRequest {
  date: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
  isDayOffOvertime: boolean;
  requests: ApprovalRequest[];
}

interface OvertimeRequestTableProps {
  requests: ApprovalRequest[];
  onApprove: (ids: string[], type: 'leave' | 'overtime') => Promise<void>;
  onReject: (id: string, type: 'leave' | 'overtime') => Promise<void>;
  isProcessing: boolean;
  selectedRequests: string[];
  onSelectRequest: (ids: string[], selected: boolean) => void;
}

export const OvertimeRequestTable = ({
  requests,
  onApprove,
  onReject,
  isProcessing,
  selectedRequests,
  onSelectRequest,
}: OvertimeRequestTableProps) => {
  // Group requests by date, time, and details
  const groupedRequests = requests.reduce(
    (groups, request) => {
      const key = `${request.requestDate}_${request.details.startTime}_${request.details.endTime}`;
      if (!groups[key]) {
        groups[key] = {
          date: request.requestDate,
          startTime: request.details.startTime || '', // Provide a default value for startTime
          endTime: request.details.endTime ?? '', // Provide a default value for endTime
          durationMinutes: request.details.durationMinutes ?? 0, // Provide a default value for durationMinutes
          reason: request.details.reason,
          isDayOffOvertime: request.isUrgent,
          requests: [],
        };
      }
      groups[key].requests.push(request);
      return groups;
    },
    {} as Record<string, GroupedRequest>,
  );

  return (
    <div className="space-y-6">
      {Object.entries(groupedRequests).map(([key, group]) => (
        <Card key={key} className="overflow-hidden">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <Checkbox
                  checked={group.requests.every((r: ApprovalRequest) =>
                    selectedRequests.includes(r.id),
                  )}
                  onCheckedChange={(checked) => {
                    onSelectRequest(
                      group.requests.map((r: ApprovalRequest) => r.id),
                      !!checked,
                    );
                  }}
                />
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span>
                      {format(new Date(group.date), 'dd MMMM yyyy', {
                        locale: th,
                      })}
                    </span>
                    <Badge
                      variant={
                        group.isDayOffOvertime ? 'destructive' : 'secondary'
                      }
                    >
                      {group.isDayOffOvertime ? 'Day-off OT' : 'Regular OT'}
                    </Badge>
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    {group.startTime} - {group.endTime} (
                    {formatDuration(group.durationMinutes)})
                  </p>
                  <p className="text-sm mt-2">{group.reason}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    onApprove(
                      group.requests.map((r) => r.id),
                      'overtime',
                    )
                  }
                  disabled={isProcessing}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    group.requests.forEach((r) => onReject(r.id, 'overtime'))
                  }
                  disabled={isProcessing}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30px]">
                    <Checkbox
                      checked={group.requests.every((r: ApprovalRequest) =>
                        selectedRequests.includes(r.id),
                      )}
                      onCheckedChange={(checked) => {
                        onSelectRequest(
                          group.requests.map((r: ApprovalRequest) => r.id),
                          !!checked,
                        );
                      }}
                    />
                  </TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Individual Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedRequests.includes(request.id)}
                        onCheckedChange={(checked) => {
                          onSelectRequest([request.id], !!checked);
                        }}
                      />
                    </TableCell>
                    <TableCell>{request.employeeName}</TableCell>
                    <TableCell>{request.department}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => onApprove([request.id], 'overtime')}
                          disabled={isProcessing}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReject(request.id, 'overtime')}
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export const OvertimeGroupCard = ({
  groupedRequests,
  onApprove,
  onReject,
  selectedRequests,
  onSelectRequest,
  isProcessing,
}: {
  groupedRequests: GroupedRequest;
  onApprove: (ids: string[], type: 'leave' | 'overtime') => Promise<void>;
  onReject: (id: string, type: 'leave' | 'overtime') => Promise<void>;
  selectedRequests: string[];
  onSelectRequest: (ids: string[], selected: boolean) => void;
  isProcessing: boolean;
}) => {
  const allSelected = groupedRequests.requests.every((r) =>
    selectedRequests.includes(r.id),
  );
  const someSelected = groupedRequests.requests.some((r) =>
    selectedRequests.includes(r.id),
  );
  const checkboxRef = useRef<CheckboxRef>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        {/* Header Info */}
        <div className="flex items-center gap-3">
          <Checkbox
            ref={checkboxRef as React.Ref<HTMLButtonElement>}
            checked={allSelected}
            onCheckedChange={(checked) => {
              onSelectRequest(
                groupedRequests.requests.map((r) => r.id),
                !!checked,
              );
            }}
          />
          <div>
            <div className="font-medium">
              {format(new Date(groupedRequests.date), 'dd MMMM yyyy', {
                locale: th,
              })}
            </div>
            <div className="text-sm text-gray-500">
              {groupedRequests.startTime} - {groupedRequests.endTime} (
              {formatDuration(groupedRequests.durationMinutes)})
            </div>
          </div>
        </div>
        <Badge
          variant={
            groupedRequests.isDayOffOvertime ? 'destructive' : 'secondary'
          }
        >
          {groupedRequests.isDayOffOvertime ? 'Day-off OT' : 'Regular OT'}
        </Badge>
        <div className="text-sm">
          <span className="font-medium">เหตุผล: </span>
          {groupedRequests.reason}
        </div>

        {/* Employee List */}
        <div className="mt-3 space-y-2">
          <div className="text-sm font-medium text-gray-500">
            Employees ({groupedRequests.requests.length})
          </div>
          {groupedRequests.requests.map((request) => (
            <div
              key={request.id}
              className="flex justify-between items-center py-2 border-b last:border-0"
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedRequests.includes(request.id)}
                  onCheckedChange={(checked) => {
                    onSelectRequest([request.id], !!checked);
                  }}
                />
                <div>
                  <div className="font-medium">{request.employeeName}</div>
                  <div className="text-sm text-gray-500">
                    {request.department}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onApprove([request.id], 'overtime')}
                  disabled={isProcessing}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onReject(request.id, 'overtime')}
                  disabled={isProcessing}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Batch action buttons */}
        <Button
          size="sm"
          className="flex-1"
          onClick={() =>
            onApprove(
              groupedRequests.requests.map((r) => r.id),
              'overtime',
            )
          }
          disabled={isProcessing}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Approve All
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() =>
            groupedRequests.requests.forEach((r) => onReject(r.id, 'overtime'))
          }
          disabled={isProcessing}
        >
          <XCircle className="h-4 w-4 mr-1" />
          Reject All
        </Button>
      </CardContent>
    </Card>
  );
};
