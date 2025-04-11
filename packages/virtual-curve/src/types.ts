import type {
    Accounts,
    BN,
    IdlAccounts,
    IdlTypes,
    Program,
} from '@coral-xyz/anchor'
import type { VirtualCurve } from './idl/idl'
import type { PublicKey, Transaction } from '@solana/web3.js'

export type VirtualCurveProgram = Program<VirtualCurve>

/////////////////
// IX ACCOUNTS //
/////////////////

export type ClaimProtocolFeeAccounts = Accounts<
    VirtualCurve['instructions']['0']
>['claimProtocolFee']
export type ClaimTradingFeeAccounts = Accounts<
    VirtualCurve['instructions']['1']
>['claimTradingFee']
export type CloseClaimFeeOperatorAccounts = Accounts<
    VirtualCurve['instructions']['2']
>['closeClaimFeeOperator']
export type CreateClaimFeeOperatorAccounts = Accounts<
    VirtualCurve['instructions']['3']
>['createClaimFeeOperator']
export type CreateConfigAccounts = Accounts<
    VirtualCurve['instructions']['4']
>['createConfig']
export type CreatePartnerMetadata = Accounts<
    VirtualCurve['instructions']['5']
>['createPartnerMetadata']
export type CreatorClaimLpFromMeteoraDynamicAmmAccounts = Accounts<
    VirtualCurve['instructions']['6']
>['creatorClaimLpFromMeteoraDynamicAmm']
export type InitializeVirtualPoolWithSplTokenAccounts = Accounts<
    VirtualCurve['instructions']['7']
>['initializeVirtualPoolWithSplToken']
export type InitializeVirtualPoolWithToken2022Accounts = Accounts<
    VirtualCurve['instructions']['8']
>['initializeVirtualPoolWithToken2022']
export type MigrateMeteoraDammAccounts = Accounts<
    VirtualCurve['instructions']['9']
>['migrateMeteoraDamm']
export type MigrateMeteoraDammCreatorClaimLpTokenAccounts = Accounts<
    VirtualCurve['instructions']['10']
>['migrateMeteoraDammCreatorClaimLpToken']
export type MigrateMeteoraDammLockLpTokenForCreatorAccounts = Accounts<
    VirtualCurve['instructions']['11']
>['migrateMeteoraDammLockLpTokenForCreator']
export type MigrateMeteoraDammLockLpTokenForPartnerAccounts = Accounts<
    VirtualCurve['instructions']['12']
>['migrateMeteoraDammLockLpTokenForPartner']
export type MigrateMeteoraDammPartnerClaimLpTokenAccounts = Accounts<
    VirtualCurve['instructions']['13']
>['migrateMeteoraDammPartnerClaimLpToken']
export type MigrationDammV2Accounts = Accounts<
    VirtualCurve['instructions']['14']
>['migrationDammV2']
export type MigrationDammV2CreateMetadataAccounts = Accounts<
    VirtualCurve['instructions']['15']
>['migrationDammV2CreateMetadata']
export type MigrationMeteoraDammCreateMetadataAccounts = Accounts<
    VirtualCurve['instructions']['16']
>['migrationMeteoraDammCreateMetadata']
export type PartnerClaimLpFromMeteoraDynamicAmmAccounts = Accounts<
    VirtualCurve['instructions']['17']
>['partnerClaimLpFromMeteoraDynamicAmm']
export type PartnerWithdrawSurplusAccounts = Accounts<
    VirtualCurve['instructions']['18']
>['partnerWithdrawSurplus']
export type ProtocolWithdrawSurplusAccounts = Accounts<
    VirtualCurve['instructions']['19']
>['protocolWithdrawSurplus']
export type SwapAccounts = Accounts<VirtualCurve['instructions']['20']>['swap']

///////////////
// IDL Types //
///////////////

export type InitializePoolParameters =
    IdlTypes<VirtualCurve>['initializePoolParameters']
export type SwapParameters = IdlTypes<VirtualCurve>['swapParameters']
export type ConfigParameters = IdlTypes<VirtualCurve>['configParameters']
export type PoolFeeParamters = IdlTypes<VirtualCurve>['poolFeeParamters']
export type DynamicFeeParameters =
    IdlTypes<VirtualCurve>['dynamicFeeParameters']
export type LiquidityDistributionParameters =
    IdlTypes<VirtualCurve>['liquidityDistributionParameters']
export type PoolFeesConfig = IdlTypes<VirtualCurve>['poolFeesConfig']
export type DynamicFeeConfig = IdlTypes<VirtualCurve>['dynamicFeeConfig']
export type LiquidityDistributionConfig =
    IdlTypes<VirtualCurve>['liquidityDistributionParameters']
export type PoolFees = IdlTypes<VirtualCurve>['poolFees']
export type BaseFeeConfig = IdlTypes<VirtualCurve>['baseFeeConfig']
export type PoolMetrics = IdlTypes<VirtualCurve>['poolMetrics']
export type SwapResult = IdlTypes<VirtualCurve>['swapResult']
export type CreatePartnerMetadataParameters =
    IdlTypes<VirtualCurve>['createPartnerMetadataParameters']

//////////////////
// IDL ACCOUNTS //
//////////////////
export type ClaimFeeOperator = IdlAccounts<VirtualCurve>['claimFeeOperator']
export type Config = IdlAccounts<VirtualCurve>['config']
export type PoolConfig = IdlAccounts<VirtualCurve>['poolConfig']
export type MeteoraDammMigrationMetadata =
    IdlAccounts<VirtualCurve>['meteoraDammMigrationMetadata']
export type VolatilityTracker = IdlTypes<VirtualCurve>['volatilityTracker']
export type VirtualPool = IdlAccounts<VirtualCurve>['virtualPool']
export type VirtualPoolState = IdlAccounts<VirtualCurve>['virtualPool']
export type PoolConfigState = IdlAccounts<VirtualCurve>['poolConfig']

///////////
// ENUMS //
///////////

export enum SwapDirection {
    BaseToQuote,
    QuoteToBase,
}

export enum TradeDirection {
    BaseToQuote,
    QuoteToBase,
}

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

///////////
// TYPES //
///////////

export type CreateConfigParam = Omit<
    CreateConfigAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
> &
    ConfigParameters

export type MigrateMeteoraDammCreateMetadataParam = Omit<
    MigrationDammV2CreateMetadataAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
>

export type MigrateMeteoraDammParam = Omit<
    MigrateMeteoraDammAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
>

export type MigrateMeteoraDammLockLpTokenForCreatorParam = Omit<
    MigrateMeteoraDammLockLpTokenForCreatorAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
>

export type MigrateMeteoraDammLockLpTokenForPartnerParam = Omit<
    MigrateMeteoraDammLockLpTokenForPartnerAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
>

export type ClaimProtocolFeeParam = {
    operator: PublicKey
    pool: PublicKey
}

export type ClaimTradingFeeParam = {
    feeClaimer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
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
    config: PublicKey
    creator: PublicKey
    baseMint: PublicKey
    quoteMint: PublicKey
    baseTokenType: TokenType
    quoteTokenType: TokenType
}

export type SwapParam = {
    owner: PublicKey
    amountIn: BN
    minimumAmountOut: BN
    swapBaseForQuote: boolean
}

export type CreateClaimFeeOperatorParam = Omit<
    CreateClaimFeeOperatorAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
>
export type CloseClaimFeeOperatorParam = Omit<
    CloseClaimFeeOperatorAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
>

export type ProtocolWithdrawSurplusParam = {
    operator: PublicKey
    virtualPool: PublicKey
}

// export type PartnerWithdrawSurplusParam = Omit<
//     PartnerWithdrawSurplusAccounts,
//     'program' | 'eventAuthority' | 'systemProgram'
// >

export type PartnerWithdrawSurplusParam = {
    feeClaimer: PublicKey
    virtualPool: PublicKey
}

////////////////
// INTERFACES //
////////////////

export interface VirtualCurveClientInterface {
    swap(swapParam: SwapParam): Promise<Transaction>
    claimTradingFee(
        claimTradingFeeParam: ClaimTradingFeeParam
    ): Promise<Transaction>
    partnerWithdrawSurplus(
        partnerWithdrawSurplusParam: PartnerWithdrawSurplusParam
    ): Promise<Transaction>
}
export interface VirtualCurveAdminInterface {
    claimProtocolFee(
        claimProtocolFeeParam: ClaimProtocolFeeParam
    ): Promise<Transaction>
    protocolWithdrawSurplus(
        protocolWithdrawSurplusParam: ProtocolWithdrawSurplusParam
    ): Promise<Transaction>
}

export interface CurvePoint {
    sqrtPrice: BN
    liquidity: BN
}

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

export interface QuoteParams {
    amountIn: BN
    direction: SwapDirection
    slippage?: number
    pool: VirtualPoolState
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
        beforeSwap: number
        afterSwap: number
    }
}

export interface FeeMode {
    feesOnInput: boolean
    feesOnBaseToken: boolean
    hasReferral: boolean
}

export interface FeeOnAmountResult {
    amount: BN // Amount remaining after taking trading fee
    protocolFee: BN // Final protocol fee (after referral deduction)
    tradingFee: BN // Portion of trading fee NOT going to protocol
    referralFee: BN // Referral fee amount
}
