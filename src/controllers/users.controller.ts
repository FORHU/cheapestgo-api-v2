import { Request, Response, NextFunction } from 'express';
import { usersService, UsersService } from '@/services/users.service';

/**
 * The account holder acting on their own account. Every handler here reads the caller from the
 * verified token — never from the body — so one account can never edit another.
 */
export class UsersController {
    private service: UsersService = usersService;

    getPreferences = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const preferences = await this.service.getPreferences(req.user!.sub);
            res.json({ preferences });
        } catch (err) { next(err); }
    };

    savePreferences = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const preferences = await this.service.savePreferences(req.user!.sub, req.body);
            res.json({ preferences });
        } catch (err) { next(err); }
    };

    changePassword = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { currentPassword, newPassword } = req.body as {
                currentPassword?: string;
                newPassword?: string;
            };
            await this.service.changePassword(req.user!.sub, currentPassword, newPassword);
            res.json({ success: true });
        } catch (err) { next(err); }
    };

    getDetails = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const details = await this.service.getDetails(req.user!.sub);
            res.json({ details });
        } catch (err) { next(err); }
    };

    updateDetails = async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Both spellings accepted on the way in, as the auth routes do: the mobile client
            // sends camelCase and the rest of this API answers in snake_case, and rejecting a
            // traveller's details over which one they picked helps nobody.
            const body = (req.body ?? {}) as Record<string, unknown>;
            const pick = (camel: string, snake: string) =>
                (body[camel] ?? body[snake]) as string | undefined;

            const details = await this.service.updateDetails(req.user!.sub, {
                birthDate:   pick('birthDate', 'birth_date'),
                phone:       pick('phone', 'phone'),
                nationality: pick('nationality', 'nationality'),
            });
            res.json({ success: true, details });
        } catch (err) { next(err); }
    };

    updateProfile = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { firstName, lastName } = req.body as { firstName?: string; lastName?: string };
            const user = await this.service.updateProfile(req.user!.sub, firstName, lastName);
            res.json({ success: true, user });
        } catch (err) { next(err); }
    };
}

export const usersController = new UsersController();
