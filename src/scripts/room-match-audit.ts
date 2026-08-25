// Audit of the room photo mapping against every seeded hotel.
//
// Three questions, in the order they matter:
//   COLLISION — do two different room descriptions land on the same group?
//               That is the Hotel Naru bug: rooms showing identical photos.
//   NO MATCH  — how many rooms get no photos at all and fall back to the hotel gallery.
//   OVERLAP   — do the groups a hotel matched to share photos anyway? Correct
//               matching still looks broken when the supplier ships the same shots.
import { prisma } from '@/lib/prisma';
import { matchEtgRoomGroup, type EtgGroup } from '@/lib/hotels/roomMatch';

async function main() {
    const rows = await prisma.$queryRaw<{ hotel_id: string; room_groups: any }[]>`
        SELECT hotel_id, room_groups FROM hotel_content
        WHERE room_groups_seeded_at IS NOT NULL
          AND jsonb_typeof(room_groups) = 'array'
          AND jsonb_array_length(room_groups) > 0
    `;

    let hotels = 0, descs = 0, matched = 0, noMatch = 0;
    let collidingHotels = 0, collidingDescs = 0;
    let pairsCompared = 0, pairsOverlapping = 0, overlapSum = 0;
    const worst: { hotel: string; a: string; b: string; group: string }[] = [];
    const overlapExamples: { hotel: string; a: string; b: string; shared: number; of: number }[] = [];

    for (const row of rows) {
        const groups = row.room_groups as EtgGroup[];
        if (!Array.isArray(groups) || groups.length < 2) continue;
        hotels++;

        // The group names stand in for TGX room descriptions: they are the same
        // vocabulary, and every one should resolve to itself or better.
        const byGroup = new Map<string, string[]>();
        for (const g of groups) {
            if (!g?.name) continue;
            descs++;
            const m = matchEtgRoomGroup(g.name, groups);
            if (!m.matchedName) { noMatch++; continue; }
            matched++;
            const list = byGroup.get(m.matchedName) ?? [];
            list.push(g.name);
            byGroup.set(m.matchedName, list);
        }

        let hotelCollided = false;
        for (const [group, names] of byGroup) {
            // ETG repeats group names, and the matcher deliberately collapses
            // those onto the first occurrence. Only *differently named* rooms
            // landing together is the defect worth counting.
            const distinct = [...new Set(names.map(n => n.toLowerCase().trim()))];
            if (distinct.length > 1) {
                hotelCollided = true;
                collidingDescs += distinct.length;
                if (worst.length < 12) {
                    worst.push({ hotel: row.hotel_id, a: distinct[0], b: distinct[1], group });
                }
            }
        }
        if (hotelCollided) collidingHotels++;

        // Photo overlap between groups that actually carry photos.
        const withPhotos = groups.filter(g => (g.images?.length ?? 0) > 0);
        for (let i = 0; i < withPhotos.length; i++) {
            for (let j = i + 1; j < withPhotos.length; j++) {
                const a = new Set(withPhotos[i].images);
                const b = withPhotos[j].images;
                const shared = b.filter(u => a.has(u)).length;
                pairsCompared++;
                if (shared > 0) {
                    pairsOverlapping++;
                    overlapSum += shared / Math.max(a.size, b.length);
                    if (shared >= Math.max(a.size, b.length) * 0.5 && overlapExamples.length < 8) {
                        overlapExamples.push({
                            hotel: row.hotel_id,
                            a: withPhotos[i].name, b: withPhotos[j].name,
                            shared, of: Math.max(a.size, b.length),
                        });
                    }
                }
            }
        }
    }

    const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';

    console.log(`\nhotels audited (>=2 groups): ${hotels}`);
    console.log(`room descriptions:           ${descs}`);
    console.log(`  matched to a group:        ${matched}  (${pct(matched, descs)})`);
    console.log(`  no match, hotel gallery:   ${noMatch}  (${pct(noMatch, descs)})`);

    console.log(`\nCOLLISIONS — different rooms landing on the same group`);
    console.log(`  hotels affected:           ${collidingHotels}  (${pct(collidingHotels, hotels)})`);
    console.log(`  descriptions involved:     ${collidingDescs}  (${pct(collidingDescs, descs)})`);
    for (const w of worst) {
        console.log(`    ${w.hotel}: "${w.a.slice(0, 40)}" + "${w.b.slice(0, 40)}" -> "${w.group.slice(0, 40)}"`);
    }

    console.log(`\nPHOTO OVERLAP between groups (supplier-side, not a matching fault)`);
    console.log(`  group pairs compared:      ${pairsCompared}`);
    console.log(`  pairs sharing any photo:   ${pairsOverlapping}  (${pct(pairsOverlapping, pairsCompared)})`);
    console.log(`  mean overlap where shared: ${pairsOverlapping ? (100 * overlapSum / pairsOverlapping).toFixed(1) + '%' : 'n/a'}`);
    for (const e of overlapExamples) {
        console.log(`    ${e.hotel}: "${e.a.slice(0, 34)}" / "${e.b.slice(0, 34)}" share ${e.shared}/${e.of}`);
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
