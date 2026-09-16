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

    updateProfile = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { firstName, lastName } = req.body as { firstName?: string; lastName?: string };
            const user = await this.service.updateProfile(req.user!.sub, firstName, lastName);
            res.json({ success: true, user });
        } catch (err) { next(err); }
    };
}

export const usersController = new UsersController();
