import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

interface InvoicePdfProps {
    invoiceNumber: string;
    issuedDate: string;
    billedTo: { name: string; email: string };
    isHotel: boolean;
    hotelDetails: {
        propertyName: string;
        roomName: string;
        dates: string;
        nights: number;
        guests: string;
    } | null;
    flightDetails: {
        segments: { airline: string; route: string; date: string }[];
        passengers: { name: string; type: string; ticketNumber: string }[];
    } | null;
    bookingRef: string;
    bookingType: string;
    provider: string;
    formattedTotal: string;
}

const colors = {
    indigo:     '#4f46e5',
    darkText:   '#1e293b',
    mediumText: '#475569',
    lightText:  '#94a3b8',
    border:     '#e2e8f0',
    bgLight:    '#f8fafc',
    emerald:    '#059669',
    white:      '#ffffff',
};

const s = StyleSheet.create({
    page:          { fontFamily: 'Helvetica', backgroundColor: colors.white, paddingHorizontal: 48, paddingVertical: 40, fontSize: 10, color: colors.mediumText },
    headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
    brand:         { fontSize: 22, fontFamily: 'Helvetica-Bold', color: colors.indigo, letterSpacing: -0.5 },
    tagline:       { fontSize: 8, color: colors.lightText, marginTop: 2 },
    receiptTitle:  { fontSize: 16, fontFamily: 'Helvetica-Bold', color: colors.darkText, textAlign: 'right' as const },
    receiptMeta:   { fontSize: 8, color: colors.lightText, textAlign: 'right' as const, marginTop: 2 },
    section:       { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    sectionLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.lightText, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: 6 },
    nameText:      { fontSize: 11, fontFamily: 'Helvetica-Bold', color: colors.darkText },
    emailText:     { fontSize: 9, color: colors.mediumText, marginTop: 2 },
    tableHeaderRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginBottom: 4 },
    tableHeaderCell: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.lightText, textTransform: 'uppercase' as const, letterSpacing: 1 },
    tableRow:        { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9' },
    tableCell:       { fontSize: 9, color: colors.mediumText },
    tableCellBold:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: colors.darkText },
    hotelPropName:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: colors.darkText },
    hotelSub:        { fontSize: 9, color: colors.mediumText, marginTop: 2 },
    passengerRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    passengerName:   { fontSize: 9, color: colors.mediumText },
    passengerType:   { fontSize: 8, color: colors.lightText },
    ticketLabel:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.emerald },
    refRow:   { flexDirection: 'row', gap: 32, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    refBlock: {},
    refLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: colors.lightText, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
    refValue: { fontSize: 9, color: colors.darkText },
    totalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 },
    totalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: colors.mediumText },
    totalValue: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: colors.darkText },
    paidStamp: { position: 'absolute', top: 140, right: 48, borderWidth: 2, borderColor: '#10b981', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 4, transform: 'rotate(-12deg)' },
    paidText:  { color: '#10b981', fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
    footer:     { marginTop: 16, backgroundColor: colors.bgLight, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 20 },
    footerText: { fontSize: 8, color: colors.lightText, textAlign: 'center' as const },
    footerEmail: { fontSize: 8, color: colors.indigo },
});

export function InvoicePdfDocument(props: InvoicePdfProps) {
    const { invoiceNumber, issuedDate, billedTo, hotelDetails, flightDetails, bookingRef, bookingType, provider, formattedTotal } = props;
    const showHotel  = !!hotelDetails;
    const showFlight = !!flightDetails;

    return (
        <Document title={`CheapestGo Receipt ${invoiceNumber}`} author="CheapestGo">
            <Page size="A4" style={s.page}>

                <View style={s.headerRow}>
                    <View>
                        <Text style={s.brand}>CheapestGo</Text>
                        <Text style={s.tagline}>Your Travel Partner</Text>
                    </View>
                    <View>
                        <Text style={s.receiptTitle}>OFFICIAL RECEIPT</Text>
                        <Text style={s.receiptMeta}>{invoiceNumber}</Text>
                        <Text style={s.receiptMeta}>Issued: {issuedDate}</Text>
                    </View>
                </View>

                <View style={s.paidStamp}>
                    <Text style={s.paidText}>PAID</Text>
                </View>

                <View style={s.section}>
                    <Text style={s.sectionLabel}>Billed to</Text>
                    <Text style={s.nameText}>{billedTo.name || 'Guest'}</Text>
                    {billedTo.email ? <Text style={s.emailText}>{billedTo.email}</Text> : null}
                </View>

                {showHotel && hotelDetails && (
                    <View style={s.section}>
                        <Text style={s.sectionLabel}>Hotel Accommodation</Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.hotelPropName}>{hotelDetails.propertyName}</Text>
                                {hotelDetails.roomName ? <Text style={s.hotelSub}>{hotelDetails.roomName}</Text> : null}
                                <Text style={s.hotelSub}>{hotelDetails.dates} · {hotelDetails.nights} night{hotelDetails.nights !== 1 ? 's' : ''}</Text>
                                <Text style={s.hotelSub}>{hotelDetails.guests}</Text>
                            </View>
                            {!showFlight && <Text style={[s.tableCellBold, { fontSize: 11 }]}>{formattedTotal}</Text>}
                        </View>
                    </View>
                )}

                {showFlight && flightDetails && (
                    <View style={s.section}>
                        <Text style={s.sectionLabel}>Flight Itinerary</Text>
                        <View style={s.tableHeaderRow}>
                            <Text style={[s.tableHeaderCell, { width: '35%' }]}>Flight</Text>
                            <Text style={[s.tableHeaderCell, { width: '35%' }]}>Route</Text>
                            <Text style={[s.tableHeaderCell, { width: '30%' }]}>Date</Text>
                        </View>
                        {flightDetails.segments.map((seg, i) => (
                            <View key={i} style={s.tableRow}>
                                <Text style={[s.tableCellBold, { width: '35%' }]}>{seg.airline}</Text>
                                <Text style={[s.tableCell, { width: '35%' }]}>{seg.route}</Text>
                                <Text style={[s.tableCell, { width: '30%' }]}>{seg.date}</Text>
                            </View>
                        ))}
                        {flightDetails.passengers.length > 0 && (
                            <View style={{ marginTop: 14 }}>
                                <Text style={s.sectionLabel}>Passengers</Text>
                                {flightDetails.passengers.map((p, i) => (
                                    <View key={i} style={s.passengerRow}>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            <Text style={s.passengerName}>{p.name}</Text>
                                            <Text style={s.passengerType}>({p.type})</Text>
                                        </View>
                                        {p.ticketNumber ? <Text style={s.ticketLabel}>E-TKT: {p.ticketNumber}</Text> : null}
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                <View style={s.refRow}>
                    <View style={s.refBlock}><Text style={s.refLabel}>Booking Ref</Text><Text style={s.refValue}>{bookingRef}</Text></View>
                    <View style={s.refBlock}><Text style={s.refLabel}>Type</Text><Text style={s.refValue}>{bookingType}</Text></View>
                    <View style={s.refBlock}><Text style={s.refLabel}>Provider</Text><Text style={s.refValue}>{provider}</Text></View>
                    <View style={s.refBlock}><Text style={s.refLabel}>Payment</Text><Text style={s.refValue}>Stripe (Card)</Text></View>
                </View>

                <View style={s.totalRow}>
                    <Text style={s.totalLabel}>Total Paid</Text>
                    <Text style={s.totalValue}>{formattedTotal}</Text>
                </View>

                <View style={s.footer}>
                    <Text style={s.footerText}>
                        Thank you for booking with CheapestGo. For support, contact{' '}
                        <Text style={s.footerEmail}>crm@myfarebox.com</Text>
                    </Text>
                    <Text style={[s.footerText, { marginTop: 4, opacity: 0.6 }]}>
                        CheapestGo is a trading name of CheapestGo Travel Services.
                    </Text>
                </View>

            </Page>
        </Document>
    );
}
