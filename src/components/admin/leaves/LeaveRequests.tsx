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
import { Checkbox } from '@/components/ui/checkbox';
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
import { Calendar, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: 'sick' | 'business' | 'annual' | 'unpaid';
  startDate: Date;
  endDate: Date;
  fullDayCount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  attachments?: string[];
}

export default function LeaveRequests() {
  const { user } = useAdmin();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (user?.lineUserId) {
      fetchLeaveRequests();
    }
  }, [user, statusFilter, departmentFilter, leaveTypeFilter]);

  const fetchLeaveRequests = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/leaves/leave-requests', {
        headers: {
          'x-line-userid': user?.lineUserId || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch leave requests');
      const data = await response.json();
      setRequests(data);
    } catch (error) {
      setError('Failed to load leave requests');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (requestIds: string[]) => {
    if (!requestIds.length) return;

    try {
      setIsProcessing(true);
      const response = await fetch('/api/admin/leaves/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          leaveRequestIds: requestIds, // Changed from requestIds to leaveRequestIds to match API
          approvedBy: user?.employeeId, // Changed from approverId to approvedBy to match API
          lineUserId: user?.lineUserId, // Added lineUserId as required by API
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to approve requests');
      }

      await fetchLeaveRequests(); // Refresh the list after approval
      setSelectedRequests([]); // Clear selections
      setShowDetailsDialog(false); // Close dialog if open
    } catch (error) {
      setError('Failed to process approval');
      console.error('Error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (requestIds: string) => {
    if (!requestIds.length) return;

    try {
      setIsProcessing(true);
      const response = await fetch(`/api/admin/leaves/deny`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          leaveRequestIds: requestIds,
          deniedBy: user?.employeeId,
          lineUserId: user?.lineUserId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to approve requests');
      }

      await fetchLeaveRequests(); // Refresh the list after approval
      setSelectedRequests([]); // Clear selections
      setShowDetailsDialog(false); // Close dialog if open
    } catch (error) {
      setError('Failed to process approval');
      console.error('Error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Mobile request card component
  const LeaveRequestCard = ({ request }: { request: LeaveRequest }) => (
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
                <div className="font-medium">{request.employeeName}</div>
                <div className="text-sm text-gray-500">
                  {request.department}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <Badge>{request.leaveType} leave</Badge>
            </div>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center text-sm">
            <Calendar className="h-4 w-4 mr-2" />
            <span>
              {format(request.startDate, 'dd MMM')} -{' '}
              {format(request.endDate, 'dd MMM')}
              <span className="text-gray-500 ml-1">
                ({request.fullDayCount} days)
              </span>
            </span>
          </div>

          <div className="text-sm text-gray-600">
            <p className="font-medium">Reason:</p>
            <p>{request.reason}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {request.status === 'pending' && (
            <>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => handleApprove([request.id])}
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

        {request.attachments && request.attachments.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-500">Attachments:</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {request.attachments.map((attachment, index) => (
                <a
                  key={index}
                  href={attachment}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Document {index + 1}
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
            <TableHead>Type</TableHead>
            <TableHead>Duration</TableHead>
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
                  <div className="font-medium">{request.employeeId}</div>
                  <div className="text-sm text-gray-500">
                    {request.department}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge>{request.leaveType}</Badge>
              </TableCell>
              <TableCell>
                <div>
                  <div>{request.fullDayCount} days</div>
                  <div className="text-sm text-gray-500">
                    {format(request.startDate, 'dd MMM')} -{' '}
                    {format(request.endDate, 'dd MMM')}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={request.status} />
              </TableCell>
              <TableCell>
                <div className="flex space-x-2">
                  {request.status === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprove([request.id])}
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
        <div className="flex justify-between items-center">
          <CardTitle>Leave Requests</CardTitle>
          {selectedRequests.length > 0 && (
            <Button
              onClick={() => handleApprove(selectedRequests)}
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
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All Status</SelectItem>
              </SelectContent>
            </Select>

            <Select value={leaveTypeFilter} onValueChange={setLeaveTypeFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Leave Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="sick">Sick Leave</SelectItem>
                <SelectItem value="annual">Annual Leave</SelectItem>
                <SelectItem value="business">Business Leave</SelectItem>
                <SelectItem value="unpaid">Unpaid Leave</SelectItem>
              </SelectContent>
            </Select>

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
          {requests.map((request) => (
            <LeaveRequestCard key={request.id} request={request} />
          ))}
        </div>

        {/* Desktop View */}
        <DesktopTable />

        {/* Leave Request Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Leave Request Details</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Employee</label>
                    <p className="font-medium">
                      {selectedRequest.employeeName}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Department</label>
                    <p className="font-medium">{selectedRequest.department}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Leave Type</label>
                  <p className="font-medium capitalize">
                    {selectedRequest.leaveType} Leave
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Start Date</label>
                    <p className="font-medium">
                      {format(selectedRequest.startDate, 'dd MMM yyyy', {
                        locale: th,
                      })}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">End Date</label>
                    <p className="font-medium">
                      {format(selectedRequest.endDate, 'dd MMM yyyy', {
                        locale: th,
                      })}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-500">Duration</label>
                  <p className="font-medium">
                    {selectedRequest.fullDayCount} days
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-500">Reason</label>
                  <p className="mt-1">{selectedRequest.reason}</p>
                </div>

                {selectedRequest.attachments &&
                  selectedRequest.attachments.length > 0 && (
                    <div>
                      <label className="text-sm text-gray-500">
                        Attachments
                      </label>
                      <div className="mt-2 space-y-2">
                        {selectedRequest.attachments.map(
                          (attachment, index) => (
                            <a
                              key={index}
                              href={attachment}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-blue-600 hover:underline"
                            >
                              View Document {index + 1}
                            </a>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                {selectedRequest.status === 'pending' && (
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => handleReject(selectedRequest.id)}
                      disabled={isProcessing}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleApprove([selectedRequest.id])}
                      disabled={isProcessing}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}
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
