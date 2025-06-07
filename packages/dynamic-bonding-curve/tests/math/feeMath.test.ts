import { test, expect } from 'bun:test'
import { getBaseFeeNumerator, getVariableFee } from '../../src/math/feeMath'
import BN from 'bn.js'
import { BaseFeeMode, TradeDirection } from '../../src/types'
import { getFeeNumeratorOnExponentialFeeScheduler } from '../../src/math/feeScheduler'

test('getFeeInPeriod calculation', () => {
    // Test case 1: No reduction
    const result1 = getFeeNumeratorOnExponentialFeeScheduler(
        new BN(1000), // cliff fee
        new BN(0), // reduction factor
        0 // period as number, not BN
    )
    expect(result1.eq(new BN(1000))).toBe(true)

    // Test case 2: With reduction
    const result2 = getFeeNumeratorOnExponentialFeeScheduler(
        new BN(1000), // cliff fee
        new BN(100), // 1% reduction factor
        1 // period as number, not BN
    )
    expect(result2.gt(new BN(989))).toBe(true)
    expect(result2.lt(new BN(991))).toBe(true)
})

test('getFeeInPeriod with higher periods', () => {
    // Test with period > 1 to test binary exponentiation
    const result = getFeeNumeratorOnExponentialFeeScheduler(
        new BN(1000),
        new BN(100),
        5
    )

    // Fee decreases with each period
    expect(result.lt(new BN(1000))).toBe(true)

    expect(result.gte(new BN(0))).toBe(true)
})

test('getBaseFeeNumerator with linear mode', () => {
    const baseFee = {
        cliffFeeNumerator: new BN(1000),
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        firstFactor: 10,
        secondFactor: new BN(50), // 50 per period
        thirdFactor: new BN(100),
    }

    // Before activation point
    const result1 = getBaseFeeNumerator(
        baseFee,
        TradeDirection.QuoteToBase,
        new BN(50),
        new BN(100)
    )

    // Use max period (min fee)
    expect(result1.eq(new BN(0))).toBe(true)

    // After activation point, 2 periods elapsed
    const result2 = getBaseFeeNumerator(
        baseFee,
        TradeDirection.QuoteToBase,
        new BN(300),
        new BN(100)
    )

    expect(result2.eq(new BN(600))).toBe(true)
})

test('getBaseFeeNumerator with exponential mode', () => {
    const baseFee = {
        cliffFeeNumerator: new BN(1000),
        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
        firstFactor: 5,
        secondFactor: new BN(100),
        thirdFactor: new BN(100),
    }

    // After activation point, 3 periods elapsed
    const result = getBaseFeeNumerator(
        baseFee,
        TradeDirection.QuoteToBase,
        new BN(350),
        new BN(100)
    )

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
