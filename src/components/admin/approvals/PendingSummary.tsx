// components/admin/approvals/PendingSummary.tsx
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList, Clock, Calendar, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';

interface SummaryData {
  leaves: number;
  overtime: number;
  urgent: number;
  total: number;
}

export default function PendingSummary() {
  const { user } = useAdmin();
  const [isLoading, setIsLoading] = useState(true);
  const [summaryData, setSummaryData] = useState<SummaryData>({
    leaves: 0,
    overtime: 0,
    urgent: 0,
    total: 0,
  });

  useEffect(() => {
    if (user?.lineUserId) {
      fetchSummaryData();
    }
  }, [user]);

  const fetchSummaryData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/approvals/summary', {
        headers: {
          'x-line-userid': user?.lineUserId || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch summary data');
      }

      const data = await response.json();
      setSummaryData(data);
    } catch (error) {
      console.error('Error fetching summary data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const SummaryCard = ({
    title,
    count,
    subtitle,
    icon: Icon,
    iconColor,
  }: {
    title: string;
    count: number;
    subtitle: string;
    icon: any;
    iconColor: string;
  }) => (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold mt-1">{isLoading ? '-' : count}</p>
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          </div>
          <Icon className={`h-8 w-8 ${iconColor}`} />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <SummaryCard
        title="Leave Requests"
        count={summaryData.leaves}
        subtitle="Pending approval"
        icon={Calendar}
        iconColor="text-blue-500"
      />
      <SummaryCard
        title="Overtime Requests"
        count={summaryData.overtime}
        subtitle="Awaiting review"
        icon={Clock}
        iconColor="text-orange-500"
      />
      <SummaryCard
        title="Urgent"
        count={summaryData.urgent}
        subtitle="Need immediate attention"
        icon={AlertCircle}
        iconColor="text-red-500"
      />
      <SummaryCard
        title="Total Pending"
        count={summaryData.total}
        subtitle="All requests"
        icon={ClipboardList}
        iconColor="text-purple-500"
      />
    </div>
  );
}
