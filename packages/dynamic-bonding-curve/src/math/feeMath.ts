import BN from 'bn.js'
import { pow, SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import {
    BASIS_POINT_MAX,
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
} from '../constants'
import {
    FeeSchedulerMode,
    Rounding,
    type DynamicFeeConfig,
    type FeeOnAmountResult,
    type PoolFeesConfig,
    type VolatilityTracker,
} from '../types'

/**
 * Get fee in period for exponential fee scheduler
 * @param cliffFeeNumerator Cliff fee numerator
 * @param reductionFactor Reduction factor
 * @param period Period
 * @returns Fee numerator
 */
export function getFeeInPeriod(
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

/**
 * Get current base fee numerator
 * @param baseFee Base fee parameters
 * @param currentPoint Current point
 * @param activationPoint Activation point
 * @returns Current base fee numerator
 */
export function getCurrentBaseFeeNumerator(
    baseFee: {
        cliffFeeNumerator: BN
        feeSchedulerMode: number
        numberOfPeriod: number
        periodFrequency: BN
        reductionFactor: BN
    },
    currentPoint: BN,
    activationPoint: BN
): BN {
    if (baseFee.periodFrequency.isZero()) {
        return baseFee.cliffFeeNumerator
    }

    let period: number
    if (currentPoint.lt(activationPoint)) {
        // before activation point, use max period (min fee)
        period = baseFee.numberOfPeriod
    } else {
        const elapsedPoints = SafeMath.sub(currentPoint, activationPoint)
        const periodCount = SafeMath.div(elapsedPoints, baseFee.periodFrequency)

        period = Math.min(
            parseInt(periodCount.toString()),
            baseFee.numberOfPeriod
        )
    }

    const feeSchedulerMode = baseFee.feeSchedulerMode

    if (feeSchedulerMode === FeeSchedulerMode.Linear) {
        // linear fee calculation: cliffFeeNumerator - period * reductionFactor
        const reduction = SafeMath.mul(new BN(period), baseFee.reductionFactor)

        if (reduction.gt(baseFee.cliffFeeNumerator)) {
            return new BN(0)
        }

        return SafeMath.sub(baseFee.cliffFeeNumerator, reduction)
    } else if (feeSchedulerMode === FeeSchedulerMode.Exponential) {
        // for exponential mode, use the optimized getFeeInPeriod function
        return getFeeInPeriod(
            baseFee.cliffFeeNumerator,
            baseFee.reductionFactor,
            period
        )
    } else {
        throw new Error('Invalid fee scheduler mode')
    }
}

/**
 * Get fee on amount
 * @param amount Amount
 * @param poolFees Pool fees
 * @param isReferral Whether referral is used
 * @param currentPoint Current point
 * @param activationPoint Activation point
 * @param volatilityTracker Volatility tracker
 * @returns Fee on amount result
 */
export function getFeeOnAmount(
    amount: BN,
    poolFees: PoolFeesConfig,
    isReferral: boolean,
    currentPoint: BN,
    activationPoint: BN,
    volatilityTracker: VolatilityTracker
): FeeOnAmountResult {
    // get total trading fee
    const baseFeeNumerator = getCurrentBaseFeeNumerator(
        poolFees.baseFee,
        currentPoint,
        activationPoint
    )

    // add dynamic fee if enabled
    let totalFeeNumerator = baseFeeNumerator
    if (poolFees.dynamicFee.initialized !== 0) {
        const variableFee = getVariableFee(
            poolFees.dynamicFee,
            volatilityTracker
        )
        totalFeeNumerator = SafeMath.add(totalFeeNumerator, variableFee)
    }

    // cap at MAX_FEE_NUMERATOR
    if (totalFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))) {
        totalFeeNumerator = new BN(MAX_FEE_NUMERATOR)
    }

    const tradingFee = mulDiv(
        amount,
        totalFeeNumerator,
        new BN(FEE_DENOMINATOR),
        Rounding.Up
    )

    const amountAfterFee = SafeMath.sub(amount, tradingFee)

    const protocolFee = mulDiv(
        tradingFee,
        new BN(poolFees.protocolFeePercent),
        new BN(100),
        Rounding.Down
    )

    const tradingFeeAfterProtocol = SafeMath.sub(tradingFee, protocolFee)

    // referral fee
    let referralFee = new BN(0)
    if (isReferral) {
        referralFee = mulDiv(
            protocolFee,
            new BN(poolFees.referralFeePercent),
            new BN(100),
            Rounding.Down
        )
    }

    // update protocol fee
    const protocolFeeAfterReferral = SafeMath.sub(protocolFee, referralFee)

    return {
        amount: amountAfterFee,
        tradingFee: tradingFeeAfterProtocol,
        protocolFee: protocolFeeAfterReferral,
        referralFee,
    }
}

/**
 * Get variable fee from dynamic fee
 * @param dynamicFee Dynamic fee parameters
 * @param volatilityTracker Volatility tracker
 * @returns Variable fee
 */
export function getVariableFee(
    dynamicFee: DynamicFeeConfig,
    volatilityTracker: VolatilityTracker
): BN {
    if (dynamicFee.initialized === 0) {
        return new BN(0)
    }

    if (volatilityTracker.volatilityAccumulator.isZero()) {
        return new BN(0)
    }

    // (volatilityAccumulator * binStep)
    const volatilityTimesBinStep = SafeMath.mul(
        volatilityTracker.volatilityAccumulator,
        new BN(dynamicFee.binStep)
    )

    // (volatilityAccumulator * binStep)^2
    const squared = SafeMath.mul(volatilityTimesBinStep, volatilityTimesBinStep)

    // (volatilityAccumulator * binStep)^2 * variableFeeControl
    const vFee = SafeMath.mul(squared, new BN(dynamicFee.variableFeeControl))

    const scaleFactor = new BN(100_000_000_000)
    const numerator = SafeMath.add(vFee, SafeMath.sub(scaleFactor, new BN(1)))
    return SafeMath.div(numerator, scaleFactor)
}
