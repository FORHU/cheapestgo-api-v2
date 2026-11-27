import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StaffInvitationsService } from '@/services/staffInvitations.service';
import { resolveReturnOrigin, originOfRequest } from '@/lib/auth/returnOrigin';
import {
    BASE_COOKIE_OPTIONS, SESSION_COOKIE, SESSION_MAX_AGE_MS,
} from '@/lib/auth/cookie';

const inviteSchema = z.object({
    email: z.string().trim().toLowerCase().email(),
    role:  z.string(),
});

const acceptSchema = z.object({
    token:      z.string().min(1),
    password:   z.string(),
    first_name: z.string().optional(),
    last_name:  z.string().optional(),
});

const COOKIE_OPTIONS = { ...BASE_COOKIE_OPTIONS, sameSite: 'strict' as const };

export class StaffInvitationsController {
    private service = new StaffInvitationsService();

    invite = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { email, role } = inviteSchema.parse(req.body);
            const actor = req.user!;
            // The console that asked for this invite, not a baked host: the link has to
            // come back to whichever staff host is actually deployed. Same mechanism the
            // password reset email uses for the same reason.
            const acceptUrlBase = resolveReturnOrigin(req.get('origin') ?? originOfRequest(req.headers));
            const invitation = await this.service.invite({
                actorId: actor.sub, actorEmail: actor.email, email, role, acceptUrlBase,
            });
            res.status(201).json({ invitation });
        } catch (err) { next(err); }
    };

    list = async (_req: Request, res: Response, next: NextFunction) => {
        try {
            const invitations = await this.service.list();
            res.json({ invitations });
        } catch (err) { next(err); }
    };

    revoke = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const actor = req.user!;
            const invitation = await this.service.revoke({
                actorId: actor.sub, actorEmail: actor.email, id: req.params.id,
            });
            res.json({ invitation });
        } catch (err) { next(err); }
    };

    /**
     * Unauthenticated: accepting an invitation is how the account comes to exist, so there
     * is no session to require yet. Signs the new staff member straight in, the same two
     * cookies `register` and `login` set, so the console has one shape to read whichever
     * way somebody arrived.
     */
    accept = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = acceptSchema.parse(req.body);
            const result = await this.service.accept({
                token: data.token, password: data.password,
                firstName: data.first_name, lastName: data.last_name,
            });
            res.cookie(SESSION_COOKIE, result.accessToken, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
            res.cookie('refresh_token', result.refreshToken, { ...COOKIE_OPTIONS, maxAge: 604800_000 });
            res.status(201).json({ user: result.user });
        } catch (err) { next(err); }
    };
}
