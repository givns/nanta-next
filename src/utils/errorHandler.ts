// utils/errorHandler.ts
import { NextApiResponse } from 'next';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'error',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log' }),
    new winston.transports.Console(),
  ],
});

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const handleError = (err: Error | AppError, res: NextApiResponse) => {
  if (err instanceof AppError) {
    logger.error(err.message, { stack: err.stack });
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  } else {
    logger.error('Unexpected error', { error: err });
    res.status(500).json({
      status: 'error',
      message: 'An unexpected error occurred',
    });
  }
};
