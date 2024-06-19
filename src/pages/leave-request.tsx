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
  const nonce = ctx.req?.headers['nonce'] || '';
  return { nonce };
};

export default LeaveRequestPage;
