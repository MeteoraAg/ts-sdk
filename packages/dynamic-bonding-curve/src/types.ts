import type {
    Accounts,
    BN,
    IdlAccounts,
    IdlTypes,
    Program,
} from '@coral-xyz/anchor'
import type { DynamicBondingCurve } from './idl/dynamic-bonding-curve/idl'
import type { Keypair, PublicKey, Transaction } from '@solana/web3.js'

// Program Type
export type DynamicBondingCurveProgram = Program<DynamicBondingCurve>

/////////////////
// IX ACCOUNTS //
/////////////////

export type ClaimProtocolFeeAccounts = Accounts<
    DynamicBondingCurve['instructions']['0']
>['claimProtocolFee']

export type ClaimTradingFeeAccounts = Accounts<
    DynamicBondingCurve['instructions']['1']
>['claimTradingFee']

export type CloseClaimFeeOperatorAccounts = Accounts<
    DynamicBondingCurve['instructions']['2']
>['closeClaimFeeOperator']

export type CreateClaimFeeOperatorAccounts = Accounts<
    DynamicBondingCurve['instructions']['3']
>['createClaimFeeOperator']

export type CreateConfigAccounts = Accounts<
    DynamicBondingCurve['instructions']['4']
>['createConfig']

export type CreateLockerAccounts = Accounts<
    DynamicBondingCurve['instructions']['5']
>['createLocker']

export type CreatePartnerMetadata = Accounts<
    DynamicBondingCurve['instructions']['6']
>['createPartnerMetadata']

export type CreateVirtualPoolMetadata = Accounts<
    DynamicBondingCurve['instructions']['7']
>['createVirtualPoolMetadata']

export type InitializeVirtualPoolWithSplTokenAccounts = Accounts<
    DynamicBondingCurve['instructions']['8']
>['initializeVirtualPoolWithSplToken']

export type InitializeVirtualPoolWithToken2022Accounts = Accounts<
    DynamicBondingCurve['instructions']['9']
>['initializeVirtualPoolWithToken2022']

export type MigrateMeteoraDammAccounts = Accounts<
    DynamicBondingCurve['instructions']['10']
>['migrateMeteoraDamm']

export type MigrateMeteoraDammClaimLpTokenAccounts = Accounts<
    DynamicBondingCurve['instructions']['11']
>['migrateMeteoraDammClaimLpToken']

export type MigrateMeteoraDammLockLpTokenAccounts = Accounts<
    DynamicBondingCurve['instructions']['12']
>['migrateMeteoraDammLockLpToken']

export type MigrationDammV2Accounts = Accounts<
    DynamicBondingCurve['instructions']['13']
>['migrationDammV2']

export type MigrationDammV2CreateMetadataAccounts = Accounts<
    DynamicBondingCurve['instructions']['14']
>['migrationDammV2CreateMetadata']

export type MigrationMeteoraDammCreateMetadataAccounts = Accounts<
    DynamicBondingCurve['instructions']['15']
>['migrationMeteoraDammCreateMetadata']

export type PartnerWithdrawSurplusAccounts = Accounts<
    DynamicBondingCurve['instructions']['16']
>['partnerWithdrawSurplus']

export type SwapAccounts = Accounts<
    DynamicBondingCurve['instructions']['18']
>['swap']

///////////////
// IDL Types //
///////////////

export type ConfigParameters = IdlTypes<DynamicBondingCurve>['configParameters']
export type LockedVestingParameters =
    IdlTypes<DynamicBondingCurve>['lockedVestingParams']
export type InitializePoolParameters =
    IdlTypes<DynamicBondingCurve>['initializePoolParameters']
export type SwapParameters = IdlTypes<DynamicBondingCurve>['swapParameters']
export type PoolFeeParameters =
    IdlTypes<DynamicBondingCurve>['poolFeeParameters']
export type DynamicFeeParameters =
    IdlTypes<DynamicBondingCurve>['dynamicFeeParameters']
export type LiquidityDistributionParameters =
    IdlTypes<DynamicBondingCurve>['liquidityDistributionParameters']
export type PoolFeesConfig = IdlTypes<DynamicBondingCurve>['poolFeesConfig']
export type DynamicFeeConfig = IdlTypes<DynamicBondingCurve>['dynamicFeeConfig']
export type BaseFeeConfig = IdlTypes<DynamicBondingCurve>['baseFeeConfig']
export type PoolFees = IdlTypes<DynamicBondingCurve>['poolFees']
export type PoolMetrics = IdlTypes<DynamicBondingCurve>['poolMetrics']
export type SwapResult = IdlTypes<DynamicBondingCurve>['swapResult']
export type CreatePartnerMetadataParameters =
    IdlTypes<DynamicBondingCurve>['createPartnerMetadataParameters']
export type CreateVirtualPoolMetadataParameters =
    IdlTypes<DynamicBondingCurve>['createVirtualPoolMetadataParameters']

//////////////////
// IDL ACCOUNTS //
//////////////////

export type ClaimFeeOperator =
    IdlAccounts<DynamicBondingCurve>['claimFeeOperator']
export type Config = IdlAccounts<DynamicBondingCurve>['config']
export type MeteoraDammMigrationMetadata =
    IdlAccounts<DynamicBondingCurve>['meteoraDammMigrationMetadata']
export type LockEscrow = IdlAccounts<DynamicBondingCurve>['lockEscrow']
export type VolatilityTracker =
    IdlTypes<DynamicBondingCurve>['volatilityTracker']
export type VirtualPool = IdlAccounts<DynamicBondingCurve>['virtualPool']
export type PoolConfig = IdlAccounts<DynamicBondingCurve>['poolConfig']
export type PartnerMetadata =
    IdlAccounts<DynamicBondingCurve>['partnerMetadata']
export type VirtualPoolMetadata =
    IdlAccounts<DynamicBondingCurve>['virtualPoolMetadata']

///////////
// ENUMS //
///////////

export enum ActivationType {
    Slot = 0,
    Timestamp = 1,
}

export enum TokenType {
    SPL = 0,
    Token2022 = 1,
}

export enum CollectFeeMode {
    OnlyQuote = 0,
    Both = 1,
}

export enum MigrationOption {
    MET_DAMM = 0,
    MET_DAMM_V2 = 1,
}

export enum CollectFeeMode {
    QuoteToken = 0,
    OutputToken = 1,
}

export enum FeeSchedulerMode {
    Linear = 0,
    Exponential = 1,
}

export enum MigrationFeeOption {
    FixedBps25 = 0,
    FixedBps30 = 1,
    FixedBps100 = 2,
    FixedBps200 = 3,
}

export enum TokenDecimal {
    SIX = 6,
    SEVEN = 7,
    EIGHT = 8,
    NINE = 9,
}

export enum TradeDirection {
    BaseToQuote = 0,
    QuoteToBase = 1,
}

export enum Rounding {
    Up,
    Down,
}

///////////
// TYPES //
///////////

export type CreateConfigParam = Omit<
    CreateConfigAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
> &
    ConfigParameters

export type CreateDammMigrationMetadataParam = {
    payer: PublicKey
    virtualPool: PublicKey
    config: PublicKey
    migrateToDammV2: boolean
}

export type FeeSchedulerParameters = {
    numberOfPeriod: number
    reductionFactor: number
    periodFrequency: number
    feeSchedulerMode: FeeSchedulerMode
}

export type BuildCurveBaseParam = {
    totalTokenSupply: number
    migrationOption: MigrationOption
    tokenBaseDecimal: TokenDecimal
    tokenQuoteDecimal: TokenDecimal
    lockedVesting: LockedVestingParameters
    feeSchedulerParam: FeeSchedulerParameters
    baseFeeBps: number
    dynamicFeeEnabled: boolean
    activationType: ActivationType
    collectFeeMode: CollectFeeMode
    migrationFeeOption: MigrationFeeOption
    tokenType: TokenType
    partnerLpPercentage: number
    creatorLpPercentage: number
    partnerLockedLpPercentage: number
    creatorLockedLpPercentage: number
}

export type BuildCurveParam = BuildCurveBaseParam & {
    percentageSupplyOnMigration: number
    migrationQuoteThreshold: number
}

export type BuildCurveByMarketCapParam = BuildCurveBaseParam & {
    initialMarketCap: number
    migrationMarketCap: number
}

export type BuildCurveAndCreateConfigParam = {
    buildCurveParam: BuildCurveParam
    feeClaimer: PublicKey
    leftoverReceiver: PublicKey
    payer: PublicKey
    quoteMint: PublicKey
    config: PublicKey
}

export type BuildCurveAndCreateConfigByMarketCapParam = {
    buildCurveByMarketCapParam: BuildCurveByMarketCapParam
    feeClaimer: PublicKey
    leftoverReceiver: PublicKey
    payer: PublicKey
    quoteMint: PublicKey
    config: PublicKey
}

export type MigrateToDammV1Param = {
    payer: PublicKey
    virtualPool: PublicKey
    dammConfig: PublicKey
}

export type MigrateToDammV2Param = {
    payer: PublicKey
    virtualPool: PublicKey
    dammConfig: PublicKey
}

export type MigrateToDammV2Response = {
    transaction: Transaction
    firstPositionNftKeypair: Keypair
    secondPositionNftKeypair: Keypair
}

export type ClaimTradingFeeParam = {
    feeClaimer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
}

export type CreateVirtualPoolMetadataParam = {
    virtualPool: PublicKey
    name: string
    website: string
    logo: string
    creator: PublicKey
    payer: PublicKey
}

export type CreatePartnerMetadataParam = {
    name: string
    website: string
    logo: string
    feeClaimer: PublicKey
    payer: PublicKey
}

export type CreatePoolParam = {
    name: string
    symbol: string
    uri: string
    payer: PublicKey
    poolCreator: PublicKey
    config: PublicKey
    baseMint: PublicKey
    baseTokenType: TokenType
    quoteMint: PublicKey
    quoteTokenType: TokenType
}

export type SwapParam = {
    owner: PublicKey
    amountIn: BN
    minimumAmountOut: BN
    swapBaseForQuote: boolean
}

export type SwapQuoteParam = {
    virtualPool: VirtualPool
    config: PoolConfig
    swapBaseForQuote: boolean
    amountIn: BN
    hasReferral: boolean
    currentPoint: BN
}

export type DammLpTokenParam = {
    payer: PublicKey
    virtualPool: PublicKey
    dammConfig: PublicKey
    isPartner: boolean
}

export type PartnerWithdrawSurplusParam = {
    feeClaimer: PublicKey
    virtualPool: PublicKey
}

export type WithdrawLeftoverParam = {
    payer: PublicKey
    virtualPool: PublicKey
}

export type CreateLockerParam = {
    payer: PublicKey
    virtualPool: PublicKey
}

////////////////
// INTERFACES //
////////////////

export interface FeeResult {
    amount: BN
    protocolFee: BN
    tradingFee: BN
    referralFee: BN
}

export interface FeeMode {
    feesOnInput: boolean
    feesOnBaseToken: boolean
    hasReferral: boolean
}

export interface QuoteResult {
    amountOut: BN
    minimumAmountOut: BN
    nextSqrtPrice: BN
    fee: {
        trading: BN
        protocol: BN
        referral?: BN
    }
    price: {
        beforeSwap: BN
        afterSwap: BN
    }
}

export interface FeeOnAmountResult {
    amount: BN
    protocolFee: BN
    tradingFee: BN
    referralFee: BN
}

export interface PrepareSwapParams {
    inputMint: PublicKey
    outputMint: PublicKey
    inputTokenProgram: PublicKey
    outputTokenProgram: PublicKey
}

export interface SwapAmount {
    outputAmount: BN
    nextSqrtPrice: BN
}
