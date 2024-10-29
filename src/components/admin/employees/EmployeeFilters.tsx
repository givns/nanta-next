// components/admin/employees/EmployeeFilters.tsx
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, SlidersHorizontal } from 'lucide-react';

interface EmployeeFiltersProps {
  departmentFilter: string;
  setDepartmentFilter: (value: string) => void;
  employeeTypeFilter: string;
  setEmployeeTypeFilter: (value: string) => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  departments: string[];
}

export function EmployeeFilters({
  departmentFilter,
  setDepartmentFilter,
  employeeTypeFilter,
  setEmployeeTypeFilter,
  searchTerm,
  setSearchTerm,
  departments,
}: EmployeeFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={employeeTypeFilter}
          onValueChange={setEmployeeTypeFilter}
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Employee Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Fulltime">Full Time</SelectItem>
            <SelectItem value="Parttime">Part Time</SelectItem>
            <SelectItem value="Probation">Probation</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" className="md:w-[120px]">
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </div>

      {(departmentFilter !== 'all' ||
        employeeTypeFilter !== 'all' ||
        searchTerm) && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Showing:</span>
          {departmentFilter !== 'all' && (
            <Badge variant="secondary">{departmentFilter}</Badge>
          )}
          {employeeTypeFilter !== 'all' && (
            <Badge variant="secondary">{employeeTypeFilter}</Badge>
          )}
          {searchTerm && (
            <Badge variant="secondary">Search: "{searchTerm}"</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDepartmentFilter('all');
              setEmployeeTypeFilter('all');
              setSearchTerm('');
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
