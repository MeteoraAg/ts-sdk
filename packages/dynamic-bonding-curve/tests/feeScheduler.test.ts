import { FeeSchedulerMode, calculateFeeScheduler } from '../src'
import { convertBNToDecimal } from './utils/common'

describe('calculateFeeScheduler tests', () => {
    test('linear fee scheduler - should calculate parameters correctly', () => {
        const startingFeeBps = 5000 // 50%
        const endingFeeBps = 1000 // 10%
        const numberOfPeriod = 144
        const feeSchedulerMode = FeeSchedulerMode.Linear
        const totalDuration = 60

        const result = calculateFeeScheduler(
            startingFeeBps,
            endingFeeBps,
            feeSchedulerMode,
            numberOfPeriod,
            totalDuration
        )

        console.log('result', convertBNToDecimal(result))

        // linear mode: cliffFeeNumerator - (numberOfPeriod * reductionFactor)
        expect(result.reductionFactor.toNumber()).toEqual(2777777)
    })

    test('exponential fee scheduler - should calculate parameters correctly', () => {
        const startingFeeBps = 5000 // 50%
        const endingFeeBps = 1000 // 10%
        const numberOfPeriod = 37.5
        const feeSchedulerMode = FeeSchedulerMode.Exponential
        const totalDuration = 144 * 60 * 60 * 24

        const result = calculateFeeScheduler(
            startingFeeBps,
            endingFeeBps,
            feeSchedulerMode,
            numberOfPeriod,
            totalDuration
        )

        console.log('result', convertBNToDecimal(result))

        // exponential mode: cliffFeeNumerator * (1 - reductionFactor/10_000)^numberOfPeriod
        expect(result.reductionFactor.toNumber()).toEqual(420)
    })
})
