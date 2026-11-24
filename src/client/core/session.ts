// Global session state shared between scenes (filled in by Boot).

import type { InitResponse } from '@shared/types/api';
import { type ApiClient, createApi } from './api';

export const session: {
  api: ApiClient;
  init: InitResponse | null;
} = {
  api: createApi(),
  init: null,
};
