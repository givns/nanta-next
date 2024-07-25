declare module '@/services/LineService' {
  export class LineService {
    sendNotification(userId: string, message: string): Promise<void>;
    sendConfirmationRequest(
      userId: string,
      action: 'check-in' | 'check-out',
    ): Promise<void>;
    sendFlexMessage(
      lineUserId: string,
      altText: string,
      flexContent: any,
    ): Promise<void>;
    sendQuickReply(
      userId: string,
      message: string,
      options: string[],
    ): Promise<void>;
  }
}
