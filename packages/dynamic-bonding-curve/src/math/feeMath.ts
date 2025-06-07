import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import { FEE_DENOMINATOR, MAX_FEE_NUMERATOR } from '../constants'
import {
    BaseFeeMode,
    Rounding,
    TradeDirection,
    type DynamicFeeConfig,
    type FeeOnAmountResult,
    type PoolFeesConfig,
    type VolatilityTracker,
} from '../types'
import {
    getFeeNumeratorOnExponentialFeeScheduler,
    getFeeNumeratorOnLinearFeeScheduler,
} from './feeScheduler'
import { getFeeNumeratorOnRateLimiter } from './rateLimiter'
import { checkRateLimiterApplied } from '../helpers'

/**
 * Get current base fee numerator
 * @param baseFee Base fee parameters
 * @param tradeDirection Trade direction
 * @param currentPoint Current point
 * @param activationPoint Activation point
 * @param inputAmount Input amount (optional, used for rate limiter)
 * @returns Current base fee numerator
 */
export function getBaseFeeNumerator(
    baseFee: {
        cliffFeeNumerator: BN
        firstFactor: number
        secondFactor: BN
        thirdFactor: BN
        baseFeeMode: BaseFeeMode
    },
    tradeDirection: TradeDirection,
    currentPoint: BN,
    activationPoint: BN,
    inputAmount?: BN
): BN {
    const baseFeeMode = baseFee.baseFeeMode

    if (baseFeeMode === BaseFeeMode.RateLimiter) {
        const feeIncrementBps = baseFee.firstFactor
        const maxLimiterDuration = baseFee.secondFactor
        const referenceAmount = baseFee.thirdFactor

        const isBaseToQuote = tradeDirection === TradeDirection.BaseToQuote

        // check if rate limiter is applied
        const isRateLimiterApplied = checkRateLimiterApplied(
            baseFeeMode,
            isBaseToQuote,
            currentPoint,
            activationPoint,
            baseFee.secondFactor
        )

        // if current point is less than activation point, return base fee
        if (currentPoint.lt(activationPoint)) {
            return baseFee.cliffFeeNumerator
        }

        // if lastEffectivePoint is less than currentPoint, return base fee
        const lastEffectivePoint = activationPoint.add(maxLimiterDuration)
        if (currentPoint.gt(lastEffectivePoint)) {
            return baseFee.cliffFeeNumerator
        }

        // if no input amount provided, return base fee
        if (!inputAmount) {
            return baseFee.cliffFeeNumerator
        }

        if (isRateLimiterApplied) {
            return getFeeNumeratorOnRateLimiter(
                baseFee.cliffFeeNumerator,
                referenceAmount,
                new BN(feeIncrementBps),
                inputAmount
            )
        } else {
            return baseFee.cliffFeeNumerator
        }
    } else {
        const numberOfPeriod = baseFee.firstFactor
        const periodFrequency = baseFee.secondFactor
        const reductionFactor = baseFee.thirdFactor

        if (periodFrequency.isZero()) {
            return baseFee.cliffFeeNumerator
        }

        let period: number
        if (currentPoint.lt(activationPoint)) {
            // before activation point, use max period (min fee)
            period = numberOfPeriod
        } else {
            const elapsedPoints = SafeMath.sub(currentPoint, activationPoint)
            const periodCount = SafeMath.div(elapsedPoints, periodFrequency)

            period = Math.min(parseInt(periodCount.toString()), numberOfPeriod)
        }

        if (baseFeeMode === BaseFeeMode.FeeSchedulerLinear) {
            // linear fee calculation: cliffFeeNumerator - period * reductionFactor
            return getFeeNumeratorOnLinearFeeScheduler(
                baseFee.cliffFeeNumerator,
                reductionFactor,
                period
            )
        } else {
            // exponential fee calculation: cliff_fee_numerator * (1 - reduction_factor/10_000)^period
            return getFeeNumeratorOnExponentialFeeScheduler(
                baseFee.cliffFeeNumerator,
                reductionFactor,
                period
            )
        }
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

/**
 * Get fee on amount for rate limiter
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
    volatilityTracker: VolatilityTracker,
    tradeDirection: TradeDirection
): FeeOnAmountResult {
    // get total trading fee
    const baseFeeNumerator = getBaseFeeNumerator(
        poolFees.baseFee,
        tradeDirection,
        currentPoint,
        activationPoint,
        poolFees.baseFee.baseFeeMode === BaseFeeMode.RateLimiter
            ? amount
            : undefined
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
