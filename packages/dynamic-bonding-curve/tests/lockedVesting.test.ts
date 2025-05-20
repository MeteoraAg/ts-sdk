import { getLockedVesting, getTotalVestingAmount, TokenDecimal } from '../src'
import { convertBNToDecimal } from './utils/common'

describe('calculateLockedVesting tests', () => {
    test('calculate locked vesting parameters 1', () => {
        const totalVestingAmount = 10000000 // 10M tokens
        const numberOfPeriod = 10
        const amountPerPeriod = 1000
        const cliffDurationFromMigrationTime = 0
        const frequency = 1

        const result = getLockedVesting(
            totalVestingAmount,
            numberOfPeriod,
            amountPerPeriod,
            cliffDurationFromMigrationTime,
            frequency,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalVestingAmount * 10 ** TokenDecimal.SIX
        )
    })

    test('calculate locked vesting parameters 2', () => {
        const totalVestingAmount = 1000000000 // 1B tokens
        const numberOfPeriod = 400000
        const amountPerPeriod = 2500 // 2500 tokens
        const cliffDurationFromMigrationTime = 0
        const frequency = 1

        const result = getLockedVesting(
            totalVestingAmount,
            numberOfPeriod,
            amountPerPeriod,
            cliffDurationFromMigrationTime,
            frequency,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalVestingAmount * 10 ** TokenDecimal.SIX
        )
    })
})
