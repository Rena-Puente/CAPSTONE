const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const companies = require('../../src/services/companies');

const { __test__ } = companies;

if (!__test__) {
  throw new Error('Expected test utilities to be exported from services/companies');
}

const { createDefaultApplicationSummary, mapApplicationSummaryRow } = __test__;

describe('services/companies application summary helpers', () => {
  test('createDefaultApplicationSummary returns a zeroed structure', () => {
    const summary = createDefaultApplicationSummary();

    assert.deepStrictEqual(summary, {
      totalApplications: 0,
      totalOffers: 0,
      activeOffers: 0,
      lastApplicationAt: null,
      lastUpdatedAt: null,
      byStatus: {
        enviada: 0,
        en_revision: 0,
        aceptada: 0,
        rechazada: 0
      }
    });
  });

  test('mapApplicationSummaryRow maps aggregated values and normalizes dates', () => {
    const lastApplication = new Date('2024-03-01T12:34:56.000Z');

    const summary = mapApplicationSummaryRow({
      TOTAL_POSTULACIONES: 5,
      ENVIADAS: 2,
      EN_REVISION: 1,
      ACEPTADAS: 1,
      RECHAZADAS: 1,
      TOTAL_OFERTAS: 3,
      OFERTAS_ACTIVAS: 2,
      ULTIMA_POSTULACION: lastApplication,
      ULTIMA_ACTUALIZACION: '2024-03-02T09:00:00Z'
    });

    assert.strictEqual(summary.totalApplications, 5);
    assert.strictEqual(summary.byStatus.enviada, 2);
    assert.strictEqual(summary.byStatus.en_revision, 1);
    assert.strictEqual(summary.byStatus.aceptada, 1);
    assert.strictEqual(summary.byStatus.rechazada, 1);
    assert.strictEqual(summary.totalOffers, 3);
    assert.strictEqual(summary.activeOffers, 2);
    assert.strictEqual(summary.lastApplicationAt, lastApplication.toISOString());
    assert.strictEqual(summary.lastUpdatedAt, '2024-03-02T09:00:00.000Z');
  });

  test('mapApplicationSummaryRow clamps negative and invalid values to zero', () => {
    const summary = mapApplicationSummaryRow({
      total_postulaciones: -5,
      enviadas: '-2',
      en_revision: -3,
      aceptadas: -1,
      rechazadas: null,
      total_ofertas: ' 10 ',
      ofertas_activas: BigInt(4),
      ultima_postulacion: null,
      ultima_actualizacion: undefined
    });

    assert.strictEqual(summary.totalApplications, 0);
    assert.strictEqual(summary.byStatus.enviada, 0);
    assert.strictEqual(summary.byStatus.en_revision, 0);
    assert.strictEqual(summary.byStatus.aceptada, 0);
    assert.strictEqual(summary.byStatus.rechazada, 0);
    assert.strictEqual(summary.totalOffers, 10);
    assert.strictEqual(summary.activeOffers, 4);
    assert.strictEqual(summary.lastApplicationAt, null);
    assert.strictEqual(summary.lastUpdatedAt, null);
  });
});
