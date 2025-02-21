// components/admin/approvals/ApprovalDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
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
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Search, ClipboardList } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import PendingSummary from './PendingSummary';
import {
  LeaveRequestCard,
  LeaveRequestTable,
} from './tables/LeaveRequestTable';
import {
  OvertimeGroupCard,
  OvertimeRequestTable,
} from './tables/OvertimeRequestTable';
import { useLiff } from '@/contexts/LiffContext';
import { useAuth } from '@/hooks/useAuth';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';

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

export default function ApprovalDashboard() {
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
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedRequest] = useState<ApprovalRequest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // In your component:
  const fetchRequests = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/approvals', {
        headers: { 'x-line-userid': lineUserId || '' },
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
  }, [lineUserId, toast]); // Include dependencies used inside the function

  useEffect(() => {
    if (lineUserId) {
      fetchRequests();
    }
  }, [lineUserId, fetchRequests]); // Now fetchRequests won't change unless its dependencies change

  // Filter requests based on type and search term
  const filteredRequests = requests.filter((request) => {
    const matchesType = filterType === 'all' || request.type === filterType;
    const matchesSearch =
      searchTerm === '' ||
      request.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.department.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const groupOvertimeRequests = (requests: ApprovalRequest[]) => {
    return requests.reduce(
      (groups, request) => {
        const key = `${request.requestDate}_${request.details.startTime}_${request.details.endTime}`;
        if (!groups[key]) {
          groups[key] = {
            date: request.requestDate,
            startTime: request.details.startTime,
            endTime: request.details.endTime,
            durationMinutes: request.details.durationMinutes,
            reason: request.details.reason,
            isDayOffOvertime: request.isUrgent,
            requests: [],
          };
        }
        groups[key].requests.push(request);
        return groups;
      },
      {} as Record<string, any>,
    );
  };

  const handleApprove = async (
    requestIds: string | string[],
    type: 'leave' | 'overtime',
  ) => {
    try {
      setIsProcessing(true);
      // Convert single requestId to array if needed
      const ids = Array.isArray(requestIds) ? requestIds : [requestIds];

      const endpoint =
        type === 'overtime'
          ? '/api//overtime/batch-approve'
          : '/api/leaves/approve';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          requestIds: ids,
          approvedBy: user?.employeeId,
          lineUserId: user?.lineUserId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to approve ${type} request`);
      }

      await fetchRequests();
      setSelectedRequests([]); // Clear selections if any
      toast({
        title: 'Success',
        description: `${ids.length > 1 ? `${ids.length} requests` : 'Request'} approved successfully`,
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
        type === 'overtime' ? '/api/overtime/reject' : '/api/leaves/reject';

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

      await fetchRequests(); // Refresh the list
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

  const RequestDetailsDialog = () => {
    if (!selectedRequest) return null;

    if (authLoading) {
      return <DashboardSkeleton />;
    }

    if (isAuthorized) {
      return <DashboardSkeleton />;
    }

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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Integrated Summary */}
      <PendingSummary />

      {/* Main Approval Card */}
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
            {filterType !== 'overtime' &&
              filteredRequests
                .filter((r) => r.type === 'leave')
                .map((request) => (
                  <LeaveRequestCard
                    key={request.id}
                    request={request}
                    onApprove={() => handleApprove([request.id], 'leave')}
                    onReject={() => handleReject(request.id, 'leave')}
                    isSelected={selectedRequests.includes(request.id)}
                    onSelect={(selected) => {
                      if (selected) {
                        setSelectedRequests((prev) => [...prev, request.id]);
                      } else {
                        setSelectedRequests((prev) =>
                          prev.filter((id) => id !== request.id),
                        );
                      }
                    }}
                    isProcessing={isProcessing}
                  />
                ))}

            {filterType !== 'leave' &&
              Object.entries(
                groupOvertimeRequests(
                  filteredRequests.filter((r) => r.type === 'overtime'),
                ),
              ).map(([key, group]) => (
                <OvertimeGroupCard
                  key={key}
                  groupedRequests={group}
                  onApprove={(ids) => handleApprove(ids, 'overtime')}
                  onReject={(id) => handleReject(id, 'overtime')}
                  selectedRequests={selectedRequests}
                  onSelectRequest={(ids, selected) => {
                    if (selected) {
                      setSelectedRequests((prev) => [...prev, ...ids]);
                    } else {
                      setSelectedRequests((prev) =>
                        prev.filter((id) => !ids.includes(id)),
                      );
                    }
                  }}
                  isProcessing={isProcessing}
                />
              ))}
          </div>

          <LeaveRequestTable
            requests={filteredRequests.filter((r) => r.type === 'leave')}
            onApprove={handleApprove}
            onReject={handleReject}
            isProcessing={isProcessing}
            selectedRequests={selectedRequests}
            onSelectRequest={(ids, selected) => {
              if (selected) {
                setSelectedRequests((prev) => [...prev, ...ids]);
              } else {
                setSelectedRequests((prev) =>
                  prev.filter((id) => !ids.includes(id)),
                );
              }
            }}
          />

          <OvertimeRequestTable
            requests={filteredRequests.filter((r) => r.type === 'overtime')}
            onApprove={handleApprove}
            onReject={handleReject}
            isProcessing={isProcessing}
            selectedRequests={selectedRequests}
            onSelectRequest={(ids, selected) => {
              if (selected) {
                setSelectedRequests((prev) => [...prev, ...ids]);
              } else {
                setSelectedRequests((prev) =>
                  prev.filter((id) => !ids.includes(id)),
                );
              }
            }}
          />

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

          {/* Details Dialog */}
          <RequestDetailsDialog />
        </CardContent>
      </Card>
    </div>
  );
}
