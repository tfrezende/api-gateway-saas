import { JwtPayload } from '../auth/jwt.service';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      requestId?: string;
      route?: { path?: string };
    }
  }
}
