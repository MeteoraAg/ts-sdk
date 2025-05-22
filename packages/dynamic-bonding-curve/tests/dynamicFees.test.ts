import {
    BASIS_POINT_MAX,
    FEE_DENOMINATOR,
    FeeSchedulerMode,
    getMinBaseFeeBps,
} from '../src'
import { expect, test, describe } from 'bun:test'

describe('getMinBaseFeeBps tests', () => {
    test('linear fee scheduler - should calculate minimum fee correctly', () => {
        const baseFeeBps = 5000
        const cliffFeeNumerator =
            (baseFeeBps * FEE_DENOMINATOR) / BASIS_POINT_MAX
        const numberOfPeriod = 144
        const reductionFactor = 3333333
        const feeSchedulerMode = FeeSchedulerMode.Linear

        const minBaseFeeBps = getMinBaseFeeBps(
            cliffFeeNumerator,
            numberOfPeriod,
            reductionFactor,
            feeSchedulerMode
        )

        // linear mode: cliffFeeNumerator - (numberOfPeriod * reductionFactor)
        const expectedMinFeeNumerator =
            cliffFeeNumerator - numberOfPeriod * reductionFactor
        const expectedMinFeeBps = Math.max(
            0,
            (expectedMinFeeNumerator / FEE_DENOMINATOR) * BASIS_POINT_MAX
        )

        console.log('minBaseFeeBps:', minBaseFeeBps)
        console.log('expectedMinFeeBps:', expectedMinFeeBps)

        expect(minBaseFeeBps).toBeLessThan(baseFeeBps)
        expect(minBaseFeeBps).toEqual(expectedMinFeeBps)
    })

    test('exponential fee scheduler - should calculate minimum fee correctly', () => {
        const baseFeeBps = 5000
        const cliffFeeNumerator =
            (baseFeeBps * FEE_DENOMINATOR) / BASIS_POINT_MAX
        const numberOfPeriod = 37.5
        const reductionFactor = 822.5
        const feeSchedulerMode = FeeSchedulerMode.Exponential

        const minBaseFeeBps = getMinBaseFeeBps(
            cliffFeeNumerator,
            numberOfPeriod,
            reductionFactor,
            feeSchedulerMode
        )

        // exponential mode: cliffFeeNumerator * (1 - reductionFactor/BASIS_POINT_MAX)^numberOfPeriod
        const decayRate = 1 - reductionFactor / BASIS_POINT_MAX
        const expectedMinFeeNumerator =
            cliffFeeNumerator * Math.pow(decayRate, numberOfPeriod)
        const expectedMinFeeBps = Math.max(
            0,
            (expectedMinFeeNumerator / FEE_DENOMINATOR) * BASIS_POINT_MAX
        )

        console.log('minBaseFeeBps:', minBaseFeeBps)
        console.log('expectedMinFeeBps:', expectedMinFeeBps)

        expect(minBaseFeeBps).toBeLessThan(baseFeeBps)
        expect(minBaseFeeBps).toEqual(expectedMinFeeBps)
    })
})
