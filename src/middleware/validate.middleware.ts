import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction) => {
        schema.parse({ body: req.body, query: req.query, params: req.params });
        next();
    };
}
