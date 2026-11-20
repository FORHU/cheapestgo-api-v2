import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { canonicalBrandName } from '@/lib/brand';
import { pdfSafe } from '@/lib/pdfText';
import type { EvidencePack, Provenance } from '@/services/paymentEvidence.service';

// Same reason as the invoice: a financial document must name the company the customer actually
// paid, not whichever brand the server happens to be built for.
const BRAND = canonicalBrandName(process.env.BRAND_NAME ?? process.env.NEXT_PUBLIC_BRAND_NAME);

/**
 * How each fact is known, printed beside it. ADR-0003: the reader is a card network, and the
 * difference between "Stripe told us this a moment ago" and "we wrote this down ourselves" is the
 * whole value of the document.
 */
const PROVENANCE_LABEL: Record<Provenance, string> = {
    verified:          'Verified with the provider during this export',
    provider_recorded: 'Recorded from the provider at the time',
    internal:          'Our own record',
    unavailable:       'Not available',
};

const styles = StyleSheet.create({
    page:        { padding: 40, fontSize: 9.5, lineHeight: 1.45, color: '#0f172a' },
    brand:       { fontSize: 15, fontWeight: 'bold' },
    title:       { fontSize: 12, marginTop: 2, color: '#334155' },
    meta:        { fontSize: 8.5, color: '#64748b', marginTop: 6 },
    section:     { marginTop: 18 },
    sectionHead: { fontSize: 10.5, fontWeight: 'bold', marginBottom: 6, color: '#0f172a' },
    row:         { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', paddingVertical: 4 },
    cLabel:      { width: '28%', color: '#334155' },
    cValue:      { width: '38%' },
    cProv:       { width: '34%', fontSize: 8, color: '#64748b' },
    unavailable: { color: '#94a3b8' },
    caution:     { marginTop: 18, padding: 10, backgroundColor: '#fef3c7', fontSize: 8.5, lineHeight: 1.5 },
    note:        { fontSize: 8, color: '#64748b', marginTop: 1 },
    event:       { flexDirection: 'row', paddingVertical: 2.5 },
    eventAt:     { width: '24%', fontSize: 8, color: '#64748b' },
    eventSrc:    { width: '14%', fontSize: 8, color: '#64748b' },
    eventText:   { width: '62%', fontSize: 8.5 },
    foot:        { position: 'absolute', bottom: 28, left: 40, right: 40, fontSize: 7.5, color: '#94a3b8' },
});

/**
 * The evidence pack as a document.
 *
 * It states facts and where each came from. It does **not** state that a stay happened or a
 * passenger flew, because the platform is not in a position to know: a reservation cancelled in
 * the supplier's own dashboard leaves no trace here (ADR-0026). The caution block says so in the
 * document itself, so the omission cannot be read as an oversight.
 */
export function EvidencePdfDocument({ pack: raw }: { pack: EvidencePack }) {
    // Everything the font cannot draw is made visible as `?` rather than printed as a different,
    // plausible glyph (an arrow came out as an apostrophe). See lib/pdfText.
    const pack = pdfSafe(raw);
    const generated = pack.generatedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    return (
        <Document title={`Payment evidence ${pack.paymentIntentId}`} author={BRAND}>
            <Page size="A4" style={styles.page}>
                <Text style={styles.brand}>{BRAND}</Text>
                <Text style={styles.title}>Payment evidence</Text>
                <Text style={styles.meta}>
                    Payment reference {pack.paymentIntentId}{'\n'}
                    Generated {generated}
                </Text>

                <View style={styles.section}>
                    <Text style={styles.sectionHead}>Facts, and how each is known</Text>
                    {pack.items.map((item) => (
                        <View key={item.key} style={styles.row} wrap={false}>
                            <Text style={styles.cLabel}>{item.label}</Text>
                            <View style={styles.cValue}>
                                <Text style={item.provenance === 'unavailable' ? styles.unavailable : undefined}>
                                    {item.value ?? '—'}
                                </Text>
                                {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
                            </View>
                            <Text style={styles.cProv}>
                                {PROVENANCE_LABEL[item.provenance]}
                                {item.observedAt ? ` · ${item.observedAt.toISOString().slice(0, 19).replace('T', ' ')}Z` : ''}
                            </Text>
                        </View>
                    ))}
                </View>

                {pack.timeline.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionHead}>What happened, in order (UTC)</Text>
                        {pack.timeline.map((e, i) => (
                            <View key={i} style={styles.event} wrap={false}>
                                <Text style={styles.eventAt}>{e.at.toISOString().slice(0, 19).replace('T', ' ')}</Text>
                                <Text style={styles.eventSrc}>{e.source}</Text>
                                <Text style={styles.eventText}>{e.label}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Always printed, never conditional. A reader who does not find a delivery claim
                    is entitled to know that its absence is deliberate. */}
                <View style={styles.caution}>
                    <Text>
                        This document records payment and booking facts held by {BRAND}, each marked with how it
                        is known. It does not assert that a service was delivered: a payment being captured is
                        evidence that money moved, not that a stay was honoured or a passenger travelled.
                    </Text>
                    {pack.limitations.map((l, i) => (
                        <Text key={i}>{'\n'}• {l}</Text>
                    ))}
                </View>

                <Text style={styles.foot} fixed>
                    {BRAND} · payment evidence · {pack.paymentIntentId} · generated {generated}
                </Text>
            </Page>
        </Document>
    );
}
