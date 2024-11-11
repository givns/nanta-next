// components/admin/AdminDesktopNav.tsx
import Link from 'next/link';
import { useState } from 'react';
import { navItems } from '@/config/adminNav';
import { useRouter } from 'next/router';

interface AdminDesktopNavProps {
  userName: string;
}

export function AdminDesktopNav({ userName }: AdminDesktopNavProps) {
  const router = useRouter();
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);

  const isCurrentPath = (path: string) => {
    if (path === '/admin') return router.pathname === path;
    return router.pathname.startsWith(path);
  };

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold">Admin Dashboard</span>
            </div>
            <div className="hidden lg:ml-6 lg:flex lg:space-x-4">
              {navItems.map((item) => (
                <div
                  key={item.href}
                  className="relative group"
                  onMouseEnter={() =>
                    item.subItems && setOpenSubMenu(item.label)
                  }
                  onMouseLeave={() => setOpenSubMenu(null)}
                >
                  <Link
                    href={item.href}
                    className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors
                      ${
                        isCurrentPath(item.href)
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-indigo-900'
                      }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="ml-2">{item.label}</span>
                  </Link>

                  {item.subItems && openSubMenu === item.label && (
                    <div className="absolute left-0 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="py-1" role="menu">
                        {item.subItems.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={`block px-4 py-2 text-sm ${
                              isCurrentPath(subItem.href)
                                ? 'bg-gray-100 text-gray-900'
                                : 'text-gray-700 hover:bg-grey-50 hover:text-indigo-900'
                            }`}
                            role="menuitem"
                          >
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:ml-4 lg:flex lg:items-center">
            <div className="flex items-center">
              <span className="text-sm text-gray-500 mr-4">{userName}</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
