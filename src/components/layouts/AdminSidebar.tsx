import { Briefcase, Settings, Calendar, DollarSign } from 'lucide-react';

export const AdminSidebar = () => {
  const menuItems = [
    { label: 'Dashboard', href: '/admin', icon: Briefcase },
    { label: 'Payroll', href: '/payroll', icon: DollarSign },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="w-64 bg-white border-r h-full">
      <div className="p-4">
        <h1 className="text-xl font-bold">Admin Panel</h1>
      </div>
      <nav className="mt-4">
        {menuItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100"
          >
            <item.icon className="w-5 h-5 mr-2" />
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
};
