// src/pages/leave-request.tsx
import React from 'react';
import LeaveRequestForm from '../components/LeaveRequestForm';
import { NextPageContext } from 'next';

interface LeaveRequestPageProps {
  nonce: string;
}

const LeaveRequestPage = ({ nonce }: LeaveRequestPageProps) => {
  return <LeaveRequestForm nonce={nonce} />;
};

LeaveRequestPage.getInitialProps = async (ctx: NextPageContext) => {
  const req = ctx.req as { nonce?: string }; // Type the req parameter
  const nonce = req?.nonce || '';
  return { nonce };
};

export default LeaveRequestPage;
