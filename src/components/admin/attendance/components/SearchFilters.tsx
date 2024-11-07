// components/admin/attendance/components/SearchFilters.tsx

import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SearchFiltersProps {
  filters: {
    searchTerm: string;
    department: string;
  };
  departments: { id: string; name: string }[];
  onSearchChange: (term: string) => void;
  onDepartmentChange: (department: string) => void;
}

export function SearchFilters({
  filters,
  departments,
  onSearchChange,
  onDepartmentChange,
}: SearchFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search employee..."
          className="pl-10"
          value={filters.searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <Select value={filters.department} onValueChange={onDepartmentChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Department" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Departments</SelectItem>
          {departments.map((dept) => (
            <SelectItem key={dept.id} value={dept.id}>
              {dept.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
