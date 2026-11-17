/** What `users.role` can hold (see lib/auth/roles). A token's copy is only ever as old as its sign-in. */
export type UserRole = 'user' | 'admin' | 'support_agent';

export interface JwtPayload {
    sub: string;
    email: string;
    role: UserRole;
    iat?: number;
    exp?: number;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
