import React from 'react';
import Link from 'next/link';
const SuperAdminUserMenu = () => {
    return (<nav>
      <ul className="space-y-4">
        <li>
          <Link href="/leave-request">
            <a className="text-blue-500">Send Leave Request</a>
          </Link>
        </li>
        <li>
          <Link href="/overtime-request">
            <a className="text-blue-500">Send Overtime Request</a>
          </Link>
        </li>
        <li>
          <Link href="/leave-balance">
            <a className="text-blue-500">Check Leave Balance</a>
          </Link>
        </li>
        <li>
          <Link href="/holiday-calendar">
            <a className="text-blue-500">Check Holiday Calendar</a>
          </Link>
        </li>
        <li>
          <Link href="/approval-dashboard">
            <a className="text-blue-500">Approval Dashboard</a>
          </Link>
        </li>
        <li>
          <Link href="/admin-dashboard">
            <a className="text-blue-500">Admin Dashboard</a>
          </Link>
        </li>
      </ul>
    </nav>);
};
export default SuperAdminUserMenu;
