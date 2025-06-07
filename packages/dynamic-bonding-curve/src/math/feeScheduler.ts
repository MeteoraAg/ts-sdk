import BN from 'bn.js'
import { BASIS_POINT_MAX } from '../constants'
import { mulDiv } from './utilsMath'
import { Rounding } from '../types'
import { pow, SafeMath } from './safeMath'

/**
 * Get fee in period for linear fee scheduler
 * @param cliffFeeNumerator Cliff fee numerator
 * @param reductionFactor Reduction factor
 * @param period Period
 * @returns Fee numerator
 */
export function getFeeNumeratorOnLinearFeeScheduler(
    cliffFeeNumerator: BN,
    reductionFactor: BN,
    period: number
): BN {
    const reduction = SafeMath.mul(new BN(period), reductionFactor)

    if (reduction.gt(cliffFeeNumerator)) {
        return new BN(0)
    }

    return SafeMath.sub(cliffFeeNumerator, reduction)
}

/**
 * Get fee in period for exponential fee scheduler
 * @param cliffFeeNumerator Cliff fee numerator
 * @param reductionFactor Reduction factor
 * @param period Period
 * @returns Fee numerator
 */
export function getFeeNumeratorOnExponentialFeeScheduler(
    cliffFeeNumerator: BN,
    reductionFactor: BN,
    period: number
): BN {
    if (period === 0) {
        return cliffFeeNumerator
    }

    if (period === 1) {
        const basisPointMax = new BN(BASIS_POINT_MAX)
        return mulDiv(
            cliffFeeNumerator,
            basisPointMax.sub(reductionFactor),
            basisPointMax,
            Rounding.Down
        )
    }

    // calculate (1-reduction_factor/10_000)^period
    const basisPointMax = new BN(BASIS_POINT_MAX)

    // base = ONE_Q64 - (reductionFactor << RESOLUTION) / BASIS_POINT_MAX
    const ONE_Q64 = new BN(1).shln(64)
    const reductionFactorScaled = SafeMath.div(
        SafeMath.shl(reductionFactor, 64),
        basisPointMax
    )
    let base = SafeMath.sub(ONE_Q64, reductionFactorScaled)

    const result = pow(base, new BN(period))

    // final fee: cliffFeeNumerator * result >> 64
    return SafeMath.div(SafeMath.mul(cliffFeeNumerator, result), ONE_Q64)
}
