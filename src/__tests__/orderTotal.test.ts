import { describe, it, expect } from 'vitest';
import { orderTotal } from '@/lib/flights/orderTotal';

const offer = {
    total_amount: '412.30',
    available_services: [
        { id: 'seat_12A', total_amount: '18.00' },
        { id: 'seat_12B', total_amount: '18.00' },
        { id: 'bag_23kg', total_amount: '45.50' },
    ],
};

describe('orderTotal', () => {
    it('is the offer\'s total when nothing extra was chosen', () => {
        expect(orderTotal(offer)).toBe('412.30');
        expect(orderTotal(offer, [], [])).toBe('412.30');
    });

    it('adds each chosen seat and bag at the price the offer lists', () => {
        expect(orderTotal(offer, ['seat_12A', 'seat_12B'], ['bag_23kg'])).toBe('493.80');
    });

    it('ignores a service the offer does not list, rather than inventing a price for it', () => {
        expect(orderTotal(offer, ['seat_99Z'], ['bag_nope'])).toBe('412.30');
    });

    it('treats an offer with no total as zero', () => {
        expect(orderTotal({})).toBe('0.00');
    });
});
