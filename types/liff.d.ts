declare module '@line/liff' {
  export interface Liff {
    init(config: { liffId: string }): Promise<void>;
    isLoggedIn(): boolean;
    login(): void;
    logout(): void;
    getProfile(): Promise<{
      userId: string;
      displayName: string;
      pictureUrl?: string;
      statusMessage?: string;
    }>;
    closeWindow(): void;
    isInClient(): boolean;
  }

  const liff: Liff;
  export default liff;
}
