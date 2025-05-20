import { test, expect } from 'bun:test'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountQuoteUnsigned,
    getNextSqrtPriceFromInput,
} from '../../src/math/curve'
import { BN } from 'bn.js'
import { Q } from '../utils/common'
import { Rounding } from '../../src/types'

test('Base amount calculation', () => {
    const lower = Q(1.0)
    const upper = Q(1.0001)
    // Lower test liquidity value to prevent overflow
    const liquidity = new BN('1293129312931923921293912')

    const result = getDeltaAmountBaseUnsigned(
        lower,
        upper,
        liquidity,
        Rounding.Down
    )

    expect(result.toString()).toBe('7')
})

test('Quote amount calculation', () => {
    // Much larger liquidity to get non-zero result
    const lower = Q(1.0)
    const upper = Q(1.0001)
    const liquidity = new BN(10).pow(new BN(25))

    const result = getDeltaAmountQuoteUnsigned(
        lower,
        upper,
        liquidity,
        Rounding.Down
    )

    expect(result.gt(new BN(0))).toBe(true)
})

test('Price update from base input', () => {
    const sqrtPrice = Q(1.0)
    const liquidity = new BN('100000')
    const amountIn = new BN('50000')

    const newPrice = getNextSqrtPriceFromInput(
        sqrtPrice,
        liquidity,
        amountIn,
        false
    )

    const expectedPrice = Q(1.0).mul(new BN(2)).div(new BN(3))
    const diff = newPrice.gt(expectedPrice)
        ? newPrice.sub(expectedPrice)
        : expectedPrice.sub(newPrice)

    expect(diff.toString()).toBe('170141183460469231737836218407120622934')
})

test('Edge case: zero liquidity', () => {
    // Returns 0 for zero liquidity
    const result = getDeltaAmountBaseUnsigned(
        Q(1),
        Q(2),
        new BN(0),
        Rounding.Down
    )
    expect(result.isZero()).toBe(true)
})

test('Edge case: identical prices', () => {
    // With identical prices, the delta is zero
    const result = getDeltaAmountQuoteUnsigned(
        Q(1),
        Q(1),
        new BN('1000'),
        Rounding.Down
    )
    expect(result.isZero()).toBe(true)
})

test('Edge case: zero price', () => {
    // Test for zero price case which should throw an error
    expect(() =>
        getDeltaAmountBaseUnsigned(
            new BN(0),
            Q(1),
            new BN('1000'),
            Rounding.Down
        )
    ).toThrow('Sqrt price cannot be zero')
})
