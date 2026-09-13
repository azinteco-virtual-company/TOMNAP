import { createApp } from '../src/server/index';

const app = createApp();

export default function handler(req: any, res: any) {
  return app(req, res);
}
