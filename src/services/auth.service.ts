import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';
import { AuthRepository } from '@/repositories/auth.repository';
import { JwtPayload } from '@/types';
import { checkName } from '@/lib/users/names';

export class AuthService {
    private repo = new AuthRepository();

    async register(data: { email: string; password: string; first_name?: string; last_name?: string }) {
        const existing = await this.repo.findByEmail(data.email);
        if (existing) throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');

        // Names are capped at the door, not only in the form. v1 learned this the expensive
        // way: a profile reached the database with a 13,708-character first name (QA BG-9),
        // and a name that long renders as a wall of text everywhere the account appears.
        const names: { first_name?: string; last_name?: string } = {};
        for (const [key, label, value] of [
            ['first_name', 'First name', data.first_name],
            ['last_name',  'Last name',  data.last_name],
        ] as const) {
            if (value === undefined) continue;
            const checked = checkName(value, label);
            if (!checked.ok) throw new AppError(400, checked.error!, 'VALIDATION_ERROR');
            names[key] = checked.value;
        }

        const password_hash = await bcrypt.hash(data.password, 12);
        const user = await this.repo.create({ email: data.email, password_hash, ...names });
        return { user: this.sanitize(user), ...this.generateTokens(user) };
    }

    async login(email: string, password: string) {
        const user = await this.repo.findByEmail(email);
        if (!user || !user.password_hash) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');

        if (user.banned_at) throw new AppError(403, 'Account suspended', 'ACCOUNT_BANNED');

        return { user: this.sanitize(user), ...this.generateTokens(user) };
    }

    async refresh(token: string) {
        if (!token) throw new AppError(401, 'No refresh token', 'AUTH_REQUIRED');
        try {
            const payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as JwtPayload;
            const user = await this.repo.findById(payload.sub);
            if (!user) throw new AppError(401, 'User not found', 'AUTH_INVALID');
            return this.generateTokens(user);
        } catch {
            throw new AppError(401, 'Invalid refresh token', 'AUTH_INVALID');
        }
    }

    async getUser(id: string) {
        const user = await this.repo.findById(id);
        if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
        return this.sanitize(user);
    }

    private generateTokens(user: { id: string; email: string; role: string }) {
        const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
            sub:   user.id,
            email: user.email,
            role:  user.role as 'user' | 'admin',
        };
        return {
            accessToken:  jwt.sign(payload, config.JWT_SECRET,         { expiresIn: config.JWT_EXPIRES_IN as any }),
            refreshToken: jwt.sign(payload, config.JWT_REFRESH_SECRET,  { expiresIn: config.JWT_REFRESH_EXPIRES_IN as any }),
        };
    }

    private sanitize(user: any) {
        const { password_hash, ...safe } = user;
        return safe;
    }
}
