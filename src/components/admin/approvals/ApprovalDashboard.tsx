// components/admin/approvals/ApprovalDashboard.tsx
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
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Search,
  ClipboardList,
} from 'lucide-react';
import { toast, useToast } from '@/components/ui/use-toast';

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

// Format duration for display
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
}

// RequestCard component for mobile view
const RequestCard = ({
  request,
  onApprove,
  onReject,
  onSelect,
}: {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
  onSelect: () => void;
}) => (
  <Card className="mb-4 md:hidden">
    <CardContent className="p-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium">{request.employeeName}</div>
          <div className="text-sm text-gray-500">{request.department}</div>
        </div>
        <Badge variant={request.type === 'leave' ? 'default' : 'secondary'}>
          {request.type === 'leave' ? 'Leave' : 'Overtime'}
        </Badge>
      </div>

      <div className="mt-4 space-y-2">
        {request.type === 'overtime' ? (
          <div className="flex items-center text-sm">
            <Clock className="h-4 w-4 mr-2" />
            <span>
              {request.details.startTime} - {request.details.endTime}
              {request.details.durationMinutes && (
                <span className="text-gray-500 ml-2">
                  ({formatDuration(request.details.durationMinutes)})
                </span>
              )}
            </span>
          </div>
        ) : (
          <div className="flex items-center text-sm">
            <Calendar className="h-4 w-4 mr-2" />
            <span>
              {format(new Date(request.details.startDate!), 'dd MMM yyyy')} -{' '}
              {format(new Date(request.details.endDate!), 'dd MMM yyyy')}
            </span>
          </div>
        )}

        <div className="text-sm text-gray-600 mt-2">
          <p className="font-medium">Reason:</p>
          <p>{request.details.reason}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button size="sm" className="flex-1" onClick={onApprove}>
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onReject}
        >
          <XCircle className="h-4 w-4 mr-1" />
          Reject
        </Button>
      </div>
    </CardContent>
  </Card>
);

export default function ApprovalDashboard() {
  const { user } = useAdmin();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<ApprovalRequest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (user?.lineUserId) {
      fetchRequests();
    }
  }, [user]);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/admin/approvals', {
        headers: { 'x-line-userid': user?.lineUserId || '' },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch requests');
      }

      const data = await response.json();
      setRequests(data);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch approval requests',
      });
      console.error('Error:', error);
    }
  };

  const handleApprove = async (
    requestIds: string[],
    type: 'leave' | 'overtime',
  ) => {
    try {
      setIsProcessing(true);
      const endpoint =
        type === 'overtime'
          ? '/api/admin/attendance/overtime/approve'
          : '/api/admin/leaves/approve';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          requestIds,
          approvedBy: user?.employeeId,
          lineUserId: user?.lineUserId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to approve ${type} request`);
      }

      await fetchRequests();
      setSelectedRequests([]);
      toast({
        title: 'Success',
        description: `${requestIds.length} ${type} request(s) approved successfully`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to approve request',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (
    requestId: string,
    type: 'leave' | 'overtime',
  ) => {
    try {
      setIsProcessing(true);
      const endpoint =
        type === 'overtime'
          ? '/api/admin/attendance/overtime/reject'
          : '/api/admin/leaves/reject';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          requestId,
          rejectedBy: user?.employeeId,
          lineUserId: user?.lineUserId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to reject ${type} request`);
      }

      await fetchRequests();
      toast({
        title: 'Success',
        description: `${type} request rejected successfully`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to reject request',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter requests based on type and search term
  const filteredRequests = requests.filter((request) => {
    const matchesType = filterType === 'all' || request.type === filterType;
    const matchesSearch =
      searchTerm === '' ||
      request.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.department.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const RequestDetailsDialog = () => {
    if (!selectedRequest) return null;

    return (
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">
                  Employee
                </label>
                <p className="font-medium">{selectedRequest.employeeName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">
                  Department
                </label>
                <p className="font-medium">{selectedRequest.department}</p>
              </div>
            </div>

            {/* Request Type Info */}
            <div>
              <label className="text-sm font-medium text-gray-500">
                Request Type
              </label>
              <Badge
                className="ml-2"
                variant={
                  selectedRequest.type === 'leave' ? 'default' : 'secondary'
                }
              >
                {selectedRequest.type === 'leave'
                  ? 'Leave Request'
                  : 'Overtime Request'}
              </Badge>
              {selectedRequest.isUrgent && (
                <Badge variant="destructive" className="ml-2">
                  Urgent
                </Badge>
              )}
            </div>

            {/* Time/Duration Details */}
            {selectedRequest.type === 'overtime' ? (
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Time
                  </label>
                  <p className="font-medium">
                    {selectedRequest.details.startTime} -{' '}
                    {selectedRequest.details.endTime}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Duration
                  </label>
                  <p className="font-medium">
                    {selectedRequest.details.durationMinutes &&
                      formatDuration(selectedRequest.details.durationMinutes)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Leave Type
                  </label>
                  <p className="font-medium">
                    {selectedRequest.details.leaveType}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Duration
                  </label>
                  <p className="font-medium">
                    {format(
                      new Date(selectedRequest.details.startDate!),
                      'dd MMM yyyy',
                    )}{' '}
                    -{' '}
                    {format(
                      new Date(selectedRequest.details.endDate!),
                      'dd MMM yyyy',
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="text-sm font-medium text-gray-500">
                Reason
              </label>
              <p className="mt-1">{selectedRequest.details.reason}</p>
            </div>

            {/* Actions */}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  handleReject(selectedRequest.id, selectedRequest.type)
                }
                disabled={isProcessing}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                onClick={() =>
                  handleApprove([selectedRequest.id], selectedRequest.type)
                }
                disabled={isProcessing}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Approve
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  // Desktop table view with formatted duration
  const RequestsTable = () => (
    <div className="hidden md:block overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Date/Time</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRequests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <div>
                  <div className="font-medium">{request.employeeName}</div>
                  <div className="text-sm text-gray-500">
                    {request.department}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={request.type === 'leave' ? 'default' : 'secondary'}
                >
                  {request.type === 'leave'
                    ? 'Leave Request'
                    : 'Overtime Request'}
                </Badge>
              </TableCell>
              <TableCell>
                {request.type === 'leave' ? (
                  <div>
                    <span className="font-medium">
                      {request.details.leaveType}
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      {request.details.reason}
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="font-medium">
                      {request.details.durationMinutes &&
                        formatDuration(request.details.durationMinutes)}
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      {request.details.reason}
                    </p>
                  </div>
                )}
              </TableCell>
              <TableCell>
                {request.type === 'leave' ? (
                  <span>
                    {format(new Date(request.details.startDate!), 'dd MMM')} -{' '}
                    {format(new Date(request.details.endDate!), 'dd MMM')}
                  </span>
                ) : (
                  <span>
                    {request.details.startTime} - {request.details.endTime}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApprove([request.id], request.type)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReject(request.id, request.type)}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedRequest(request);
                      setShowDetailsDialog(true);
                    }}
                  >
                    Details
                  </Button>
                </div>
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
        <div className="flex justify-between items-center">
          <CardTitle>Pending Approvals</CardTitle>
          {selectedRequests.length > 0 && (
            <Button
              onClick={() => {
                const type = requests.find(
                  (r) => r.id === selectedRequests[0],
                )?.type;
                if (type) {
                  handleApprove(selectedRequests, type);
                }
              }}
              disabled={isProcessing}
            >
              {isProcessing
                ? 'Processing...'
                : `Approve Selected (${selectedRequests.length})`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="space-y-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Request Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="leave">Leave Requests</SelectItem>
                <SelectItem value="overtime">Overtime Requests</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search employee or department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile View */}
        <div className="md:hidden">
          {filteredRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onApprove={() => handleApprove([request.id], request.type)}
              onReject={() => handleReject(request.id, request.type)}
              onSelect={() => {
                setSelectedRequest(request);
                setShowDetailsDialog(true);
              }}
            />
          ))}
        </div>

        {/* Desktop View */}
        <RequestsTable />

        {/* Details Dialog */}
        <RequestDetailsDialog />

        {/* Empty State */}
        {filteredRequests.length === 0 && (
          <div className="text-center py-12">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No pending requests
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              All requests have been processed
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
