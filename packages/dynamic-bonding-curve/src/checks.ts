import BN from 'bn.js'
import { MAX_CURVE_POINT, MAX_SQRT_PRICE, MIN_SQRT_PRICE } from './constants'
import {
    ActivationType,
    CollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    type CreateConfigParam,
    type PoolConfig,
} from './types'
import { Connection, PublicKey } from '@solana/web3.js'
import {
    getBaseTokenForSwap,
    getMigrationBaseToken,
    getMigrationThresholdPrice,
    getSwapAmountWithBuffer,
} from './common'
import { isNativeSol } from './utils'

/**
 * Check if the locked vesting is the default
 * @param lockedVesting - The locked vesting parameters
 * @returns true if the locked vesting is the default, false otherwise
 */
export function isDefaultLockedVesting(lockedVesting: {
    amountPerPeriod: BN
    cliffDurationFromMigrationTime: BN
    frequency: BN
    numberOfPeriod: BN
    cliffUnlockAmount: BN
}): boolean {
    return (
        lockedVesting.amountPerPeriod.eqn(0) &&
        lockedVesting.cliffDurationFromMigrationTime.eqn(0) &&
        lockedVesting.frequency.eqn(0) &&
        lockedVesting.numberOfPeriod.eqn(0) &&
        lockedVesting.cliffUnlockAmount.eqn(0)
    )
}

/**
 * Validate the pool fees
 * @param poolFees - The pool fees
 * @returns true if the pool fees are valid, false otherwise
 */
export function validatePoolFees(poolFees: any): boolean {
    if (!poolFees) return false

    // check base fee if it exists
    if (poolFees.baseFee) {
        if (poolFees.baseFee.cliffFeeNumerator.lte(new BN(0))) {
            return false
        }
    }

    return true
}

/**
 * Get the total token supply
 * @param swapBaseAmount - The swap base amount
 * @param migrationBaseThreshold - The migration base threshold
 * @param lockedVestingParams - The locked vesting parameters
 * @returns The total token supply
 */
export function getTotalTokenSupply(
    swapBaseAmount: BN,
    migrationBaseThreshold: BN,
    lockedVestingParams: {
        amountPerPeriod: BN
        numberOfPeriod: BN
        cliffUnlockAmount: BN
    }
): BN {
    try {
        // calculate total circulating amount
        const totalCirculatingAmount = swapBaseAmount.add(
            migrationBaseThreshold
        )

        // calculate total locked vesting amount
        const totalLockedVestingAmount =
            lockedVestingParams.cliffUnlockAmount.add(
                lockedVestingParams.amountPerPeriod.mul(
                    lockedVestingParams.numberOfPeriod
                )
            )

        // calculate total amount
        const totalAmount = totalCirculatingAmount.add(totalLockedVestingAmount)

        // check for overflow
        if (totalAmount.isNeg() || totalAmount.bitLength() > 64) {
            throw new Error('Math overflow')
        }

        return totalAmount
    } catch (error) {
        throw new Error('Math overflow')
    }
}

/**
 * Validate the collect fee mode
 * @param collectFeeMode - The collect fee mode
 * @returns true if the collect fee mode is valid, false otherwise
 */
export function validateCollectFeeMode(
    collectFeeMode: CollectFeeMode
): boolean {
    return [CollectFeeMode.OnlyQuote, CollectFeeMode.Both].includes(
        collectFeeMode
    )
}

/**
 * Validate the migration and token type
 * @param migrationOption - The migration option
 * @param tokenType - The token type
 * @returns true if the migration and token type are valid, false otherwise
 */
export function validateMigrationAndTokenType(
    migrationOption: MigrationOption,
    tokenType: TokenType
): boolean {
    if (migrationOption === MigrationOption.MET_DAMM) {
        return tokenType === TokenType.SPL
    }
    return true
}

/**
 * Validate the activation type
 * @param activationType - The activation type
 * @returns true if the activation type is valid, false otherwise
 */
export function validateActivationType(
    activationType: ActivationType
): boolean {
    return [ActivationType.Slot, ActivationType.Timestamp].includes(
        activationType
    )
}

/**
 * Validate the migration fee option
 * @param migrationFeeOption - The migration fee option
 * @returns true if the migration fee option is valid, false otherwise
 */
export function validateMigrationFeeOption(
    migrationFeeOption: MigrationFeeOption
): boolean {
    return [
        MigrationFeeOption.FixedBps25,
        MigrationFeeOption.FixedBps30,
        MigrationFeeOption.FixedBps100,
        MigrationFeeOption.FixedBps200,
    ].includes(migrationFeeOption)
}

/**
 * Validate the token decimals
 * @param tokenDecimal - The token decimal
 * @returns true if the token decimal is valid, false otherwise
 */
export function validateTokenDecimals(tokenDecimal: TokenDecimal): boolean {
    return tokenDecimal >= TokenDecimal.SIX && tokenDecimal <= TokenDecimal.NINE
}

/**
 * Validate the LP percentages
 * @param partnerLpPercentage - The partner LP percentage
 * @param partnerLockedLpPercentage - The partner locked LP percentage
 * @param creatorLpPercentage - The creator LP percentage
 * @param creatorLockedLpPercentage - The creator locked LP percentage
 * @returns true if the LP percentages are valid, false otherwise
 */
export function validateLPPercentages(
    partnerLpPercentage: number,
    partnerLockedLpPercentage: number,
    creatorLpPercentage: number,
    creatorLockedLpPercentage: number
): boolean {
    const totalLPPercentage =
        partnerLpPercentage +
        partnerLockedLpPercentage +
        creatorLpPercentage +
        creatorLockedLpPercentage
    return totalLPPercentage === 100
}

/**
 * Validate the curve
 * @param curve - The curve
 * @param sqrtStartPrice - The sqrt start price
 * @returns true if the curve is valid, false otherwise
 */
export function validateCurve(
    curve: Array<{ sqrtPrice: BN; liquidity: BN }>,
    sqrtStartPrice: BN
): boolean {
    if (!curve || curve.length === 0 || curve.length > MAX_CURVE_POINT) {
        return false
    }

    // first curve point validation
    if (
        curve[0]?.sqrtPrice.lte(sqrtStartPrice) ||
        curve[0]?.liquidity.lte(new BN(0)) ||
        curve[0]?.sqrtPrice.gt(new BN(MAX_SQRT_PRICE))
    ) {
        return false
    }

    // validate curve points are in ascending order and have positive liquidity
    for (let i = 1; i < curve.length; i++) {
        const currentPoint = curve[i]
        const previousPoint = curve[i - 1]

        if (!currentPoint || !previousPoint) {
            return false
        }

        if (
            currentPoint.sqrtPrice.lte(previousPoint.sqrtPrice) ||
            currentPoint.liquidity.lte(new BN(0))
        ) {
            return false
        }
    }

    // validate last curve point
    return !curve[curve.length - 1]?.sqrtPrice.gt(new BN(MAX_SQRT_PRICE))
}

/**
 * Validate the token supply
 * @param tokenSupply - The token supply
 * @param leftoverReceiver - The leftover receiver
 * @param swapBaseAmount - The swap base amount
 * @param migrationBaseAmount - The migration base amount
 * @param lockedVesting - The locked vesting parameters
 * @param swapBaseAmountBuffer - The swap base amount buffer
 * @returns true if the token supply is valid, false otherwise
 */
export function validateTokenSupply(
    tokenSupply: any,
    leftoverReceiver: PublicKey,
    swapBaseAmount: BN,
    migrationBaseAmount: BN,
    lockedVesting: any,
    swapBaseAmountBuffer: BN
): boolean {
    if (!tokenSupply) return true

    if (!leftoverReceiver) {
        return false
    }

    // Check if it's a PublicKey instance
    if (!(leftoverReceiver instanceof PublicKey)) {
        return false
    }

    // Check if it's not the default public key (all zeros)
    if (leftoverReceiver.equals(PublicKey.default)) {
        return false
    }

    const minimumBaseSupplyWithBuffer = getTotalTokenSupply(
        swapBaseAmountBuffer,
        migrationBaseAmount,
        lockedVesting
    )

    const minimumBaseSupplyWithoutBuffer = getTotalTokenSupply(
        swapBaseAmount,
        migrationBaseAmount,
        lockedVesting
    )

    return !(
        minimumBaseSupplyWithoutBuffer.gt(
            new BN(tokenSupply.postMigrationTokenSupply)
        ) ||
        new BN(tokenSupply.postMigrationTokenSupply).gt(
            new BN(tokenSupply.preMigrationTokenSupply)
        ) ||
        minimumBaseSupplyWithBuffer.gt(
            new BN(tokenSupply.preMigrationTokenSupply)
        )
    )
}

/**
 * Validate the config parameters
 * @param configParam - The config parameters
 */
export function validateConfigParameters(
    configParam: Omit<
        CreateConfigParam,
        'config' | 'feeClaimer' | 'quoteMint' | 'payer'
    >
) {
    // Pool fees validation
    if (!configParam.poolFees) {
        throw new Error('Pool fees are required')
    }
    if (!validatePoolFees(configParam.poolFees)) {
        throw new Error('Invalid pool fees')
    }

    // Collect fee mode validation
    if (!validateCollectFeeMode(configParam.collectFeeMode)) {
        throw new Error('Invalid collect fee mode')
    }

    // Migration and token type validation
    if (
        !validateMigrationAndTokenType(
            configParam.migrationOption,
            configParam.tokenType
        )
    ) {
        throw new Error('Token type must be SPL for MeteoraDamm migration')
    }

    // Activation type validation
    if (!validateActivationType(configParam.activationType)) {
        throw new Error('Invalid activation type')
    }

    // Migration fee validation
    if (!validateMigrationFeeOption(configParam.migrationFeeOption)) {
        throw new Error('Invalid migration fee option')
    }

    // Token decimals validation
    if (!validateTokenDecimals(configParam.tokenDecimal)) {
        throw new Error('Token decimal must be between 6 and 9')
    }

    // LP percentages validation
    if (
        !validateLPPercentages(
            configParam.partnerLpPercentage,
            configParam.partnerLockedLpPercentage,
            configParam.creatorLpPercentage,
            configParam.creatorLockedLpPercentage
        )
    ) {
        throw new Error('Sum of LP percentages must equal 100')
    }

    // Migration quote threshold validation
    if (configParam.migrationQuoteThreshold.lte(new BN(0))) {
        throw new Error('Migration quote threshold must be greater than 0')
    }

    // Price validation
    if (
        new BN(configParam.sqrtStartPrice).lt(new BN(MIN_SQRT_PRICE)) ||
        new BN(configParam.sqrtStartPrice).gte(new BN(MAX_SQRT_PRICE))
    ) {
        throw new Error('Invalid sqrt start price')
    }

    // Curve validation
    if (!validateCurve(configParam.curve, configParam.sqrtStartPrice)) {
        throw new Error('Invalid curve')
    }

    // Locked vesting validation
    if (!isDefaultLockedVesting(configParam.lockedVesting)) {
        try {
            const totalAmount = configParam.lockedVesting.cliffUnlockAmount.add(
                configParam.lockedVesting.amountPerPeriod.mul(
                    new BN(configParam.lockedVesting.numberOfPeriod)
                )
            )
            if (
                configParam.lockedVesting.frequency.eq(new BN(0)) ||
                totalAmount.eq(new BN(0))
            ) {
                throw new Error('Invalid vesting parameters')
            }
        } catch (error) {
            throw new Error('Invalid vesting parameters')
        }
    }

    // Token supply validation
    if (configParam.tokenSupply) {
        const sqrtMigrationPrice = getMigrationThresholdPrice(
            configParam.migrationQuoteThreshold,
            configParam.sqrtStartPrice,
            configParam.curve
        )

        const swapBaseAmount = getBaseTokenForSwap(
            configParam.sqrtStartPrice,
            sqrtMigrationPrice,
            configParam.curve
        )

        const migrationBaseAmount = getMigrationBaseToken(
            configParam.migrationQuoteThreshold,
            sqrtMigrationPrice,
            configParam.migrationOption
        )

        const swapBaseAmountBuffer = getSwapAmountWithBuffer(
            swapBaseAmount,
            configParam.sqrtStartPrice,
            configParam.curve
        )

        if (
            !validateTokenSupply(
                configParam.tokenSupply,
                new PublicKey(configParam.leftoverReceiver),
                swapBaseAmount,
                migrationBaseAmount,
                configParam.lockedVesting,
                swapBaseAmountBuffer
            )
        ) {
            throw new Error('Invalid token supply')
        }
    }
}

/**
 * Validate that the base token type matches the pool config token type
 * @param baseTokenType - The base token type from create pool parameters
 * @param poolConfig - The pool config state
 * @returns true if the token types match, false otherwise
 */
export function validateBaseTokenType(
    baseTokenType: TokenType,
    poolConfig: PoolConfig
): boolean {
    return baseTokenType === poolConfig.tokenType
}

/**
 * Validate that the user has sufficient balance for the swap
 * @param balance - The current balance in lamports
 * @param amountIn - The input amount for the swap
 * @param isSOLInput - Whether the input token is SOL
 * @returns true if the balance is sufficient, throws error if insufficient
 */
/**
 * Validate that the user has sufficient balance for the swap
 * @param connection - The Solana connection
 * @param owner - The owner's public key
 * @param inputMint - The mint of the input token
 * @param amountIn - The input amount for the swap
 * @param inputTokenAccount - The token account to check balance for
 * @returns true if the balance is sufficient, throws error if insufficient
 */
export async function validateBalance(
    connection: Connection,
    owner: PublicKey,
    inputMint: PublicKey,
    amountIn: BN,
    inputTokenAccount: PublicKey
): Promise<boolean> {
    const isSOLInput = isNativeSol(inputMint)

    if (isSOLInput) {
        const balance = await connection.getBalance(owner)
        const requiredBalance = BigInt(amountIn.toString()) + BigInt(10000000) // Add 0.01 SOL for fees and rent

        if (balance < Number(requiredBalance)) {
            throw new Error(
                `Insufficient SOL balance. Required: ${requiredBalance.toString()} lamports, Found: ${balance} lamports`
            )
        }
    } else {
        try {
            const tokenBalance =
                await connection.getTokenAccountBalance(inputTokenAccount)
            const balance = new BN(tokenBalance.value.amount)

            if (balance.lt(amountIn)) {
                throw new Error(
                    `Insufficient token balance. Required: ${amountIn.toString()}, Found: ${balance.toString()}`
                )
            }
        } catch (error) {
            throw new Error(
                `Failed to fetch token balance or token account doesn't exist`
            )
        }
    }

    return true
}
