// __tests__/components/PayrollProcessing.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PayrollProcessing } from '@/components/payroll/PayrollProcessing';
import { act } from 'react-dom/test-utils';

// Mock fetch and EventSource
global.fetch = jest.fn();
global.EventSource = jest.fn();

describe('PayrollProcessing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should start processing when button is clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sessionId: '123' }),
    });

    render(<PayrollProcessing />);

    // Select a period
    const periodSelector = screen.getByRole('combobox');
    fireEvent.change(periodSelector, { target: { value: '2024-01' } });

    // Click process button
    const processButton = screen.getByText('Process Payroll');
    await act(async () => {
      fireEvent.click(processButton);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/payroll/process',
      expect.any(Object),
    );
  });

  it('should show progress during processing', async () => {
    let eventSourceCallback;
    (global.EventSource as jest.Mock).mockImplementation(() => ({
      onmessage: (cb) => {
        eventSourceCallback = cb;
      },
      close: jest.fn(),
    }));

    render(<PayrollProcessing />);

    // Simulate progress updates
    act(() => {
      eventSourceCallback({
        data: JSON.stringify({
          status: 'processing',
          totalEmployees: 10,
          processedCount: 5,
        }),
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText('Processed 5 of 10 employees'),
      ).toBeInTheDocument();
    });
  });
});
