import { test, expect } from 'bun:test'
import BN from 'bn.js'
import { type VirtualPool, type PoolConfig } from '../src/types'
import { DEFAULT_POOL_CONFIG, DEFAULT_VIRTUAL_POOL } from './utils/defaults'
import { getInitialBaseSupply, MAX_CURVE_POINT } from '../src/math/poolConfig'
import { getPriceFromId } from '../src/math/priceMath'
import { swapQuote } from '../src/math/swapQuote'

// Constants matching Rust test
const MAX_SQRT_PRICE = new BN('79226673521066979257578248091') // MAX u128
const MIGRATION_QUOTE_THRESHOLD = new BN('50000000000') // 50k USDC

/**
 * Convert a decimal string or BN to a u128 (simulating Rust's u128 behavior)
 */
function toU128(value: string | BN) {
    const bn = BN.isBN(value) ? value : new BN(value)
    const U128_MAX = new BN(1).shln(128).subn(1)
    return bn.and(U128_MAX)
}

/**
 * Perform a left shift on a value and wrap to u128
 */
function u128Shl(value: string | BN, bits: number) {
    const bn = BN.isBN(value) ? value : new BN(value)
    return toU128(bn.shln(bits))
}

test('swap quote test without fees', () => {
    const sqrtActiveId = -100 // Same as Rust test
    const binStep = 80 // 80bps, same as Rust test

    const sqrtStartPrice = getPriceFromId(sqrtActiveId, binStep)

    // Define curve points
    const curve = [
        {
            sqrtPrice: MAX_SQRT_PRICE,
            liquidity: u128Shl('1000000000000000000000000', 64),
        },
    ]
    const curveLength = curve.length

    // Create test pool configuration
    const config: PoolConfig = {
        ...DEFAULT_POOL_CONFIG,
        sqrtStartPrice,
        migrationQuoteThreshold: MIGRATION_QUOTE_THRESHOLD,
        collectFeeMode: 1, // OutputToken mode
        curve: Array(MAX_CURVE_POINT)
            .fill(null)
            .map((_, i) => {
                if (i < curveLength) {
                    return curve[i]
                } else {
                    return {
                        sqrtPrice: MAX_SQRT_PRICE, // set max
                        liquidity: new BN(0),
                    }
                }
            }),
    }

    // Create virtual pool state
    const virtualPool: VirtualPool = {
        ...DEFAULT_VIRTUAL_POOL,
        sqrtPrice: config.sqrtStartPrice,
        baseReserve: getInitialBaseSupply(config),
    }

    // Test quote for quote to base swap
    const amountIn = new BN('1000000000') // 1k USDC
    const result = swapQuote(
        virtualPool,
        config,
        false, // quote to base
        amountIn,
        false, // no referral
        new BN(0) // current point
    )

    // Log results similar to Rust test
    console.log('Swap Quote Result without fees:', {
        amountOut: result.amountOut.toString(),
        tradingFee: result.fee.trading.toString(),
        protocolFee: result.fee.protocol.toString(),
        nextSqrtPrice: result.nextSqrtPrice.toString(),
    })

    expect(result.amountOut.toString()).toBe('4921601219')
    expect(result.fee.trading.toString()).toBe('0')
    expect(result.nextSqrtPrice.toString()).toBe('8315081533034529335')
})

test('swap quote test with fees', () => {
    const sqrtActiveId = -100 // Same as Rust test
    const binStep = 80 // 80bps, same as Rust test

    const sqrtStartPrice = getPriceFromId(sqrtActiveId, binStep)

    // Define curve points
    const curve = [
        {
            sqrtPrice: MAX_SQRT_PRICE,
            liquidity: u128Shl('1000000000000000000000000', 64),
        },
    ]
    const curveLength = curve.length

    // Create test pool configuration
    const config: PoolConfig = {
        ...DEFAULT_POOL_CONFIG,
        sqrtStartPrice,
        migrationQuoteThreshold: MIGRATION_QUOTE_THRESHOLD,
        collectFeeMode: 1, // OutputToken mode
        curve: Array(MAX_CURVE_POINT)
            .fill(null)
            .map((_, i) => {
                if (i < curveLength) {
                    return curve[i]
                } else {
                    return {
                        sqrtPrice: MAX_SQRT_PRICE, // set max
                        liquidity: new BN(0),
                    }
                }
            }),
        poolFees: {
            ...DEFAULT_POOL_CONFIG['poolFees'],
            baseFee: {
                cliffFeeNumerator: new BN(2_500_000),
                periodFrequency: new BN(0),
                reductionFactor: new BN(0),
                numberOfPeriod: 0,
                feeSchedulerMode: 0,
                padding0: [],
            },
        },
    }

    // Create virtual pool state
    const virtualPool: VirtualPool = {
        ...DEFAULT_VIRTUAL_POOL,
        sqrtPrice: config.sqrtStartPrice,
        baseReserve: getInitialBaseSupply(config),
    }

    // Test quote for quote to base swap
    const amountIn = new BN('1000000000') // 1k USDC
    const result = swapQuote(
        virtualPool,
        config,
        false, // quote to base
        amountIn,
        false, // no referral
        new BN(0) // current point
    )

    // Log results similar to Rust test
    console.log('Swap Quote Result with fees:', {
        amountOut: result.amountOut.toString(),
        tradingFee: result.fee.trading.toString(),
        protocolFee: result.fee.protocol.toString(),
        nextSqrtPrice: result.nextSqrtPrice.toString(),
    })

    expect(result.amountOut.toString()).toBe('4909297215')
    expect(result.fee.trading.toString()).toBe('12304004')
    expect(result.nextSqrtPrice.toString()).toBe('8315081533034529335')

    // Test with small amount
    const smallAmountIn = new BN('1') // 1
    const smallResult = swapQuote(
        virtualPool,
        config,
        false, // quote to base
        smallAmountIn,
        false, // no referral
        new BN(0) // current point
    )

    console.log('Small Swap Quote Result with fees:', {
        amountOut: smallResult.amountOut.toString(),
        tradingFee: smallResult.fee.trading.toString(),
        protocolFee: smallResult.fee.protocol.toString(),
        nextSqrtPrice: smallResult.nextSqrtPrice.toString(),
    })

    expect(smallResult.amountOut.toString()).toBe('3')
    expect(smallResult.fee.trading.toString()).toBe('1')
    expect(smallResult.nextSqrtPrice.toString()).toBe('8315081523828484030')

    // Test base to quote swap
    const amountInBase = new BN('1000000000') // 1k USDC
    const resultBaseToQuote = swapQuote(
        virtualPool,
        config,
        true, // base to quote
        amountInBase,
        false, // no referral
        new BN(0) // current point
    )

    console.log('Base to Quote Swap Result with fees:', {
        amountOut: resultBaseToQuote.amountOut.toString(),
        tradingFee: resultBaseToQuote.fee.trading.toString(),
        protocolFee: resultBaseToQuote.fee.protocol.toString(),
        nextSqrtPrice: resultBaseToQuote.nextSqrtPrice.toString(),
    })

    expect(resultBaseToQuote.amountOut.toString()).toBe('202677940')
    expect(resultBaseToQuote.fee.trading.toString()).toBe('507965')
    expect(resultBaseToQuote.fee.protocol.toString()).toBe('0')
    expect(resultBaseToQuote.nextSqrtPrice.toString()).toBe(
        '8315081521957945371'
    )
})
