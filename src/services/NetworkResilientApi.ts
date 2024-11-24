import axios, { 
  AxiosInstance, 
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosRequestConfig
} from 'axios';

interface QueuedRequest {
  config: AxiosRequestConfig;
  timestamp: number;
}

export class NetworkResilientApi {
  private readonly axiosInstance: AxiosInstance;
  private readonly RETRY_DELAYS = [1000, 2000, 4000];
  private readonly OFFLINE_QUEUE_KEY = 'offline_requests_queue';
  private isOnline: boolean = navigator.onLine;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });

    window.addEventListener('online', this.handleNetworkChange.bind(this));
    window.addEventListener('offline', this.handleNetworkChange.bind(this));

    this.axiosInstance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        if (!this.isOnline) {
          await this.queueRequest(config);
          throw new Error('Device is offline, request queued');
        }
        return config;
      },
      (error: any) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: any) => {
        const config = error.config as InternalAxiosRequestConfig & { __retryCount?: number };
        
        if (!config || 
            (config.__retryCount ?? 0) >= this.RETRY_DELAYS.length ||
            error.response?.status === 401 ||
            error.response?.status === 403 ||
            error.response?.status === 404) {
          return Promise.reject(error);
        }

        config.__retryCount = (config.__retryCount || 0) + 1;
        const delay = this.RETRY_DELAYS[config.__retryCount - 1];
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.axiosInstance(config);
      }
    );
  }

  private async handleNetworkChange() {
    this.isOnline = navigator.onLine;
    if (this.isOnline) {
      await this.processOfflineQueue();
    }
  }

  private async queueRequest(config: AxiosRequestConfig) {
    const queue = await this.getOfflineQueue();
    queue.push({
      config,
      timestamp: Date.now()
    });
    await this.saveOfflineQueue(queue);
  }

  private async processOfflineQueue() {
    const queue = await this.getOfflineQueue();
    if (!queue.length) return;

    const results = await Promise.allSettled(
      queue.map((item: QueuedRequest) => this.axiosInstance(item.config))
    );

    await this.saveOfflineQueue([]);
    return results;
  }

  private async getOfflineQueue(): Promise<QueuedRequest[]> {
    const queueStr = localStorage.getItem(this.OFFLINE_QUEUE_KEY);
    return queueStr ? JSON.parse(queueStr) : [];
  }

  private async saveOfflineQueue(queue: QueuedRequest[]) {
    localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.axiosInstance(config);
      return response.data;
    } catch (error) {
      if (!this.isOnline) {
        await this.queueRequest(config);
        throw new Error('Device is offline, request queued');
      }
      throw error;
    }
  }

  async checkInOut(data: any) {
    return this.request({
      method: 'POST',
      url: '/api/check-in-out',
      data,
      timeout: 45000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}