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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Clock,
  CalendarDays,
  Filter,
  AlertCircle,
  Users,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';

interface OvertimeRequest {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  reason: string;
  status: 'pending_response' | 'pending' | 'approved' | 'rejected';
  isDayOffOvertime: boolean;
  approverId: string | null;
}

export default function OvertimeRequests() {
  const { user } = useAdmin();
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending_response');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<OvertimeRequest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Mobile request card component
  const RequestCard = ({ request }: { request: OvertimeRequest }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedRequests.includes(request.id)}
                onCheckedChange={(checked) =>
                  handleSelectRequest(request.id, checked as boolean)
                }
              />
              <div>
                <div className="font-medium">{request.name}</div>
                <div className="text-sm text-gray-500">
                  {request.department}
                </div>
              </div>
            </div>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center text-sm">
            <CalendarDays className="h-4 w-4 mr-2" />
            <span>
              {format(new Date(request.date), 'dd MMM yyyy', { locale: th })}
            </span>
          </div>
          <div className="flex items-center text-sm">
            <Clock className="h-4 w-4 mr-2" />
            <span>
              {request.startTime} - {request.endTime} ({request.duration}h)
            </span>
          </div>

          <div className="text-sm text-gray-600 mt-2">
            <p className="font-medium">Reason:</p>
            <p>{request.reason}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {request.status === 'pending_response' && (
            <>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => handleBatchApprove([request.id])}
                disabled={isProcessing}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleReject(request.id)}
                disabled={isProcessing}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </>
          )}
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
      </CardContent>
    </Card>
  );

  // Filter section
  const FilterSection = () => (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending_response">Pending Response</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {/* Add department options */}
          </SelectContent>
        </Select>

        <div className="flex-1">
          <div className="relative">
            <Filter className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search employee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {selectedRequests.length > 0 && (
        <div className="flex justify-between items-center bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-500" />
            <span>{selectedRequests.length} requests selected</span>
          </div>
          <Button
            onClick={() => handleBatchApprove(selectedRequests)}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Approve Selected'}
          </Button>
        </div>
      )}
    </div>
  );

  // Desktop table view
  const DesktopTable = () => (
    <div className="hidden md:block overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                checked={selectedRequests.length === requests.length}
                onCheckedChange={handleSelectAll}
              />
            </TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <Checkbox
                  checked={selectedRequests.includes(request.id)}
                  onCheckedChange={(checked) =>
                    handleSelectRequest(request.id, checked as boolean)
                  }
                />
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{request.name}</div>
                  <div className="text-sm text-gray-500">
                    {request.department}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {format(new Date(request.date), 'dd MMM yyyy', { locale: th })}
              </TableCell>
              <TableCell>
                {request.startTime} - {request.endTime}
              </TableCell>
              <TableCell>
                <Badge
                  variant={request.isDayOffOvertime ? 'destructive' : 'default'}
                >
                  {request.isDayOffOvertime ? 'Day-off OT' : 'Regular OT'}
                </Badge>
              </TableCell>
              <TableCell>
                <StatusBadge status={request.status} />
              </TableCell>
              <TableCell>
                <div className="flex space-x-2">
                  {request.status === 'pending_response' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleBatchApprove([request.id])}
                        disabled={isProcessing}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(request.id)}
                        disabled={isProcessing}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
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

  // Event handlers and effects...
  useEffect(() => {
    if (user?.lineUserId) {
      fetchOvertimeRequests();
    }
  }, [user, statusFilter, departmentFilter]);

  const fetchOvertimeRequests = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/admin/attendance/overtime-requests?status=${statusFilter}`,
        {
          headers: {
            'x-line-userid': user?.lineUserId || '',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to fetch overtime requests');
      }

      const data = await response.json();
      setRequests(data);
    } catch (error) {
      setError('Failed to load overtime requests');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchApprove = async (requestIds: string[]) => {
    if (!requestIds.length) return;

    try {
      setIsProcessing(true);
      const response = await fetch('/api/admin/attendance/overtime-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          requestIds,
          action: 'approve',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve requests');
      }

      toast({
        title: 'Success',
        description: 'Overtime requests approved successfully',
      });

      await fetchOvertimeRequests();
      setSelectedRequests([]);
      setShowDetailsDialog(false);
    } catch (error) {
      setError('Failed to process approval');
      console.error('Error:', error);

      toast({
        title: 'Error',
        description: 'Failed to approve overtime requests',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      setIsProcessing(true);
      const response = await fetch('/api/admin/attendance/overtime-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          requestIds: [requestId],
          action: 'reject',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to reject request');
      }

      toast({
        title: 'Success',
        description: 'Overtime request rejected successfully',
      });

      await fetchOvertimeRequests();
      setShowDetailsDialog(false);
    } catch (error) {
      setError('Failed to process rejection');
      console.error('Error:', error);

      toast({
        title: 'Error',
        description: 'Failed to reject overtime request',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRequests(requests.map((req) => req.id));
    } else {
      setSelectedRequests([]);
    }
  };

  const handleSelectRequest = (requestId: string, checked: boolean) => {
    if (checked) {
      setSelectedRequests((prev) => [...prev, requestId]);
    } else {
      setSelectedRequests((prev) => prev.filter((id) => id !== requestId));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overtime Requests</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FilterSection />

        {/* Mobile View */}
        <div className="md:hidden">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>

        {/* Desktop View */}
        <DesktopTable />

        {/* Request Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Overtime Request Details</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Employee</label>
                    <p className="font-medium">{selectedRequest.name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Department</label>
                    <p className="font-medium">{selectedRequest.department}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Date</label>
                    <p className="font-medium">
                      {format(new Date(selectedRequest.date), 'dd MMM yyyy', {
                        locale: th,
                      })}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Time</label>
                    <p className="font-medium">
                      {selectedRequest.startTime} - {selectedRequest.endTime}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-500">Type</label>
                  <p className="font-medium">
                    {selectedRequest.isDayOffOvertime
                      ? 'Day-off Overtime'
                      : 'Regular Overtime'}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-500">Reason</label>
                  <p className="font-medium mt-1">{selectedRequest.reason}</p>
                </div>

                <DialogFooter>
                  {selectedRequest.status === 'pending_response' && (
                    <div className="flex gap-2 w-full">
                      <Button
                        variant="outline"
                        onClick={() => handleReject(selectedRequest.id)}
                        disabled={isProcessing}
                        className="flex-1"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleBatchApprove([selectedRequest.id])}
                        disabled={isProcessing}
                        className="flex-1"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Empty State */}
        {!isLoading && requests.length === 0 && (
          <div className="text-center py-12">
            <Clock className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No overtime requests
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              There are no pending overtime requests to review
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const StatusBadge = ({ status }: { status: string }) => {
  const styles = {
    pending_response: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    pending: 'bg-blue-100 text-blue-800',
  };

  const labels = {
    pending_response: 'Pending Response',
    approved: 'Approved',
    rejected: 'Rejected',
    pending: 'Pending',
  };

  return (
    <Badge className={styles[status as keyof typeof styles]}>
      {labels[status as keyof typeof labels]}
    </Badge>
  );
};
