import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { AppError } from '@/middleware/error.middleware';
import { AuthRepository } from '@/repositories/auth.repository';
import { JwtPayload } from '@/types';

export class AuthService {
    private repo = new AuthRepository();

    async register(data: { email: string; password: string; first_name?: string; last_name?: string }) {
        const existing = await this.repo.findByEmail(data.email);
        if (existing) throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');

        const password_hash = await bcrypt.hash(data.password, 12);
        const user = await this.repo.create({ ...data, password_hash });
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
