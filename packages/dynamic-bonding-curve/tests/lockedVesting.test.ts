import {
    getLockedVestingParams,
    getTotalVestingAmount,
    TokenDecimal,
} from '../src'
import { convertBNToDecimal } from './utils/common'
import { expect, test, describe } from 'bun:test'

describe('calculateLockedVesting tests', () => {
    test('calculate locked vesting parameters 1', () => {
        const totalVestingAmount = 10000000 // 10M tokens
        const totalVestingDuration = 3600
        const numberOfPeriod = 10
        const amountPerPeriod = 1000
        const cliffDurationFromMigrationTime = 0

        const result = getLockedVestingParams(
            totalVestingAmount,
            numberOfPeriod,
            amountPerPeriod,
            totalVestingDuration,
            cliffDurationFromMigrationTime,
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
        const totalVestingDuration = 60
        const numberOfPeriod = 400000
        const amountPerPeriod = 2500 // 2500 tokens
        const cliffDurationFromMigrationTime = 0

        const result = getLockedVestingParams(
            totalVestingAmount,
            numberOfPeriod,
            amountPerPeriod,
            totalVestingDuration,
            cliffDurationFromMigrationTime,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalVestingAmount * 10 ** TokenDecimal.SIX
        )
    })

    test('calculate locked vesting parameters 2', () => {
        const totalVestingAmount = 10000000
        const totalVestingDuration = (365 * 24 * 60 * 60) / 0.4
        const numberOfPeriod = 365
        const amountPerPeriod = 10000000 / 365
        const cliffDurationFromMigrationTime = 0

        const result = getLockedVestingParams(
            totalVestingAmount,
            numberOfPeriod,
            amountPerPeriod,
            totalVestingDuration,
            cliffDurationFromMigrationTime,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalVestingAmount * 10 ** TokenDecimal.SIX
        )
    })
})
