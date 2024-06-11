declare module '@line/liff' {
  export interface Profile {
    userId: string;
    displayName: string;
    pictureUrl: string;
    statusMessage: string;
  }

  export interface InitOptions {
    liffId: string;
  }

  export function init(options: InitOptions): Promise<void>;
  export function isLoggedIn(): boolean;
  export function login(): void;
  export function getProfile(): Promise<Profile>;
  export function closeWindow(): void;
}
