import { test, expect } from 'bun:test'
import {
    getFeeInPeriod,
    getCurrentBaseFeeNumerator,
    getVariableFee,
} from '../../src/math/feeMath'
import BN from 'bn.js'
import { FeeSchedulerMode } from '../../src/types'

test('getFeeInPeriod calculation', () => {
    // Test case 1: No reduction
    const result1 = getFeeInPeriod(
        new BN(1000), // cliff fee
        new BN(0), // reduction factor
        0 // period as number, not BN
    )
    expect(result1.eq(new BN(1000))).toBe(true)

    // Test case 2: With reduction
    const result2 = getFeeInPeriod(
        new BN(1000), // cliff fee
        new BN(100), // 1% reduction factor
        1 // period as number, not BN
    )
    expect(result2.gt(new BN(989))).toBe(true)
    expect(result2.lt(new BN(991))).toBe(true)
})

test('getFeeInPeriod with higher periods', () => {
    // Test with period > 1 to test binary exponentiation
    const result = getFeeInPeriod(new BN(1000), new BN(100), 5)

    // Fee decreases with each period
    expect(result.lt(new BN(1000))).toBe(true)

    expect(result.gte(new BN(0))).toBe(true)
})

test('getCurrentBaseFeeNumerator with linear mode', () => {
    const baseFee = {
        cliffFeeNumerator: new BN(1000),
        feeSchedulerMode: FeeSchedulerMode.Linear,
        numberOfPeriod: 10,
        periodFrequency: new BN(100),
        reductionFactor: new BN(50), // 50 per period
    }

    // Before activation point
    const result1 = getCurrentBaseFeeNumerator(baseFee, new BN(50), new BN(100))
    // Use max period (min fee)
    expect(result1.eq(new BN(500))).toBe(true)

    // After activation point, 2 periods elapsed
    const result2 = getCurrentBaseFeeNumerator(
        baseFee,
        new BN(300),
        new BN(100)
    )
    expect(result2.eq(new BN(900))).toBe(true)
})

test('getCurrentBaseFeeNumerator with exponential mode', () => {
    const baseFee = {
        cliffFeeNumerator: new BN(1000),
        feeSchedulerMode: FeeSchedulerMode.Exponential,
        numberOfPeriod: 5,
        periodFrequency: new BN(100),
        reductionFactor: new BN(100),
    }

    // After activation point, 3 periods elapsed
    const result = getCurrentBaseFeeNumerator(baseFee, new BN(350), new BN(100))

    // Use exponential reduction
    expect(result.lt(new BN(1000))).toBe(true)
    expect(result.gt(new BN(950))).toBe(true)
})

test('getVariableFee calculation', () => {
    const dynamicFee = {
        initialized: 1,
        padding: [],
        maxVolatilityAccumulator: 1000,
        variableFeeControl: 10,
        binStep: 100,
        filterPeriod: 0,
        decayPeriod: 0,
        reductionFactor: 0,
        padding2: [],
        binStepU128: new BN(100),
    }

    const volatilityTracker = {
        lastUpdateTimestamp: new BN(0),
        padding: [],
        sqrtPriceReference: new BN(0),
        volatilityAccumulator: new BN(1000),
        volatilityReference: new BN(0),
    }

    const result = getVariableFee(dynamicFee, volatilityTracker)

    // Return a non-zero fee
    expect(result.gt(new BN(0))).toBe(true)
})

test('getVariableFee with zero volatility', () => {
    const dynamicFee = {
        initialized: 1,
        padding: [],
        maxVolatilityAccumulator: 1000,
        variableFeeControl: 10,
        binStep: 100,
        filterPeriod: 0,
        decayPeriod: 0,
        reductionFactor: 0,
        padding2: [],
        binStepU128: new BN(100),
    }

    const volatilityTracker = {
        lastUpdateTimestamp: new BN(0),
        padding: [],
        sqrtPriceReference: new BN(0),
        volatilityAccumulator: new BN(0),
        volatilityReference: new BN(0),
    }

    const result = getVariableFee(dynamicFee, volatilityTracker)

    // Return zero fee
    expect(result.isZero()).toBe(true)
})

test('getVariableFee with uninitialized dynamic fee', () => {
    const dynamicFee = {
        initialized: 0, // disabled
        padding: [],
        maxVolatilityAccumulator: 1000,
        variableFeeControl: 10,
        binStep: 100,
        filterPeriod: 0,
        decayPeriod: 0,
        reductionFactor: 0,
        padding2: [],
        binStepU128: new BN(100),
    }

    const volatilityTracker = {
        lastUpdateTimestamp: new BN(0),
        padding: [],
        sqrtPriceReference: new BN(0),
        volatilityAccumulator: new BN(1000),
        volatilityReference: new BN(0),
    }

    const result = getVariableFee(dynamicFee, volatilityTracker)

    // Return zero fee
    expect(result.isZero()).toBe(true)
})
