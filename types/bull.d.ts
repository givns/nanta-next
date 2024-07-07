// bull.d.ts
declare module 'bull' {
  import { EventEmitter } from 'events';
  import { RedisClient } from 'redis';
  export interface JobOptions {
    // Add job options as needed
  }

  export interface Queue<T = any> {
    add(data: T, opts?: JobOptions): Promise<Job<T>>;
    process(callback: (job: Job<T>) => Promise<any>): void;
    getJob(jobId: string | number): Promise<Job<T> | null>;
    // Add other methods as needed
  }

  export interface Job<T = any> {
    id: string;
    data: T;
    progress(): Promise<number>;
    progress(percent: number): Promise<void>;
    progress(data: object): Promise<void>;
    getState(): Promise<string>;
    log(row: string): Promise<any>;
  }

  export interface QueueOptions {
    redis?: {
      port?: number;
      host?: string;
      password?: string;
      tls?: object;
    };
    // Add other options as needed
  }

  export default class Queue<T = any> {
    constructor(name: string, url?: string, opts?: QueueOptions);
    add(data: T, opts?: JobOptions): Promise<Job<T>>;
    process(callback: (job: Job<T>) => Promise<any>): void;
    getJob(jobId: string | number): Promise<Job<T> | null>;
    // Add other methods as needed
  }
}
