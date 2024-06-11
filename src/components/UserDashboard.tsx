import React from 'react';

const SuperAdminUserMenu: React.FC = () => {
  const LIFF_URL = `https://liff.line.me/${process.env.LIFF_URL}`;

  const handleClick = (url: string) => {
    window.location.href = url;
  };

  return (
    <nav>
      <ul className="space-y-4">
        <li>
          <button
            onClick={() => handleClick(`${LIFF_URL}/leave-request`)}
            style={{ all: 'unset', cursor: 'pointer' }}
          >
            Send Leave Request
          </button>
        </li>
        <li>
          <button
            onClick={() => handleClick(`${LIFF_URL}/overtime-request`)}
            style={{ all: 'unset', cursor: 'pointer' }}
          >
            Send Overtime Request
          </button>
        </li>
        <li>
          <button
            onClick={() => handleClick(`${LIFF_URL}/leave-balance`)}
            style={{ all: 'unset', cursor: 'pointer' }}
          >
            Check Leave Balance
          </button>
        </li>
        <li>
          <button
            onClick={() => handleClick(`${LIFF_URL}/holiday-calendar`)}
            style={{ all: 'unset', cursor: 'pointer' }}
          >
            Check Holiday Calendar
          </button>
        </li>
        <li>
          <button
            onClick={() => handleClick(`${LIFF_URL}/approval-dashboard`)}
            style={{ all: 'unset', cursor: 'pointer' }}
          >
            Approval Dashboard
          </button>
        </li>
        <li>
          <button
            onClick={() => handleClick(`${LIFF_URL}/admin-dashboard`)}
            style={{ all: 'unset', cursor: 'pointer' }}
          >
            Admin Dashboard
          </button>
        </li>
      </ul>
    </nav>
  );
};

export default SuperAdminUserMenu;
