// Request/response shapes shared by the client and the Devvit server.

export type ApiMode = 'mock' | 'reddit';

export interface InitResponse {
  /** Reddit username, or null when signed out. */
  userName: string | null;
  /** Post id the game is running in (null in mock mode). */
  postId: string | null;
}
