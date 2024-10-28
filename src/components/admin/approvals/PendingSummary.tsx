// components/admin/approvals/PendingSummary.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, Clock, Calendar, AlertCircle } from 'lucide-react';

export default function PendingSummary() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Leave Requests
              </p>
              <p className="text-2xl font-bold mt-1">12</p>
              <p className="text-sm text-gray-500 mt-1">Pending approval</p>
            </div>
            <Calendar className="h-8 w-8 text-blue-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">
                Overtime Requests
              </p>
              <p className="text-2xl font-bold mt-1">8</p>
              <p className="text-sm text-gray-500 mt-1">Awaiting review</p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Urgent</p>
              <p className="text-2xl font-bold mt-1">3</p>
              <p className="text-sm text-gray-500 mt-1">
                Need immediate attention
              </p>
            </div>
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Pending</p>
              <p className="text-2xl font-bold mt-1">23</p>
              <p className="text-sm text-gray-500 mt-1">All requests</p>
            </div>
            <ClipboardList className="h-8 w-8 text-purple-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
