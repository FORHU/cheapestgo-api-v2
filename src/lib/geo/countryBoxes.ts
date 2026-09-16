/**
 * Country bounding boxes, and the test that decides whether a hotel returned for a search
 * is confirmed to be somewhere else — the OTV destination code for "Paris" that also
 * returns Paris, Texas.
 *
 * Read the boxes as rough outlines, not borders. v1's comment promised a "±2° buffer" that
 * was never there, and an audit of live content on 2026-09-14 found many drawn at the
 * border or leaving out islands: as the only test they dropped real hotels — 170 of
 * Uruguay's 313 (Montevideo, Punta del Este), all of Galápagos, Montego Bay, Dakar, Penghu
 * and Kinmen. The buffer is applied where the boxes are used, and a hotel whose stored
 * country matches is never dropped by a box.
 */
import { hotelCountry, hasLandBorder } from '@/lib/geo/territories';

const COUNTRY_BBOX: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
    // ── Asia-Pacific ──────────────────────────────────────────────────────────
    TH: { minLat: 3.6,   maxLat: 22.5,  minLng: 95.3,   maxLng: 107.7  },
    ID: { minLat: -13.0, maxLat: 7.9,   minLng: 93.0,   maxLng: 143.0  },
    JP: { minLat: 22.0,  maxLat: 47.5,  minLng: 120.9,  maxLng: 147.8  },
    PH: { minLat: 4.6,   maxLat: 21.1,  minLng: 116.9,  maxLng: 128.0  },
    SG: { minLat: 1.1,   maxLat: 1.6,   minLng: 103.6,  maxLng: 104.1  },
    MY: { minLat: -0.2,  maxLat: 8.5,   minLng: 99.6,   maxLng: 119.5  },
    VN: { minLat: 8.2,   maxLat: 23.4,  minLng: 102.1,  maxLng: 109.5  },
    KH: { minLat: 9.4,   maxLat: 14.7,  minLng: 102.3,  maxLng: 107.6  },
    LA: { minLat: 13.9,  maxLat: 22.5,  minLng: 100.1,  maxLng: 107.7  },
    MM: { minLat: 9.8,   maxLat: 28.5,  minLng: 92.2,   maxLng: 101.2  },
    BN: { minLat: 4.0,   maxLat: 5.1,   minLng: 114.1,  maxLng: 115.4  },
    TL: { minLat: -9.5,  maxLat: -8.1,  minLng: 124.0,  maxLng: 127.3  },
    IN: { minLat: 6.7,   maxLat: 37.1,  minLng: 68.2,   maxLng: 97.4   },
    PK: { minLat: 23.6,  maxLat: 37.1,  minLng: 60.9,   maxLng: 77.1   },
    BD: { minLat: 20.7,  maxLat: 26.6,  minLng: 88.0,   maxLng: 92.7   },
    LK: { minLat: 5.9,   maxLat: 9.8,   minLng: 79.7,   maxLng: 81.9   },
    NP: { minLat: 26.3,  maxLat: 30.4,  minLng: 80.1,   maxLng: 88.2   },
    BT: { minLat: 26.7,  maxLat: 28.3,  minLng: 88.8,   maxLng: 92.1   },
    MV: { minLat: -1.0,  maxLat: 7.1,   minLng: 72.7,   maxLng: 73.8   },
    AF: { minLat: 29.4,  maxLat: 38.5,  minLng: 60.5,   maxLng: 74.9   },
    CN: { minLat: 18.2,  maxLat: 53.6,  minLng: 73.5,   maxLng: 134.8  },
    HK: { minLat: 22.1,  maxLat: 22.6,  minLng: 113.8,  maxLng: 114.5  },
    MO: { minLat: 22.1,  maxLat: 22.2,  minLng: 113.5,  maxLng: 113.6  },
    TW: { minLat: 21.9,  maxLat: 25.3,  minLng: 119.9,  maxLng: 122.1  },
    KR: { minLat: 33.1,  maxLat: 38.6,  minLng: 125.1,  maxLng: 130.9  },
    KP: { minLat: 37.7,  maxLat: 42.5,  minLng: 124.3,  maxLng: 130.7  },
    MN: { minLat: 41.6,  maxLat: 52.1,  minLng: 87.8,   maxLng: 119.9  },
    AU: { minLat: -43.7, maxLat: -10.7, minLng: 113.2,  maxLng: 153.6  },
    NZ: { minLat: -47.3, maxLat: -34.4, minLng: 166.4,  maxLng: 178.6  },
    PG: { minLat: -11.7, maxLat: -1.3,  minLng: 141.0,  maxLng: 155.7  },
    SB: { minLat: -11.9, maxLat: -5.0,  minLng: 155.5,  maxLng: 166.9  },
    VU: { minLat: -20.3, maxLat: -13.1, minLng: 166.5,  maxLng: 170.2  },
    FJ: { minLat: -20.7, maxLat: -12.5, minLng: 177.0,  maxLng: 180.0  },
    WS: { minLat: -14.1, maxLat: -13.4, minLng: -172.8, maxLng: -171.4 },
    TO: { minLat: -22.4, maxLat: -15.6, minLng: -175.4, maxLng: -173.7 },
    FM: { minLat: 1.0,   maxLat: 10.1,  minLng: 138.0,  maxLng: 163.1  },
    PW: { minLat: 2.8,   maxLat: 8.1,   minLng: 131.1,  maxLng: 134.7  },
    MH: { minLat: 4.6,   maxLat: 14.7,  minLng: 160.8,  maxLng: 172.0  },
    // ── Middle East ───────────────────────────────────────────────────────────
    AE: { minLat: 22.6,  maxLat: 26.1,  minLng: 51.6,   maxLng: 56.4   },
    SA: { minLat: 16.4,  maxLat: 32.2,  minLng: 36.5,   maxLng: 55.7   },
    QA: { minLat: 24.5,  maxLat: 26.2,  minLng: 50.7,   maxLng: 51.7   },
    BH: { minLat: 25.8,  maxLat: 26.4,  minLng: 50.3,   maxLng: 50.8   },
    KW: { minLat: 28.5,  maxLat: 30.1,  minLng: 46.5,   maxLng: 48.4   },
    OM: { minLat: 16.6,  maxLat: 26.4,  minLng: 51.9,   maxLng: 59.9   },
    YE: { minLat: 12.1,  maxLat: 19.0,  minLng: 42.6,   maxLng: 54.7   },
    JO: { minLat: 29.2,  maxLat: 33.4,  minLng: 34.9,   maxLng: 39.3   },
    IL: { minLat: 29.5,  maxLat: 33.3,  minLng: 34.3,   maxLng: 35.9   },
    PS: { minLat: 31.2,  maxLat: 32.6,  minLng: 34.2,   maxLng: 35.6   },
    LB: { minLat: 33.1,  maxLat: 34.7,  minLng: 35.1,   maxLng: 36.6   },
    SY: { minLat: 32.3,  maxLat: 37.3,  minLng: 35.7,   maxLng: 42.4   },
    IQ: { minLat: 29.1,  maxLat: 37.4,  minLng: 38.8,   maxLng: 48.6   },
    IR: { minLat: 25.1,  maxLat: 39.8,  minLng: 44.0,   maxLng: 63.3   },
    // ── Central Asia ─────────────────────────────────────────────────────────
    KZ: { minLat: 40.6,  maxLat: 55.4,  minLng: 50.3,   maxLng: 87.4   },
    UZ: { minLat: 37.2,  maxLat: 45.6,  minLng: 56.0,   maxLng: 73.2   },
    TM: { minLat: 35.1,  maxLat: 42.8,  minLng: 52.5,   maxLng: 66.7   },
    TJ: { minLat: 36.7,  maxLat: 41.0,  minLng: 67.4,   maxLng: 75.2   },
    KG: { minLat: 39.2,  maxLat: 43.2,  minLng: 69.3,   maxLng: 80.3   },
    // ── Caucasus ─────────────────────────────────────────────────────────────
    GE: { minLat: 41.0,  maxLat: 43.6,  minLng: 40.0,   maxLng: 46.7   },
    AM: { minLat: 38.8,  maxLat: 41.3,  minLng: 43.4,   maxLng: 46.6   },
    AZ: { minLat: 38.4,  maxLat: 41.9,  minLng: 44.8,   maxLng: 50.4   },
    // ── Eastern Europe ────────────────────────────────────────────────────────
    RU: { minLat: 41.2,  maxLat: 81.9,  minLng: 19.6,   maxLng: 180.0  },
    UA: { minLat: 44.4,  maxLat: 52.4,  minLng: 22.1,   maxLng: 40.2   },
    BY: { minLat: 51.3,  maxLat: 56.2,  minLng: 23.2,   maxLng: 32.8   },
    MD: { minLat: 45.5,  maxLat: 48.5,  minLng: 26.6,   maxLng: 30.2   },
    RO: { minLat: 43.6,  maxLat: 48.3,  minLng: 20.3,   maxLng: 29.7   },
    BG: { minLat: 41.2,  maxLat: 44.2,  minLng: 22.4,   maxLng: 28.6   },
    RS: { minLat: 42.2,  maxLat: 46.2,  minLng: 18.8,   maxLng: 23.0   },
    XK: { minLat: 41.9,  maxLat: 43.3,  minLng: 20.0,   maxLng: 21.8   },
    BA: { minLat: 42.6,  maxLat: 45.3,  minLng: 15.7,   maxLng: 19.6   },
    ME: { minLat: 41.9,  maxLat: 43.6,  minLng: 18.5,   maxLng: 20.4   },
    HR: { minLat: 42.4,  maxLat: 46.6,  minLng: 13.5,   maxLng: 19.4   },
    SI: { minLat: 45.4,  maxLat: 46.9,  minLng: 13.4,   maxLng: 16.6   },
    MK: { minLat: 40.9,  maxLat: 42.4,  minLng: 20.5,   maxLng: 23.0   },
    AL: { minLat: 39.6,  maxLat: 42.7,  minLng: 19.3,   maxLng: 21.1   },
    SK: { minLat: 47.7,  maxLat: 49.6,  minLng: 16.8,   maxLng: 22.6   },
    PL: { minLat: 49.0,  maxLat: 54.8,  minLng: 14.1,   maxLng: 24.1   },
    CZ: { minLat: 48.5,  maxLat: 51.1,  minLng: 12.1,   maxLng: 18.9   },
    HU: { minLat: 45.7,  maxLat: 48.6,  minLng: 16.1,   maxLng: 22.9   },
    EE: { minLat: 57.5,  maxLat: 59.7,  minLng: 21.8,   maxLng: 28.2   },
    LV: { minLat: 55.7,  maxLat: 58.1,  minLng: 21.0,   maxLng: 28.2   },
    LT: { minLat: 53.9,  maxLat: 56.5,  minLng: 20.9,   maxLng: 26.8   },
    // ── Northern & Western Europe ─────────────────────────────────────────────
    GB: { minLat: 49.9,  maxLat: 60.8,  minLng: -8.6,   maxLng: 1.8    },
    IE: { minLat: 51.4,  maxLat: 55.4,  minLng: -10.5,  maxLng: -6.0   },
    NO: { minLat: 57.9,  maxLat: 71.2,  minLng: 4.5,    maxLng: 31.1   },
    SE: { minLat: 55.3,  maxLat: 69.1,  minLng: 10.6,   maxLng: 24.2   },
    DK: { minLat: 54.6,  maxLat: 57.8,  minLng: 8.1,    maxLng: 15.2   },
    FI: { minLat: 59.8,  maxLat: 70.1,  minLng: 19.1,   maxLng: 31.6   },
    IS: { minLat: 63.3,  maxLat: 66.6,  minLng: -24.5,  maxLng: -13.5  },
    DE: { minLat: 47.3,  maxLat: 55.1,  minLng: 5.9,    maxLng: 15.0   },
    NL: { minLat: 50.7,  maxLat: 53.6,  minLng: 3.3,    maxLng: 7.3    },
    BE: { minLat: 49.5,  maxLat: 51.5,  minLng: 2.5,    maxLng: 6.4    },
    LU: { minLat: 49.4,  maxLat: 50.2,  minLng: 5.7,    maxLng: 6.5    },
    FR: { minLat: 41.3,  maxLat: 51.1,  minLng: -5.2,   maxLng: 9.6    },
    CH: { minLat: 45.8,  maxLat: 47.8,  minLng: 5.9,    maxLng: 10.5   },
    AT: { minLat: 46.4,  maxLat: 49.0,  minLng: 9.5,    maxLng: 17.2   },
    LI: { minLat: 47.0,  maxLat: 47.3,  minLng: 9.5,    maxLng: 9.6    },
    // ── Southern Europe ───────────────────────────────────────────────────────
    ES: { minLat: 27.6,  maxLat: 43.8,  minLng: -18.2,  maxLng: 4.3    },
    PT: { minLat: 29.8,  maxLat: 42.2,  minLng: -31.3,  maxLng: -6.2   },
    IT: { minLat: 36.6,  maxLat: 47.1,  minLng: 6.7,    maxLng: 18.5   },
    MT: { minLat: 35.8,  maxLat: 36.1,  minLng: 14.2,   maxLng: 14.6   },
    GR: { minLat: 34.8,  maxLat: 41.8,  minLng: 19.4,   maxLng: 29.6   },
    CY: { minLat: 34.6,  maxLat: 35.7,  minLng: 32.3,   maxLng: 34.6   },
    TR: { minLat: 35.8,  maxLat: 42.1,  minLng: 25.7,   maxLng: 44.8   },
    AD: { minLat: 42.4,  maxLat: 42.7,  minLng: 1.4,    maxLng: 1.8    },
    SM: { minLat: 43.9,  maxLat: 44.0,  minLng: 12.4,   maxLng: 12.5   },
    // ── North Africa ──────────────────────────────────────────────────────────
    MA: { minLat: 27.7,  maxLat: 35.9,  minLng: -13.2,  maxLng: -1.0   },
    DZ: { minLat: 18.9,  maxLat: 37.1,  minLng: -8.7,   maxLng: 12.0   },
    TN: { minLat: 30.2,  maxLat: 37.5,  minLng: 7.5,    maxLng: 11.6   },
    LY: { minLat: 19.5,  maxLat: 33.2,  minLng: 9.4,    maxLng: 25.2   },
    EG: { minLat: 22.0,  maxLat: 31.7,  minLng: 24.7,   maxLng: 37.0   },
    SD: { minLat: 9.3,   maxLat: 22.2,  minLng: 21.9,   maxLng: 38.6   },
    // ── West Africa ───────────────────────────────────────────────────────────
    MR: { minLat: 14.7,  maxLat: 27.3,  minLng: -17.1,  maxLng: -4.8   },
    ML: { minLat: 10.1,  maxLat: 25.0,  minLng: -12.2,  maxLng: 4.3    },
    SN: { minLat: 12.3,  maxLat: 16.7,  minLng: -17.5,  maxLng: -11.4  },
    GM: { minLat: 13.1,  maxLat: 13.8,  minLng: -16.8,  maxLng: -13.8  },
    GW: { minLat: 11.0,  maxLat: 12.7,  minLng: -16.7,  maxLng: -13.6  },
    GN: { minLat: 7.2,   maxLat: 12.7,  minLng: -15.1,  maxLng: -7.6   },
    SL: { minLat: 6.9,   maxLat: 10.0,  minLng: -13.3,  maxLng: -10.3  },
    LR: { minLat: 4.4,   maxLat: 8.6,   minLng: -11.5,  maxLng: -7.4   },
    CI: { minLat: 4.3,   maxLat: 10.7,  minLng: -8.6,   maxLng: -2.5   },
    GH: { minLat: 4.7,   maxLat: 11.2,  minLng: -3.3,   maxLng: 1.2    },
    BF: { minLat: 9.4,   maxLat: 15.1,  minLng: -5.5,   maxLng: 2.4    },
    TG: { minLat: 6.1,   maxLat: 11.1,  minLng: -0.1,   maxLng: 1.8    },
    BJ: { minLat: 6.2,   maxLat: 12.4,  minLng: 0.8,    maxLng: 3.9    },
    NE: { minLat: 11.7,  maxLat: 23.5,  minLng: 0.2,    maxLng: 16.0   },
    NG: { minLat: 4.3,   maxLat: 13.9,  minLng: 2.7,    maxLng: 14.7   },
    CV: { minLat: 14.8,  maxLat: 17.2,  minLng: -25.4,  maxLng: -22.7  },
    // ── Central Africa ────────────────────────────────────────────────────────
    CM: { minLat: 1.7,   maxLat: 13.1,  minLng: 8.5,    maxLng: 16.2   },
    TD: { minLat: 7.4,   maxLat: 23.5,  minLng: 13.5,   maxLng: 24.0   },
    CF: { minLat: 2.2,   maxLat: 11.0,  minLng: 14.4,   maxLng: 27.5   },
    GQ: { minLat: -1.5,  maxLat: 3.8,   minLng: 5.6,    maxLng: 11.3   },
    GA: { minLat: -3.9,  maxLat: 2.3,   minLng: 8.7,    maxLng: 14.5   },
    CG: { minLat: -5.1,  maxLat: 3.7,   minLng: 11.2,   maxLng: 18.6   },
    CD: { minLat: -13.5, maxLat: 5.3,   minLng: 12.2,   maxLng: 31.3   },
    ST: { minLat: -0.1,  maxLat: 1.7,   minLng: 6.5,    maxLng: 7.5    },
    // ── East Africa ───────────────────────────────────────────────────────────
    ET: { minLat: 3.4,   maxLat: 15.0,  minLng: 33.0,   maxLng: 47.9   },
    ER: { minLat: 12.4,  maxLat: 18.0,  minLng: 36.4,   maxLng: 43.1   },
    DJ: { minLat: 10.9,  maxLat: 12.7,  minLng: 41.8,   maxLng: 43.4   },
    SO: { minLat: -1.7,  maxLat: 12.0,  minLng: 40.9,   maxLng: 51.4   },
    KE: { minLat: -4.7,  maxLat: 4.6,   minLng: 33.9,   maxLng: 41.9   },
    UG: { minLat: -1.5,  maxLat: 4.2,   minLng: 29.6,   maxLng: 35.0   },
    TZ: { minLat: -11.7, maxLat: -1.0,  minLng: 29.3,   maxLng: 40.4   },
    RW: { minLat: -2.8,  maxLat: -1.1,  minLng: 29.0,   maxLng: 30.9   },
    BI: { minLat: -4.5,  maxLat: -2.3,  minLng: 29.0,   maxLng: 30.9   },
    SS: { minLat: 3.5,   maxLat: 12.2,  minLng: 24.1,   maxLng: 36.9   },
    MG: { minLat: -25.6, maxLat: -11.9, minLng: 43.2,   maxLng: 50.5   },
    MU: { minLat: -20.5, maxLat: -10.3, minLng: 56.5,   maxLng: 63.5   },
    SC: { minLat: -9.8,  maxLat: -3.7,  minLng: 46.2,   maxLng: 56.3   },
    // ── Southern Africa ───────────────────────────────────────────────────────
    AO: { minLat: -18.0, maxLat: -4.4,  minLng: 11.7,   maxLng: 24.1   },
    ZM: { minLat: -18.1, maxLat: -8.2,  minLng: 21.9,   maxLng: 33.7   },
    ZW: { minLat: -22.4, maxLat: -15.6, minLng: 25.2,   maxLng: 33.1   },
    MW: { minLat: -17.1, maxLat: -9.4,  minLng: 32.7,   maxLng: 35.9   },
    MZ: { minLat: -26.9, maxLat: -10.5, minLng: 32.3,   maxLng: 40.8   },
    NA: { minLat: -29.0, maxLat: -16.9, minLng: 11.7,   maxLng: 25.3   },
    BW: { minLat: -26.9, maxLat: -17.8, minLng: 19.9,   maxLng: 29.4   },
    ZA: { minLat: -34.8, maxLat: -22.1, minLng: 16.5,   maxLng: 32.9   },
    LS: { minLat: -30.7, maxLat: -28.6, minLng: 27.0,   maxLng: 29.5   },
    SZ: { minLat: -27.3, maxLat: -25.7, minLng: 30.8,   maxLng: 32.1   },
    // ── North America ─────────────────────────────────────────────────────────
    CA: { minLat: 41.7,  maxLat: 83.1,  minLng: -141.0, maxLng: -52.6  },
    US: { minLat: 18.9,  maxLat: 71.4,  minLng: -179.1, maxLng: -66.9  },
    MX: { minLat: 14.5,  maxLat: 32.7,  minLng: -117.1, maxLng: -86.7  },
    GT: { minLat: 13.7,  maxLat: 17.8,  minLng: -92.2,  maxLng: -88.2  },
    BZ: { minLat: 15.9,  maxLat: 18.5,  minLng: -89.2,  maxLng: -87.8  },
    HN: { minLat: 13.0,  maxLat: 16.5,  minLng: -89.4,  maxLng: -83.2  },
    SV: { minLat: 13.1,  maxLat: 14.5,  minLng: -90.1,  maxLng: -87.7  },
    NI: { minLat: 10.7,  maxLat: 15.0,  minLng: -87.7,  maxLng: -82.6  },
    CR: { minLat: 8.0,   maxLat: 11.2,  minLng: -85.9,  maxLng: -82.6  },
    PA: { minLat: 7.2,   maxLat: 9.6,   minLng: -83.1,  maxLng: -77.2  },
    CU: { minLat: 19.8,  maxLat: 23.3,  minLng: -84.9,  maxLng: -74.1  },
    JM: { minLat: 17.7,  maxLat: 18.5,  minLng: -78.4,  maxLng: -76.2  },
    HT: { minLat: 18.0,  maxLat: 20.1,  minLng: -74.5,  maxLng: -71.6  },
    DO: { minLat: 17.5,  maxLat: 20.0,  minLng: -72.0,  maxLng: -68.3  },
    BS: { minLat: 20.9,  maxLat: 27.3,  minLng: -80.5,  maxLng: -72.7  },
    TT: { minLat: 10.0,  maxLat: 11.4,  minLng: -61.9,  maxLng: -60.5  },
    BB: { minLat: 13.0,  maxLat: 13.3,  minLng: -59.7,  maxLng: -59.4  },
    LC: { minLat: 13.7,  maxLat: 14.1,  minLng: -61.1,  maxLng: -60.9  },
    VC: { minLat: 12.6,  maxLat: 13.4,  minLng: -61.5,  maxLng: -61.1  },
    GD: { minLat: 12.0,  maxLat: 12.3,  minLng: -61.8,  maxLng: -61.6  },
    DM: { minLat: 15.2,  maxLat: 15.6,  minLng: -61.5,  maxLng: -61.2  },
    AG: { minLat: 16.9,  maxLat: 17.7,  minLng: -61.9,  maxLng: -61.7  },
    KN: { minLat: 17.1,  maxLat: 17.4,  minLng: -62.9,  maxLng: -62.5  },
    // ── South America ─────────────────────────────────────────────────────────
    CO: { minLat: -4.2,  maxLat: 12.5,  minLng: -79.0,  maxLng: -66.8  },
    VE: { minLat: 0.6,   maxLat: 12.5,  minLng: -73.4,  maxLng: -59.8  },
    GY: { minLat: 1.2,   maxLat: 8.6,   minLng: -61.4,  maxLng: -56.5  },
    SR: { minLat: 1.8,   maxLat: 6.0,   minLng: -58.1,  maxLng: -53.9  },
    BR: { minLat: -33.8, maxLat: 5.3,   minLng: -73.9,  maxLng: -34.8  },
    EC: { minLat: -5.0,  maxLat: 1.4,   minLng: -81.0,  maxLng: -75.2  },
    PE: { minLat: -18.3, maxLat: -0.0,  minLng: -81.4,  maxLng: -68.7  },
    BO: { minLat: -22.9, maxLat: -9.7,  minLng: -69.7,  maxLng: -57.5  },
    CL: { minLat: -55.9, maxLat: -17.5, minLng: -75.7,  maxLng: -66.4  },
    PY: { minLat: -27.6, maxLat: -19.3, minLng: -62.7,  maxLng: -54.3  },
    AR: { minLat: -55.1, maxLat: -21.8, minLng: -73.6,  maxLng: -53.6  },
    UY: { minLat: -34.9, maxLat: -30.1, minLng: -58.4,  maxLng: -53.1  },
};

/** Degrees added on every side of a COUNTRY_BBOX box where it is used. */
const BBOX_BUFFER_DEG = 1;

/**
 * Whether a hotel returned for a search in `searchedCountry` is confirmed to be somewhere
 * else — the OTV destination code for "Paris" that also returns Paris, Texas.
 *
 * Two kinds of evidence, and a hotel is dropped only when they agree:
 *  - its stored country, corrected for territories filed under a parent (Guam as US);
 *  - its coordinates against the country's box, buffered.
 *
 * Neither is enough alone. Boxes miss islands and cut border cities (Montevideo, Galápagos —
 * see COUNTRY_BBOX), so a hotel whose country matches is never dropped for its coordinates.
 * And a supplier row with no country is stamped with the searched one (parseTgxHotelData),
 * so a matching country proves little — which is fine, since matching keeps the hotel.
 *
 * Land-border territories (Hong Kong, Macao) are decided by country alone: Shenzhen is
 * inside Hong Kong's box, so coordinates cannot separate them.
 *
 * Anything unknown is kept — a hotel not yet catalogued may well be valid.
 */
export function isConfirmedOutOfCountry(
    hotel: { country?: string | null; city?: string | null; lat?: number | string | null; lng?: number | string | null },
    searchedCountry: string | null | undefined,
): boolean {
    const searched = (searchedCountry ?? '').trim().toUpperCase();
    if (!searched) return false;

    const lat = Number(hotel.lat ?? 0), lng = Number(hotel.lng ?? 0);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
    const country = hotelCountry(hotel.country, hotel.city, lat, lng).toUpperCase();

    if (country === searched) return false;
    if (hasLandBorder(searched)) return !!country;

    const box = COUNTRY_BBOX[searched];
    const outsideBox = !!box && hasCoords && !(
        lat >= box.minLat - BBOX_BUFFER_DEG && lat <= box.maxLat + BBOX_BUFFER_DEG &&
        lng >= box.minLng - BBOX_BUFFER_DEG && lng <= box.maxLng + BBOX_BUFFER_DEG
    );

    // A different country alone is not enough, whether or not one is stored: some of it is
    // noise from `hotel_content` rows seeded by an earlier search, and 32 countries have no
    // box to check against. Only the coordinates decide — the leniency this filter has
    // always had, now applied to the country too.
    return outsideBox;
}
