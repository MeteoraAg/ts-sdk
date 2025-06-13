import BN from 'bn.js'
import { mulDiv } from './utilsMath'
import {
    BASIS_POINT_MAX,
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
} from '../constants'
import { Rounding } from '../types'

/**
 * Calculate the max index for rate limiter
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param feeIncrementBps - The fee increment bps
 * @returns The max index
 */
function getMaxIndex(cliffFeeNumerator: BN, feeIncrementBps: BN): BN {
    const deltaNumerator = new BN(MAX_FEE_NUMERATOR).sub(cliffFeeNumerator)
    const feeIncrementNumerator = mulDiv(
        new BN(feeIncrementBps),
        new BN(FEE_DENOMINATOR),
        new BN(BASIS_POINT_MAX),
        Rounding.Down
    )
    return deltaNumerator.div(feeIncrementNumerator)
}

/**
 * Calculate the fee numerator on rate limiter
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param referenceAmount - The reference amount
 * @param feeIncrementBps - The fee increment bps
 * @param inputAmount - The input amount
 * @returns The fee numerator
 */
export function getFeeNumeratorOnRateLimiter(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    inputAmount: BN
): BN {
    if (inputAmount.lte(referenceAmount)) {
        return cliffFeeNumerator
    }

    const c = new BN(cliffFeeNumerator)
    const diff = inputAmount.sub(referenceAmount)
    const a = new BN(diff.div(referenceAmount))
    const b = new BN(diff.mod(referenceAmount))
    const maxIndex = new BN(getMaxIndex(cliffFeeNumerator, feeIncrementBps))
    const i = mulDiv(
        new BN(feeIncrementBps),
        new BN(FEE_DENOMINATOR),
        new BN(BASIS_POINT_MAX),
        Rounding.Down
    )
    const x0 = new BN(referenceAmount)
    const one = new BN(1)
    const two = new BN(2)

    let tradingFeeNumerator: BN
    if (a.lt(maxIndex)) {
        let numerator1 = c.add(c.mul(a)).add(i.mul(a).mul(a.add(one)).div(two))
        let numerator2 = c.add(i.mul(a.add(one)))
        let firstFee = x0.mul(numerator1)
        let secondFee = b.mul(numerator2)
        tradingFeeNumerator = firstFee.add(secondFee)
    } else {
        let numerator1 = c
            .add(c.mul(maxIndex))
            .add(i.mul(maxIndex).mul(maxIndex.add(one)).div(two))
        let numerator2 = new BN(MAX_FEE_NUMERATOR)
        let firstFee = x0.mul(numerator1)
        let d = a.sub(maxIndex)
        let leftAmount = d.mul(x0).add(b)
        let secondFee = leftAmount.mul(numerator2)
        tradingFeeNumerator = firstFee.add(secondFee)
    }

    const denominator = new BN(FEE_DENOMINATOR)
    const tradingFee = tradingFeeNumerator
        .add(denominator)
        .sub(one)
        .div(denominator)

    // reverse to fee numerator:
    // input_amount * numerator / FEE_DENOMINATOR = trading_fee
    // => numerator = trading_fee * FEE_DENOMINATOR / input_amount
    const feeNumerator = mulDiv(
        tradingFee,
        new BN(FEE_DENOMINATOR),
        inputAmount,
        Rounding.Up
    )

    return BN.min(feeNumerator, new BN(MAX_FEE_NUMERATOR))
}
